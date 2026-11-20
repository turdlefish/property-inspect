// Offline-first document store with partner sync (adapted from Human Doing).
//
// Rows:  prop:<space>:p:<slot>:<doc>
// <slot> is "a" or "b", the same as in Human Being. Each person only writes
// their own rows, so you can never overwrite each other.
//
// Unlike Human Doing, everything here is shared: you both work on the same
// properties. So documents are made of *fields*, each stamped with when it was
// set and by whom, and the app shows the two of you merged field by field
// (the newest value wins). See merged() below.
//
// Documents live in localStorage as { t: editedAt, d: data } and are pushed
// to the table. Downloads stay small: one quick query for rows changed since
// the last look ("[]" when nothing has), then only those documents, and never
// your own edits back again.

import { CONFIG, apiBase } from './config.js';

const NS = 'prop';
const HB_NS = 'tend';   // Human Being: only its profiles are read, for pairing
const SESSION_KEY = 'prop:session';
const DIRTY_KEY = 'prop:dirty';
const SEEN_KEY = 'prop:seen';
const CURSOR_KEY = 'prop:cursor';
const DOC_PREFIX = 'prop:doc:';
const DOC = fk => DOC_PREFIX + fk;

function lsGet(k) {
  try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function lsHas(k) { try { return localStorage.getItem(k) != null; } catch (e) { return false; } }

let session = lsGet(SESSION_KEY);
let dirty = new Set(lsGet(DIRTY_KEY) || []);
let seen = lsGet(SEEN_KEY) || {};
let cursor = lsGet(CURSOR_KEY) || {};
const listeners = new Set();
const statusListeners = new Set();
let status = { state: 'idle', at: 0, pending: dirty.size };
let flushTimer = null, pollTimer = null, flushing = null, pulling = null;
let lastFull = 0, lastPull = 0;

const stats = { requests: 0, down: 0, up: 0, docsDown: 0, lastCheck: null };
export const getStats = () => ({ ...stats });

// ── Session ───────────────────────────────────────────────────────────────
export const getSession = () => session;
export function setSession(s) { session = s; lsSet(SESSION_KEY, s); }

export function signOut() {
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(DOC_PREFIX) || [DIRTY_KEY, SEEN_KEY, CURSOR_KEY, SESSION_KEY].includes(k))) drop.push(k);
    }
    drop.forEach(lsDel);
  } catch (e) {}
  session = null; dirty = new Set(); seen = {}; cursor = {};
  stopSync();
}

export const me = () => session.slot;
export const partner = () => (session.slot === 'a' ? 'b' : 'a');
export const keyFor = (slot, doc) => `p:${slot}:${doc}`;
const full = (k, space = session.space) => `${NS}:${space}:${k}`;
const short = fk => fk.slice(`${NS}:${session.space}:`.length);
const parts = fk => { const p = fk.split(':'); return { slot: p[3], doc: p.slice(4).join(':') }; };

// ── Reading & writing whole documents ─────────────────────────────────────
export function read(k, fallback) {
  const e = lsGet(DOC(full(k)));
  return e ? e.d : fallback;
}
export const readMine = (doc, fb) => read(keyFor(me(), doc), fb);
export const readPartner = (doc, fb) => read(keyFor(partner(), doc), fb);

export function write(k, data) {
  const fk = full(k);
  lsSet(DOC(fk), { t: Date.now(), d: data });
  dirty.add(fk);
  lsSet(DIRTY_KEY, [...dirty]);
  emit(parts(fk).doc, 'local');
  scheduleFlush();
}
export const writeMine = (doc, data) => write(keyFor(me(), doc), data);

// ── Fields: the shared, merged layer ──────────────────────────────────────
// A field document is { fields: { key: { v, t, by, ...meta } } }.
// meta can carry why / link / from (an edit's reason, supporting link and the
// value it replaced).

/** Set one field in my copy of a document. value null = cleared. */
export function setField(doc, key, value, meta = {}) {
  const mine = readMine(doc, { fields: {} });
  mine.fields = mine.fields || {};
  mine.fields[key] = { v: value, t: Date.now(), by: me(), ...meta };
  writeMine(doc, mine);
}
/** Set several fields at once (one write). */
export function setFields(doc, values, meta = {}) {
  const mine = readMine(doc, { fields: {} });
  mine.fields = mine.fields || {};
  const t = Date.now();
  for (const [k, v] of Object.entries(values)) mine.fields[k] = { v, t, by: me(), ...meta };
  writeMine(doc, mine);
}
/** Set several fields at once, each with its own meta: { key: [value, meta] } (one write). */
export function setFieldsEach(doc, entries) {
  const mine = readMine(doc, { fields: {} });
  mine.fields = mine.fields || {};
  const t = Date.now();
  for (const [k, [v, meta]] of Object.entries(entries)) mine.fields[k] = { v, t, by: me(), ...(meta || {}) };
  writeMine(doc, mine);
}
/** Both people's copies merged: { key: record }, the newest record per key. */
export function merged(doc) {
  const out = {};
  for (const slot of ['a', 'b']) {
    const f = (read(keyFor(slot, doc), null) || {}).fields || {};
    for (const [k, rec] of Object.entries(f)) if (!out[k] || rec.t > out[k].t) out[k] = rec;
  }
  return out;
}
/** Just the values of merged(doc), without cleared ones. */
export function values(doc) {
  const m = merged(doc), out = {};
  for (const [k, rec] of Object.entries(m)) if (rec.v != null) out[k] = rec.v;
  return out;
}

/** The documents of one person on this phone: [{ doc, bytes, t }]. */
export function listDocs(slot) {
  const prefix = DOC(full(keyFor(slot, '')));
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = localStorage.getItem(k) || '';
      let t = 0;
      try { t = JSON.parse(raw).t || 0; } catch (e) {}
      out.push({ doc: k.slice(prefix.length), bytes: raw.length, t });
    }
  } catch (e) {}
  return out.sort((x, y) => x.doc.localeCompare(y.doc));
}
/** Every document name either of you has that starts with `prefix`. */
export function docsLike(prefix) {
  const names = new Set();
  for (const slot of ['a', 'b']) listDocs(slot).forEach(d => { if (d.doc.startsWith(prefix)) names.add(d.doc); });
  return [...names];
}

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(doc, source) {
  listeners.forEach(fn => { try { fn(doc, source); } catch (e) { console.error(e); } });
}
export function onStatus(fn) { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); }
export const getStatus = () => status;
function setStatus(state) {
  status = { state, at: Date.now(), pending: dirty.size };
  statusListeners.forEach(fn => fn(status));
}

// ── Network ───────────────────────────────────────────────────────────────
function headers(extra = {}) {
  return { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, ...extra };
}
async function api(query, opts = {}) {
  stats.requests++;
  if (opts.body) stats.up += opts.body.length;
  const r = await fetch(apiBase() + '/rest/v1/' + CONFIG.table + query, { ...opts, headers: headers(opts.headers) });
  const text = await r.text().catch(() => '');
  stats.down += text.length;
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + text);
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}
const inList = fks => 'in.(' + fks.map(k => '"' + k + '"').join(',') + ')';
const quote = v => '"' + v + '"';

async function fetchDocs(fks) {
  const out = [];
  for (let i = 0; i < fks.length; i += 40) {
    const rows = await api('?select=key,value,updated_at&key=' + encodeURIComponent(inList(fks.slice(i, i + 40)))) || [];
    for (const row of rows) {
      let v = row.value;
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      out.push({ key: row.key, updated_at: row.updated_at, entry: v });
    }
  }
  return out;
}

function fetchStamps(all) {
  const space = session.space;
  if (all) return api('?select=key,updated_at&key=' + encodeURIComponent(`like.${NS}:${space}:*`));
  const like = s => `key.like.${quote(`${NS}:${space}:p:${s}:*`)}`;
  const part = s => (cursor[s] ? `and(${like(s)},updated_at.gt.${quote(cursor[s])})` : like(s));
  return api('?select=key,updated_at&or=' + encodeURIComponent(`(${part('a')},${part('b')})`));
}
const later = (x, y) => !y || Date.parse(x) > Date.parse(y);

export function pull({ full: all = false } = {}) {
  if (pulling) return all ? pulling.then(() => pull({ full: true })) : pulling;
  pulling = doPull(all || Date.now() - lastFull > CONFIG.fullCheckMs).finally(() => { pulling = null; });
  return pulling;
}

async function doPull(all) {
  if (!session) return false;
  if (navigator.onLine === false) { setStatus('offline'); return false; }
  lastPull = Date.now();
  try {
    const stamps = await fetchStamps(all);
    const next = { ...cursor };
    const want = [];
    for (const s of stamps || []) {
      const { slot } = parts(s.key);
      if (slot !== 'a' && slot !== 'b') continue;
      if (later(s.updated_at, next[slot])) next[slot] = s.updated_at;
      if (seen[s.key] !== s.updated_at || !lsHas(DOC(s.key))) want.push(s.key);
    }
    if (want.length) {
      const rows = await fetchDocs(want);
      stats.docsDown += rows.length;
      const changed = [];
      for (const row of rows) {
        seen[row.key] = row.updated_at;
        const e = row.entry;
        if (!e || typeof e.t !== 'number' || dirty.has(row.key)) continue;
        const local = lsGet(DOC(row.key));
        if (!local || e.t > local.t) {
          lsSet(DOC(row.key), e);
          changed.push(parts(row.key).doc);
        }
      }
      lsSet(SEEN_KEY, seen);
      changed.forEach(d => emit(d, 'remote'));
    }
    cursor = next;
    lsSet(CURSOR_KEY, cursor);
    if (all) lastFull = Date.now();
    stats.lastCheck = { at: Date.now(), full: all, rows: (stamps || []).length, docs: want.length };
    if (!dirty.size) setStatus('synced');
    return true;
  } catch (e) {
    console.warn('Property Inspect: pull failed', e);
    setStatus(navigator.onLine === false ? 'offline' : 'error');
    return false;
  }
}

function scheduleFlush(ms = 700) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), ms);
  setStatus('saving');
}

export async function flush({ keepalive = false } = {}) {
  if (!session || !dirty.size) return true;
  if (flushing) return flushing;
  if (navigator.onLine === false) { setStatus('offline'); return false; }
  const batch = [...dirty].map(fk => ({ fk, entry: lsGet(DOC(fk)) })).filter(x => x.entry);
  const now = new Date().toISOString();
  flushing = (async () => {
    try {
      const rows = await api('?select=key,updated_at', {
        method: 'POST',
        keepalive,
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch.map(x => ({ key: x.fk, value: JSON.stringify(x.entry), updated_at: now }))),
      });
      const stamped = new Map((Array.isArray(rows) ? rows : []).map(r => [r.key, r.updated_at]));
      for (const x of batch) {
        seen[x.fk] = stamped.get(x.fk) || now;
        const cur = lsGet(DOC(x.fk));
        if (cur && cur.t === x.entry.t) dirty.delete(x.fk);
      }
      lsSet(SEEN_KEY, seen);
      lsSet(DIRTY_KEY, [...dirty]);
      if (dirty.size) scheduleFlush(300); else setStatus('synced');
      return true;
    } catch (e) {
      console.warn('Property Inspect: push failed', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error');
      return false;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export function startSync() {
  stopSync();
  const first = pull({ full: true });
  first.then(() => flush());
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') { flush(); pull(); }
  }, CONFIG.pollMs);
  return first;
}
export function stopSync() { clearInterval(pollTimer); pollTimer = null; }
export const syncNow = () => flush().then(() => pull({ full: true }));

document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.visibilityState === 'visible') { flush(); if (Date.now() - lastPull > 15000) pull(); }
  else flush({ keepalive: true });
});
window.addEventListener('online', () => { if (session) { flush(); pull(); } });
window.addEventListener('offline', () => setStatus('offline'));

// ── Spaces ────────────────────────────────────────────────────────────────
export const normalizeCode = s => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
export function makeSpaceCode() {
  const A = ['sunny', 'cozy', 'leafy', 'bright', 'breezy', 'quiet', 'golden', 'snug', 'lucky', 'gentle'];
  const N = ['wattle', 'banksia', 'gum', 'fern', 'waratah', 'magpie', 'wren', 'koala', 'possum', 'robin'];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${A[r[0] % A.length]}-${N[r[1] % N.length]}-${1000 + (r[2] % 9000)}`;
}

// Who's already in a space? { a?, b? } from Property Inspect, hb: { a?, b? } from Human Being.
export async function peekSpace(code) {
  const fks = ['a', 'b'].flatMap(s => [`${NS}:${code}:p:${s}:profile`, `${HB_NS}:${code}:p:${s}:profile`]);
  const rows = await fetchDocs(fks);
  const out = { hb: {} };
  rows.forEach(r => {
    const [ns, , , slot] = r.key.split(':');
    const d = r.entry && r.entry.d;
    if (!d) return;
    if (ns === HB_NS) out.hb[slot] = d;
    else out[slot] = d.fields ? Object.fromEntries(Object.entries(d.fields).map(([k, x]) => [k, x.v])) : d;
  });
  return out;
}
