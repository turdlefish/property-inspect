// Free limits: what the automatic lookups have used of Google's free monthly allowance, and the
// app's own stop points, so you can see at a glance that nothing can be charged.
//
// The lookup function (supabase/functions/property-lookup) counts every Google request in the row
// prop:<space>:usage:<YYYY-MM> and refuses at 90% of each free allowance, and at a small daily
// limit. This reads that same row, so both of you see the same numbers.

import * as store from './store.js';
import { CONFIG, apiBase } from './config.js';
import { storageUse, mb } from './photos.js';
import { esc, openSheet, closeSheet } from './ui.js';

// In plain words, with Google's free amount each month (the app stops at 90% of it).
export const SKUS = {
  geocode: { name: 'Finding the address', free: 10000 },
  routesEss: { name: 'Walk and drive times', free: 10000 },
  routesPro: { name: 'Peak-hour drive times', free: 5000 },
  routesEnt: { name: 'Toll prices', free: 1000 },
  places: { name: 'Nearest supermarket & Bunnings', free: 5000 },
};
const CAPS = { geocode: 9000, routesEss: 9000, routesPro: 4500, routesEnt: 900, places: 4500 };
const DAY_CAPS = { geocode: 60, routesEss: 60, routesPro: 150, routesEnt: 30, places: 30 };

const sydney = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const CACHE = 'prop:usage';
let usage = (() => { try { return JSON.parse(localStorage.getItem(CACHE)) || null; } catch (e) { return null; } })();
const listeners = new Set();
export const onUsage = fn => { listeners.add(fn); return () => listeners.delete(fn); };

/** { geocode: { used, cap, free, today, dayCap }, … } for this month (zero if nothing's been looked up). */
export function getUsage() {
  const today = sydney(), month = today.slice(0, 7);
  const u = usage && usage.month === month ? usage : { month, dayOf: today, n: {}, day: {} };
  const day = u.dayOf === today ? u.day || {} : {};
  return Object.fromEntries(Object.keys(SKUS).map(k => [k, { used: u.n[k] || 0, cap: (u.caps && u.caps[k]) || CAPS[k], free: SKUS[k].free, today: day[k] || 0, dayCap: (u.dayCaps && u.dayCaps[k]) || DAY_CAPS[k] }]));
}
const keep = u => {
  usage = u;
  try { localStorage.setItem(CACHE, JSON.stringify(u)); } catch (e) {}
  listeners.forEach(fn => fn());
};

/** A lookup's reply carries the counts too: { sku: { used, cap, today, dayCap } }. */
export function fromReply(rep) {
  if (!rep) return;
  const today = sydney();
  keep({ month: today.slice(0, 7), dayOf: today, n: Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, v.used || 0])), day: Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, v.today || 0])), caps: Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, v.cap])), dayCaps: Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, v.dayCap])), at: Date.now() });
}

/** Reads the shared counter (both phones' lookups). Quietly keeps the last numbers if offline. */
export async function refreshUsage() {
  const s = store.getSession();
  if (!s) return;
  const key = `prop:${s.space}:usage:${sydney().slice(0, 7)}`;
  try {
    const r = await fetch(`${apiBase()}/rest/v1/${CONFIG.table}?select=value&key=eq.${encodeURIComponent(key)}`, { headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'x-space': s.space } });
    if (!r.ok) return;
    const rows = await r.json();
    const v = rows && rows[0] && rows[0].value ? JSON.parse(rows[0].value) : null;
    keep({ month: key.slice(-7), dayOf: v ? v.dayOf : sydney(), n: v ? v.n || {} : {}, day: v ? v.day || {} : {}, caps: v && v.caps, dayCaps: v && v.dayCaps, at: Date.now() });
  } catch (e) { /* offline: keep what we had */ }
}

/** How close the lookups are to stopping: { level: 'ok' | 'warn' | 'today' | 'stopped', share, worst }. */
export function limitState(u = getUsage()) {
  const rows = Object.entries(u);
  const [wk, w] = rows.reduce((a, x) => (x[1].used / x[1].cap > a[1].used / a[1].cap ? x : a));
  const share = w.used / w.cap;
  const dayHit = rows.some(([, x]) => x.today >= x.dayCap);
  const level = share >= 1 ? 'stopped' : dayHit ? 'today' : share >= 0.75 ? 'warn' : 'ok';
  return { level, share, worst: wk };
}

/** The short line under the lookup button: always there, so you know it's free. */
export function usageLine() {
  const st = limitState();
  const pct = Math.round(st.share * 100);
  const text = st.level === 'stopped' ? 'Lookups paused until the 1st so nothing is charged'
    : st.level === 'today' ? 'Today’s lookups are used up · more tomorrow'
    : `Free · ${pct}% of this month’s allowance used`;
  return `<button class="limits-line ${st.level}" data-limits><span class="dot" aria-hidden="true"></span>${text} ›</button>`;
}

/** A banner on Lists when lookups are close to, or at, their stop point. */
export function limitsBanner() {
  const st = limitState();
  if (st.level === 'ok') return '';
  const pct = Math.round(st.share * 100);
  const [tone, head, more] = st.level === 'stopped'
    ? ['red', 'Lookups are paused until the 1st', 'This month’s free Google allowance is nearly used, so the app stopped itself before anything could be charged. You can still type values in.']
    : st.level === 'today'
      ? ['amber', 'Today’s lookups are used up', 'The app allows about 4 full lookups a day so the monthly allowance lasts. More tomorrow, free.']
      : ['amber', `Lookups are ${pct}% of the way to their monthly stop`, 'Still free. At 100% the app pauses lookups until the 1st, before anything could be charged.'];
  return `<div class="flag ${tone}" role="status"><span class="ic">!</span><span class="t"><span><b>${head}</b></span><small>${more}</small>
    <button class="btn sm" data-limits style="align-self:flex-start;margin-top:4px">See free limits</button></span></div>`;
}

export function limitsSheet() {
  const draw = () => {
    const u = getUsage(), st = limitState(u), ph = storageUse();
    const bar = (share, tone) => `<span class="lbar ${tone}"><span style="width:${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100)).toFixed(1)}%"></span></span>`;
    const toneOf = s => (s >= 1 ? 'red' : s >= 0.75 ? 'amber' : 'green');
    const nf = n => n.toLocaleString('en-AU');
    const reset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    return `<h3>Free limits</h3>
      <div class="flag green"><span class="ic">✓</span><span class="t"><span><b>Nothing here can charge you</b></span>
        <small>Each lookup is counted. The app stops itself at 90% of Google’s free amount each month, and at a small daily limit, so it can never reach a paid amount. Your $1 Google budget alert is a last backstop.</small></span></div>
      ${st.level !== 'ok' ? limitsBanner().replace(/<button[^]*?<\/button>/, '') : ''}
      <div class="limits">
        <div class="lhead"><span class="eyebrow">Google lookups this month</span><span class="small muted">resets ${reset}</span></div>
        ${Object.entries(u).map(([k, x]) => `<div class="lrow">
          <div class="ltop"><b>${esc(SKUS[k].name)}</b><span class="num small">${nf(x.used)} / ${nf(x.cap)}</span></div>
          ${bar(x.used / x.cap, toneOf(x.used / x.cap))}
          <div class="small muted">Free up to ${nf(x.free)}; stops at ${nf(x.cap)} · today ${x.today} of ${x.dayCap}${x.today >= x.dayCap ? ' <b>(used up today)</b>' : ''}</div></div>`).join('')}
        <div class="lhead"><span class="eyebrow">Photos</span></div>
        <div class="lrow"><div class="ltop"><b>Photo storage</b><span class="num small">${mb(ph.bytes)} / 1 GB</span></div>${bar(ph.share, toneOf(ph.share / 0.95))}
          <div class="small muted">Supabase’s free plan. New photos stop being added before it’s full.</div></div>
        <div class="lhead"><span class="eyebrow">Always free</span></div>
        <ul class="small free-list">
          <li><b>Strata reader and Fill in with Claude</b>: your own Claude chat, covered by your membership. No API key, no per-use charge.</li>
          <li><b>Flood, bushfire & heritage</b>: NSW government maps, free.</li>
          <li><b>Public transport times</b>: Transport NSW’s free key.</li>
          <li><b>Syncing between your phones</b>: Supabase’s free plan, a tiny amount of data.</li>
        </ul>
      </div>
      <p class="small muted" style="margin:0">${usage && usage.at ? `Checked ${new Date(usage.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Not checked yet'} · counts both your phones.</p>
      <div class="row-btns"><button class="btn" data-refresh>Check now</button><button class="btn" data-close>Close</button></div>`;
  };
  const s = openSheet(draw());
  s.onclick = async e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-refresh]')) { await refreshUsage(); s.innerHTML = draw(); }
  };
  refreshUsage().then(() => { if (document.body.contains(s) && !s.hidden) s.innerHTML = draw(); });
}
