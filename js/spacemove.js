// Moving your space to a new, longer code without losing anything. The same
// file is in Human Being, Human Doing and Property Inspect; each app passes
// in its own bits (initMove below).
//
// The first codes were short (sunny-otter-1234: about 8 million of them), so
// a patient stranger could guess one. New ones are longer
// (sunny-otter-misty-fern-482913: about 700 billion). A move only ever copies:
//   1. The first app to move (Us → "Make our code longer") copies every row
//      of the old space in all three apps to a new code, then leaves a
//      "moved" note in the old space: <app>:<old code>:moved = { at, by }.
//      The note doesn't hold the new code; the two of you pass that on.
//   2. Every other app, on either phone, sees the note and asks for the new
//      code. It first copies anything that changed in the old space since
//      (for each row, the newer copy wins), then carries on with the new code.
// The old rows stay where they are until you choose to have them removed, so
// nothing is lost on the way, even from a phone that moves days later.

import { CONFIG, apiBase } from './config.js';

export const APPS_NS = ['tend', 'doing', 'prop'];   // Human Being, Human Doing, Property Inspect

const ADJ = ['sunny', 'cozy', 'fuzzy', 'sweet', 'misty', 'dreamy', 'peachy', 'minty', 'sleepy', 'bubbly',
  'snug', 'honey', 'velvet', 'starry', 'dewy', 'rosy', 'lucky', 'gentle', 'merry', 'breezy', 'cloudy',
  'golden', 'lilac', 'silky', 'twinkly', 'jolly', 'mellow', 'plushy', 'sparkly', 'tender'];
const NOUN = ['otter', 'bunny', 'panda', 'koala', 'fawn', 'duckling', 'kitten', 'puffin', 'hedgehog', 'lamb',
  'robin', 'seal', 'cub', 'sparrow', 'bee', 'fox', 'mochi', 'dumpling', 'teacup', 'petal', 'clover',
  'cloud', 'acorn', 'pebble', 'muffin', 'peach', 'plum', 'tulip', 'fern', 'moon'];

/** A new space code: two pairs of words and six digits. */
export function makeLongCode() {
  const r = new Uint32Array(5);
  crypto.getRandomValues(r);
  return `${ADJ[r[0] % 30]}-${NOUN[r[1] % 30]}-${ADJ[r[2] % 30]}-${NOUN[r[3] % 30]}-${100000 + (r[4] % 900000)}`;
}
/** An old-style short code (sunny-otter-1234)? */
export const isShortCode = code => String(code || '').split('-').length < 5;
const normal = s => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── The database (every request names its space, see the store) ──────────
const head = (space, extra = {}) => ({ apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'x-space': space, ...extra });
async function get(space, query) {
  const r = await fetch(apiBase() + '/rest/v1/' + CONFIG.table + query, { headers: head(space) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function put(space, rows) {
  for (let i = 0; i < rows.length; i += 20) {
    const r = await fetch(apiBase() + '/rest/v1/' + CONFIG.table, {
      method: 'POST',
      headers: head(space, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows.slice(i, i + 20)),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')));
  }
}
const rowsOf = (ns, space) => get(space, '?select=key,value&key=' + encodeURIComponent(`like.${ns}:${space}:*`));
const entryOf = v => { try { return (typeof v === 'string' ? JSON.parse(v) : v) || {}; } catch (e) { return {}; } };
const movedKey = (ns, space) => `${ns}:${space}:moved`;

/**
 * Copies these apps' rows from one code to another: each row the new space
 * lacks, or has an older copy of. Never deletes. Then checks that every row
 * of the old space is there under the new code, and throws if one isn't, so
 * nothing moves on to a half-copied space. Returns how many it copied.
 */
export async function copySpace(from, to, namespaces = APPS_NS) {
  let n = 0;
  const now = new Date().toISOString();
  for (const ns of namespaces) {
    const [old, cur] = await Promise.all([rowsOf(ns, from), rowsOf(ns, to)]);
    const have = new Map(cur.map(r => [r.key, entryOf(r.value).t || 0]));
    const rows = [];
    const want = [];
    for (const r of old) {
      if (r.key === movedKey(ns, from) || !r.key.startsWith(`${ns}:${from}:`)) continue;
      const key = `${ns}:${to}:${r.key.slice(`${ns}:${from}:`.length)}`;
      want.push(key);
      if (have.has(key) && have.get(key) >= (entryOf(r.value).t || 0)) continue;
      rows.push({ key, value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value), updated_at: now });
    }
    await put(to, rows);
    n += rows.length;
    const there = new Set((await rowsOf(ns, to)).map(r => r.key));
    const missing = want.filter(k => !there.has(k));
    if (missing.length) throw new Error(`${missing.length} of ${want.length} rows didn't copy`);
  }
  return n;
}
/** Has this space moved? { at, by } of the note, or null. */
export async function movedNote(ns, space) {
  const rows = await get(space, '?select=value&key=eq.' + encodeURIComponent(movedKey(ns, space)));
  return rows.length ? (entryOf(rows[0].value).d || { at: 0 }) : null;
}
/** Is anything at this code yet (someone's profile, in any of the apps)? */
export async function spaceExists(space) {
  const keys = APPS_NS.flatMap(ns => ['a', 'b'].map(s => `"${ns}:${space}:p:${s}:profile"`));
  return (await get(space, '?select=key&key=' + encodeURIComponent(`in.(${keys.join(',')})`))).length > 0;
}

// ── In the app ────────────────────────────────────────────────────────────
// ctx: { ns, app, store (getSession, flush, rekeySpace), sheet(title, html) → { el, close },
//        busy() (another sheet is open), toast, copyText, myName(), after() (once moved),
//        cls: { input, code, actions, primary, ghost, err }, photos?(from, to) (Property Inspect) }
let ctx = null, asked = false;

/** Sets the move up for this app and starts looking for a "moved" note now and then. */
export function initMove(c) {
  ctx = c;
  const check = async () => {
    const s = ctx.store.getSession();
    if (!s || asked || document.hidden) return;
    let note = null;
    try { note = await movedNote(ctx.ns, s.space); } catch (e) { return; }
    if (!note) return;
    if (ctx.busy()) { setTimeout(check, 5000); return; }
    asked = true;
    askNewCode(note);
  };
  setTimeout(check, 4000);
  setInterval(check, 10 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 1500); });
}

const failText = e => (navigator.onLine === false
  ? 'You\'re offline. Try again with a connection: nothing has changed.'
  : 'Something went wrong (' + esc(e && e.message || e) + '). Nothing was deleted; try again in a moment.');

/** Us → "Make our code longer": copies everything to a new code and moves this app there. */
export async function startMove() {
  const s = ctx.store.getSession();
  const from = s.space;
  // Already moved (from another app or your person's phone)? Then follow it, never make a second code.
  try {
    const note = await movedNote(ctx.ns, from);
    if (note) { asked = true; return askNewCode(note); }
  } catch (e) { ctx.toast('Couldn\'t reach the database. Check your connection.'); return; }
  const c = ctx.cls;
  const sh = ctx.sheet('Make your code longer 🔑', `
    <p>Your code <b>${esc(from)}</b> is short enough that a patient stranger could guess it. A longer one keeps your space to the two of you.</p>
    <p class="muted small">Everything is copied to the new code, in Human Being, Human Doing and Property Inspect. Nothing is deleted: the old copy stays until you choose to have it removed.</p>
    <p class="${c.err}" data-mv-err hidden></p>
    <div class="${c.actions}"><button type="button" class="${c.ghost}" data-mv="no">Not now</button><button type="button" class="${c.primary}" data-mv="go">Make a new code</button></div>`);
  sh.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-mv]');
    if (!b) return;
    if (b.dataset.mv === 'no') return sh.close();
    if (b.dataset.mv !== 'go' || b.disabled) return;
    const err = sh.el.querySelector('[data-mv-err]');
    b.disabled = true;
    b.textContent = 'Copying…';
    try {
      if (!(await ctx.store.flush())) throw new Error('offline');
      const to = makeLongCode();
      await copySpace(from, to);
      if (ctx.photos) await ctx.photos(from, to);
      await put(from, APPS_NS.map(ns => ({ key: movedKey(ns, from), value: JSON.stringify({ t: Date.now(), d: { at: Date.now(), by: ctx.myName() || '' } }), updated_at: new Date().toISOString() })));
      await ctx.store.rekeySpace(to);
      asked = true;
      sh.close();
      ctx.after();
      showNewCode(to);
    } catch (e2) {
      err.hidden = false;
      err.innerHTML = failText(e2.message === 'offline' ? null : e2);
      b.disabled = false;
      b.textContent = 'Try again';
    }
  });
}

function showNewCode(code) {
  const c = ctx.cls;
  const sh = ctx.sheet('Your new code ✨', `
    <p>Everything is copied, and ${esc(ctx.app)} on this phone already uses it:</p>
    <div class="${c.code}">${esc(code)}</div>
    <p class="muted small">Copy it now. Each of your other apps (Human Being, Human Doing, Property Inspect, here and on the website) asks for it the next time you open it, and so do your person's once they have the new versions. Send it to them in a message only you two can see. Using the iPhone widget? Copy its script again from Us.</p>
    <div class="${c.actions}"><button type="button" class="${c.ghost}" data-mv="close">Done</button><button type="button" class="${c.primary}" data-mv="copy">Copy the code</button></div>`);
  sh.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-mv]');
    if (!b) return;
    if (b.dataset.mv === 'copy') ctx.toast((await ctx.copyText(code)) ? 'Code copied' : 'Select the code to copy it');
    else sh.close();
  });
}

/** Another app moved the space: ask for the new code, then catch up and move this app too. */
function askNewCode(note) {
  const c = ctx.cls;
  const from = ctx.store.getSession().space;
  const when = note.at ? ` on ${new Date(note.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : '';
  const sh = ctx.sheet('Your space has a new code 🔑', `
    <p>${note.by ? esc(note.by) : 'One of you'} gave your space a new, longer code${when}. Enter it to keep ${esc(ctx.app)} in sync. Everything was copied, so nothing is lost.</p>
    <input class="${c.input}" data-mv-code placeholder="e.g. sunny-otter-misty-fern-482913" autocomplete="off" autocapitalize="none" spellcheck="false">
    <p class="${c.err}" data-mv-err hidden></p>
    <div class="${c.actions}"><button type="button" class="${c.ghost}" data-mv="later">Later</button><button type="button" class="${c.primary}" data-mv="go">Use the new code</button></div>`);
  const err = text => { const p = sh.el.querySelector('[data-mv-err]'); p.hidden = !text; p.innerHTML = text || ''; };
  sh.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-mv]');
    if (!b) return;
    if (b.dataset.mv === 'later') return sh.close();
    if (b.dataset.mv !== 'go' || b.disabled) return;
    const to = normal(sh.el.querySelector('[data-mv-code]').value);
    if (!to) return err('Paste or type the new code first.');
    if (to === from) return err('That\'s the old code. The new one is longer, with five parts.');
    b.disabled = true;
    b.textContent = 'Moving…';
    try {
      if (!(await spaceExists(to))) { err('Nothing is at that code yet. Check it with your person (it has five parts).'); return; }
      await ctx.store.flush();
      await copySpace(from, to, [ctx.ns]);   // anything this app's space changed since the move
      if (ctx.photos) await ctx.photos(from, to);
      await ctx.store.rekeySpace(to);
      sh.close();
      ctx.after();
      ctx.toast('Moved to your new code ✨');
    } catch (e2) {
      err(failText(e2));
    } finally {
      b.disabled = false;
      b.textContent = 'Use the new code';
    }
  });
}
