// The auction (Nov 2026): when it is, and what happened on the day.
//
// One field on the property: auction = { date: 'YYYY-MM-DD', time: 'HH:MM', outcome, outDate, note }
//   outcome: '' (not held yet) | 'sold' | 'passed' (passed in) | 'withdrawn'
//   outDate: the day that happened (usually the auction day; a withdrawal is often earlier)

import { getProperty, setProp } from './props.js';
import { esc, openSheet, closeSheet, toast } from './ui.js';

export const OUTCOMES = {
  '': ['Not held yet', ''],
  sold: ['Sold', 'green'],
  passed: ['Passed in', 'amber'],
  withdrawn: ['Withdrawn', 'red'],
};

const pad = n => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dShort = s => new Date(s + 'T00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const t12 = t => { const [h, m] = String(t).split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m || 0)}${h < 12 ? 'am' : 'pm'}`; };

/** The auction if one is set, else null. */
export const auctionOf = p => (p && p.auction && p.auction.date ? p.auction : null);

/** "Sat 6 Dec · 11:00am", or "Passed in · Sat 6 Dec". */
export function auctionText(a) {
  if (!a) return '';
  if (a.outcome) return `${OUTCOMES[a.outcome][0]} · ${dShort(a.outDate || a.date)}`;
  return `${dShort(a.date)}${a.time ? ' · ' + t12(a.time) : ''}`;
}

/** A small pill for cards and the property title. */
export function auctionPill(p) {
  const a = auctionOf(p);
  if (!a) return '';
  if (a.outcome) return `<span class="pill ${OUTCOMES[a.outcome][1]}">Auction: ${esc(auctionText(a))}</span>`;
  if (a.date < todayIso()) return '<span class="pill amber">Auction held · add the result</span>';
  return `<span class="pill blue">Auction ${esc(auctionText(a))}</span>`;
}

/** Add or change the auction, and its result. */
export function auctionSheet(id, done) {
  const p = getProperty(id);
  const cur = auctionOf(p);
  let outcome = cur?.outcome || '';
  const s = openSheet(`<h3>${cur ? 'Auction' : 'Add the auction'}</h3>
    <p class="muted" style="margin:0"><b style="color:var(--ink)">${esc(p.address)}</b></p>
    <form id="aucForm" novalidate style="display:flex;flex-direction:column;gap:10px">
      <div class="grid2"><div class="field"><label for="au-date">Auction day</label><input class="input" id="au-date" type="date" value="${esc(cur?.date || '')}"></div>
        <div class="field"><label for="au-time">Time</label><input class="input" id="au-time" type="time" value="${esc(cur?.time || '')}"></div></div>
      <div class="field"><label>What happened</label><div class="seg" role="radiogroup" style="flex-wrap:wrap">${Object.entries(OUTCOMES).map(([k, [l]]) => `<button type="button" data-out="${k}" aria-pressed="${outcome === k}">${l}</button>`).join('')}</div></div>
      <div class="field" id="au-outf"><label for="au-out" id="au-outl">Date it happened</label><input class="input" id="au-out" type="date" value="${esc(cur?.outDate || cur?.date || '')}"><span class="small muted" id="au-hint"></span></div>
      <div class="field"><label for="au-note">Note (optional)</label><input class="input" id="au-note" value="${esc(cur?.note || '')}" placeholder="e.g. Passed in at $1.02m, vendor bid. Now $1.1m."></div>
      <p class="err" id="au-err" hidden></p>
      <div class="row-btns"><button class="btn primary">Save</button><button type="button" class="btn" data-close>Cancel</button>${cur ? '<button type="button" class="btn" data-remove style="margin-left:auto;color:var(--red)">Remove</button>' : ''}</div>
    </form>`);
  const $ = q => s.querySelector(q);
  const sync = () => {
    $('#au-outf').hidden = !outcome;
    $('#au-outl').textContent = { sold: 'Date it sold', passed: 'Date it passed in', withdrawn: 'Date it was withdrawn' }[outcome] || 'Date it happened';
    $('#au-hint').textContent = outcome === 'sold' ? 'To keep the sale price, also use ⋯ → Sold on the property.' : outcome === 'passed' ? 'Passed in: no bid reached the reserve, so it’s usually still for sale.' : outcome === 'withdrawn' ? 'Withdrawn: taken off the auction, often sold before it or relisted.' : '';
    if (outcome && !$('#au-out').value) $('#au-out').value = outcome === 'withdrawn' ? todayIso() : ($('#au-date').value || todayIso());
  };
  sync();
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-remove]')) { setProp(id, 'auction', null); closeSheet(); toast('Auction removed'); return done(); }
    const b = e.target.closest('[data-out]');
    if (b) {
      outcome = b.dataset.out;
      s.querySelectorAll('[data-out]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      sync();
    }
  };
  $('#aucForm').onsubmit = e => {
    e.preventDefault();
    const err = t => { const x = $('#au-err'); x.hidden = false; x.textContent = t; };
    const date = $('#au-date').value;
    if (!date) return err('Add the auction day.');
    const v = { date, time: $('#au-time').value || '', outcome, outDate: outcome ? ($('#au-out').value || date) : '', note: $('#au-note').value.trim() };
    setProp(id, 'auction', v);
    closeSheet();
    toast(outcome ? `Saved: ${OUTCOMES[outcome][0].toLowerCase()}` : `Auction saved for ${dShort(date)}`);
    done();
  };
}
