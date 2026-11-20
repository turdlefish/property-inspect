// Fill in with Claude (step 7): listing details, inspection times, sales history and value, using
// your own Claude chat (covered by your Claude membership, no API key).
//
//   1. The app copies a ready-made prompt for this property.
//   2. You paste it into Claude with the listing link (or the page text).
//   3. Claude answers with a JSON block; you copy it and paste it back here.
//   4. The app shows what it found, and fills it in when you tap "Fill in".
//
// Values that came from Claude are marked { auto: true, via: 'claude', link }. Anything either of you
// typed or corrected is kept, the same rule as the automatic lookups.

import * as store from './store.js';
import { getProperty } from './props.js';
import { esc, money, openSheet, closeSheet, toast, copyText } from './ui.js';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// The listing sites block automated reading (Claude included), so the page text you copied can
// travel inside the prompt instead of links. Long pages are trimmed to keep the prompt a sensible size.
const clip = (t, n = 30000) => { const s = String(t || '').replace(/\n{3,}/g, '\n\n').trim(); return s.length > n ? s.slice(0, n) + '\n[…trimmed]' : s; };

export function buildPrompt(p, pages = {}) {
  const listing = clip(pages.listing), history = clip(pages.history);
  const where = listing || history
    ? `${listing ? 'The listing page text is below, between <listing> tags.' : 'Listing link: [paste the realestate.com.au or Domain link here, or leave out]'}
${history ? 'The sale history page text is below, between <history> tags.' : ''}`
    : `Listing link: [paste the realestate.com.au or Domain link here]
Sale history link (optional): [paste a property.com.au or Domain property profile link here]`;
  return `I'm using an app called Property Inspect to compare homes to buy in NSW, Australia. Please find the details of this property and reply with ONLY one JSON code block in the format at the end, nothing else.

Property: ${[p.address, p.suburb].filter(Boolean).join(', ')}
${where}

How to fill it in:
- Use the listing for type, bedrooms, bathrooms, car spaces, size, price guide, inspection times, agent and features.
- Use the property history page for past sales, past rentals (rent per week) and the estimated value. Property history is usually under "Property history" on realestate.com.au's property page, on property.com.au, or on Domain's property profile. If the text has none, use empty lists.
- If you can't open a link, say so and I'll paste the page text instead.
- Page text copied from a website includes menus, ads and other listings: use only what's about this property.
- Use null for anything you can't find. Don't guess or estimate anything yourself.
- Dates as YYYY-MM-DD, months as YYYY-MM, times as 24-hour HH:MM, money as plain numbers (no $ or commas).
- "priceNum" is one number for the price: the middle of the guide range, or the asking price.
- Strata, council and water amounts are per quarter if the listing gives them.
- "sources" lists every web address you used.

\`\`\`json
{
  "propertyInspect": 1,
  "address": "street address as written on the listing",
  "type": "Apartment | Townhouse | House | Villa | Duplex | Terrace | Studio",
  "beds": 2,
  "baths": 1,
  "cars": 1,
  "size": "internal and balcony size, e.g. 84 m² internal · 11 m² balcony",
  "land": "land size for houses, e.g. 450 m²",
  "garage": "only an enclosed lock-up garage counts: 'Yes · lock-up garage'; a basement car space, carport or open space is 'No · basement car space' (or 'No · carport')",
  "nbn": "NBN technology if the listing or nbnco.com.au's address check says, e.g. FTTP · fibre to the premises",
  "priceGuide": "as written, e.g. Guide $780k – $830k",
  "priceNum": 805000,
  "listedDate": "YYYY-MM-DD",
  "inspections": [{ "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM" }],
  "auction": { "date": "YYYY-MM-DD", "time": "HH:MM" },
  "agent": "agent name, agency, phone",
  "features": ["short feature", "another"],
  "description": "two sentences at most",
  "strataLevyQ": 1350,
  "councilQ": 420,
  "waterQ": 180,
  "sales": [{ "when": "YYYY-MM", "price": 640000, "note": "e.g. private treaty" }],
  "rentals": [{ "when": "YYYY-MM", "perWeek": 650, "note": "e.g. leased" }],
  "estimate": "estimated value range as written, e.g. $795k – $845k",
  "sources": ["https://..."]
}
\`\`\`${listing ? `

<listing>
${listing}
</listing>` : ''}${history ? `

<history>
${history}
</history>` : ''}`;
}

/** Finds the JSON in whatever was pasted (Claude's whole reply is fine). Throws a readable Error. */
export function parseAnswer(text) {
  const t = String(text || '');
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : t;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b < a) {
    if (/couldn.?t|can.?not|unable|paste/i.test(t)) throw new Error('Claude couldn’t open the link. On the listing page press Ctrl+A then Ctrl+C (on a phone: share → copy, or select all), paste that into the same Claude chat, and copy its new answer.');
    throw new Error('There’s no answer block in what you pasted. Copy Claude’s whole reply (or just its code block) and paste it again.');
  }
  body = body.slice(a, b + 1).replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1');
  let d;
  try { d = JSON.parse(body); } catch (e) { throw new Error('Claude’s answer got cut off or changed when copying. Use the Copy button on Claude’s code block and paste again.'); }
  if (typeof d !== 'object' || !d) throw new Error('That doesn’t look like Claude’s answer for Property Inspect.');
  return d;
}

// a number, keeping 0 (e.g. no car spaces) but not "", null or text with no digits
const num = v => { if (v == null || v === '') return null; const s = String(v).replace(/[^\d.]/g, ''); return s === '' || isNaN(+s) ? null : +s; };
const str = v => (v == null || String(v).trim() === '' || String(v).toLowerCase() === 'null' ? null : String(v).trim());
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const isTime = v => /^\d{1,2}:\d{2}$/.test(v || '');
const pad = t => (t && t.length === 4 ? '0' + t : t);
const plus30 = t => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + 30; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

/** What the answer would change: [{ key, label, value, show, kept }] plus the inspection and sale records. */
export function plan(id, d) {
  const p = getProperty(id);
  const out = [];
  const add = (key, label, value, show = value) => {
    if (value == null) return;
    const cur = p.rec[key];
    const kept = !!(cur && cur.v != null && !cur.auto);   // typed or corrected by one of you: keep it
    const same = cur && JSON.stringify(cur.v) === JSON.stringify(value);
    if (!same) out.push({ key, label, value, show: String(show), kept });
  };
  add('type', 'Type', str(d.type));
  add('beds', 'Bedrooms', num(d.beds));
  add('baths', 'Bathrooms', num(d.baths));
  add('cars', 'Car spaces', num(d.cars));
  add('size', 'Size', str(d.size));
  add('land', 'Land', str(d.land));
  add('garage', 'Garage', str(d.garage));
  add('nbn', 'Internet', str(d.nbn));
  add('price', 'Price guide', str(d.priceGuide));
  add('priceNum', 'Expected price', num(d.priceNum), num(d.priceNum) ? money(num(d.priceNum)) : '');
  add('listedDate', 'First listed', isDate(d.listedDate) ? d.listedDate : null);
  add('agent', 'Agent', str(d.agent));
  // The auction goes in its own field; a result one of you has already added is never replaced.
  if (d.auction && isDate(d.auction.date) && !(p.auction && p.auction.outcome) && p.auction?.date !== d.auction.date) {
    const time = isTime(d.auction.time) ? pad(d.auction.time) : '';
    add('auction', 'Auction', { date: d.auction.date, time, outcome: '', outDate: '', note: '' }, d.auction.date + (time ? ' ' + time : ''));
  }
  add('description', 'Description', str(d.description));
  const feats = Array.isArray(d.features) ? d.features.map(str).filter(Boolean).slice(0, 15) : [];
  if (feats.length) add('features', 'Features', feats, feats.join(' · '));
  add('levyQ', 'Strata levies', num(d.strataLevyQ), num(d.strataLevyQ) ? money(num(d.strataLevyQ)) + ' / quarter' : '');
  add('councilQ', 'Council rates', num(d.councilQ), num(d.councilQ) ? money(num(d.councilQ)) + ' / quarter' : '');
  add('waterQ', 'Water rates', num(d.waterQ), num(d.waterQ) ? money(num(d.waterQ)) + ' / quarter' : '');
  add('est', 'Estimated value', str(d.estimate));

  // Inspection times and the auction, skipping any already booked at the same day and time.
  const have = new Set(Object.entries(p.rec).filter(([k, r]) => k.startsWith('insp:') && r.v).map(([, r]) => r.v.date + ' ' + r.v.start));
  const insps = (Array.isArray(d.inspections) ? d.inspections : [])
    .filter(x => x && isDate(x.date) && isTime(x.start))
    // listed open homes aren't on your schedule until you choose them on the property page
    .map(x => ({ date: x.date, start: pad(x.start), end: isTime(x.end) ? pad(x.end) : plus30(pad(x.start)), note: 'Open home (from the listing)', planned: false }));
  const newInsps = insps.filter(x => !have.has(x.date + ' ' + x.start));

  // Past sales, skipping ones already in the history (same month and price).
  const haveSales = new Set(Object.entries(p.rec).filter(([k, r]) => k.startsWith('sale:') && r.v).map(([, r]) => r.v.when + ' ' + r.v.price));
  const sales = (Array.isArray(d.sales) ? d.sales : [])
    .map(x => ({ when: /^\d{4}-\d{2}/.test(x?.when || '') ? x.when.slice(0, 7) : null, price: num(x?.price), note: str(x?.note) || '' }))
    .filter(x => x.when && x.price && !haveSales.has(x.when + ' ' + x.price));

  // Past rentals, skipping ones already in the history (same month and rent).
  const haveRent = new Set(Object.entries(p.rec).filter(([k, r]) => k.startsWith('rent:') && r.v).map(([, r]) => r.v.when + ' ' + r.v.perWeek));
  const rentals = (Array.isArray(d.rentals) ? d.rentals : [])
    .map(x => ({ when: /^\d{4}-\d{2}/.test(x?.when || '') ? x.when.slice(0, 7) : null, perWeek: num(x?.perWeek), note: str(x?.note) || '' }))
    .filter(x => x.when && x.perWeek && !haveRent.has(x.when + ' ' + x.perWeek));

  const sources = (Array.isArray(d.sources) ? d.sources : []).map(str).filter(u => u && /^https?:\/\//.test(u));
  const addrClaude = str(d.address);
  // A different street name in Claude's answer probably means the wrong listing.
  const street = (String(p.address).toLowerCase().match(/[a-z]{3,}/g) || []).find(w => !['unit', 'apartment', 'level', 'shop', 'lot'].includes(w));
  const mismatch = addrClaude && street && !addrClaude.toLowerCase().includes(street) ? addrClaude : null;
  return { fields: out, insps: newInsps, sales, rentals, sources, mismatch };
}

/** Saves a plan; returns a short summary. */
export function apply(id, pl) {
  const link = pl.sources[0];
  const meta = { auto: true, via: 'claude', ...(link ? { link } : {}) };
  const entries = {};
  for (const f of pl.fields) if (!f.kept) entries[f.key] = [f.value, meta];
  for (const x of pl.insps) entries['insp:' + newId()] = [x, meta];
  for (const x of pl.sales) entries['sale:' + newId()] = [x, meta];
  for (const x of pl.rentals) entries['rent:' + newId()] = [x, meta];
  const listing = pl.sources.find(u => /realestate\.com\.au|domain\.com\.au\/(?!property-profile)/.test(u));
  const history = pl.sources.find(u => /property\.com\.au|property-profile|pricefinder|onthehouse/.test(u));
  const p = getProperty(id);
  if (listing && !(p.rec.src_facts && p.rec.src_facts.v && !p.rec.src_facts.auto)) entries.src_facts = [listing, meta];
  if ((history || link) && !(p.rec.src_value && p.rec.src_value.v && !p.rec.src_value.auto)) entries.src_value = [history || link, meta];
  entries.claudeAt = [Date.now(), meta];
  store.setFieldsEach('prop-' + id, entries);
  return { filled: pl.fields.filter(f => !f.kept).length, kept: pl.fields.filter(f => f.kept).length, insps: pl.insps.length, sales: pl.sales.length, rentals: pl.rentals.length };
}

/** The whole flow, in one sheet. */
export function claudeSheet(id, done) {
  const p = getProperty(id);
  const s = openSheet(`<h3>Fill in with Claude</h3>
    <ol class="steps">
      <li><b>Copy each page’s text</b> and paste it here. realestate.com.au and property.com.au block Claude from opening links, so this is the reliable way. On each page: <b>Ctrl+A</b> then <b>Ctrl+C</b> (on a phone: press and hold → Select all → Copy).
        <textarea class="input" id="c-listing" placeholder="Listing page (realestate.com.au or Domain)" style="min-height:64px;margin-top:6px;font-size:12px"></textarea>
        <textarea class="input" id="c-history" placeholder="Property history page, for past sales and rentals (optional): realestate.com.au “Property history”, property.com.au or Domain’s property profile" style="min-height:52px;margin-top:6px;font-size:12px"></textarea></li>
      <li><b>Copy the prompt</b> (it includes those pages) and paste it into Claude.<div class="row-btns" style="margin-top:6px"><button class="btn sm primary" data-copyprompt>Copy prompt</button><a class="btn sm" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a></div>
        <span class="small muted">Left the boxes empty? Then put the listing link in the prompt where it says, and Claude will try to open it.</span></li>
      <li><b>Copy Claude’s answer</b> (the Copy button on its code block) and paste it here:</li>
    </ol>
    <textarea class="input" id="c-answer" placeholder="Paste Claude’s answer here" style="min-height:110px;font-family:var(--f-mono);font-size:12px"></textarea>
    <p class="err" id="c-err" hidden></p>
    <div id="c-preview"></div>
    <div class="row-btns"><button class="btn primary" id="c-check">Check the answer</button><button class="btn" data-close>Close</button></div>
    <details class="small"><summary class="muted">See the prompt</summary><textarea class="input" id="c-prompt" readonly style="min-height:160px;font-size:11.5px;font-family:var(--f-mono)"></textarea></details>`);
  let pending = null;
  // the prompt follows whatever page text is in the boxes
  const prompt = () => buildPrompt(p, { listing: s.querySelector('#c-listing').value, history: s.querySelector('#c-history').value });
  const showPrompt = () => { s.querySelector('#c-prompt').value = prompt(); };
  showPrompt();
  s.oninput = e => { if (e.target.id === 'c-listing' || e.target.id === 'c-history') showPrompt(); };
  const err = t => { const e = s.querySelector('#c-err'); e.hidden = !t; e.textContent = t || ''; };
  s.onclick = async e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-copyprompt]')) {
      const ok = await copyText(prompt());
      toast(ok ? 'Prompt copied. Paste it into Claude.' : 'Couldn’t copy: open “See the prompt” below and copy it from there.');
      if (!ok) s.querySelector('details').open = true;
      return;
    }
    if (e.target.closest('#c-check')) {
      err('');
      try {
        pending = plan(id, parseAnswer(s.querySelector('#c-answer').value));
      } catch (ex) { pending = null; s.querySelector('#c-preview').innerHTML = ''; return err(ex.message); }
      s.querySelector('#c-preview').innerHTML = preview(pending);
      return;
    }
    if (e.target.closest('#c-apply') && pending) {
      const r = apply(id, pending);
      closeSheet();
      toast(`Filled in ${r.filled} detail${r.filled === 1 ? '' : 's'}${r.insps ? `, ${r.insps} open home${r.insps === 1 ? '' : 's'} to choose from` : ''}${r.sales ? `, ${r.sales} past sale${r.sales === 1 ? '' : 's'}` : ''}${r.rentals ? `, ${r.rentals} past rental${r.rentals === 1 ? '' : 's'}` : ''}`);
      done();
    }
  };
}

function preview(pl) {
  const any = pl.fields.length || pl.insps.length || pl.sales.length || pl.rentals.length;
  if (!any) return '<div class="flag amber"><span class="ic">~</span><span class="t"><span>Nothing new in this answer</span><small>Everything it has is already on the property.</small></span></div>';
  const t12 = t => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };
  const day = d => new Date(d + 'T00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  return `<div class="card" style="background:var(--surface-2);gap:6px">
    ${pl.mismatch ? `<div class="flag red"><span class="ic">!</span><span class="t"><span>Is this the right property?</span><small>Claude’s answer is for “${esc(pl.mismatch)}”.</small></span></div>` : ''}
    <span class="eyebrow">Claude found</span>
    <div class="sum">${pl.fields.map(f => `<div class="r"><span>${esc(f.label)}${f.kept ? ' <span class="pill">keeping yours</span>' : ''}</span><span style="white-space:normal;text-align:right;font-family:var(--f-body)">${esc(f.show.length > 90 ? f.show.slice(0, 90) + '…' : f.show)}</span></div>`).join('')}
    ${pl.insps.map(x => `<div class="r"><span>${esc(x.note)}</span><span>${day(x.date)} · ${t12(x.start)}</span></div>`).join('')}
    ${pl.sales.map(x => `<div class="r"><span>Sold ${esc(x.when)}${x.note ? ` <span class="muted small">(${esc(x.note)})</span>` : ''}</span><span>${money(x.price)}</span></div>`).join('')}
    ${pl.rentals.map(x => `<div class="r"><span>Rented ${esc(x.when)}${x.note ? ` <span class="muted small">(${esc(x.note)})</span>` : ''}</span><span>${money(x.perWeek)} / week</span></div>`).join('')}</div>
    ${!pl.sales.length && !pl.rentals.length ? '<span class="small muted">No sale or rental history in this answer. Paste the property history page (realestate.com.au “Property history”, property.com.au or Domain’s property profile) into the second box to get it.</span>' : ''}
    ${pl.sources.length ? `<span class="small muted">From ${pl.sources.map(u => esc(u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])).join(', ')}</span>` : ''}
    <button class="btn primary" id="c-apply">Fill in</button></div>`;
}
