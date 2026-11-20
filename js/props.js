// Properties: one shared document per property ("prop-<id>"), made of fields
// that both of you can set (see store.js setField / merged).

import * as store from './store.js';

export const LISTS = {
  review: { label: 'To review', tone: 'accent' },
  short: { label: 'Shortlist', tone: 'green' },
  notideal: { label: 'Not ideal', tone: 'blue' },
  sold: { label: 'Sold', tone: 'red' },
};

const docOf = id => 'prop-' + id;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** "7/21 Wattle Street, Dulwich Hill NSW 2203" → address + suburb. */
export function splitAddress(text) {
  const [a, ...rest] = String(text).split(',');
  return { address: a.trim(), suburb: rest.join(',').trim() };
}

export function addProperty(text, extra = {}) {
  const id = newId();
  const { address, suburb } = splitAddress(text);
  store.setFields(docOf(id), { address, suburb, list: 'review', created: Date.now(), ...extra });
  return id;
}

/** One property: its merged values, plus `rec` (who set each field, when, and why). */
export function getProperty(id) {
  const rec = store.merged(docOf(id));
  const v = store.values(docOf(id));
  if (!v.address || v.deleted) return null;
  // The "Do not buy" list became "Sold" (Nov 2026); anything still on it shows under Not ideal.
  if (v.list === 'nobuy' || !LISTS[v.list]) v.list = v.list === 'nobuy' ? 'notideal' : 'review';
  return { id, ...v, rec };
}

export function allProperties() {
  return store.docsLike('prop-')
    .map(d => getProperty(d.slice(5)))
    .filter(Boolean)
    .sort((x, y) => (y.created || 0) - (x.created || 0));
}

export const setProp = (id, key, value, meta) => store.setField(docOf(id), key, value, meta);
export const setProps = (id, values) => store.setFields(docOf(id), values);
// Moving clears both of your votes, so a property moved back to To review starts fresh.
export const moveTo = (id, list) => setProps(id, { list, 'vote:a': null, 'vote:b': null });

// ── Deciding together (To review) ────────────────────────────────────────
// Each of you votes Shortlist or Not ideal (fields vote:a / vote:b). It only moves once you agree.
export const VOTES = { short: 'Shortlist', notideal: 'Not ideal' };
export function votesOf(p) { return { a: p['vote:a'] || null, b: p['vote:b'] || null }; }
/** Casts my vote; returns the list it moved to when we now agree, else null. */
export function vote(id, choice) {
  const p = getProperty(id);
  const mine = store.me(), theirs = store.partner();
  const next = p['vote:' + mine] === choice ? null : choice;   // tapping your vote again takes it back
  setProp(id, 'vote:' + mine, next);
  if (next && p['vote:' + theirs] === next && p.list === 'review') { moveTo(id, next); return next; }
  return null;
}
/** If both votes already agree (e.g. you voted on two phones at once), finish the move. */
export function settleVotes(p) {
  const v = votesOf(p);
  if (p.list === 'review' && v.a && v.a === v.b) { moveTo(p.id, v.a); return true; }
  return false;
}

// ── Sold ─────────────────────────────────────────────────────────────────
// Selling moves it to Sold, remembers which list it came from, and adds the sale to its sales history.
export function markSold(id, { price, date, listed, link }) {
  const p = getProperty(id);
  const v = { list: 'sold', listBefore: p.list === 'sold' ? (p.listBefore || 'notideal') : p.list, soldPrice: price || null, soldDate: date || null, listedDate: listed || p.listedDate || null, 'vote:a': null, 'vote:b': null };
  if (link) v.src_sold = link;
  if (price) v['sale:sold'] = { when: (date || new Date().toISOString().slice(0, 10)).slice(0, 7), price, note: 'sold while we watched' };
  setProps(id, v);
}
export function unSold(id) {
  const p = getProperty(id);
  setProps(id, { list: p.listBefore || 'notideal', soldPrice: null, soldDate: null, 'sale:sold': null });
}
/** Sold price against the price guide (priceNum), and days on the market. */
export function saleStats(p) {
  const days = p.soldDate && p.listedDate ? Math.round((new Date(p.soldDate) - new Date(p.listedDate)) / 864e5) : null;
  const vsGuide = p.soldPrice && p.priceNum ? (p.soldPrice - p.priceNum) / p.priceNum * 100 : null;
  return { days, vsGuide };
}
// Deleting keeps a marker (so the deletion syncs to your partner) and clears the rest.
export function deleteProperty(id) {
  const blank = {};
  for (const k of Object.keys(store.merged(docOf(id)))) blank[k] = null;
  store.setFields(docOf(id), { ...blank, deleted: true });
}

/** Example properties for the test server (Us → Add example properties). */
export function addExamples() {
  const ex = [
    ['7/21 Wattle Street, Dulwich Hill NSW 2203', { list: 'short', type: 'Apartment', price: 'Guide $780k – $830k', priceNum: 810000, beds: 2, baths: 1, cars: 1, viewed: true,
      size: '84 m² internal · 11 m² balcony', garage: 'Yes · lock-up garage', nbn: 'FTTP · fibre to the premises', est: '$795k – $845k',
      councilQ: 420, waterQ: 180, levyQ: 1350, access: 'lift', level: 3, flights: 3, amen: ['Gym', 'BBQ area'], facing: 40,
      'hz_flood': { sev: 'none', kind: 'Outside the flood planning area', detail: '' },
      'hz_heritage': { sev: 'low', kind: 'Inside a Heritage Conservation Area (local)', detail: 'External changes need council approval.' },
      'flag:ex1': { tone: 'red', title: 'Special levy still owing', detail: '$4,200 per lot due Mar 2027 for balcony waterproofing', link: '' },
      'flag:ex2': { tone: 'green', title: 'Lift replaced 2023', detail: 'Paid from capital works, no levy', link: '' },
      'sale:ex1': { when: '2019-03', price: 640000, note: '' }, 'sale:ex2': { when: '2012-06', price: 455000, note: '' },
      'cm:a:to': { pt: [38, 44, 52, 47], dr: [22, 31, 44, 39], nt: [22, 31, 44, 39] }, 'cm:b:to': { pt: [55, 61, 72, 66], dr: [27, 38, 55, 49], nt: [36, 52, 74, 63] },
      'tag:Bright': 'like', 'tag:Quiet': 'like', 'tag:Dark entry': 'dislike' }],
    ['14 Corella Avenue, Ermington NSW 2115', { list: 'short', type: 'Townhouse', price: 'Guide $1.05m – $1.12m', beds: 3, baths: 2, cars: 2 }],
    ['3/9 Banksia Parade, Campsie NSW 2194', { list: 'review', type: 'Apartment', price: 'Guide $620k – $660k', beds: 2, baths: 1, cars: 0 }],
    ['22 Lyrebird Close, Kellyville NSW 2155', { list: 'notideal', type: 'House', price: 'Guide $1.2m – $1.3m', beds: 4, baths: 2, cars: 2 }],
    ['11/2 Grevillea Lane, Wolli Creek NSW 2205', { list: 'sold', listBefore: 'notideal', type: 'Apartment', price: 'Guide $740k – $780k', priceNum: 760000, beds: 2, baths: 2, cars: 1,
      soldPrice: 795000, soldDate: '2026-11-08', listedDate: '2026-10-02', 'sale:sold': { when: '2026-11', price: 795000, note: 'sold while we watched' } }],
  ];
  // Open homes next Saturday: two that clash and one with a tight gap, for trying the run sheet.
  const sat = new Date(); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
  const day = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
  const times = [['10:00', '10:20'], ['11:15', '11:45'], ['11:30', '11:50'], null, null];
  const have = new Set(allProperties().map(p => p.address));
  ex.forEach(([a, x], i) => have.has(splitAddress(a).address) || addProperty(a, { ...x, created: Date.now() - i * 1000, ...(times[i] ? { ['insp:ex' + i]: { date: day, start: times[i][0], end: times[i][1], note: '' } } : {}) }));
}
