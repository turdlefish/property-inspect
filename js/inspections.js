// Inspection times and the Inspections tab (a week strip and the day's run sheet).
//
// Each time is a field on its property: insp:<id> = { date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM', note }.

import { allProperties, getProperty, setProp, addProperty, LISTS } from './props.js';
import { flagCounts } from './property.js';
import { esc, openSheet, closeSheet, toast } from './ui.js';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const mins = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const today = () => iso(new Date());
export const time12 = t => { const m = mins(t); const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${pad(mm)}${h < 12 ? 'am' : 'pm'}`; };
export const dayLabel = s => fromIso(s).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const addMins = (t, n) => { const m = mins(t) + n; return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };

/** A property's inspection times, soonest first. */
export function inspectionsOf(p) {
  return Object.entries(p.rec)
    .filter(([k, r]) => k.startsWith('insp:') && r.v)
    .map(([k, r]) => ({ key: k, ...r.v }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
// A time is on your schedule unless it came from a listing and you haven't chosen it (planned: false).
export const onSchedule = x => x.planned !== false;
/** The next time on your schedule from today on, or null. */
export const nextInspection = p => inspectionsOf(p).find(x => onSchedule(x) && x.date >= today()) || null;
/** Puts a listed open home on your schedule, or takes it off. */
export function toggleSchedule(id, key) {
  const v = getProperty(id).rec[key].v;
  setProp(id, key, { ...v, planned: !onSchedule(v) });
  return !onSchedule(v);
}
export const inspText = x => `${dayLabel(x.date)} · ${time12(x.start)}`;

/** Add (or edit) an inspection time. opts: { propId, date, key } */
export function inspectionSheet(opts, done) {
  const props = allProperties().filter(p => p.list !== 'sold');
  const cur = opts.key ? getProperty(opts.propId).rec[opts.key].v : null;
  const date = cur ? cur.date : (opts.date || today());
  const s = openSheet(`<h3>${cur ? 'Change inspection time' : 'Add an inspection time'}</h3>
    <form id="inspForm" style="display:flex;flex-direction:column;gap:10px">
      ${opts.propId ? `<p class="muted" style="margin:0"><b style="color:var(--ink)">${esc(getProperty(opts.propId).address)}</b></p>` : `
      <div class="field"><label for="i-prop">Property</label><select class="input" id="i-prop">
        <option value="">A new address…</option>${props.map(p => `<option value="${p.id}">${esc(p.address)}${p.suburb ? ', ' + esc(p.suburb.split(' NSW')[0]) : ''}</option>`).join('')}</select></div>
      <div class="field" id="i-newf"><label for="i-new">New address</label><input class="input" id="i-new" placeholder="e.g. 8 Heron St, Marrickville NSW 2204"><span class="small muted">It’s added to To review.</span></div>`}
      <div class="field"><label for="i-date">Day</label><input class="input" id="i-date" type="date" value="${date}"></div>
      <div class="grid2"><div class="field"><label for="i-start">Starts</label><input class="input" id="i-start" type="time" value="${cur ? cur.start : '10:00'}"></div>
        <div class="field"><label for="i-end">Ends</label><input class="input" id="i-end" type="time" value="${cur ? cur.end : '10:20'}"></div></div>
      <div class="field"><label for="i-note">Note (optional)</label><input class="input" id="i-note" value="${esc(cur?.note || '')}" placeholder="e.g. Private inspection, agent Sam 0400 000 000"></div>
      <p class="err" id="i-err" hidden></p>
      <div class="row-btns"><button class="btn primary">${cur ? 'Save' : 'Add time'}</button><button type="button" class="btn" data-close>Cancel</button>${cur ? '<button type="button" class="btn" data-remove style="margin-left:auto;color:var(--red)">Remove</button>' : ''}</div>
    </form>`);
  const sel = s.querySelector('#i-prop');
  const syncNew = () => { if (sel) s.querySelector('#i-newf').hidden = !!sel.value; };
  if (sel) { if (props.length) sel.value = props[0].id; sel.onchange = syncNew; syncNew(); }
  // keep the end 20 minutes after the start unless you change it
  s.querySelector('#i-start').onchange = e => { if (!cur) s.querySelector('#i-end').value = addMins(e.target.value, 20); };
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-remove]')) { setProp(opts.propId, opts.key, null); closeSheet(); toast('Inspection removed'); done(); }
  };
  s.querySelector('#inspForm').onsubmit = e => {
    e.preventDefault();
    const err = t => { const x = s.querySelector('#i-err'); x.hidden = false; x.textContent = t; };
    // a time you add yourself goes on the schedule; editing a listed one keeps its state
    const v = { date: s.querySelector('#i-date').value, start: s.querySelector('#i-start').value, end: s.querySelector('#i-end').value, note: s.querySelector('#i-note').value.trim(), planned: cur ? onSchedule(cur) : true };
    if (!v.date || !v.start) return err('Pick the day and the start time.');
    if (v.end && mins(v.end) <= mins(v.start)) return err('The end time needs to be after the start.');
    let pid = opts.propId || (sel && sel.value);
    if (!pid) {
      const a = s.querySelector('#i-new').value.trim();
      if (!a) return err('Choose a property or type a new address.');
      pid = addProperty(a);
    }
    setProp(pid, opts.key || 'insp:' + newId(), v);
    closeSheet();
    toast(cur ? 'Inspection time saved' : `Added for ${dayLabel(v.date)}`);
    done(v.date);
  };
}

// ── The Inspections tab ──────────────────────────────────────────────────
const state = { day: null };

function everything() {
  const out = [];
  for (const p of allProperties()) for (const x of inspectionsOf(p)) if (onSchedule(x)) out.push({ ...x, p });
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export function renderInspections(view, topbar, nav) {
  topbar.set('Inspections', { action: '<button class="iconbtn" data-addinsp-top style="background:var(--accent);color:var(--accent-ink);border-color:var(--accent)">＋ Add</button>' });
  document.querySelector('[data-addinsp-top]').onclick = () => inspectionSheet({ date: state.day }, day => { if (day) { state.day = day; state.picked = true; } nav.render(true); });
  const all = everything();
  // Until you pick a day, show the next day with an inspection (it may only arrive with the first sync).
  if (!state.picked) state.day = (all.find(x => x.date >= today()) || {}).date || today();
  // the Monday-to-Sunday week holding the chosen day
  const d0 = fromIso(state.day);
  const mon = new Date(d0); mon.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
  const week = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return iso(d); });
  const has = new Set(all.map(x => x.date));
  const list = all.filter(x => x.date === state.day);
  const upcoming = all.filter(x => x.date >= today());

  const legs = [];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1], cur = list[i];
    const gap = mins(cur.start) - mins(prev.end || prev.start);
    const dir = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(addr(prev.p))}&destination=${encodeURIComponent(addr(cur.p))}&travelmode=driving`;
    legs[i] = gap < 0
      ? `<div class="leg warn">⚠ Clash: starts ${-gap} min before ${esc(prev.p.address)} ends</div>`
      : `<div class="leg ${gap < 10 ? 'warn' : ''}">${gap < 10 ? '⚠ Only ' : ''}${gap} min to get there · <a href="${dir}" target="_blank" rel="noopener">drive time ↗</a></div>`;
  }
  const route = list.length > 1 ? 'https://www.google.com/maps/dir/' + list.map(x => encodeURIComponent(addr(x.p))).join('/') : '';

  view.innerHTML = `
    <div class="sec-head"><button class="iconbtn" data-wk="-7" aria-label="Previous week">‹</button><b style="flex:1;text-align:center">${fromIso(week[0]).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${fromIso(week[6]).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</b><button class="iconbtn" data-wk="7" aria-label="Next week">›</button></div>
    <div class="week">${week.map(d => { const x = fromIso(d); return `<button data-day="${d}" aria-pressed="${state.day === d}" class="${has.has(d) ? 'has' : ''} ${d === today() ? 'today' : ''}">${x.toLocaleDateString('en-AU', { weekday: 'short' })}<b>${x.getDate()}</b></button>`; }).join('')}</div>
    <div class="sec-head"><h3 style="font-size:18px">${fromIso(state.day).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</h3><span class="muted small">${list.length} booked</span></div>
    ${list.length ? list.map((x, i) => (legs[i] || '') + slot(x)).join('') : '<div class="empty">No inspections this day.<br>Tap ＋ Add to book one.</div>'}
    ${route ? `<a class="btn" href="${route}" target="_blank" rel="noopener">Open the whole run in Google Maps ↗</a>` : ''}
    <button class="btn primary" data-addinsp>＋ Add an inspection time</button>
    ${upcoming.length ? `<div class="card"><h3>Coming up</h3>${groupByDay(upcoming).map(([d, xs]) => `<button class="opt" data-day="${d}"><span style="flex:1">${dayLabel(d)}</span><span class="pill accent">${xs.length}</span></button>`).join('')}</div>` : ''}`;

  view.onclick = e => {
    const t = e.target.closest('[data-day],[data-wk],[data-addinsp],[data-open],[data-editinsp],[data-viewed]');
    if (!t) return;
    const d = t.dataset;
    const pick = day => { if (day) { state.day = day; state.picked = true; } nav.render(true); };
    if (d.day) return pick(d.day);
    if (d.wk) { const x = fromIso(state.day); x.setDate(x.getDate() + Number(d.wk)); return pick(iso(x)); }
    if (t.hasAttribute('data-addinsp')) return inspectionSheet({ date: state.day }, pick);
    if (d.open) return nav.go('prop-' + d.open);
    if (d.editinsp) return inspectionSheet({ propId: d.pid, key: d.editinsp }, pick);
    if (d.viewed) { const p = getProperty(d.viewed); setProp(p.id, 'viewed', !p.viewed); toast(p.viewed ? 'Marked as not viewed' : 'Marked as viewed'); return nav.render(true); }
  };
}

const addr = p => [p.address, p.suburb].filter(Boolean).join(', ');
function groupByDay(xs) {
  const m = new Map();
  xs.forEach(x => m.set(x.date, [...(m.get(x.date) || []), x]));
  return [...m.entries()].slice(0, 8);
}

function slot(x) {
  const p = x.p, l = LISTS[p.list] || LISTS.review, c = flagCounts(p);
  const past = x.date < today();
  return `<div class="slot ${past ? 'past' : ''}"><div class="time">${time12(x.start)}<small>${x.end ? time12(x.end) : ''}</small></div><div class="card">
    <div class="sec-head"><b style="flex:1">${esc(p.address)}</b><span class="pill ${l.tone}">${l.label}</span></div>
    <div class="muted small">${esc([p.suburb, p.beds != null && p.beds + ' bed', p.cars != null && p.cars + ' car'].filter(Boolean).join(' · '))}</div>
    ${p.price ? `<div class="num" style="font-weight:600">${esc(p.price)}</div>` : ''}
    ${x.note ? `<div class="small">${esc(x.note)}</div>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap">${c.red ? `<span class="pill red">${c.red} red flag${c.red > 1 ? 's' : ''}</span>` : ''}${c.amber ? `<span class="pill amber">${c.amber} to check</span>` : ''}</div>
    <div class="row-btns"><button class="btn sm primary" data-open="${p.id}">Open property</button>
      <a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr(p))}" target="_blank" rel="noopener">Directions ↗</a>
      <button class="btn sm ${p.viewed ? 'on-green' : ''}" data-viewed="${p.id}" aria-pressed="${!!p.viewed}">${p.viewed ? '✓ Viewed' : 'Mark viewed'}</button>
      <button class="edit" data-editinsp="${x.key}" data-pid="${p.id}" aria-label="Change time">✎</button></div></div></div>`;
}
