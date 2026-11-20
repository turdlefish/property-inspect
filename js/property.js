// The property file: every section from the mockup, filled in by the two of you.

import * as store from './store.js';
import { getProperty, setProp, setProps, LISTS } from './props.js';
import { moveSheet } from './lists.js';
import { FIELDS, SEV, HAZARDS, display, editField, editHazard } from './edit.js';
import { nameOf, bothSlots, settings, setSetting, person } from './people.js';
import { esc, money, HOUSE, hueOf, openSheet, closeSheet, toast } from './ui.js';
import { compassSheet, compassSVG, dirOf } from './compass.js';
import { photosOf, thumbUrl, fullUrl, addPhotos, deletePhoto, uploadError, storageUse, storageBanner, mb } from './photos.js';

import { moneyState } from './money.js';
import { lookUp, lookingUp, PARTS } from './lookup.js';
import { voteBlock, onVote, soldSheet, soldLine } from './decide.js';
import { claudeSheet } from './claude.js';
import { strataSheet } from './strata.js';
import { usageLine } from './limits.js';
import { inspectionsOf, nextInspection, inspText, inspectionSheet, dayLabel, time12, iso, onSchedule, toggleSchedule } from './inspections.js';

const KIND = { listing: 'Listing photo', ours: 'Our photo', floorplan: 'Floorplan' };

const ui = { editTags: false, editAmen: false, cdir: 'to', reveal: new Set() };   // reveal: empty sections opened from "Add more" (property id + section)
const SLOTS_TO = ['6:00', '7:00', '8:00', '9:00'];
const SLOTS_HOME = ['4:00pm', '5:00pm', '6:00pm', '7:00pm'];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const when = t => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const entries = (p, prefix) => Object.entries(p.rec).filter(([k, r]) => k.startsWith(prefix) && r.v != null);

export function accessText(b) {
  if (!b.access) return '';
  if (b.access === 'ground') return 'Ground level · no stairs';
  if (b.access === 'lift') return `Lift · level ${b.level ?? 0}`;
  const n = b.flights ?? 0;
  return `Stairs only · ${n} flight${n === 1 ? '' : 's'} up`;
}

// Good points and concerns: the flags you write plus the liked / didn't-like buttons you pressed.
export function flagCounts(p) {
  const c = { red: 0, amber: 0, green: 0 };
  entries(p, 'flag:').forEach(([, r]) => { if (c[r.v.tone] != null) c[r.v.tone]++; });
  entries(p, 'tag:').forEach(([, r]) => { if (r.v === 'like') c.green++; else if (r.v === 'dislike') c.red++; });
  return c;
}

// Which cards are open, per phone (a convenience, so it isn't shared).
const FOLD_KEY = 'prop:folds';
function readFolds() { try { return JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) { return {}; } }
function saveFolds(f) { try { localStorage.setItem(FOLD_KEY, JSON.stringify(f)); } catch (e) {} }

export function renderProperty(view, topbar, nav, id) {
  const p = getProperty(id);
  if (!p) return false;
  topbar.set(p.address, { back: 'lists' });
  const me = store.me();
  const st = settings();
  const l = LISTS[p.list] || LISTS.review;
  const b = { access: p.access, level: p.level, flights: p.flights };
  const amen = p.amen || [];

  // one value row with ✎, and the reason underneath if someone changed it
  const row = (key, label = FIELDS[key].label) => {
    const v = display(key, p[key]);
    const r = p.rec[key];
    return `<div class="r"><span class="k">${esc(label)}</span><span class="v ${v ? '' : 'empty-v'}">${v ? esc(v) : 'Not added'}</span><button class="edit" data-edit="${key}" aria-label="Edit ${esc(label)}">✎</button>
      ${changeNote(r, id, true)}</div>`;
  };
  // A grid of small tappable tiles (label + value); tapping one opens its ✎ sheet, which shows any
  // reason for the last change. A dot marks values one of you changed by hand.
  const WIDE = new Set(['defects', 'special', 'agent', 'size', 'groc_name', 'bun_name', 'builder', 'price']);
  const tiles = keys => `<div class="tiles2">${keys.map(k => {
    const v = display(k, p[k]), r = p.rec[k];
    const edited = r && r.v != null && !r.auto && (r.why || r.link || r.img);
    return `<button class="tile ${WIDE.has(k) ? 'wide' : ''}" data-edit="${k}"><span class="tl">${esc(FIELDS[k].label)}${edited ? ' <i class="edot" title="Changed by hand"></i>' : ''}</span><span class="tv ${v ? '' : 'none'}">${v ? esc(v) : 'Add'}</span></button>`;
  }).join('')}</div>`;
  const src = key => {
    const u = p[key];
    return `<div class="src">Source: ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))} ↗</a>` : '<span>not added</span>'}<button class="edit" data-edit="${key}">✎ ${u ? 'Change' : 'Add link'}</button></div>`;
  };

  const counts = flagCounts(p);
  const flags = entries(p, 'flag:').sort((x, y) => ['red', 'amber', 'green'].indexOf(x[1].v.tone) - ['red', 'amber', 'green'].indexOf(y[1].v.tone));
  const sales = entries(p, 'sale:').map(([k, r]) => ({ k, ...r.v })).sort((x, y) => String(y.when).localeCompare(String(x.when)));
  const rents = entries(p, 'rent:').map(([k, r]) => ({ k, ...r.v })).sort((x, y) => String(y.when).localeCompare(String(x.when)));
  const notes = entries(p, 'note:').map(([k, r]) => ({ k, ...r.v, by: r.by, t: r.t })).sort((x, y) => x.t - y.t);
  const tag = (name, kind) => {
    const on = p['tag:' + name] === kind;
    return `<button class="tag ${kind} ${on ? 'on' : ''}" data-tag="${esc(name)}" data-kind="${kind}" aria-pressed="${on}">${ui.editTags ? '<span class="x" aria-hidden="true">×</span>' : ''}${esc(name)}</button>`;
  };
  // each web address once, with what it was used for
  const linkMap = new Map();
  const addLink = (u, what) => { if (!u) return; const x = linkMap.get(u) || new Set(); x.add(what); linkMap.set(u, x); };
  for (const [k, r] of Object.entries(p.rec)) {
    if (r.v == null) continue;
    if (k.startsWith('src_') && r.v) addLink(r.v, (FIELDS[k]?.label || k).replace(/ source$/i, ''));
    else if (r.link) addLink(r.link, r.auto ? (r.via === 'claude' ? 'From Claude' : 'Looked up') : (FIELDS[k]?.label || HAZARDS[k]?.label || 'An edit'));
    else if (k.startsWith('flag:') && r.v.link) addLink(r.v.link, r.v.title);
  }
  const links = [...linkMap].map(([u, s]) => [[...s].join(', '), u]);
  const chips = [['s-insp', 'Inspections'], ['s-flags', 'Flags'], ['s-value', 'Value'], ['s-hazards', 'Hazards'], ['s-building', 'Access'], ['s-strata', 'Strata'], ['s-rates', 'Rates'], ['s-commute', 'Commute'], ['s-nearby', 'Nearby'], ['s-facing', 'Facing'], ['s-visit', 'Our visit'], ['s-sources', 'Sources']];

  const photos = photosOf(p);
  const gallery = photos.filter(x => x.kind !== 'floorplan').concat(photos.filter(x => x.kind === 'floorplan'));
  const ours = photos.filter(x => x.kind === 'ours');
  const plans = photos.filter(x => x.kind === 'floorplan');
  const tile = x => `<button class="ph-tile" data-photo="${x.id}" aria-label="Open photo"><img src="${thumbUrl(id, x.id)}" alt="${esc(x.caption || KIND[x.kind] || 'Photo')}" loading="lazy"><span class="yr">${esc(x.kind === 'floorplan' ? 'Floorplan' : x.kind === 'ours' ? 'Ours · ' + x.year : x.year)}</span></button>`;

  // ── foldable cards, Human Being style: tape, a header with an icon bubble, a one-line summary when folded ──
  const folds = readFolds();
  const card = (sid, icon, title, summary, body, { open = false, action = '' } = {}) => {
    const isOpen = folds[sid] ?? open;
    return `<section class="card fcard ${isOpen ? 'open' : ''}" id="${sid}"><span class="tape" aria-hidden="true"></span>
      <div class="fhead"><button class="ftoggle" data-fold="${sid}" aria-expanded="${isOpen}"><span class="bubble" aria-hidden="true">${icon}</span><span class="ftitle"><span class="fname">${title}</span><span class="fsum">${summary || ''}</span></span><span class="chev" aria-hidden="true">▾</span></button>${isOpen ? action : ''}</div>
      ${isOpen ? `<div class="fbody">${body()}</div>` : ''}</section>`;
  };
  // Details as a list: label on the left, value on the right, tap a row to change it.
  const list = keys => `<div class="dlist">${keys.map(k => {
    const v = display(k, p[k]), r = p.rec[k];
    const edited = r && r.v != null && !r.auto && (r.why || r.link || r.img);
    return `<button class="drow" data-edit="${k}"><span class="dk">${esc(FIELDS[k].label)}${edited ? ' <i class="edot" title="Changed by hand"></i>' : ''}</span><span class="dv ${v ? '' : 'none'}">${v ? esc(v) : 'Add'}</span></button>`;
  }).join('')}</div>`;
  const liked = st.likes.filter(n => p['tag:' + n] === 'like');
  const disliked = st.dislikes.filter(n => p['tag:' + n] === 'dislike');
  const strataFlags = flags.filter(([, r]) => r.v.from === 'strata');
  const strataPts = strataFlags.length, strataRed = strataFlags.filter(([, r]) => r.v.tone === 'red').length;
  const good = flags.filter(([, r]) => r.v.tone === 'green'), bad = flags.filter(([, r]) => r.v.tone === 'red'), check = flags.filter(([, r]) => r.v.tone === 'amber');
  const flagRow = ([k, r]) => `<div class="fl ${r.v.tone}"><span><b>${esc(r.v.title)}</b>${r.v.detail ? ` <span class="small">${esc(r.v.detail)}</span>` : ''}<span class="small muted"> · ${r.v.from === 'strata' ? `strata report${r.v.page ? ` p. ${r.v.page}` : ''}` : esc(nameOf(r.by))}${r.v.link ? ` · <a href="${esc(r.v.link)}" target="_blank" rel="noopener">source ↗</a>` : ''}</span></span><button class="edit" data-delflag="${k}" aria-label="Remove">✕</button></div>`;
  const cm = p['cm:' + me + ':to'];
  const range = a => { const x = (a || []).filter(n => n > 0); return x.length ? (Math.min(...x) === Math.max(...x) ? `${x[0]}` : `${Math.min(...x)}–${Math.max(...x)}`) : ''; };
  const quarter = (p.councilQ || 0) + (p.waterQ || 0) + (p.levyQ || 0) + (p.specialQ || 0);
  const sevWord = k => (p[k] ? SEV[p[k].sev]?.[0] : 'not checked');
  const nextI = nextInspection(p), openHomes = inspectionsOf(p).filter(x => !onSchedule(x) && x.date >= iso(new Date())).length;
  // Sections with nothing in them yet are tucked into one "Add more" card (Nov 2026: the
  // page had 12 cards and things were hard to find). Tapping one there brings it back.
  const EMPTY = {
    's-facing': p.facing == null && !plans.length,
    's-commute': !Object.keys(p).some(k => /^cmr?:/.test(k) && p[k]),
    's-nearby': !['groc_name', 'groc_walk', 'groc_drive', 'bun_name', 'bun_walk', 'bun_drive'].some(k => p[k]),
    's-hazards': !Object.keys(HAZARDS).some(k => p[k]),
    's-building': !b.access && !amen.length,
    's-strata': !strataPts && !['strataRep', 'levyQ', 'funds', 'special', 'specialQ', 'specialOnce', 'builder', 'defects'].some(k => p[k]),
    's-rates': !quarter,
    's-value': !p.est && !sales.length && !rents.length && !p.src_value,
    's-sources': !links.length,
  };
  const hidden = sid => EMPTY[sid] && !ui.reveal.has(id + sid);
  const show = (sid, f) => (hidden(sid) ? '' : f());
  const group = (title, ids) => (ids.some(i => !hidden(i)) ? `<h2 class="pgroup">${title}</h2>` : '');
  const moreCard = () => {
    const h = Object.keys(EMPTY).filter(hidden);
    if (!h.length) return '';
    const name = Object.fromEntries(sections);
    return `<section class="card more-add"><span class="tape" aria-hidden="true"></span>
      <div class="q">Add more when you have it</div>
      <div class="tags">${h.map(s => `<button class="tag" data-reveal="${s}">＋ ${esc(name[s])}</button>`).join('')}</div></section>`;
  };
  // At a glance: the few things you look for most, each one a tap away from its section.
  const hz = Object.entries(HAZARDS).filter(([k]) => p[k] && ['low', 'med', 'high', 'council'].includes(p[k].sev)).map(([k, h]) => `${h.label} ${SEV[p[k].sev][0].toLowerCase()}`);
  const glance = [
    p.priceNum && ['Expected price', money(p.priceNum), 's-details'],
    nextI && ['Next inspection', inspText(nextI), 's-insp'],
    (counts.green || counts.red || counts.amber || notes.length) && ['Our visit', [counts.green && `${counts.green} good`, counts.red && `${counts.red} concern${counts.red === 1 ? '' : 's'}`, counts.amber && `${counts.amber} to check`, notes.length && `${notes.length} note${notes.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '), 's-visit'],
    p[`cmr:${me}:to`]?.legs?.length ? ['To work, public transport', `${tripTotal(p[`cmr:${me}:to`])} min · ${tripSummary(p[`cmr:${me}:to`]).split(' · ')[0]}`, 's-commute']
      : cm && range(cm.pt) && ['To work, train/bus', `${range(cm.pt)} min`, 's-commute'],
    quarter && ['Rates & levies', `${money(quarter)} a quarter`, 's-rates'],
    hz.length && ['Watch out', hz.join(' · '), 's-hazards'],
  ].filter(Boolean);
  const glanceBox = glance.length ? `<div class="glance"><span class="eyebrow">At a glance</span>${glance.map(([k, v, s]) => `<button class="grow" data-jump="${s}"><span class="gk">${k}</span><span class="gv">${esc(v)}</span><span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>` : '';
  const sections = [['s-details', 'Details'], ['s-facing', 'Floorplan & facing'], ['s-building', 'Access & amenities'], ['s-commute', 'Commute'], ['s-nearby', 'Nearby'], ['s-insp', 'Inspection times'], ['s-visit', 'Our visit'], ['s-value', 'Value & history'], ['s-hazards', 'Flood, bushfire & heritage'], ['s-strata', 'Strata & builder'], ['s-rates', 'Rates'], ['s-sources', 'Sources']];

  view.innerHTML = `
  ${gallery.length
    ? `<div class="gallery">${gallery.map(tile).join('')}<button class="ph-tile ph-add" data-addphoto="listing">＋ Add photos</button></div>`
    : `<div class="thumb hero" style="--h:${hueOf(p.id)}">${HOUSE}<button class="btn sm hero-add" data-addphoto="listing">＋ Add photos</button></div>`}
  <div class="ptitle" id="top">
    <div class="line"><button class="pill ${l.tone}" data-menu="${p.id}" style="cursor:pointer">${l.label} ▾</button>${nextI ? `<button class="pill accent" data-jump="s-insp" style="cursor:pointer">Inspect ${esc(inspText(nextI))}</button>` : ''}${p.viewed ? '<span class="pill green">✓ Viewed</span>' : ''}${counts.green ? `<button class="pill green" data-jump="s-visit">${counts.green} good</button>` : ''}${counts.red ? `<button class="pill red" data-jump="s-visit">${counts.red} concern${counts.red === 1 ? '' : 's'}</button>` : ''}</div>
    <h1>${esc(p.address)} <button class="edit" data-edit="address" aria-label="Edit address">✎</button></h1>
    <div class="muted">${esc([p.suburb, p.type].filter(Boolean).join(' · '))}</div>
    ${p.price ? `<div class="price-line">${esc(p.price)}</div>` : ''}
    <div class="facts">${p.beds != null ? `<span><b>${p.beds}</b> bed</span>` : ''}${p.baths != null ? `<span><b>${p.baths}</b> bath</span>` : ''}${p.cars != null ? `<span><b>${p.cars}</b> car</span>` : ''}${p.facing != null ? `<span><b>${dirOf(p.facing)}</b> facing</span>` : ''}${accessText(b) ? `<span><b>${esc(accessText(b))}</b></span>` : ''}</div>
    ${glanceBox}
    ${p.list === 'review' ? voteBlock(p, true) : ''}
    ${p.list === 'sold' ? `<div class="sold-line">${soldLine(p)}<button class="edit small" data-sold>✎ Sale</button>${p.src_sold ? `<a class="small" href="${esc(p.src_sold)}" target="_blank" rel="noopener">Sold listing ↗</a>` : ''}</div>` : ''}
    <div class="row-btns">${lookupButton(p)}<button class="btn sm" data-claude>${p.claudeAt ? '↻ Fill in with Claude' : 'Fill in with Claude'}</button></div>
    ${usageLine()}
    ${lookupNote(p)}
  </div>

  ${group('At the inspection', ['s-details', 's-insp', 's-visit', 's-facing'])}
  ${show('s-details', () => card('s-details', '🏠', 'Details', [p.beds != null && `${p.beds} bed`, p.baths != null && `${p.baths} bath`, p.size && String(p.size).split('·')[0].trim(), p.priceNum && `expect ${money(p.priceNum)}`].filter(Boolean).join(' · '), () => `
    ${list(['price', 'priceNum', 'type', 'beds', 'baths', 'cars', 'size', ...(p.land || p.type === 'House' ? ['land'] : []), 'garage', 'nbn', 'listedDate', 'agent'])}
    ${Array.isArray(p.features) && p.features.length ? `<div class="tags">${p.features.map(f => `<span class="tag">${esc(f)}</span>`).join('')}<button class="edit" data-edit="features" aria-label="Edit features">✎</button></div>` : ''}
    ${p.description ? `<details class="desc"><summary class="small">Description</summary><p class="small">${esc(p.description)}</p><button class="edit small" data-edit="description">✎ Change</button></details>` : ''}
    ${provenance(p, ['price', 'priceNum', 'type', 'beds', 'baths', 'cars', 'size', 'land', 'garage', 'nbn', 'listedDate', 'agent', 'features', 'description'])}
    <div class="row-btns"><button class="btn sm" data-money>${p.priceNum ? 'Run the numbers' : 'Run the numbers (add the expected price)'}</button>${p.src_facts ? `<a class="btn sm" href="${esc(p.src_facts)}" target="_blank" rel="noopener">Listing ↗</a>` : ''}</div>`, { open: true }))}

  ${show('s-insp', () => card('s-insp', '📅', 'Inspection times', nextI ? `next: ${inspText(nextI)}` : openHomes ? `${openHomes} open home${openHomes === 1 ? '' : 's'} to choose from` : 'none yet', () => `
    ${inspectionsOf(p).map(x => { const on = onSchedule(x); return `<div class="insp-row ${x.date < iso(new Date()) ? 'past' : ''}"><span class="num" style="flex:1">${esc(dayLabel(x.date))} · ${time12(x.start)}${x.end ? '–' + time12(x.end) : ''}${x.note ? `<br><span class="small muted" style="font-family:var(--f-body)">${esc(x.note)}</span>` : ''}</span><button class="btn sm ${on ? 'on-green' : ''}" data-sched="${x.key}" aria-pressed="${on}">${on ? '✓ On our schedule' : '＋ Add to schedule'}</button><button class="edit" data-editinsp="${x.key}" aria-label="Change time">✎</button></div>`; }).join('') || '<p class="small muted" style="margin:0">No times yet. Fill in with Claude brings in the open homes from the listing, or add one yourself.</p>'}
    ${inspectionsOf(p).some(x => !onSchedule(x)) ? '<p class="small muted" style="margin:0">Open homes from the listing only go on your Inspections tab once you add them.</p>' : ''}`, { action: '<button class="btn sm" data-addinsp>＋ Add a time</button>' }))}

  ${show('s-visit', () => card('s-visit', '🔑', 'Our visit', [p.viewed ? 'viewed' : 'not viewed yet', counts.green ? `${counts.green} good` : '', counts.red ? `${counts.red} concern${counts.red === 1 ? '' : 's'}` : '', notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '), () => `
    <div class="qb"><button class="viewed" data-viewed aria-pressed="${!!p.viewed}"><span class="box">${p.viewed ? '✓' : ''}</span>${p.viewed ? `We’ve been to see it${p.rec.viewed ? ` · ${when(p.rec.viewed.t)}` : ''}` : 'We’ve been to see it'}</button></div>
    <div class="qb good"><div class="q-row"><span class="q">What we liked</span><button class="edit small" data-edittags>${ui.editTags ? 'Done editing' : 'Edit buttons'}</button></div>
      <div class="tags">${st.likes.map(n => tag(n, 'like')).join('')}${ui.editTags ? addTag('like') : ''}</div>
      ${good.map(flagRow).join('')}<button class="edit small add-line" data-addflag="green">＋ Add a good point</button></div>
    <div class="qb bad"><span class="q">What we didn’t like</span>
      <div class="tags">${st.dislikes.map(n => tag(n, 'dislike')).join('')}${ui.editTags ? addTag('dislike') : ''}</div>
      ${bad.map(flagRow).join('')}<button class="edit small add-line" data-addflag="red">＋ Add a concern</button></div>
    <div class="qb check"><span class="q">Worth checking</span>
      ${check.map(flagRow).join('') || '<p class="small muted" style="margin:0">Things to ask the agent or look into, e.g. “Is the special levy paid?”</p>'}<button class="edit small add-line" data-addflag="amber">＋ Add something to check</button></div>
    <div class="qb"><span class="q">Notes</span>
      <div style="display:flex;flex-direction:column;gap:8px">${notes.map(n => `<div class="note" style="border-color:${esc(person(n.by).color)}"><small><span>${esc(nameOf(n.by))} · ${when(n.t)}</span>${n.by === me ? `<button class="edit" data-delnote="${n.k}" aria-label="Delete note">✕</button>` : ''}</small><span>${esc(n.text)}</span></div>`).join('')}</div>
      <form id="noteForm" style="display:flex;flex-direction:column;gap:8px;margin-top:8px"><textarea class="input" id="noteText" placeholder="What did you think?"></textarea><button class="btn primary">Add note as ${esc(nameOf(me))}</button></form></div>
    <div class="qb"><span class="q">Our photos</span><div class="photos">${ours.map(x => `<button class="ph-sq" data-photo="${x.id}" aria-label="Open photo"><img src="${thumbUrl(id, x.id)}" alt="${esc(x.caption || 'Our photo')}" loading="lazy"></button>`).join('')}<button class="ph-sq ph-add" data-addphoto="ours">＋ Add</button></div></div>`, { open: true }))}

  ${show('s-facing', () => card('s-facing', '🧭', 'Floorplan & facing', [p.facing != null ? `faces ${dirOf(p.facing)}` : 'facing not set', plans.length ? `${plans.length} floorplan${plans.length === 1 ? '' : 's'}` : 'no floorplan'].join(' · '), () => `
    ${plans.length ? `<div class="plans">${plans.map(x => `<button class="plan-img" data-photo="${x.id}" aria-label="Open floorplan"><img src="${thumbUrl(id, x.id)}" alt="Floorplan" loading="lazy"></button>`).join('')}</div>` : ''}
    <button class="btn sm" data-addphoto="floorplan" style="align-self:flex-start">＋ ${plans.length ? 'Add another floorplan' : 'Add the floorplan'}</button>
    <div class="compass">${compassSVG(p.facing ?? 0)}<div style="display:flex;flex-direction:column;gap:8px">
      <div><span class="eyebrow">Living area faces</span><div class="big-dir" id="dirText">${p.facing != null ? `${dirOf(p.facing)} <span class="num muted" style="font-size:14px">${p.facing}°</span>` : '<span class="muted" style="font-size:15px">Not set</span>'}</div></div>
      <input type="range" class="range" id="facing" min="0" max="359" value="${p.facing ?? 0}" aria-label="Facing direction in degrees">
      <button class="btn sm primary" data-compass>Use phone compass</button></div></div>
    <p class="small muted" style="margin:0">At the inspection, stand at the living-room window, point the top of the phone out of the window, and tap the button. North-facing living areas get the most winter sun.</p>`))}

  ${group('Where it is', ['s-commute', 's-nearby', 's-hazards'])}
  ${show('s-commute', () => card('s-commute', '🚆', 'Commute', cm ? `to work: train/bus ${range(cm.pt) || '—'} min · drive ${range(cm.dr) || '—'} min` : 'not looked up yet', () => `
    <div class="seg" role="group" aria-label="Direction">${[['to', 'To work · 6–9am'], ['home', 'Home · 4–7pm']].map(([k, t]) => `<button data-cdir="${k}" aria-pressed="${ui.cdir === k}">${t}</button>`).join('')}</div>
    ${bothSlots().map(slot => commuteBlock(p, slot, st)).join('')}
    ${src('src_commute')}`, { action: `${again('commute')}<button class="edit small" data-work>✎ Workplaces</button>` }))}

  ${show('s-nearby', () => card('s-nearby', '🛒', 'Nearby', [p.groc_name && `${p.groc_name}${p.groc_walk ? ' · ' + String(p.groc_walk).split('·')[0].trim() + ' walk' : ''}`, p.bun_drive && `Bunnings ${String(p.bun_drive).split('·')[0].trim()} drive`].filter(Boolean).join(' · ') || 'not looked up yet', () => `
    <ul class="places">${[['groc', 'Supermarket'], ['bun', 'Bunnings']].map(([k, kind]) => `<li>
      <button class="pname" data-edit="${k}_name"><span class="eyebrow">${kind}</span><b>${p[k + '_name'] ? esc(p[k + '_name']) : '<span class="muted">Add</span>'}</b></button>
      <button class="pway" data-edit="${k}_walk"><span class="muted small">Walk</span> ${p[k + '_walk'] ? esc(p[k + '_walk']) : '—'}</button>
      <button class="pway" data-edit="${k}_drive"><span class="muted small">Drive</span> ${p[k + '_drive'] ? esc(p[k + '_drive']) : '—'}</button></li>`).join('')}</ul>
    ${provenance(p, ['groc_name', 'groc_walk', 'groc_drive', 'bun_name', 'bun_walk', 'bun_drive'])}`, { action: again('nearby') }))}

  ${show('s-hazards', () => card('s-hazards', '🌊', 'Flood, bushfire & heritage', `flood: ${sevWord('hz_flood')} · bushfire: ${sevWord('hz_fire')} · heritage: ${sevWord('hz_heritage')}`.toLowerCase(), () => `
    <div class="hz">${Object.entries(HAZARDS).map(([k, h]) => {
      const v = p[k];
      const sv = SEV[v ? v.sev : 'unknown'];
      return `<div class="h"><span class="g">${h.g}</span><div><div class="top"><b>${h.label}</b><span class="pill ${sv[1]}">${sv[0]}</span></div>${v && v.kind ? `<div>${esc(v.kind)}</div>` : '<div class="muted small">Not checked yet</div>'}${v && v.detail ? `<div class="small muted">${esc(v.detail)}</div>` : ''}</div><button class="edit" data-hazard="${k}" aria-label="Edit ${h.label}">✎</button></div>`;
    }).join('')}</div>
    <div class="src"><a href="https://www.planningportal.nsw.gov.au/spatialviewer/" target="_blank" rel="noopener">NSW Planning Portal ↗</a> · <a href="https://flooddata.ses.nsw.gov.au/" target="_blank" rel="noopener">NSW Flood Data Portal ↗</a></div>`, { action: again('hazards') }))}

  ${group('The building & costs', ['s-building', 's-strata', 's-rates'])}
  ${show('s-building', () => card('s-building', '🛗', 'Access & amenities', [accessText(b) || 'access not set', amen.length ? `${amen.length} amenit${amen.length === 1 ? 'y' : 'ies'}` : ''].filter(Boolean).join(' · '), () => `
    <div class="qb"><div class="q">Getting to the front door</div>
      <div class="seg" role="group" aria-label="Access">${[['lift', 'Lift + stairs'], ['stairs', 'Stairs only'], ['ground', 'Ground level']].map(([k, t]) => `<button data-access="${k}" aria-pressed="${b.access === k}">${t}</button>`).join('')}</div>
      ${b.access && b.access !== 'ground' ? `<div class="grid2" style="margin-top:10px">
        <div class="field"><label>Level</label><div class="stepper"><button data-bstep="level" data-d="-1" aria-label="Lower level">−</button><b class="num">${b.level ?? 0}</b><button data-bstep="level" data-d="1" aria-label="Higher level">+</button></div></div>
        <div class="field"><label>Flights of stairs up</label><div class="stepper"><button data-bstep="flights" data-d="-1" aria-label="Fewer flights">−</button><b class="num">${b.flights ?? 0}</b><button data-bstep="flights" data-d="1" aria-label="More flights">+</button></div></div></div>
        ${b.access === 'stairs' && (b.flights ?? 0) >= 3 ? `<div class="flag amber" style="margin-top:8px"><span class="ic">~</span><span class="t"><span>${b.flights} flights with no lift</span><small>Think about groceries, furniture and moving day</small></span></div>` : ''}` : ''}</div>
    <div class="qb"><div class="q-row"><span class="q">Building amenities</span><button class="edit small" data-editamen>${ui.editAmen ? 'Done editing' : 'Edit list'}</button></div>
      <div class="tags">${st.amenities.map(a => { const on = amen.includes(a); return `<button class="tag amen ${on ? 'on' : ''}" data-amen="${esc(a)}" aria-pressed="${on}">${ui.editAmen ? '<span class="x" aria-hidden="true">×</span>' : on ? '✓ ' : ''}${esc(a)}</button>`; }).join('')}${ui.editAmen ? `<form class="addtag" data-addamen><input class="input" id="newamen" placeholder="New amenity…" aria-label="New amenity"><button class="btn sm">Add</button></form>` : ''}</div></div>`))}

  ${show('s-strata', () => card('s-strata', '🏢', 'Strata & builder', [p.levyQ && `${money(p.levyQ)} a quarter`, p.specialQ || p.specialOnce ? 'special levy' : '', p.builder].filter(Boolean).join(' · ') || 'nothing yet', () => `
    ${strataPts ? `<button class="flag ${strataRed ? 'red' : 'green'}" data-jump="s-visit" style="text-align:left;cursor:pointer;border:0;width:100%;font:inherit;color:inherit"><span class="ic">${strataRed ? '!' : '✓'}</span><span class="t"><span>${strataPts} point${strataPts === 1 ? '' : 's'} from the strata report</span><small>${strataRed ? `${strataRed} concern${strataRed === 1 ? '' : 's'} · ` : ''}see them in Our visit ›</small></span></button>` : ''}
    ${list(['strataRep', 'levyQ', 'funds', 'special', 'specialQ', 'specialOnce', 'builder', 'defects'])}${provenance(p, ['strataRep', 'builder', 'funds', 'defects', 'levyQ', 'special', 'specialQ', 'specialOnce'])}
    ${p.strataAt ? '' : '<p class="small muted" style="margin:0">Got the strata report? Claude can read it for you and pick out the concerns, things to check and good points, with page numbers.</p>'}`, { action: `<button class="btn sm" data-strata>${p.strataAt ? 'Read another report' : 'Read a strata report'}</button>` }))}

  ${show('s-rates', () => card('s-rates', '🧾', 'Rates', quarter ? `${money(quarter)} a quarter all up` : 'nothing yet', () => `
    ${list(['councilQ', 'waterQ', 'levyQ', 'specialQ'])}${provenance(p, ['councilQ', 'waterQ', 'levyQ', 'specialQ'])}
    ${quarter ? `<div class="small muted">${money(quarter)} a quarter all up (about ${money(quarter / 3)} a month).</div>` : ''}`))}

  ${group('Value & sources', ['s-value', 's-sources'])}
  ${show('s-value', () => card('s-value', '📈', 'Value & history', [p.est && `estimate ${p.est}`, sales[0] && `sold ${monthText(sales[0].when)} ${money(sales[0].price)}`, rents[0] && `rented ${money(rents[0].perWeek)}/wk`].filter(Boolean).join(' · ') || 'nothing yet', () => `
    <div class="valuebig"><span class="num">${p.est ? esc(p.est) : '—'}</span><span class="muted small">estimated today</span><button class="edit" data-edit="est">✎</button></div>
    ${sales.length ? `<div class="tbl"><table><thead><tr><th>Sold</th><th>Price</th><th>Change</th><th></th></tr></thead><tbody>${sales.map((s, i) => {
      const prev = sales[i + 1];
      let ch = '—';
      if (prev && prev.price) { const d = (s.price - prev.price) / prev.price * 100; ch = `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d.toFixed(0)}%</span>`; }
      return `<tr><td>${esc(monthText(s.when))}${s.note ? ` <span class="muted small">(${esc(s.note)})</span>` : ''}</td><td class="n">${money(s.price)}</td><td class="n">${ch}</td><td><button class="edit" data-delsale="${s.k}" aria-label="Remove sale">✕</button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="small muted" style="margin:0">No previous sales added.</p>'}
    <button class="btn sm" data-addsale style="align-self:flex-start">＋ Add a past sale</button>
    ${rents.length ? `<div><span class="eyebrow">Rental history</span><div class="tbl"><table><thead><tr><th>Rented</th><th>Rent</th><th></th></tr></thead><tbody>${rents.map(x => `<tr><td>${esc(monthText(x.when))}${x.note ? ` <span class="muted small">(${esc(x.note)})</span>` : ''}</td><td class="n">${money(x.perWeek)} / week</td><td><button class="edit" data-delsale="${x.k}" aria-label="Remove rental">✕</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${src('src_value')}`))}

  ${show('s-sources', () => card('s-sources', '🔗', 'Where this came from', `${links.length} link${links.length === 1 ? '' : 's'}`, () => `
    ${links.length ? `<ul class="linklist">${links.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))} ↗</a><span class="muted small">${esc(t)}</span></li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">No links yet. Add a source on any section, or a link when you edit a value.</p>'}`))}

  ${moreCard()}

  <div class="row-btns"><button class="btn sm" data-menu="${p.id}">Move, mark sold or delete</button></div>
  <button class="totop" data-jump="top" aria-label="Back to the top">↑ Top</button>`;

  const rerender = () => nav.render(true);
  const top = view.querySelector('.totop');
  view.onscroll = () => top.classList.toggle('show', view.scrollTop > 400);
  // Opens a folded card if needed, then scrolls to it.
  const jumpTo = sid => {
    if (sid === 'top') return view.scrollTo({ top: 0, behavior: 'smooth' });
    const was = document.getElementById(sid);
    if (!was || !was.classList.contains('open')) { folds[sid] = true; saveFolds(folds); nav.render(true); }
    // the redraw is immediate, so scroll the page area (not the window) to the new card now
    const s = document.getElementById(sid);
    if (s) view.scrollTo({ top: view.scrollTop + s.getBoundingClientRect().top - view.getBoundingClientRect().top - 8, behavior: 'smooth' });
  };
  view.onclick = e => {
    const fb = e.target.closest('[data-fold],[data-foldall]');
    if (fb) {
      if (fb.dataset.fold) { const sid = fb.dataset.fold; folds[sid] = !(folds[sid] ?? (sid === 's-details' || sid === 's-visit')); }
      else { const openAny = Object.values(folds).some(Boolean); for (const sid of ['s-details', 's-facing', 's-building', 's-commute', 's-nearby', 's-insp', 's-visit', 's-value', 's-hazards', 's-strata', 's-rates', 's-sources']) folds[sid] = !openAny; }
      saveFolds(folds);
      return nav.render(true);
    }
    const rv = e.target.closest('[data-reveal]');
    if (rv) { const sid = rv.dataset.reveal; ui.reveal.add(id + sid); folds[sid] = true; saveFolds(folds); nav.render(true); jumpTo(sid); return; }
    if (onVote(e.target, () => nav.render(true))) return;
    if (e.target.closest('[data-sold]')) return soldSheet(id, () => nav.render(true));
    if (e.target.closest('[data-claude]')) return claudeSheet(id, () => nav.render(true));
    if (e.target.closest('[data-strata]')) return strataSheet(id, () => nav.render(true));
    const sc = e.target.closest('[data-sched]');
    if (sc) { const on = toggleSchedule(id, sc.dataset.sched); toast(on ? 'Added to your Inspections tab' : 'Taken off your schedule'); return nav.render(true); }
    const lk = e.target.closest('[data-lookup]');
    if (lk) return startLookup(id, lk.dataset.lookup, nav);
    const t = e.target.closest('[data-money],[data-addinsp],[data-editinsp],[data-addphoto],[data-photo],[data-edit],[data-hazard],[data-menu],[data-jump],[data-addflag],[data-delflag],[data-addsale],[data-delsale],[data-access],[data-bstep],[data-amen],[data-editamen],[data-cdir],[data-work],[data-cedit],[data-trip],[data-compass],[data-viewed],[data-tag],[data-edittags],[data-delnote]');
    if (!t) return;
    const d = t.dataset;
    if (d.edit) return editField(id, d.edit, rerender);
    if (d.hazard) return editHazard(id, d.hazard, rerender);
    if (d.menu) return moveSheet(d.menu, nav);
    if (d.jump) return jumpTo(d.jump);
    if (t.hasAttribute('data-addflag')) return flagSheet(id, rerender, d.addflag || 'red');
    if (d.delflag) { setProp(id, d.delflag, null); toast('Removed'); return rerender(); }
    if (t.hasAttribute('data-addsale')) return saleSheet(id, rerender);
    if (d.delsale) { setProp(id, d.delsale, null); return rerender(); }
    if (d.access) { const v = { access: d.access }; if (d.access !== 'ground' && p.level == null) Object.assign(v, { level: 1, flights: 1 }); setProps(id, v); return rerender(); }
    if (d.bstep) { setProp(id, d.bstep, Math.max(0, (p[d.bstep] ?? 0) + Number(d.d))); return rerender(); }
    if (d.amen) {
      if (ui.editAmen) { setSetting('amenities', st.amenities.filter(x => x !== d.amen)); setProp(id, 'amen', amen.filter(x => x !== d.amen)); }
      else setProp(id, 'amen', amen.includes(d.amen) ? amen.filter(x => x !== d.amen) : [...amen, d.amen]);
      return rerender();
    }
    if (t.hasAttribute('data-editamen')) { ui.editAmen = !ui.editAmen; return rerender(); }
    if (d.cdir) { ui.cdir = d.cdir; return rerender(); }
    if (t.hasAttribute('data-work')) return workSheet(rerender);
    if (d.cedit) return commuteSheet(id, d.cedit, rerender);
    if (d.trip) return tripSheet(id, d.trip, ui.cdir, rerender);
    if (t.hasAttribute('data-compass')) return compassSheet(deg => { setProp(id, 'facing', deg); rerender(); });
    if (t.hasAttribute('data-viewed')) { setProp(id, 'viewed', !p.viewed); toast(p.viewed ? 'Marked as not viewed' : 'Marked as viewed'); return rerender(); }
    if (d.tag) {
      if (ui.editTags) { const k = d.kind === 'like' ? 'likes' : 'dislikes'; setSetting(k, st[k].filter(x => x !== d.tag)); return rerender(); }
      setProp(id, 'tag:' + d.tag, p['tag:' + d.tag] === d.kind ? null : d.kind); return rerender();
    }
    if (t.hasAttribute('data-edittags')) { ui.editTags = !ui.editTags; return rerender(); }
    if (d.delnote) { setProp(id, d.delnote, null); toast('Note deleted'); return rerender(); }
    if (t.hasAttribute('data-money')) {
      if (!p.priceNum) return editField(id, 'priceNum', rerender);
      moneyState.pid = id; return nav.go('money');
    }
    if (t.hasAttribute('data-addinsp')) return inspectionSheet({ propId: id }, rerender);
    if (d.editinsp) return inspectionSheet({ propId: id, key: d.editinsp }, rerender);
    if (d.addphoto) return addPhotoSheet(id, d.addphoto, rerender);
    if (d.photo) return viewer(id, d.photo, rerender);
  };
  view.onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'noteForm') { const v = f.querySelector('#noteText').value.trim(); if (v) { setProp(id, 'note:' + newId(), { text: v }); rerender(); } return; }
    if (f.hasAttribute('data-addamen')) { const v = f.querySelector('#newamen').value.trim(); if (v && !st.amenities.includes(v)) setSetting('amenities', [...st.amenities, v]); return rerender(); }
    if (f.dataset.addtag) {
      const k = f.dataset.addtag === 'like' ? 'likes' : 'dislikes';
      const v = f.querySelector('input').value.trim();
      if (v && !st[k].includes(v)) setSetting(k, [...st[k], v]);
      return rerender();
    }
  };
  view.oninput = e => {
    if (e.target.id !== 'facing') return;
    const deg = Number(e.target.value);
    view.querySelector('.compass svg').outerHTML = compassSVG(deg);
    view.querySelector('#dirText').innerHTML = `${dirOf(deg)} <span class="num muted" style="font-size:14px">${deg}°</span>`;
  };
  view.onchange = e => {
    if (e.target.id === 'facing') setProp(id, 'facing', Number(e.target.value));
    if (e.target.id === 'jumpto' && e.target.value) jumpTo(e.target.value);
  };
  return true;
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
const monthText = m => { const [y, mo] = String(m || '').split('-'); return mo ? new Date(+y, +mo - 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : (m || ''); };
const addTag = kind => `<form class="addtag" data-addtag="${kind}"><input class="input" placeholder="New button…" aria-label="New ${kind} button"><button class="btn sm">Add</button></form>`;
function changeNote(r, propId, inRow) {
  if (r && r.auto && r.v != null) return `<div class="auto-note" style="${inRow ? 'grid-column:2 / -1' : 'margin-top:4px'}">${r.via === 'claude' ? 'From Claude' : 'Looked up'} ${when(r.t)}${r.link ? ` · <a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(host(r.link))} ↗</a>` : ''}</div>`;
  if (!r || !(r.why || r.link || r.img)) return '';
  return `<div class="change" style="${inRow ? '' : 'margin-top:6px'}"><span><b>${esc(nameOf(r.by))}</b>${r.from ? ` changed from <s>${esc(r.from)}</s>` : ' added this'} · ${when(r.t)}</span>${r.why ? `<span>“${esc(r.why)}”</span>` : ''}${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">Supporting link ↗</a>` : ''}${r.img ? `<a href="${fullUrl(propId, r.img)}" target="_blank" rel="noopener"><img src="${thumbUrl(propId, r.img)}" alt="Attached screenshot" loading="lazy"></a>` : ''}</div>`;
}

function commuteBlock(p, slot, st) {
  const H = ui.cdir === 'home';
  const c = p[`cm:${slot}:${ui.cdir}`] || {};
  const pt = c.pt || [], dr = c.dr || [], nt = c.nt || [];
  const all = [...pt, ...dr, ...nt].filter(n => n > 0);
  const mx = Math.max(1, ...all);
  const cell = (v, cls) => v > 0 ? `<td><span class="num">${v} min</span><span class="bar ${cls}" style="width:${v / mx * 100}%"></span></td>` : '<td class="muted">—</td>';
  const work = st.work[slot];
  const extra = dr.length && nt.length ? Math.round(nt.reduce((a, v, i) => a + (v - (dr[i] || v)), 0) / nt.length) : 0;
  return `<div class="commute-person"><div class="sec-head"><span style="flex:1"><b>${esc(nameOf(slot))}</b> <span class="muted">${H ? '← from' : '→'} ${work ? esc(work) : 'add a workplace (✎ Workplaces)'}</span></span></div>
    ${tripBlock(p, slot, ui.cdir)}
    <div class="q-row" style="margin-top:4px"><span class="eyebrow">Door to door through the ${H ? 'evening' : 'morning'}</span><button class="edit small" data-cedit="${slot}">✎ Times</button></div>
    ${all.length ? `<div class="tbl"><table><thead><tr><th>Leave</th><th>Public transport</th><th>Drive · tolls</th><th>Drive · no tolls</th></tr></thead><tbody>${(H ? SLOTS_HOME : SLOTS_TO).map((s, i) => `<tr><td class="n">${s}</td>${cell(pt[i], 'pt')}${cell(dr[i], '')}${cell(nt[i], 'nt')}</tr>`).join('')}</tbody></table></div>` : '<p class="small muted">No times yet. Tap ✎ Times to add them.</p>'}
    <div class="small"><span class="muted">Fare:</span> ${p['fare_' + slot] ? esc(p['fare_' + slot]) : '—'} <button class="edit" data-edit="fare_${slot}" aria-label="Edit fare">✎</button><br><span class="muted">Tolls:</span> ${p['toll_' + slot] ? esc(p['toll_' + slot]) : '—'} <button class="edit" data-edit="toll_${slot}" aria-label="Edit tolls">✎</button>${extra > 0 ? ` <span class="muted">· avoiding tolls adds about ${extra} min</span>` : ''}</div></div>`;
}

// ── Public transport, step by step (Nov 2026) ─────────────────────────────
// cmr:<slot>:<to|home> = { leave: '08:00', min, legs: [{ m, line, toward, from, to, dep, arr, min, stops, wait }], byHand }
// The lookup fills it from Transport NSW (8am to work, 5pm home); you can change any step or type it all in.
export const MODE = {
  walk: ['🚶', 'Walk'], train: ['🚆', 'Train'], metro: ['🚇', 'Metro'], lightrail: ['🚊', 'Light rail'],
  bus: ['🚌', 'Bus'], coach: ['🚍', 'Coach'], ferry: ['⛴️', 'Ferry'], cycle: ['🚲', 'Cycle'],
};
const minsOf = t => { const [h, m] = String(t || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const t12 = t => { const v = minsOf(t); if (v == null) return ''; const h = Math.floor(v / 60) % 24, m = v % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };
/** Waiting time before each leg: what you typed, else the gap between the last arrival and this departure. */
function waitsOf(legs) {
  return legs.map((l, i) => {
    if (i === 0) return 0;
    if (l.wait != null) return Math.max(0, l.wait);
    const a = minsOf(legs[i - 1].arr), d = minsOf(l.dep);
    return a != null && d != null && d >= a ? d - a : 0;
  });
}
/** "Bus 461 → Train T9 · 1 change", or '' when there's no trip. */
export function tripSummary(trip) {
  if (!trip || !trip.legs?.length) return '';
  const ride = trip.legs.filter(l => l.m !== 'walk');
  if (!ride.length) return 'Walk all the way';
  const ch = ride.length - 1;
  return ride.map(l => `${MODE[l.m]?.[1] || l.m}${l.line ? ' ' + l.line : ''}`).join(' → ') + (ch ? ` · ${ch} change${ch === 1 ? '' : 's'}` : ' · no changes');
}
export const tripTotal = trip => trip.min || trip.legs.reduce((a, l) => a + (l.min || 0), 0) + waitsOf(trip.legs).reduce((a, b) => a + b, 0);

function tripBlock(p, slot, dir) {
  const trip = p[`cmr:${slot}:${dir}`];
  const H = dir === 'home';
  if (!trip || !trip.legs?.length) {
    return `<div class="trip empty-trip"><span class="small muted">No public transport steps yet. “Look up flood, commute &amp; more” finds them, or type them in.</span>
      <button class="btn sm" data-trip="${slot}">＋ Add the steps</button></div>`;
  }
  const waits = waitsOf(trip.legs);
  const total = tripTotal(trip);
  const ends = [H ? 'Work' : 'Home', H ? 'Home' : 'Work'];
  const rows = trip.legs.map((l, i) => {
    const [ic, name] = MODE[l.m] || ['•', l.m];
    const from = l.from || (i === 0 ? ends[0] : trip.legs[i - 1].to || '');
    const to = l.to || (i === trip.legs.length - 1 ? ends[1] : '');
    const head = l.m === 'walk' || l.m === 'cycle'
      ? `<b>${name} ${l.min} min</b>${to ? ` <span class="muted">to ${esc(to)}</span>` : ''}`
      : `<b>${name}${l.line ? ` <span class="line ${esc(l.m)}">${esc(l.line)}</span>` : ''}</b>${l.toward ? ` <span class="muted">towards ${esc(l.toward)}</span>` : ''}`;
    const detail = l.m === 'walk' || l.m === 'cycle' ? '' : `<div class="small">${from ? `${esc(from)}${l.dep ? ` <span class="num">${t12(l.dep)}</span>` : ''}` : ''} → ${to ? `${esc(to)}${l.arr ? ` <span class="num">${t12(l.arr)}</span>` : ''}` : ''}</div>
      <div class="small muted">${l.min} min${l.stops ? ` · ${l.stops} stop${l.stops === 1 ? '' : 's'}` : ''}</div>`;
    return `${waits[i] ? `<li class="wait"><span class="ic" aria-hidden="true">⏱</span><span class="small muted">Wait ${waits[i]} min${l.m !== 'walk' && trip.legs[i - 1]?.m !== 'walk' ? ' · change here' : ''}</span></li>` : ''}
      <li class="tleg ${esc(l.m)}"><span class="ic" aria-hidden="true">${ic}</span><div>${head}${detail}</div></li>`;
  }).join('');
  return `<div class="trip">
    <div class="q-row"><span><b>${total} min</b> <span class="muted">leaving ${t12(trip.leave) || (H ? '5:00pm' : '8:00am')} · ${esc(tripSummary(trip))}</span></span><button class="edit small" data-trip="${slot}">✎ Steps</button></div>
    <ol class="legs">${rows}</ol>
    <div class="small muted">${trip.byHand ? `Typed in by ${esc(nameOf(p.rec[`cmr:${slot}:${dir}`]?.by))}` : 'From Transport NSW’s trip planner'} · <a href="https://transportnsw.info/trip" target="_blank" rel="noopener">Check on transportnsw.info ↗</a></div></div>`;
}

// Type the trip in, or change the looked-up one: each step is how, which line, where you get off, and minutes.
function tripSheet(id, slot, dir, done) {
  const p = getProperty(id);
  const old = p[`cmr:${slot}:${dir}`];
  const legs = (old?.legs?.length ? old.legs : [{ m: 'walk', min: 5 }, { m: 'bus', min: 15 }]).map((l, i, a) => ({ ...l, wait: i ? waitsOf(a)[i] : 0 }));
  let leave = old?.leave || (dir === 'home' ? '17:00' : '08:00');
  const H = dir === 'home';
  const row = (l, i) => `<div class="legrow" data-i="${i}">
      <div class="lr-top"><span class="num muted">${i + 1}</span>
        <select class="input" data-f="m" aria-label="How">${Object.entries(MODE).map(([k, [ic, t]]) => `<option value="${k}" ${k === l.m ? 'selected' : ''}>${ic} ${t}</option>`).join('')}</select>
        <input class="input" data-f="line" value="${esc(l.line || '')}" placeholder="Line: T1, 370" aria-label="Line" ${l.m === 'walk' || l.m === 'cycle' ? 'hidden' : ''}>
        <span>${i ? `<button type="button" class="edit" data-up="${i}" aria-label="Move this step up">↑</button>` : ''}<button type="button" class="edit" data-del="${i}" aria-label="Remove this step">✕</button></span></div>
      <div class="lr-mid"><input class="input" data-f="to" value="${esc(l.to || '')}" placeholder="${i === legs.length - 1 ? (H ? 'Home' : 'Work') : 'Get off at… e.g. Central'}" aria-label="To">
        <input class="input num" data-f="min" inputmode="numeric" value="${l.min ?? ''}" aria-label="Minutes" placeholder="min"><span class="small muted">min</span></div>
      ${i ? `<div class="lr-wait small muted">Wait before this step <input class="input num" data-f="wait" inputmode="numeric" value="${l.wait || ''}" placeholder="0" aria-label="Wait minutes"> min</div>` : ''}
    </div>`;
  const s = openSheet(`<h3>${esc(nameOf(slot))} · public transport ${H ? 'home' : 'to work'}</h3>
    <form id="tripForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="tr-leave">Leaving at</label><input class="input" id="tr-leave" type="time" value="${esc(leave)}" style="max-width:150px"></div>
      <div id="tr-legs" style="display:flex;flex-direction:column;gap:10px"></div>
      <button type="button" class="btn sm" data-addleg style="align-self:flex-start">＋ Add a step</button>
      <p class="small muted" id="tr-total"></p>
      <div class="row-btns"><button class="btn primary">Save steps</button><button type="button" class="btn" data-close>Cancel</button></div>
      ${old?.legs?.length ? '<button type="button" class="edit small" data-clear style="align-self:flex-start;color:var(--red)">Remove the steps</button>' : ''}
    </form>`);
  const box = s.querySelector('#tr-legs');
  const read = () => s.querySelectorAll('.legrow').forEach(r => {
    const l = legs[+r.dataset.i];
    r.querySelectorAll('[data-f]').forEach(x => {
      const f = x.dataset.f;
      if (f === 'min' || f === 'wait') { const n = parseInt(x.value, 10); l[f] = Number.isFinite(n) ? n : null; } else l[f] = x.value.trim();
    });
  });
  const total = () => { const t = legs.reduce((a, l, i) => a + (l.min || 0) + (i ? l.wait || 0 : 0), 0); s.querySelector('#tr-total').textContent = t ? `About ${t} min door to door` : ''; };
  const draw = () => { box.innerHTML = legs.map(row).join(''); total(); };
  draw();
  s.oninput = () => { read(); total(); };
  s.onchange = e => {
    if (e.target.dataset.f === 'm') { read(); const ln = e.target.closest('.legrow').querySelector('[data-f="line"]'); ln.hidden = e.target.value === 'walk' || e.target.value === 'cycle'; }
  };
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-addleg]')) { read(); legs.push({ m: 'walk', min: null, wait: 0 }); draw(); box.lastElementChild.querySelector('select').focus(); return; }
    const up = e.target.closest('[data-up]');
    if (up) { read(); const i = +up.dataset.up; [legs[i - 1], legs[i]] = [legs[i], legs[i - 1]]; legs[0].wait = 0; draw(); return; }
    const d = e.target.closest('[data-del]');
    if (d) { read(); if (legs.length > 1) { legs.splice(+d.dataset.del, 1); draw(); } return; }
    if (e.target.closest('[data-clear]')) { setProp(id, `cmr:${slot}:${dir}`, null); closeSheet(); toast('Steps removed'); return done(); }
  };
  s.querySelector('#tripForm').onsubmit = e => {
    e.preventDefault();
    read();
    leave = s.querySelector('#tr-leave').value || leave;
    const clean = legs.filter(l => l.min > 0 || l.line || l.to).map((l, i) => {
      // Times from the trip planner only stay if nothing about that step changed.
      const was = old?.legs?.[i];
      const same = was && was.m === l.m && (was.line || '') === (l.line || '') && (was.to || '') === (l.to || '') && was.min === l.min;
      const x = { m: l.m, min: l.min || 0 };
      if (l.line && l.m !== 'walk' && l.m !== 'cycle') x.line = l.line;
      if (l.to) x.to = l.to;
      if (same) for (const k of ['toward', 'from', 'dep', 'arr', 'stops']) if (was[k] != null) x[k] = was[k];
      if (i) x.wait = l.wait || 0;
      return x;
    });
    if (!clean.length) { s.querySelector('#tr-total').textContent = 'Add at least one step, or Cancel.'; return; }
    const min = clean.reduce((a, l) => a + l.min + (l.wait || 0), 0);
    setProp(id, `cmr:${slot}:${dir}`, { leave, min, legs: clean, byHand: true });
    closeSheet(); toast('Steps saved'); done();
  };
}

function commuteSheet(id, slot, done) {
  const p = getProperty(id);
  const dir = ui.cdir;
  const c = p[`cm:${slot}:${dir}`] || {};
  const slots = dir === 'home' ? SLOTS_HOME : SLOTS_TO;
  const inp = (mode, i) => `<input class="input num" inputmode="numeric" data-mode="${mode}" data-i="${i}" value="${c[mode]?.[i] ?? ''}" aria-label="${mode} ${slots[i]}">`;
  const s = openSheet(`<h3>${esc(nameOf(slot))} · ${dir === 'home' ? 'home from work' : 'to work'}</h3>
    <p class="small muted">Minutes door to door when leaving at each time. Google Maps' "Leave at" and "Avoid tolls" options give these; step 6 fills them in automatically.</p>
    <form id="cmForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="cgrid"><span>Leave</span><span>Public transport</span><span>Drive · tolls</span><span>Drive · no tolls</span>
      ${slots.map((t, i) => `<span class="num" style="font-size:13px;color:var(--ink)">${t}</span>${inp('pt', i)}${inp('dr', i)}${inp('nt', i)}`).join('')}</div>
      <div class="row-btns"><button class="btn primary">Save times</button><button type="button" class="btn" data-close>Cancel</button></div></form>`);
  s.onclick = e => { if (e.target.closest('[data-close]')) closeSheet(); };
  s.querySelector('#cmForm').onsubmit = e => {
    e.preventDefault();
    const v = { pt: [], dr: [], nt: [] };
    s.querySelectorAll('[data-mode]').forEach(x => { const n = parseInt(x.value, 10); v[x.dataset.mode][+x.dataset.i] = Number.isFinite(n) ? n : null; });
    setProp(id, `cm:${slot}:${dir}`, v);
    closeSheet(); toast('Times saved'); done();
  };
}

function workSheet(done) {
  const st = settings();
  const [a, b] = bothSlots();
  const s = openSheet(`<h3>Our workplaces</h3><p class="small muted">Used for the commute on every property.</p>
    <form id="workForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="w-a">${esc(nameOf(a))}</label><input class="input" id="w-a" value="${esc(st.work[a])}" placeholder="Street address, suburb"></div>
      <div class="field"><label for="w-b">${esc(nameOf(b))}</label><input class="input" id="w-b" value="${esc(st.work[b])}" placeholder="Street address, suburb"></div>
      <div class="row-btns"><button class="btn primary">Save workplaces</button><button type="button" class="btn" data-close>Cancel</button></div></form>`);
  s.onclick = e => { if (e.target.closest('[data-close]')) closeSheet(); };
  s.querySelector('#workForm').onsubmit = e => {
    e.preventDefault();
    setSetting('work_' + a, s.querySelector('#w-a').value.trim());
    setSetting('work_' + b, s.querySelector('#w-b').value.trim());
    closeSheet(); toast('Workplaces saved'); done();
  };
}

function flagSheet(id, done, tone = 'red') {
  const TITLE = { green: 'Add a good point', red: 'Add a concern', amber: 'Add something to check' };
  const s = openSheet(`<h3>${TITLE[tone]}</h3>
    <form id="flagForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="seg" role="radiogroup">${[['green', 'Good'], ['red', 'Concern'], ['amber', 'To check']].map(([k, t]) => `<button type="button" data-tone="${k}" aria-pressed="${k === tone}">${t}</button>`).join('')}</div>
      <div class="field"><label for="f-title">What is it?</label><input class="input" id="f-title" placeholder="e.g. Special levy still owing"></div>
      <div class="field"><label for="f-detail">Details (optional)</label><input class="input" id="f-detail" placeholder="e.g. $4,200 due March 2027 for balcony waterproofing"></div>
      <div class="field"><label for="f-link">Source link (optional)</label><input class="input" id="f-link" type="url" placeholder="https://…"></div>
      <div class="row-btns"><button class="btn primary">Add</button><button type="button" class="btn" data-close>Cancel</button></div></form>`);
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const b = e.target.closest('[data-tone]');
    if (b) { tone = b.dataset.tone; s.querySelectorAll('[data-tone]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
  };
  s.querySelector('#flagForm').onsubmit = e => {
    e.preventDefault();
    const title = s.querySelector('#f-title').value.trim();
    if (!title) return s.querySelector('#f-title').focus();
    setProp(id, 'flag:' + newId(), { tone, title, detail: s.querySelector('#f-detail').value.trim(), link: s.querySelector('#f-link').value.trim() });
    closeSheet(); done();
  };
}

function saleSheet(id, done) {
  const s = openSheet(`<h3>Add a past sale</h3>
    <form id="saleForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="s-when">When</label><input class="input" id="s-when" type="month"></div>
      <div class="field"><label for="s-price">Sold for</label><input class="input num" id="s-price" inputmode="numeric" placeholder="640000"></div>
      <div class="field"><label for="s-note">Note (optional)</label><input class="input" id="s-note" placeholder="e.g. off the plan"></div>
      <p class="err" id="s-err" hidden></p>
      <div class="row-btns"><button class="btn primary">Add sale</button><button type="button" class="btn" data-close>Cancel</button></div></form>`);
  s.onclick = e => { if (e.target.closest('[data-close]')) closeSheet(); };
  s.querySelector('#saleForm').onsubmit = e => {
    e.preventDefault();
    const price = Number(String(s.querySelector('#s-price').value).replace(/[^\d.]/g, ''));
    const w = s.querySelector('#s-when').value;
    if (!w || !price) { const er = s.querySelector('#s-err'); er.hidden = false; er.textContent = 'Add the month and the price.'; return; }
    setProp(id, 'sale:' + newId(), { when: w, price, note: s.querySelector('#s-note').value.trim() });
    closeSheet(); done();
  };
}

function yearsText(list) {
  const ys = list.map(x => Number(x.year)).filter(Boolean);
  if (!ys.length) return '';
  const a = Math.min(...ys), b = Math.max(...ys);
  return a === b ? ` · ${a}` : ` · ${a} to ${b}`;
}

// Choose photos: what they are and (for listing photos) which year, then upload.
function addPhotoSheet(id, kind, done) {
  const before = storageUse().level;
  const s = openSheet(`<h3>${kind === 'floorplan' ? 'Add the floorplan' : 'Add photos'}</h3>${storageBanner()}
    <form id="phForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="seg" role="radiogroup" aria-label="What are they">${Object.entries(KIND).map(([k, t]) => `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${t}</button>`).join('')}</div>
      <div class="field" id="ph-yearf"><label for="ph-year">Year taken</label><input class="input num" id="ph-year" inputmode="numeric" value="${new Date().getFullYear()}"><span class="small muted">Old listing photos: the year of that listing, so the gallery runs from old to new.</span></div>
      <input id="ph-files" type="file" accept="image/*" multiple hidden>
      <button type="button" class="btn primary" id="ph-pick">📷 Choose or take photos</button>
      <div id="ph-prev" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      <p class="small muted" id="ph-status">They upload as soon as you pick them.</p>
      <div class="row-btns"><button type="button" class="btn" data-close id="ph-close">Cancel</button></div></form>`);
  const input = s.querySelector('#ph-files');
  const status = s.querySelector('#ph-status');
  const pick = s.querySelector('#ph-pick');
  const prev = s.querySelector('#ph-prev');
  let busy = false, added = 0;
  s.onclick = e => {
    if (e.target.closest('[data-close]')) {
      if (busy) return;   // don't drop half-finished uploads
      closeSheet();
      if (added) done();
      return;
    }
    if (e.target.closest('#ph-pick') && !busy) { input.value = ''; input.click(); return; }
    const b = e.target.closest('[data-kind]');
    if (b) { kind = b.dataset.kind; s.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
  };
  s.querySelector('#phForm').onsubmit = e => e.preventDefault();
  // Picking photos starts the upload straight away (there used to be a
  // separate Upload button, which was easy to miss on the phone).
  input.onchange = async () => {
    const files = [...input.files];
    if (!files.length) {
      status.textContent = 'No photo came back from the phone. Try again, or pick from Gallery / Photos instead of Files.';
      status.className = 'err';
      return;
    }
    busy = true; pick.disabled = true;
    s.querySelector('#ph-close').textContent = 'Uploading…';
    status.className = 'small muted';
    const tiles = files.map(f => {
      const t = document.createElement('div');
      t.style.cssText = 'width:64px;height:64px;border-radius:10px;background:var(--card) center/cover;opacity:.45;position:relative';
      try { t.style.backgroundImage = `url(${URL.createObjectURL(f)})`; } catch (e) { /* preview only */ }
      prev.appendChild(t);
      return t;
    });
    status.textContent = `Uploading 0 of ${files.length}…`;
    try {
      await addPhotos(id, files, { kind, year: s.querySelector('#ph-year').value.trim() }, (n, total) => {
        status.textContent = n < total ? `Uploading ${n} of ${total}…` : '';
        if (tiles[n - 1]) tiles[n - 1].style.opacity = '1';
        added++;
      });
      const u = storageUse();
      // Crossing 80% or 95% with this upload: say so straight away.
      if (u.level !== before && u.level !== 'ok') toast(`Photo storage is now ${Math.round(u.share * 100)}% full (${mb(u.bytes)} of 1 GB). Us → Photo storage shows what’s using it.`);
      else toast(files.length === 1 ? 'Photo added' : `${files.length} photos added`);
      closeSheet();
      done();
    } catch (err) {
      status.textContent = (added ? `${added} uploaded, then it stopped. ` : '') + uploadError(err);
      status.className = 'err';
      tiles.slice(added).forEach(t => t.remove());
      pick.textContent = '📷 Try again';
    } finally {
      busy = false; pick.disabled = false;
      const c = s.querySelector('#ph-close');
      if (c) c.textContent = added ? 'Done' : 'Cancel';
    }
  };
}

// Full-size viewer: swipe with ‹ ›, change its caption, year or kind, or delete it.
function viewer(id, photoId, done) {
  const p = getProperty(id);
  const list = photosOf(p);
  let i = Math.max(0, list.findIndex(x => x.id === photoId));
  const s = openSheet('');
  const draw = () => {
    const x = list[i];
    s.innerHTML = `<div class="viewer"><img src="${fullUrl(id, x.id)}" alt="${esc(x.caption || KIND[x.kind])}"></div>
      <div class="sec-head"><span class="small muted" style="flex:1">${i + 1} of ${list.length} · ${esc(KIND[x.kind] || 'Photo')} · ${esc(x.year || '')} · added by ${esc(nameOf(x.by))}</span>
        <button class="iconbtn" data-step="-1" aria-label="Previous" ${i === 0 ? 'disabled' : ''}>‹</button><button class="iconbtn" data-step="1" aria-label="Next" ${i === list.length - 1 ? 'disabled' : ''}>›</button></div>
      <form id="vForm" style="display:flex;flex-direction:column;gap:8px">
        <input class="input" id="v-cap" value="${esc(x.caption || '')}" placeholder="Caption, e.g. Kitchen from the 2019 listing">
        <div class="grid2"><input class="input num" id="v-year" value="${esc(x.year || '')}" inputmode="numeric" aria-label="Year"><select class="input" id="v-kind" aria-label="What it is">${Object.entries(KIND).map(([k, t]) => `<option value="${k}" ${k === x.kind ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="row-btns"><button class="btn primary">Save</button><a class="btn" href="${fullUrl(id, x.id)}" target="_blank" rel="noopener">Full size ↗</a><button type="button" class="btn" data-delask style="color:var(--red)">Delete</button><button type="button" class="btn" data-close>Close</button></div>
      </form>`;
    s.querySelector('#vForm').onsubmit = e => {
      e.preventDefault();
      const v = { ...p.rec['photo:' + x.id].v, caption: s.querySelector('#v-cap').value.trim(), year: s.querySelector('#v-year').value.trim(), kind: s.querySelector('#v-kind').value };
      setProp(id, 'photo:' + x.id, v);
      closeSheet(); toast('Photo saved'); done();
    };
  };
  s.onclick = async e => {
    const t = e.target.closest('[data-step],[data-close],[data-delask],[data-del]');
    if (!t) return;
    if (t.dataset.step) { i = Math.min(list.length - 1, Math.max(0, i + Number(t.dataset.step))); return draw(); }
    if (t.hasAttribute('data-close')) return closeSheet();
    if (t.hasAttribute('data-delask')) {
      t.closest('.row-btns').innerHTML = '<span class="small" style="flex-basis:100%">Delete this photo for both of you?</span><button type="button" class="btn danger" data-del>Delete</button><button type="button" class="btn" data-close>Cancel</button>';
      return;
    }
    if (t.hasAttribute('data-del')) { await deletePhoto(id, list[i].id); closeSheet(); toast('Photo deleted'); done(); }
  };
  draw();
}

// ── Automatic lookups (step 6) ───────────────────────────────────────────
const lookupMsg = new Map();   // property id → { tone, text } from the last lookup, shown on its card
const again = part => `<button class="edit small" data-lookup="${part}" title="Look this up again">↻ Look up</button>`;

// The automatic lookup is just a button: "Looking up…" while it runs, ↻ once it has.
function lookupButton(p) {
  if (lookingUp(p.id)) return '<span class="btn sm busy" aria-live="polite"><span class="tick spin"></span>Looking up…</span>';
  return `<button class="btn sm" data-lookup="all" title="Flood, bushfire, heritage, NBN, commute and nearby shops">${p.lookedUp ? `↻ Look up again <span class="muted small">${when(p.rec.lookedUp.t)}</span>` : 'Look up flood, commute &amp; more'}</button>`;
}
// Only problems get a line under the buttons; a clean lookup just says "Lookup finished".
function lookupNote(p) {
  const msg = lookupMsg.get(p.id);
  if (!msg || lookingUp(p.id) || msg.tone === 'green') return '';
  return `<div class="flag ${msg.tone}"><span class="ic">${msg.tone === 'red' ? '!' : '~'}</span><span class="t">${msg.lines.map((l, i) => i ? `<small>${esc(l)}</small>` : `<span>${esc(l)}</span>`).join('')}</span></div>`;
}

/** Runs a lookup for a property and keeps the page up to date while it runs. */
export function startLookup(id, part, nav) {
  const parts = part === 'all' || !part ? Object.keys(PARTS) : [part];
  const rerender = () => { if (location.hash === '#prop-' + id) nav.render(true); };
  lookupMsg.delete(id);
  lookUp(id, parts, rerender)
    .then(res => {
      if (!res) return;
      const lines = [`Looked up: ${res.saved.join(', ')}`];
      if (res.kept.length) lines.push(`Kept your own values for ${res.kept.length} field${res.kept.length === 1 ? '' : 's'}.`);
      lines.push(...res.notes);
      lookupMsg.set(id, { tone: res.notes.length ? 'amber' : 'green', lines });
      toast('Lookup finished');
    })
    .catch(e => { lookupMsg.set(id, { tone: 'red', lines: ['Lookup didn’t finish', e.message] }); })
    .finally(rerender);
}

// One quiet line saying where a card's values came from, instead of a note under every value.
function provenance(p, keys) {
  const by = { claude: [], lookup: [], hand: 0 };
  let claudeLink = null, lookLink = null, last = 0;
  for (const k of keys) {
    const r = p.rec[k];
    if (!r || r.v == null) continue;
    if (r.auto && r.via === 'claude') { by.claude.push(k); claudeLink = claudeLink || r.link; last = Math.max(last, r.t); }
    else if (r.auto) { by.lookup.push(k); lookLink = lookLink || r.link; }
    else if (r.why || r.link || r.img) by.hand++;
  }
  const bits = [];
  if (by.claude.length) bits.push(`From Claude ${when(last)}${claudeLink ? ` · <a href="${esc(claudeLink)}" target="_blank" rel="noopener">${esc(host(claudeLink))} ↗</a>` : ''}`);
  if (by.lookup.length) bits.push(`Looked up${lookLink ? ` · <a href="${esc(lookLink)}" target="_blank" rel="noopener">${esc(host(lookLink))} ↗</a>` : ''}`);
  if (by.hand) bits.push(`<i class="edot"></i> ${by.hand} changed by hand (tap one to see why)`);
  return bits.length ? `<div class="auto-note">${bits.join(' · ')}</div>` : '';
}
