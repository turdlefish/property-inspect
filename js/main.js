// App start-up, routing (#lists, #inspections, #money, #prop-<id>), top bar and the Us sheet.

import * as store from './store.js';
import { CONFIG } from './config.js';
import { runOnboarding } from './onboarding.js';
import { renderLists, storageSheet } from './lists.js';
import { renderInspections } from './inspections.js';
import { renderMoney } from './money.js';
import { limitState, limitsSheet, refreshUsage } from './limits.js';
import { fillSea } from './sea.js';
import { storageUse, mb } from './photos.js';
import { addExamples, allProperties } from './props.js';
import { mountFeedback } from './feedback.js';
import { inspectionsOf, onSchedule, iso } from './inspections.js';
import { esc, openSheet, closeSheet, sheetOpen, toast, copyText } from './ui.js';

const view = document.getElementById('view');
const topbarEl = document.getElementById('topbar');
let route = 'lists';
const ROUTES = ['lists', 'inspections', 'money', 'us'];

import { person } from './people.js';
import { renderProperty } from './property.js';

const topbar = {
  set(title, { back, action } = {}) {
    const me = person(store.me()), them = person(store.partner());
    topbarEl.innerHTML = `${back ? `<button class="iconbtn" data-go="${back}" aria-label="Back to properties">‹ Properties</button>` : '<span class="brandmark" aria-hidden="true"></span>'}
      <h2>${esc(title)}</h2>${action || ''}
      ${CONFIG.mock ? '<span class="mock-badge">test server</span>' : ''}
      <span class="sync" id="syncDot" data-state="${store.getStatus().state}" title="Sync"></span>
      <button class="duo" data-go="us" aria-label="You, your partner and sync">
        <span style="background:${esc(me.color)}">${esc(me.name[0])}</span>${them.here ? `<span style="background:${esc(them.color)}">${esc(them.name[0])}</span>` : ''}
      </button>`;
  },
};

const nav = {
  go(r) { route = r; try { history.replaceState(null, '', '#' + r); } catch (e) {} render(); },
  render: keep => render(keep),
};

function render(keepScroll) {
  const st = view.scrollTop;
  const tab = route.startsWith('prop-') ? 'lists' : route;
  view.dataset.route = route.startsWith('prop-') ? 'prop' : route;   // for the wide-screen layout
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', String(b.dataset.go === tab)));
  view.onclick = view.onkeydown = view.onsubmit = view.oninput = view.onchange = view.onscroll = null;
  if (route === 'lists') renderLists(view, topbar, nav);
  else if (route.startsWith('prop-')) { if (!renderProperty(view, topbar, nav, route.slice(5))) { route = 'lists'; return render(); } }
  else if (route === 'inspections') renderInspections(view, topbar, nav);
  else if (route === 'money') renderMoney(view, topbar);
  else if (route === 'us') renderUs();
  badges();
  view.scrollTop = keepScroll ? st : 0;
}

function placeholder(title, text) {
  topbar.set(title);
  view.innerHTML = `<div class="empty"><b>Coming soon</b><br>${esc(text)}</div>`;
}

// Light / Dark / Auto, per phone (index.html applies it before the first paint).
const themeNow = () => { try { return localStorage.getItem('prop:theme') || 'auto'; } catch (e) { return 'auto'; } };
function setTheme(t) {
  try { if (t === 'auto') localStorage.removeItem('prop:theme'); else localStorage.setItem('prop:theme', t); } catch (e) {}
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  if (window.propApplyLook) window.propApplyLook();
}

// Little counts on the tabs, so you can see where something is waiting without opening it.
function badges() {
  const set = (id, n, label) => { const b = document.getElementById(id); if (!b) return; b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); b.title = label; };
  const mine = store.me(), all = allProperties();
  set('b-lists', all.filter(p => p.list === 'review' && !p['vote:' + mine]).length, 'Waiting for your vote');
  const today = iso(new Date()), week = iso(new Date(Date.now() + 6 * 864e5));
  set('b-insp', all.flatMap(p => inspectionsOf(p)).filter(x => onSchedule(x) && x.date >= today && x.date <= week).length, 'On your schedule this week');
}

// The Us tab (was a sheet behind the initials at the top): you two, sync, free limits, look.
function renderUs() {
  topbar.set('Us');
  const s = store.getSession(), me = person(store.me()), them = person(store.partner());
  const st = store.getStats();
  view.innerHTML = `<div class="uspage"><section class="card"><span class="tape" aria-hidden="true"></span>
    <div class="kv2">
      <div><span class="muted">You</span><b>${esc(me.name)}</b></div>
      <div><span class="muted">Partner</span><b>${them.here ? esc(them.name) : 'Not joined yet'}</b></div>
      <div><span class="muted">Space code</span><b class="num">${esc(s.space)}</b></div>
      <div><span class="muted">Photo storage</span><button class="edit" data-storage>${(() => { const u = storageUse(); return `${mb(u.bytes)} of 1 GB (${Math.round(u.share * 100)}%) ›`; })()}</button></div>
      <div><span class="muted">Free limits</span><button class="edit" data-limits>${(() => {
        const st = limitState();
        return st.level === 'stopped' ? 'Lookups paused until the 1st ›' : st.level === 'today' ? 'Today’s lookups used up ›' : `${Math.round(st.share * 100)}% of this month’s free lookups ›`;
      })()}</button></div>
      <div><span class="muted">Sync</span><span>${esc(store.getStatus().state)} · ${st.requests} requests · ${(st.down / 1024).toFixed(1)} KB down</span></div>
    </div>
    <div class="field"><label>Look on this phone</label>
      <div class="seg" role="radiogroup" aria-label="Look">${[['light', 'Light · jellyfish'], ['dark', 'Dark · starfish'], ['auto', 'Auto']].map(([k, t]) => `<button data-theme-pick="${k}" aria-pressed="${themeNow() === k}">${t}</button>`).join('')}</div>
      <span class="small muted">Auto follows your phone’s light or dark setting.</span></div>
    <div class="row-btns"><button class="btn" data-act="copy">Copy space code</button><button class="btn" data-act="sync">Sync now</button></div>
    ${CONFIG.mock ? `<div class="card" style="background:var(--surface-2)"><span class="eyebrow">Test server</span><p class="small muted">Only on the test server. Open <b>127.0.0.1</b> instead of localhost in a second tab to be your partner.</p><button class="btn sm" data-act="examples">Add example properties</button></div>` : ''}
    <button class="btn" data-act="signout" style="color:var(--red)">Sign out on this phone</button></section>
    <section class="card fb-card" id="fbCard"></section></div>`;
  mountFeedback(view.querySelector('#fbCard'));
  const sh = view;
  sh.onclick = async e => {
    const tp = e.target.closest('[data-theme-pick]');
    if (tp) {
      setTheme(tp.dataset.themePick);
      sh.querySelectorAll('[data-theme-pick]').forEach(b => b.setAttribute('aria-pressed', String(b === tp)));
      return;
    }
    const t = e.target.closest('[data-act],[data-close]');
    if (!t) return;
    const a = t.dataset.act;
    if (t.hasAttribute('data-close')) return closeSheet();
    if (a === 'signout2') { await store.flush(); store.signOut(); location.reload(); return; }
    if (a === 'copy') toast((await copyText(s.space)) ? 'Code copied' : 'Select the code to copy it');
    if (a === 'sync') { await store.syncNow(); toast('Synced'); render(true); }
    if (a === 'examples') { addExamples(); toast('Added 5 example properties'); nav.go('lists'); }
    if (a === 'signout') {
      const ask = openSheet(`<h3>Sign out on this phone?</h3><p class="muted">Your properties stay safe on the server. You can sign in again with the space code.</p>
        <div class="row-btns"><button class="btn danger" data-act="signout2">Sign out</button><button class="btn" data-close>Cancel</button></div>`);
      ask.onclick = sh.onclick;
    }
  };
}

// ── events ────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-storage],[data-limits]');
  if (!t) { if (e.target.id === 'sheet') closeSheet(); return; }
  if (t.hasAttribute('data-limits')) return limitsSheet();
  if (t.hasAttribute('data-storage')) return storageSheet(nav);
  if (t.dataset.go) { closeSheet(); nav.go(t.dataset.go); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
// Following a link to another screen (e.g. #prop-<id>) while the app is open.
window.addEventListener('hashchange', () => {
  const h = (location.hash || '').slice(1);
  if (!store.getSession() || h === route) return;
  if (ROUTES.includes(h) || h.startsWith('prop-')) { closeSheet(); route = h; render(); }
});

// The Android app's back button: close a sheet, then go back to the lists; false lets the app close.
window.propBack = () => {
  if (sheetOpen()) { closeSheet(); return true; }
  if (store.getSession() && route !== 'lists') { nav.go('lists'); return true; }
  return false;
};
// The Android app is going into the background: send anything not yet saved.
window.propFlush = () => { try { store.flush(); } catch (e) {} };

store.onStatus(st => { const d = document.getElementById('syncDot'); if (d) d.dataset.state = st.state; });
// Your partner's changes show as they arrive (but not while you're typing or in a sheet).
store.on((doc, source) => {
  const typing = document.activeElement && document.activeElement.matches('input,textarea,select');
  if (source === 'remote' && !sheetOpen() && !typing) render(true);
});

function start() {
  document.getElementById('app').hidden = false;
  fillSea(document.getElementById('app'));
  const h = (location.hash || '').slice(1);
  if (ROUTES.includes(h) || h.startsWith('prop-')) route = h;
  render();
  store.startSync().then(() => {
    // A link to a property this phone hadn't downloaded yet: open it now that it's here.
    if (h.startsWith('prop-') && route === 'lists') route = h;
    render(true);
    // How much of the free lookup allowance is used (both phones), for the lines and warnings.
    refreshUsage().then(() => { if (!sheetOpen()) render(true); });
  });
}

if (store.getSession()) start();
else runOnboarding(start);
