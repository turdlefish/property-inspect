// Automatic lookups: asks the property-lookup function (supabase/functions/property-lookup,
// or the test server's stand-in) and saves what comes back on the property.
//
// Looked-up values are marked { auto: true, link } so the page can show where they came
// from. A value one of you typed or corrected is never overwritten by a lookup.

import * as store from './store.js';
import { CONFIG, apiBase } from './config.js';
import { getProperty } from './props.js';
import { settings } from './people.js';
import { fromReply } from './limits.js';

export const PARTS = {
  hazards: 'Flood, bushfire & heritage',
  nbn: 'NBN connection',
  commute: 'Commute times, fares & tolls',
  nearby: 'Nearest supermarket & Bunnings',
};
const running = new Map();   // property id → the parts being looked up (so the page can show progress)
export const lookingUp = id => running.get(id) || null;
let lastUsage = null;        // { geocode: { used, cap }, routesPro: {…}, … } this month, from the latest reply
export const usageToday = () => lastUsage;

/**
 * Looks up `parts` for a property. Resolves { saved: [labels], kept: [field names], notes: [text] }
 * or throws an Error whose message can be shown as it is.
 */
export async function lookUp(id, parts = Object.keys(PARTS), onChange = () => {}) {
  const p = getProperty(id);
  if (!p) throw new Error('That property has gone.');
  if (running.has(id)) return null;
  running.set(id, parts);
  onChange();
  try {
    const st = settings();
    let r;
    try {
      r = await fetch(`${apiBase()}/functions/v1/property-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey },
        body: JSON.stringify({ space: store.getSession().space, address: [p.address, p.suburb].filter(Boolean).join(', '), parts, work: st.work, at: p.geo || undefined }),
      });
    } catch (e) { throw new Error('Couldn’t reach the lookup service. Check your connection and try again.'); }
    if (r.status === 404) throw new Error('Automatic lookups aren’t set up yet. LOOKUPS-SETUP.md has the steps.');
    const j = await r.json().catch(() => ({}));
    if (j.usage) { lastUsage = j.usage; fromReply(j.usage); }
    if (!j.ok) {
      if (j.error === 'limit-day') throw new Error('Today’s lookup limit is reached (about 4 full lookups a day), so nothing can be charged. Try again tomorrow, or type the values in.');
      if (j.error === 'limit' || j.error === 'limit-month') throw new Error('This month’s free Google allowance is nearly used up, so the lookup stopped before anything could be charged. It resets on the 1st. Until then, type the values in.');
      throw new Error(j.error ? `Lookup failed: ${j.error}` : 'Lookup failed. Try again later.');
    }
    return save(id, j, parts);
  } finally {
    running.delete(id);
    onChange();
  }
}

function save(id, j, parts) {
  const p = getProperty(id);
  const entries = {}, kept = [];
  const when = Date.now();
  for (const [k, v] of Object.entries(j.fields || {})) {
    if (v == null) continue;
    const cur = p.rec[k];
    // someone typed or corrected this: keep theirs
    if (cur && cur.v != null && !cur.auto && k !== 'geo') { kept.push(k); continue; }
    entries[k] = [v, { auto: true, link: j.sources?.[k] || sourceFor(k, j.sources) || undefined }];
  }
  for (const [k, url] of Object.entries(j.sources || {})) {
    if (k.startsWith('src_') && !(p.rec[k] && p.rec[k].v && !p.rec[k].auto)) entries[k] = [url, { auto: true }];
  }
  entries.lookedUp = [{ at: when, parts }, { auto: true }];
  store.setFieldsEach('prop-' + id, entries);
  // One workplace is enough (your partner may not have joined yet): only mention it when neither is set.
  const noWork = (j.notes || []).filter(n => n.startsWith('commute: no workplace')).length;
  const notes = (j.notes || []).filter(n => !(n.startsWith('commute: no workplace') && noWork < 2)).map(n => {
    if (n.startsWith('limit-day:')) return 'Today’s lookup limit was reached partway, so some answers are missing. Look up again tomorrow.';
    if (n.startsWith('limit')) return 'This month’s free Google allowance ran out partway, so some answers are missing. It resets on the 1st.';
    if (n.startsWith('commute: no workplace')) return 'Add both workplaces (✎ Workplaces in Commute) to get commute times.';
    if (n.startsWith('commute: TFNSW_KEY')) return 'Public transport times need the Transport NSW key (see LOOKUPS-SETUP.md).';
    if (n.startsWith('nbn: address not found')) return 'nbn didn’t recognise the address. Check it on nbnco.com.au.';
    return n;
  });
  return { saved: parts.map(x => PARTS[x]).filter(Boolean), kept, notes: [...new Set(notes)] };
}

// Which section source covers a field (for the "looked up · source" note).
function sourceFor(k, sources = {}) {
  if (k.startsWith('hz_')) return sources.src_hazards;
  if (k.startsWith('cm:') || k.startsWith('cmr:') || k.startsWith('fare_') || k.startsWith('toll_')) return sources.src_commute;
  if (k.startsWith('groc_') || k.startsWith('bun_')) return sources.src_nearby;
  return null;
}
