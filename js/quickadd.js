// Quick add: one short form to type a property in yourself (Nov 2026).
// Everything is optional except the address. Automatic lookups no longer run
// on their own; they stay as a button on the property ("Look it all up").

import { addProperty, setProps } from './props.js';
import { openSheet, closeSheet, toast } from './ui.js';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const TYPES = ['House', 'Townhouse', 'Villa', 'Apartment', 'Land'];

/** "$780k – $830k", "Guide 1.05m-1.12m", "$795,000" → one number (the middle of a range), or null. */
export function priceFrom(text) {
  const s = String(text || '').toLowerCase().replace(/,/g, '');
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(m|k|mil|million)?/g)]
    .map(([, n, u]) => Number(n) * (u && u.startsWith('m') ? 1e6 : u === 'k' ? 1e3 : 1))
    .map(n => (n < 10 ? n * 1e6 : n < 10000 ? n * 1e3 : n))   // "1.05" → $1.05m, "780" → $780k
    .filter(n => n >= 50000 && n <= 20e6);
  if (!nums.length) return null;
  const pick = nums.slice(0, 2);
  return Math.round(pick.reduce((a, b) => a + b, 0) / pick.length);
}

const stepper = (key, label, v) => `<div class="field"><label>${label}</label><div class="stepper">
  <button type="button" data-qstep="${key}" data-d="-1" aria-label="Fewer ${label.toLowerCase()}">−</button>
  <b class="num" id="qa-${key}">${v}</b>
  <button type="button" data-qstep="${key}" data-d="1" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;

/** Opens the Quick add sheet. onSaved(id) runs after it's saved. */
export function quickAddSheet(nav, onSaved = () => {}) {
  let type = '';
  const n = { beds: 2, baths: 1, cars: 1 };
  const s = openSheet(`<h3>Add a property</h3>
    <form id="qaForm" novalidate style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label for="qa-addr">Address</label><input class="input" id="qa-addr" placeholder="7/21 Wattle St, Dulwich Hill" autocomplete="off" required></div>
      <div class="field"><label>Type</label><div class="seg" role="radiogroup" style="flex-wrap:wrap">${TYPES.map(t => `<button type="button" data-qtype="${t}" aria-pressed="false">${t}</button>`).join('')}</div></div>
      <div class="field"><label for="qa-price">Price or guide</label><input class="input" id="qa-price" placeholder="$780k – $830k" autocomplete="off"><span class="small muted" id="qa-pnum"></span></div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">${stepper('beds', 'Beds', n.beds)}${stepper('baths', 'Baths', n.baths)}${stepper('cars', 'Car spaces', n.cars)}</div>
      <div class="field"><label for="qa-link">Listing link <span class="muted">(optional)</span></label><input class="input" id="qa-link" inputmode="url" autocapitalize="off" placeholder="https://…" autocomplete="off"></div>
      <div class="field"><label>Open home <span class="muted">(optional)</span></label><div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="input" id="qa-date" type="date" style="flex:1 1 140px"><input class="input" id="qa-start" type="time" style="flex:0 1 110px" aria-label="Starts"><input class="input" id="qa-end" type="time" style="flex:0 1 110px" aria-label="Ends"></div></div>
      <div class="field"><label>Auction <span class="muted">(optional)</span></label><div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="input" id="qa-adate" type="date" style="flex:1 1 140px" aria-label="Auction day"><input class="input" id="qa-atime" type="time" style="flex:0 1 110px" aria-label="Auction time"></div>
        <span class="small muted">You can add whether it sold, passed in or was withdrawn later, on the property.</span></div>
      <div class="field"><label for="qa-note">Notes <span class="muted">(optional)</span></label><textarea class="input" id="qa-note" rows="2" placeholder="First thoughts, agent's name, anything"></textarea></div>
      <p class="err" id="qa-err" hidden></p>
      <div class="row-btns"><button class="btn primary">Save</button><button type="button" class="btn" data-close>Cancel</button></div>
      <p class="small muted" style="margin:0">Flood, bushfire, commute and nearby shops can be looked up later from the property, if you want them.</p>
    </form>`);
  const $ = q => s.querySelector(q);
  $('#qa-addr').focus();

  $('#qa-price').oninput = () => {
    const v = priceFrom($('#qa-price').value);
    $('#qa-pnum').textContent = v ? `Budget will use about $${v.toLocaleString('en-AU')}` : '';
  };
  // End time follows the start (inspections default to 30 minutes) until you change it.
  let endTouched = false;
  $('#qa-end').oninput = () => { endTouched = true; };
  $('#qa-start').oninput = () => {
    const v = $('#qa-start').value;
    if (endTouched || !v) return;
    const [h, m] = v.split(':').map(Number);
    const t = h * 60 + m + 30;
    $('#qa-end').value = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };

  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const t = e.target.closest('[data-qtype]');
    if (t) {
      type = type === t.dataset.qtype ? '' : t.dataset.qtype;
      s.querySelectorAll('[data-qtype]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.qtype === type)));
      return;
    }
    const st = e.target.closest('[data-qstep]');
    if (st) {
      const k = st.dataset.qstep;
      n[k] = Math.max(0, Math.min(9, n[k] + Number(st.dataset.d)));
      $('#qa-' + k).textContent = n[k];
    }
  };

  $('#qaForm').onsubmit = e => {
    e.preventDefault();
    const addr = $('#qa-addr').value.trim();
    const err = $('#qa-err');
    if (!addr) { err.hidden = false; err.textContent = 'Add the address first.'; return $('#qa-addr').focus(); }
    const date = $('#qa-date').value, start = $('#qa-start').value;
    if (date && !start) { err.hidden = false; err.textContent = 'Add the open home’s start time too (or clear the date).'; return $('#qa-start').focus(); }

    const price = $('#qa-price').value.trim();
    const extra = { beds: n.beds, baths: n.baths, cars: n.cars };
    if (type) extra.type = type;
    if (price) { extra.price = price; const pn = priceFrom(price); if (pn) extra.priceNum = pn; }
    const link = $('#qa-link').value.trim();
    const adate = $('#qa-adate').value;
    if (adate) extra.auction = { date: adate, time: $('#qa-atime').value || '', outcome: '', outDate: '', note: '' };
    if (link) extra.src_facts = /^https?:\/\//i.test(link) ? link : 'https://' + link;
    const id = addProperty(addr, extra);

    // Notes and the open home carry who added them, so they're saved after the property exists.
    const more = {};
    const note = $('#qa-note').value.trim();
    if (note) more['note:' + newId()] = { text: note };
    if (date) more['insp:' + newId()] = { date, start, end: $('#qa-end').value || start, note: '' };
    if (Object.keys(more).length) setProps(id, more);

    closeSheet();
    toast('Added to To review');
    onSaved(id);
  };
  return s;
}
