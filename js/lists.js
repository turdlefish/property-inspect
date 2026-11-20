// Lists screen: add an address, the four lists, move and delete.

import * as store from './store.js';
import { LISTS, allProperties, getProperty, moveTo, deleteProperty, settleVotes, vote } from './props.js';
import { nameOf } from './people.js';
import { voteBlock, onVote, soldSheet, soldLine, soldSummary } from './decide.js';
import { esc, HOUSE, hueOf, openSheet, closeSheet, toast } from './ui.js';
import { accessText, flagCounts } from './property.js';
import { nextInspection, inspText } from './inspections.js';
import { photosOf, thumbUrl, storageBanner, storageUse, deleteAllPhotos, mb } from './photos.js';
import { limitsBanner } from './limits.js';
import { quickAddSheet } from './quickadd.js';

export const listState = { tab: 'short' };

export function renderLists(view, topbar, nav) {
  topbar.set('Our properties');
  let all = allProperties();
  // Votes that agree but haven't moved yet (you both voted at once on different phones): move them now.
  if (all.some(settleVotes)) all = allProperties();
  const counts = Object.fromEntries(Object.keys(LISTS).map(k => [k, all.filter(p => p.list === k).length]));
  const items = all.filter(p => p.list === listState.tab);
  const EMPTY = { review: 'Tap ＋ Add a property to start.', short: 'Properties you both vote Shortlist on land here.', notideal: 'Properties you both vote Not ideal on land here, to keep an eye on the market.', sold: 'When a property you’re watching sells, tap ⋯ → Sold.' };
  view.innerHTML = `${storageBanner()}${limitsBanner()}
    <button class="btn primary" id="addBtn" style="width:100%">＋ Add a property</button>
    <div class="seg lists-seg" role="group" aria-label="Lists">${Object.entries(LISTS).map(([k, l]) => `<button data-tab="${k}" aria-pressed="${listState.tab === k}">${l.label}<span class="c">${counts[k]}</span></button>`).join('')}</div>
    ${listState.tab === 'sold' ? soldSummary(items) : ''}
    ${listState.tab === 'review' && items.length ? '<p class="small muted" style="margin:0">Vote on each one. It moves only when you both pick the same list.</p>' : ''}
    ${items.length ? items.map(card).join('') : `<div class="empty">Nothing in ${LISTS[listState.tab].label} yet.<br>${EMPTY[listState.tab]}</div>`}`;

  // Typed in by hand; lookups are a button on the property now, not automatic.
  view.querySelector('#addBtn').onclick = () => quickAddSheet(nav, id => {
    listState.tab = 'review';
    nav.go('prop-' + id);
  });
  view.onclick = e => {
    if (onVote(e.target, () => nav.render(true))) return;
    const t = e.target.closest('[data-tab],[data-menu],[data-open]');
    if (!t) return;
    if (t.dataset.tab) { listState.tab = t.dataset.tab; return nav.render(true); }
    if (t.dataset.menu) { e.stopPropagation(); return moveSheet(t.dataset.menu, nav); }
    if (t.dataset.open) return nav.go('prop-' + t.dataset.open);
  };
  view.onkeydown = e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pcard')) { e.preventDefault(); e.target.click(); }
  };
}

function card(p) {
  const facts = [p.beds != null && `<span><b>${p.beds}</b> bed</span>`, p.baths != null && `<span><b>${p.baths}</b> bath</span>`, p.cars != null && `<span><b>${p.cars}</b> car</span>`].filter(Boolean).join('');
  return `<div class="pcard" role="button" tabindex="0" data-open="${p.id}">
    <div class="thumb" style="--h:${hueOf(p.id)}">${HOUSE}${(() => { const ph = photosOf(p).find(x => x.kind !== 'floorplan'); return ph ? `<img src="${thumbUrl(p.id, ph.id)}" alt="" loading="lazy">` : ''; })()}</div>
    <div class="body">
      <div class="top"><div><div class="addr">${esc(p.address)}</div><div class="sub">${esc([p.suburb, p.type].filter(Boolean).join(' · '))}</div></div><button class="kebab" data-menu="${p.id}" aria-label="Move or delete ${esc(p.address)}">⋯</button></div>
      ${p.price ? `<div class="price">${esc(p.price)}</div>` : ''}
      ${facts ? `<div class="facts">${facts}</div>` : ''}
      ${accessText(p) ? `<div class="sub">${esc(accessText(p))}</div>` : ''}
      ${soldLine(p)}
      <div class="meta">${(() => { const c = flagCounts(p); return (c.red ? `<span class="pill red">${c.red} concern${c.red === 1 ? "" : "s"}</span>` : '') + (c.amber ? `<span class="pill amber">${c.amber} to check</span>` : '') + (c.green ? `<span class="pill green">${c.green} good</span>` : ''); })()}${nextInspection(p) ? `<span class="pill accent">${esc(inspText(nextInspection(p)))}</span>` : ''}${p.viewed ? '<span class="pill green">✓ Viewed</span>' : ''}</div>
      ${voteBlock(p, true)}
    </div></div>`;
}

export function moveSheet(id, nav) {
  const p = getProperty(id);
  if (!p) return;
  const s = openSheet(`<h3>${esc(p.address)}</h3><span class="eyebrow">Move to list</span>
    ${Object.entries(LISTS).map(([k, l]) => `<button class="opt" data-move="${k}"><span class="pill ${l.tone}">${p.list === k ? '✓' : '•'}</span>${l.label}</button>`).join('')}
    <button class="opt" data-delask style="color:var(--red)">Delete property</button>
    <button class="btn" data-close>Cancel</button>`);
  s.onclick = e => {
    const t = e.target.closest('[data-move],[data-delask],[data-del],[data-close]');
    if (!t) return;
    if (t.dataset.move === 'sold') return soldSheet(id, () => nav.render(true));
    // Out of To review takes both of you: moving to Shortlist or Not ideal from here is your vote.
    if (p.list === 'review' && (t.dataset.move === 'short' || t.dataset.move === 'notideal')) {
      const moved = vote(id, t.dataset.move);
      closeSheet();
      toast(moved ? `You both agreed: moved to ${LISTS[moved].label}` : `Your vote is in. It moves when ${nameOf(store.partner())} picks ${LISTS[t.dataset.move].label} too.`);
      return nav.render(true);
    }
    if (t.dataset.move) { moveTo(id, t.dataset.move); closeSheet(); toast(`Moved to ${LISTS[t.dataset.move].label}`); return nav.render(true); }
    if (t.hasAttribute('data-close')) return closeSheet();
    if (t.hasAttribute('data-delask')) {
      s.innerHTML = `<h3>Delete ${esc(p.address)}?</h3>
        <p class="muted">This removes it and its notes for both of you. To keep it for market research, move it to Not ideal instead.</p>
        <div class="row-btns"><button class="btn danger" data-del>Delete</button><button class="btn" data-move="notideal">Move to Not ideal</button><button class="btn" data-close>Cancel</button></div>`;
      return;
    }
    if (t.hasAttribute('data-del')) { deleteAllPhotos(p); deleteProperty(id); closeSheet(); toast('Property deleted'); return nav.go('lists'); }
  };
}

/** Which properties' photos take the most room, with a way to open each. */
export function storageSheet(nav) {
  const u = storageUse();
  const pct = Math.round(u.share * 100);
  const rows = u.byProperty.map(x => ({ ...x, p: getProperty(x.id) })).filter(x => x.p);
  const s = openSheet(`<h3>Photo storage</h3>
    <div><div class="sec-head"><b class="num" style="flex:1">${mb(u.bytes)} of 1 GB</b><span class="pill ${u.level === 'ok' ? 'green' : u.level === 'warn' ? 'amber' : 'red'}">${pct}%</span></div>
      <div class="meter" style="margin-top:6px"><i style="width:${Math.min(100, Math.max(1, pct))}%" class="${u.level}"></i></div>
      <p class="small muted" style="margin-top:6px">${u.count} photos. You’ll get a warning on the Lists screen at 80% and again at 95%. Supabase’s free plan holds 1 GB and never charges; at 100% new photos just stop until you delete some.</p></div>
    ${rows.length ? `<span class="eyebrow">Using the most</span>${rows.map(x => `<button class="opt" data-openprop="${x.id}"><span style="flex:1;min-width:0">${esc(x.p.address)}<br><span class="small muted">${LISTS[x.p.list]?.label || ''} · ${x.count} photo${x.count === 1 ? '' : 's'}</span></span><span class="num small">${mb(x.bytes)}</span></button>`).join('')}` : '<p class="muted small">No photos yet.</p>'}
    <button class="btn" data-close>Close</button>`);
  s.onclick = e => {
    const t = e.target.closest('[data-openprop],[data-close]');
    if (!t) return;
    closeSheet();
    if (t.dataset.openprop) nav.go('prop-' + t.dataset.openprop);
  };
}
