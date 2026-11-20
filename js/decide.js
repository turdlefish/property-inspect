// Deciding together (votes in To review) and marking a property sold. Used by the
// Lists screen and the property page.

import * as store from './store.js';
import { getProperty, votesOf, vote, markSold, unSold, saleStats, LISTS, VOTES } from './props.js';
import { nameOf } from './people.js';
import { esc, money, openSheet, closeSheet, toast } from './ui.js';

/** The Shortlist / Not ideal buttons for a property in To review, with where each of you stands. */
export function voteBlock(p, compact = false) {
  if (p.list !== 'review') return '';
  const v = votesOf(p), me = store.me(), them = store.partner();
  const mine = v[me], theirs = v[them];
  const say = x => (x ? VOTES[x] : 'not yet');
  const status = !mine && !theirs ? 'Both of you need to pick the same one to move it.'
    : mine && theirs && mine !== theirs ? `You picked different ones: talk it over. You: ${say(mine)} · ${nameOf(them)}: ${say(theirs)}`
      : mine ? `Waiting for ${nameOf(them)}. You: ${say(mine)}`
        : `${nameOf(them)} picked ${say(theirs)}. Your turn.`;
  const tone = mine && theirs && mine !== theirs ? 'amber' : '';
  return `<div class="vote ${compact ? 'compact' : ''}" ${compact ? '' : 'id="s-vote"'}>
    ${compact ? '' : '<div class="sec-head"><h3>Shortlist it?</h3></div>'}
    <div class="vote-btns">${Object.entries(VOTES).map(([k, t]) => `<button class="btn sm vbtn ${k}" data-vote="${k}" data-id="${p.id}" aria-pressed="${mine === k}">${k === 'short' ? '✓' : '✕'} ${t}${theirs === k ? ` <span class="vmark">${esc(nameOf(them)[0] || '•')}</span>` : ''}</button>`).join('')}</div>
    <span class="small ${tone ? 'warn-text' : 'muted'}">${esc(status)}</span></div>`;
}

/** Handles a tap on a vote button; returns true if it was one. */
export function onVote(target, done) {
  const b = target.closest('[data-vote]');
  if (!b) return false;
  const moved = vote(b.dataset.id, b.dataset.vote);
  toast(moved ? `You both agreed: moved to ${LISTS[moved].label}` : 'Your vote is in');
  done(moved);
  return true;
}

/** "Sold" sheet: price, date, when it was listed (for days on market), and a link to the sold listing. */
export function soldSheet(id, done) {
  const p = getProperty(id);
  const today = new Date().toISOString().slice(0, 10);
  const s = openSheet(`<h3>Mark ${esc(p.address)} as sold</h3>
    <p class="small muted" style="margin:0">The app can’t fetch sold prices by itself (that needs a paid property-data service), so add what the agent or the sold listing says. Price not out yet? Leave it blank and add it later.</p>
    <form id="soldForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="grid2"><div class="field"><label for="s-price">Sold for</label><input class="input num" id="s-price" inputmode="numeric" value="${p.soldPrice || ''}" placeholder="e.g. 795000"></div>
        <div class="field"><label for="s-date">Sold on</label><input class="input" id="s-date" type="date" value="${p.soldDate || today}"></div></div>
      <div class="field"><label for="s-listed">First listed (optional)</label><input class="input" id="s-listed" type="date" value="${p.listedDate || ''}"><span class="small muted">For days on the market.</span></div>
      <div class="field"><label for="s-link">Sold listing link (optional)</label><input class="input" id="s-link" type="url" value="${esc(p.src_sold || '')}" placeholder="https://…"></div>
      <div class="row-btns"><button class="btn primary">Mark as sold</button>${p.list === 'sold' ? '<button type="button" class="btn" data-unsold>Not sold after all</button>' : ''}<button type="button" class="btn" data-close>Cancel</button></div></form>`);
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-unsold]')) { unSold(id); closeSheet(); toast(`Moved back to ${LISTS[getProperty(id).list].label}`); done(); }
  };
  s.querySelector('#soldForm').onsubmit = e => {
    e.preventDefault();
    const price = Number(String(s.querySelector('#s-price').value).replace(/[^\d.]/g, '')) || null;
    markSold(id, { price, date: s.querySelector('#s-date').value || null, listed: s.querySelector('#s-listed').value || null, link: s.querySelector('#s-link').value.trim() || null });
    closeSheet();
    toast(price ? `Sold for ${money(price)}` : 'Marked as sold. Add the price when it’s out.');
    done();
  };
}

const dateText = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

/** One line about a sale, for list cards and the property page. */
export function soldLine(p) {
  if (p.list !== 'sold') return '';
  const { days, vsGuide } = saleStats(p);
  return `<div class="market">${p.soldPrice ? `<b class="num">${money(p.soldPrice)}</b>` : '<span class="pill amber">Price not added</span>'}${p.soldDate ? `<span class="muted">${dateText(p.soldDate)}</span>` : ''}${vsGuide != null ? `<span class="num ${vsGuide >= 0 ? 'up' : 'down'}">${vsGuide >= 0 ? '▲' : '▼'} ${Math.abs(vsGuide).toFixed(1)}% vs guide</span>` : ''}${days != null ? `<span class="muted">· ${days} days on market</span>` : ''}</div>`;
}

/** What the sold properties say about the market (top of the Sold list). */
export function soldSummary(props) {
  const priced = props.filter(p => p.soldPrice);
  if (!props.length) return '';
  const vs = priced.map(p => saleStats(p).vsGuide).filter(x => x != null);
  const days = props.map(p => saleStats(p).days).filter(x => x != null);
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const median = a => { const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  return `<div class="card"><div class="sec-head"><h3>What’s selling</h3><span class="pill red">${props.length} sold</span></div>
    <p class="small muted" style="margin:0">Properties you were watching that have sold. Mark one sold from its ⋯ menu or its page.</p>
    <div class="tiles">
      <div><span class="eyebrow">Avg vs guide</span><span class="num ${vs.length && avg(vs) >= 0 ? 'up' : 'down'}">${vs.length ? `${avg(vs) >= 0 ? '+' : ''}${avg(vs).toFixed(1)}%` : '—'}</span><span class="small muted">${vs.length} with a guide</span></div>
      <div><span class="eyebrow">Avg days listed</span><span class="num">${days.length ? Math.round(avg(days)) : '—'}</span><span class="small muted">${days.length} with dates</span></div>
      <div><span class="eyebrow">Median price</span><span class="num">${priced.length ? money(median(priced.map(p => p.soldPrice))) : '—'}</span><span class="small muted">${priced.length} priced</span></div>
    </div>
    ${props.length - priced.length ? `<p class="small" style="margin:0">${props.length - priced.length} still need a sold price.</p>` : ''}</div>`;
}
