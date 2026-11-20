// Every value you can type in on a property, and the ✎ edit sheet.
// Changing a value that's already filled in asks why (plus an optional link),
// so you can both see what changed and where it came from.

import { getProperty, setProp } from './props.js';
import { esc, money, openSheet, closeSheet, toast } from './ui.js';
import { uploadImage, uploadError, fullUrl, thumbUrl } from './photos.js';
import { nameOf } from './people.js';

const perQ = n => `${money(n)} / quarter`;
const SRC = label => ({ label, kind: 'url', ph: 'https://…', hint: 'Where this section’s information came from.' });

export const FIELDS = {
  address: { label: 'Street address', kind: 'text' },
  suburb: { label: 'Suburb, state, postcode', kind: 'text', ph: 'Dulwich Hill NSW 2203' },
  type: { label: 'Type', kind: 'text', list: ['Apartment', 'Townhouse', 'House', 'Villa', 'Duplex', 'Terrace', 'Studio'] },
  price: { label: 'Price guide', kind: 'text', ph: 'Guide $780k – $830k' },
  priceNum: { label: 'Expected price', kind: 'number', fmt: money, ph: '810000', hint: 'What you expect to pay, as one number (e.g. the middle of the price guide). The Budget tab uses it for the loan, deposit and stamp duty.' },
  beds: { label: 'Bedrooms', kind: 'number' },
  baths: { label: 'Bathrooms', kind: 'number' },
  cars: { label: 'Car spaces', kind: 'number' },
  size: { label: 'Size', kind: 'text', ph: '84 m² internal · 11 m² balcony' },
  land: { label: 'Land', kind: 'text', ph: '450 m²' },
  listedDate: { label: 'First listed', kind: 'text', ph: 'YYYY-MM-DD', fmt: v => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : String(v)), hint: 'As YYYY-MM-DD, e.g. 2026-10-02. Used for days on the market.' },
  agent: { label: 'Agent', kind: 'text', ph: 'Name, agency, phone' },
  features: { label: 'Features', kind: 'textarea', fmt: v => (Array.isArray(v) ? v.join(' · ') : String(v)) },
  description: { label: 'Description', kind: 'textarea' },
  // Only an enclosed lock-up garage counts as a garage; a basement car space or carport doesn't.
  garage: { label: 'Garage', kind: 'text', list: ['Yes · lock-up garage', 'Yes · double lock-up garage', 'Yes · lock-up garage, internal access', 'No · basement car space', 'No · carport', 'No · street parking'], hint: 'Only an enclosed lock-up garage counts. A basement car space or carport is “No”.' },
  nbn: { label: 'Internet', kind: 'text', list: ['FTTP · fibre to the premises', 'FTTC · fibre to the curb', 'FTTB · fibre to the building', 'FTTN · fibre to the node', 'HFC · cable', 'Fixed wireless', 'Satellite'] },
  est: { label: 'Estimated value today', kind: 'text', ph: '$795k – $845k' },
  duty: { label: 'Stamp duty', kind: 'number', fmt: money, hint: 'Your own figure, e.g. from the Revenue NSW calculator. Clear it to go back to the app’s calculation.' },
  strataRep: { label: 'Strata report', kind: 'text', ph: 'Report 10 Nov 2026 · SP 12345 · 48 lots' },
  builder: { label: 'Builder', kind: 'text' },
  funds: { label: 'Fund balances', kind: 'text', ph: 'Admin $85,000 · Capital works $420,000' },
  defects: { label: 'Known defects', kind: 'textarea' },
  levyQ: { label: 'Strata levies', kind: 'number', fmt: perQ, hint: 'Dollars per quarter (admin + capital works).' },
  special: { label: 'Special levies', kind: 'text', ph: '$8,400 / lot raised 2025' },
  specialQ: { label: 'Special levy, ongoing', kind: 'number', fmt: perQ, hint: 'Dollars per quarter you’d keep paying, e.g. a levy spread over several years. Used on the Budget tab.' },
  specialOnce: { label: 'Special levy, one-off', kind: 'number', fmt: money, hint: 'A lump sum you’d pay once, e.g. still owing at settlement. Added to the cash needed upfront.' },
  councilQ: { label: 'Council rates', kind: 'number', fmt: perQ, hint: 'Dollars per quarter.' },
  waterQ: { label: 'Water rates', kind: 'number', fmt: perQ, hint: 'Dollars per quarter.' },
  groc_name: { label: 'Nearest grocery store', kind: 'text', ph: 'Woolworths Dulwich Hill' },
  groc_walk: { label: 'Grocery walk', kind: 'text', ph: '9 min · 0.7 km' },
  groc_drive: { label: 'Grocery drive', kind: 'text', ph: '3 min · 1.1 km' },
  bun_name: { label: 'Nearest Bunnings', kind: 'text', ph: 'Bunnings Marrickville' },
  bun_walk: { label: 'Bunnings walk', kind: 'text', ph: '48 min · 3.8 km' },
  bun_drive: { label: 'Bunnings drive', kind: 'text', ph: '9 min · 4.2 km' },
  fare_a: { label: 'Fare', kind: 'text', ph: '$4.20 each way (Opal, peak)' },
  fare_b: { label: 'Fare', kind: 'text', ph: '$4.20 each way (Opal, peak)' },
  toll_a: { label: 'Tolls', kind: 'text', ph: '$0 · no tolls on the fastest route' },
  toll_b: { label: 'Tolls', kind: 'text', ph: '$9.84 each way · M8' },
  src_facts: SRC('Listing link'),
  src_value: SRC('Value source'),
  src_hazards: SRC('Hazards source'),
  src_building: SRC('Building source'),
  src_strata: SRC('Strata source'),
  src_rates: SRC('Rates source'),
  src_commute: SRC('Commute source'),
  src_nearby: SRC('Nearby source'),
};

export const SEV = { none: ['None', 'green'], low: ['Low', 'amber'], med: ['Moderate', 'amber'], high: ['Severe', 'red'], unknown: ['Not checked', ''], council: ['Check council map', 'blue'] };
export const HAZARDS = {
  hz_flood: { label: 'Flood', g: '≋', types: ['Outside the flood planning area', 'Within the 1% AEP (1-in-100 year) flood planning area', 'Overland flow path', 'Riverine flooding', 'Probable maximum flood area only'] },
  hz_fire: { label: 'Bushfire', g: '▲', types: ['Not bushfire prone land', 'Vegetation buffer', 'Vegetation category 1 (highest)', 'Vegetation category 2', 'Vegetation category 3'] },
  hz_heritage: { label: 'Heritage', g: '⌂', types: ['Not heritage listed', 'Inside a Heritage Conservation Area (local)', 'Local heritage item', 'State Heritage Register item'] },
};

export function display(key, v) {
  const f = FIELDS[key];
  if (v == null || v === '') return '';
  return f && f.fmt ? f.fmt(v) : String(v);
}

/** The ✎ sheet for one field. */
export function editField(id, key, onSaved) {
  const p = getProperty(id);
  const f = FIELDS[key];
  if (!p || !f) return;
  const cur = p[key];
  const input = f.kind === 'textarea'
    ? `<textarea class="input" id="e-val" placeholder="${esc(f.ph || '')}">${esc(cur ?? '')}</textarea>`
    : `<input class="input" id="e-val" ${f.kind === 'number' ? 'type="number" inputmode="decimal" step="any"' : f.kind === 'url' ? 'type="url"' : ''} value="${esc(cur ?? '')}" placeholder="${esc(f.ph || '')}" ${f.list ? 'list="e-list"' : ''}>`
      + (f.list ? `<datalist id="e-list">${f.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
  const r = p.rec[key];
  const when = t => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const history = !r || r.v == null ? ''
    : r.auto ? `<p class="small muted" style="margin:0">${r.via === 'claude' ? 'From Claude' : 'Looked up automatically'} on ${when(r.t)}${r.link ? ` · <a href="${esc(r.link)}" target="_blank" rel="noopener">source ↗</a>` : ''}</p>`
      : (r.why || r.link || r.img) ? `<div class="change"><span><b>${esc(nameOf(r.by))}</b>${r.from ? ` changed it from <s>${esc(r.from)}</s>` : ' added it'} on ${when(r.t)}</span>${r.why ? `<span>“${esc(r.why)}”</span>` : ''}${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">Supporting link ↗</a>` : ''}${r.img ? `<a href="${fullUrl(id, r.img)}" target="_blank" rel="noopener"><img src="${thumbUrl(id, r.img)}" alt="Attached screenshot"></a>` : ''}</div>` : '';
  const s = openSheet(`<h3>${cur != null && cur !== '' ? 'Edit' : 'Add'} ${esc(f.label.toLowerCase())}</h3>${history}
    <form id="editForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="e-val">${esc(f.label)}</label>${input}${f.hint ? `<span class="small muted">${esc(f.hint)}</span>` : ''}</div>
      ${reasonFields(cur)}
      <p class="err" id="e-err" hidden></p>
      <div class="row-btns"><button class="btn primary">Save</button><button type="button" class="btn" data-close>Cancel</button>${cur != null && cur !== '' ? '<button type="button" class="btn" data-clear style="margin-left:auto">Clear</button>' : ''}</div>
    </form>`);
  wire(s, cur, raw => {
    if (f.kind === 'number') { if (raw === '') return null; const n = Number(raw); return Number.isFinite(n) ? n : undefined; }
    return raw === '' ? null : raw;
  }, (value, meta) => { setProp(id, key, value, meta); onSaved(); }, display(key, cur), false, id);
}

/** Flood / bushfire / heritage: a severity, what kind, and details. */
export function editHazard(id, key, onSaved) {
  const p = getProperty(id);
  const h = HAZARDS[key];
  const cur = p[key] || null;
  const c = cur || { sev: 'unknown', kind: '', detail: '' };
  const s = openSheet(`<h3>${esc(h.label)}</h3>
    <form id="editForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label>How severe?</label><div class="seg" role="radiogroup">${Object.entries(SEV).map(([k, [l]]) => `<button type="button" data-sev="${k}" aria-pressed="${c.sev === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><label for="e-kind">What kind</label><input class="input" id="e-kind" list="e-kinds" value="${esc(c.kind)}" placeholder="${esc(h.types[0])}"><datalist id="e-kinds">${h.types.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
      <div class="field"><label for="e-detail">Details</label><textarea class="input" id="e-detail" placeholder="e.g. Rear courtyard only; floor level is above the flood level.">${esc(c.detail)}</textarea></div>
      ${reasonFields(cur && cur.kind)}
      <p class="err" id="e-err" hidden></p>
      <div class="row-btns"><button class="btn primary">Save</button><button type="button" class="btn" data-close>Cancel</button></div>
    </form>`);
  let sev = c.sev;
  s.addEventListener('click', e => {
    const b = e.target.closest('[data-sev]');
    if (!b) return;
    sev = b.dataset.sev;
    s.querySelectorAll('[data-sev]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  wire(s, cur && cur.kind, () => ({ sev, kind: s.querySelector('#e-kind').value.trim(), detail: s.querySelector('#e-detail').value.trim() }),
    (value, meta) => { setProp(id, key, value, meta); onSaved(); },
    cur ? `${SEV[cur.sev]?.[0] || ''} · ${cur.kind}` : '', true, id);
}

function reasonFields(cur) {
  const had = cur != null && cur !== '';
  return `<div class="field"><label for="e-why">${had ? 'Why are you changing it?' : 'Note (optional)'}</label><input class="input" id="e-why" placeholder="${had ? 'e.g. Agent confirmed at the inspection' : 'e.g. From the listing'}"></div>
    <div class="field"><label for="e-link">Link to back it up (optional)</label><input class="input" id="e-link" type="url" placeholder="https://…"></div>
    <div class="field"><label for="e-img">Screenshot or photo (optional)</label><input class="input" id="e-img" type="file" accept="image/*"></div>`;
}

// Shared save / clear / cancel handling for both sheets. A chosen screenshot is
// shrunk and uploaded first, and the edit keeps its photo id (meta.img).
function wire(s, cur, readValue, save, fromText, always, propId) {
  const withImage = async (value, m) => {
    const file = s.querySelector('#e-img')?.files[0];
    if (file) {
      const btns = s.querySelectorAll('button');
      btns.forEach(b => { b.disabled = true; });
      try {
        const up = await uploadImage(propId, file);
        m.img = up.id;
        // kept as a hidden photo record so storage use counts it
        setProp(propId, 'photo:' + up.id, { kind: 'evidence', w: up.w, h: up.h, bytes: up.bytes });
      }
      catch (e) { btns.forEach(b => { b.disabled = false; }); err(uploadError(e)); return false; }
    }
    save(value, m);
    return true;
  };
  const had = cur != null && cur !== '';
  const err = t => { const e = s.querySelector('#e-err'); e.hidden = false; e.textContent = t; };
  const meta = () => {
    const why = s.querySelector('#e-why').value.trim();
    const link = s.querySelector('#e-link').value.trim();
    const m = {};
    if (why) m.why = why;
    if (link) m.link = link;
    if (had) m.from = fromText;
    return m;
  };
  s.addEventListener('click', async e => {
    if (e.target.closest('[data-close]')) closeSheet();
    if (e.target.closest('[data-clear]')) {
      if (!s.querySelector('#e-why').value.trim()) return err('Add why you’re clearing it, so you both know.');
      if (await withImage(null, meta())) { closeSheet(); toast('Cleared'); }
    }
  });
  s.querySelector('#editForm').addEventListener('submit', async e => {
    e.preventDefault();
    const raw = s.querySelector('#e-val') ? s.querySelector('#e-val').value.trim() : null;
    const value = readValue(raw);
    if (value === undefined) return err('That isn’t a number. Use digits only, e.g. 810000.');
    const changed = always || String(value ?? '') !== String(cur ?? '');
    if (!changed) return closeSheet();
    if (had && !s.querySelector('#e-why').value.trim()) return err('Add why you’re changing it, so you both know.');
    if (!(await withImage(value, meta()))) return;
    closeSheet();
    toast(had ? 'Change saved with your note' : 'Saved');
  });
}
