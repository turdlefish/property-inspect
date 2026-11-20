// Read a strata report (step 8), with your own Claude chat (covered by your membership, no API key).
//
//   1. The app copies a ready-made prompt for this property.
//   2. You paste it into Claude and attach the strata report PDF (or several).
//   3. Claude answers with a JSON block; you copy it and paste it back here.
//   4. The app shows the good points, concerns and things to check (with page numbers) and the
//      levy, fund and builder details, and saves them when you tap "Save".
//
// Points go into Our visit as flags marked { from: 'strata', page }. Details either of you typed
// are kept, the same rule as everywhere else.

import * as store from './store.js';
import { getProperty } from './props.js';
import { parseAnswer } from './claude.js';
import { esc, money, openSheet, closeSheet, toast, copyText } from './ui.js';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const num = v => { if (v == null || v === '') return null; const s = String(v).replace(/[^\d.]/g, ''); return s === '' || isNaN(+s) ? null : +s; };
const str = v => (v == null || String(v).trim() === '' || String(v).toLowerCase() === 'null' ? null : String(v).trim());
const TONES = { good: 'green', concern: 'red', check: 'amber', green: 'green', red: 'red', amber: 'amber' };

export function buildPrompt(p) {
  return `I'm using an app called Property Inspect to compare homes to buy in NSW, Australia. I've attached the strata report (strata inspection report) for this property. Please read all of it and reply with ONLY one JSON code block in the format at the end, nothing else.

Property: ${[p.address, p.suburb].filter(Boolean).join(', ')}

What to look for, as a careful first home buyer would:
- Money: levies for this lot (admin fund + capital works fund, per quarter), fund balances, whether the capital works fund is enough for the 10-year plan, levy arrears for this lot, special levies (raised, planned or being discussed in minutes), and insurance (current, sum insured, big claims or excesses).
- Building: builder and year built, defects (water leaks, waterproofing, cracking, cladding, fire safety, concrete cancer, balconies, roof, lifts), defect claims or bond, engineer or defect reports.
- Running: legal disputes or tribunal (NCAT) cases, by-law issues (pets, renovations, short stays, parking), the strata manager, how well minutes and records are kept, owner-occupier vs investor mix if given.
- Good signs count too: healthy funds, no special levies, recent work done, no disputes.

How to fill it in:
- "points" are the things worth knowing. "tone" is "good", "concern" or "check" (something to ask the agent, strata manager or a lawyer). Keep each title under 8 words and the detail to one sentence. Give the page number in the PDF where you found it.
- Put concerns first, then things to check, then good points. 15 points at most.
- Use null for anything the report doesn't say. Don't guess.
- Money as plain numbers (no $ or commas). Dates as YYYY-MM-DD.
- If you can't see an attached PDF, say so and I'll attach it again.

\`\`\`json
{
  "propertyInspect": "strata",
  "address": "the lot's address as written in the report",
  "reportDate": "YYYY-MM-DD",
  "strataPlan": "e.g. SP 12345",
  "lots": 48,
  "builder": "builder and year built, e.g. Meriton · 2014",
  "levyQ": 1350,
  "adminFund": 85000,
  "capitalWorksFund": 420000,
  "special": "special levies as written, e.g. $8,400 a lot raised 2025, paid over 2 years",
  "specialQ": 1050,
  "specialOnce": null,
  "defects": "one or two sentences on known defects and what's being done",
  "points": [
    { "tone": "concern", "title": "Waterproofing defects in 6 balconies", "detail": "Engineer's report found leaks; repairs quoted at $310k.", "page": 14 },
    { "tone": "check", "title": "Is the 2025 special levy paid?", "detail": "Minutes show it raised but not whether this lot paid.", "page": 22 },
    { "tone": "good", "title": "Healthy capital works fund", "detail": "$420k on hand, above the 10-year plan's target.", "page": 8 }
  ]
}
\`\`\``;
}

/** What the answer would save: { fields, points, mismatch, reportDate }. */
export function plan(id, d) {
  if (d.propertyInspect !== 'strata' && !Array.isArray(d.points)) throw new Error('That looks like a different answer. Paste Claude’s answer to the strata report prompt.');
  const p = getProperty(id);
  const fields = [];
  const add = (key, label, value, show = value) => {
    if (value == null) return;
    const cur = p.rec[key];
    const kept = !!(cur && cur.v != null && !cur.auto);
    if (cur && JSON.stringify(cur.v) === JSON.stringify(value)) return;
    fields.push({ key, label, value, show: String(show), kept });
  };
  const report = [str(d.reportDate) && `Report ${new Date(d.reportDate + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`, str(d.strataPlan), num(d.lots) && `${num(d.lots)} lots`].filter(Boolean).join(' · ');
  add('strataRep', 'Strata report', report || null);
  add('builder', 'Builder', str(d.builder));
  add('levyQ', 'Strata levies', num(d.levyQ), num(d.levyQ) ? money(num(d.levyQ)) + ' / quarter' : '');
  const funds = [num(d.adminFund) != null && `Admin ${money(num(d.adminFund))}`, num(d.capitalWorksFund) != null && `Capital works ${money(num(d.capitalWorksFund))}`].filter(Boolean).join(' · ');
  add('funds', 'Fund balances', funds || null);
  add('special', 'Special levies', str(d.special));
  add('specialQ', 'Special levy, ongoing', num(d.specialQ) || null, num(d.specialQ) ? money(num(d.specialQ)) + ' / quarter' : '');
  add('specialOnce', 'Special levy, one-off', num(d.specialOnce) || null, num(d.specialOnce) ? money(num(d.specialOnce)) : '');
  add('defects', 'Known defects', str(d.defects));

  // Points already saved from a strata report (same title) aren't added twice.
  const have = new Set(Object.entries(p.rec).filter(([k, r]) => k.startsWith('flag:') && r.v).map(([, r]) => String(r.v.title).toLowerCase()));
  const points = (Array.isArray(d.points) ? d.points : [])
    .map(x => ({ tone: TONES[String(x?.tone || '').toLowerCase()], title: str(x?.title), detail: str(x?.detail) || '', page: num(x?.page) }))
    .filter(x => x.tone && x.title && !have.has(x.title.toLowerCase()))
    .slice(0, 20);

  const addr = str(d.address);
  const street = (String(p.address).toLowerCase().match(/[a-z]{3,}/g) || []).find(w => !['unit', 'apartment', 'level', 'shop', 'lot'].includes(w));
  const mismatch = addr && street && !addr.toLowerCase().includes(street) ? addr : null;
  return { fields, points, mismatch };
}

export function apply(id, pl) {
  const meta = { auto: true, via: 'claude', from: 'strata' };
  const entries = {};
  for (const f of pl.fields) if (!f.kept) entries[f.key] = [f.value, meta];
  for (const x of pl.points) entries['flag:' + newId()] = [{ tone: x.tone, title: x.title, detail: x.detail, from: 'strata', ...(x.page ? { page: x.page } : {}) }, meta];
  entries.strataAt = [Date.now(), meta];
  store.setFieldsEach('prop-' + id, entries);
  const n = t => pl.points.filter(x => x.tone === t).length;
  return { filled: pl.fields.filter(f => !f.kept).length, red: n('red'), amber: n('amber'), green: n('green') };
}

export function strataSheet(id, done) {
  const p = getProperty(id);
  const s = openSheet(`<h3>Read a strata report</h3>
    <ol class="steps">
      <li><b>Copy the prompt</b> and paste it into a new Claude chat.<div class="row-btns" style="margin-top:6px"><button class="btn sm primary" data-copyprompt>Copy prompt</button><a class="btn sm" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a></div></li>
      <li><b>Attach the strata report PDF</b> to the same message (the 📎 or ＋ button), then send.
        <span class="small muted">The agent usually emails it, or you can order one from a strata search company. Several PDFs are fine.</span></li>
      <li><b>Copy Claude’s answer</b> (the Copy button on its code block) and paste it here:</li>
    </ol>
    <textarea class="input" id="s-answer" placeholder="Paste Claude’s answer here" style="min-height:110px;font-family:var(--f-mono);font-size:12px"></textarea>
    <p class="err" id="s-err" hidden></p>
    <div id="s-preview"></div>
    <div class="row-btns"><button class="btn primary" id="s-check">Check the answer</button><button class="btn" data-close>Close</button></div>
    <details class="small"><summary class="muted">See the prompt</summary><textarea class="input" id="s-prompt" readonly style="min-height:160px;font-size:11.5px;font-family:var(--f-mono)"></textarea></details>`);
  s.querySelector('#s-prompt').value = buildPrompt(p);
  let pending = null;
  const err = t => { const e = s.querySelector('#s-err'); e.hidden = !t; e.textContent = t || ''; };
  s.onclick = async e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-copyprompt]')) {
      const ok = await copyText(buildPrompt(p));
      toast(ok ? 'Prompt copied. Paste it into Claude and attach the PDF.' : 'Couldn’t copy: open “See the prompt” below and copy it from there.');
      if (!ok) s.querySelector('details').open = true;
      return;
    }
    if (e.target.closest('#s-check')) {
      err('');
      const text = s.querySelector('#s-answer').value;
      try {
        if (!/[{]/.test(text) && /attach|can.?t see|no (pdf|file)/i.test(text)) throw new Error('Claude didn’t get the PDF. Attach the strata report to the chat again and copy its new answer.');
        pending = plan(id, parseAnswer(text));
      } catch (ex) { pending = null; s.querySelector('#s-preview').innerHTML = ''; return err(ex.message); }
      s.querySelector('#s-preview').innerHTML = preview(pending);
      return;
    }
    if (e.target.closest('#s-apply') && pending) {
      const r = apply(id, pending);
      closeSheet();
      const parts = [r.red && `${r.red} concern${r.red === 1 ? '' : 's'}`, r.amber && `${r.amber} to check`, r.green && `${r.green} good`].filter(Boolean);
      toast(parts.length ? `Added ${parts.join(', ')} to Our visit` : `Saved ${r.filled} detail${r.filled === 1 ? '' : 's'}`);
      done();
    }
  };
}

function preview(pl) {
  if (!pl.fields.length && !pl.points.length) return '<div class="flag amber"><span class="ic">~</span><span class="t"><span>Nothing new in this answer</span><small>Everything it has is already on the property.</small></span></div>';
  const row = x => `<div class="fl ${x.tone}"><span><b>${esc(x.title)}</b>${x.detail ? ` <span class="small">${esc(x.detail)}</span>` : ''}${x.page ? `<span class="small muted"> · p. ${x.page}</span>` : ''}</span></div>`;
  const group = (tone, box, label) => { const xs = pl.points.filter(x => x.tone === tone); return xs.length ? `<div class="qb ${box}"><span class="q">${label}</span>${xs.map(row).join('')}</div>` : ''; };
  return `<div class="card" style="gap:8px">
    ${pl.mismatch ? `<div class="flag red"><span class="ic">!</span><span class="t"><span>Is this the right report?</span><small>Claude’s answer is for “${esc(pl.mismatch)}”.</small></span></div>` : ''}
    ${group('red', 'bad', 'Concerns')}${group('amber', 'check', 'Worth checking')}${group('green', 'good', 'Good points')}
    ${pl.fields.length ? `<span class="eyebrow">Details</span><div class="sum">${pl.fields.map(f => `<div class="r"><span>${esc(f.label)}${f.kept ? ' <span class="pill">keeping yours</span>' : ''}</span><span style="white-space:normal;text-align:right;font-family:var(--f-body)">${esc(f.show.length > 90 ? f.show.slice(0, 90) + '…' : f.show)}</span></div>`).join('')}</div>` : ''}
    <span class="small muted">Claude can miss things. For anything serious, ask a solicitor or conveyancer to read the report too.</span>
    <button class="btn primary" id="s-apply">Save to this property</button></div>`;
}
