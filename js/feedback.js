// App feedback (Nov 2026), like Human Being / Human Doing: bugs, ideas and wishes
// for Property Inspect that either of you can add, and tick off once sorted. On the Us tab.
//
// One shared document "feedback"; each note is its own field, so the usual
// newest-wins merge works per note:
//   fb:<id> = { text, at, author, edited?, done, doneT }   (null = deleted)
// Only the person who wrote a note can change its words or delete it; either of you can tick it.

import * as store from './store.js';
import { nameOf } from './people.js';
import { esc, toast, copyText, openSheet, closeSheet } from './ui.js';

const APP = 'Property Inspect';
const DOC = 'feedback';
const MAX = 1000;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const day = ms => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

let editing = null;              // id of my note being edited
const drafts = { add: '' };      // text being typed, kept when the page redraws
let showDone = false;

function notes() {
  const me = store.me();
  return Object.entries(store.merged(DOC))
    .filter(([k, r]) => k.startsWith('fb:') && r.v && r.v.text)
    .map(([k, r]) => ({ id: k.slice(3), ...r.v, mine: r.v.author === me }));
}
const put = (id, v) => store.setField(DOC, 'fb:' + id, v);

function itemHTML(n) {
  const who = esc(nameOf(n.author));
  const meta = n.done ? `${who} · done ${day(n.doneT || n.at)}` : `${who} · ${day(n.at)}${n.edited ? ' · edited' : ''}`;
  if (editing === n.id && n.mine) {
    return `<li class="fb-item editing" data-fb="${esc(n.id)}">
      <textarea class="input fb-edit" rows="3" maxlength="${MAX}" aria-label="Edit note">${esc(drafts[n.id] ?? n.text)}</textarea>
      <div class="row-btns" style="justify-content:flex-end"><button type="button" class="btn sm" data-fb-act="cancel">Cancel</button><button type="button" class="btn sm primary" data-fb-act="save">Save</button></div></li>`;
  }
  return `<li class="fb-item${n.done ? ' done' : ''}" data-fb="${esc(n.id)}">
    <button type="button" class="fb-tick" data-fb-act="${n.done ? 'reopen' : 'done'}" aria-pressed="${!!n.done}" aria-label="${n.done ? 'Done, tap to reopen' : 'Mark as done'}">${n.done ? '✓' : ''}</button>
    <div class="fb-body"><p class="fb-text">${esc(n.text)}</p><span class="fb-meta">${meta}</span></div>
    ${n.mine && !n.done ? '<button type="button" class="edit" data-fb-act="edit" aria-label="Edit">✎</button>' : ''}
    ${n.mine ? '<button type="button" class="edit" data-fb-act="delete" aria-label="Delete">✕</button>' : ''}</li>`;
}

/** The card's HTML (the Us page puts it in a <section id="fbCard"> and calls mountFeedback). */
export function feedbackHTML() {
  const all = notes();
  const open = all.filter(n => !n.done).sort((a, b) => b.at - a.at);
  const done = all.filter(n => n.done).sort((a, b) => (b.doneT || 0) - (a.doneT || 0));
  return `<span class="tape" aria-hidden="true"></span>
    <div class="q">💭 App feedback</div>
    <p class="small muted" style="margin:0">Bugs, ideas and wishes for ${APP}. Either of you can add them, and tick them off once they’re sorted.</p>
    <form class="fb-add"><textarea class="input" name="fb" rows="2" maxlength="${MAX}" placeholder="e.g. Photos take ages to upload at inspections" aria-label="New feedback">${esc(drafts.add)}</textarea><button class="btn sm primary">Add</button></form>
    ${open.length ? `<ul class="fb-list">${open.map(itemHTML).join('')}</ul>` : '<p class="small muted" style="margin:0">Nothing open, lovely ✨</p>'}
    ${open.length ? '<div class="row-btns"><button type="button" class="btn sm" data-fb-act="copy">📋 Copy open feedback</button></div>' : ''}
    ${done.length ? `<details class="fb-done"${showDone ? ' open' : ''}><summary class="small">Done (${done.length})</summary><ul class="fb-list">${done.map(itemHTML).join('')}</ul></details>` : ''}`;
}

function openText() {
  const open = notes().filter(n => !n.done).sort((a, b) => a.at - b.at);
  return `${APP} feedback (${open.length} open, ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}):\n`
    + open.map(n => `• ${nameOf(n.author)}: ${n.text.replace(/\s*\n\s*/g, ' / ')}`).join('\n');
}

function confirmDelete(text) {
  return new Promise(ok => {
    const s = openSheet(`<h3>Delete this note?</h3><p class="muted">${esc(text.length > 80 ? text.slice(0, 80) + '…' : text)}</p>
      <div class="row-btns"><button class="btn danger" data-yes>Delete</button><button class="btn" data-close>Cancel</button></div>`);
    s.onclick = e => {
      if (e.target.closest('[data-yes]')) { closeSheet(); ok(true); }
      else if (e.target.closest('[data-close]')) { closeSheet(); ok(false); }
    };
  });
}

/** Wires up the card in `section`; `redraw` redraws it (after a change). */
export function mountFeedback(section) {
  const redraw = () => { section.innerHTML = feedbackHTML(); };
  section.addEventListener('input', e => {
    if (e.target.name === 'fb') drafts.add = e.target.value;
    else if (e.target.classList.contains('fb-edit') && editing) drafts[editing] = e.target.value;
  });
  section.addEventListener('toggle', e => { if (e.target.classList?.contains('fb-done')) showDone = e.target.open; }, true);
  section.addEventListener('submit', e => {
    if (!e.target.closest('.fb-add')) return;
    e.preventDefault();
    const ta = e.target.querySelector('textarea');
    const text = ta.value.trim();
    if (!text) return ta.focus();
    const now = Date.now();
    put(newId(), { text: text.slice(0, MAX), at: now, author: store.me(), done: false, doneT: 0 });
    drafts.add = '';
    toast('Feedback added 💭');
    redraw();
  });
  section.addEventListener('click', async e => {
    const b = e.target.closest('[data-fb-act]');
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.fbAct;
    const id = b.closest('[data-fb]')?.dataset.fb;
    const n = id ? notes().find(x => x.id === id) : null;
    const { mine, ...rec } = n || {};
    delete rec.id;
    if (act === 'done' || act === 'reopen') {
      if (!n) return;
      put(id, { ...rec, done: act === 'done', doneT: Date.now() });
      if (act === 'done') toast('Ticked off ✨');
      redraw();
    } else if (act === 'edit') {
      editing = id; redraw();
      const ta = section.querySelector('.fb-edit');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    } else if (act === 'cancel') {
      delete drafts[editing]; editing = null; redraw();
    } else if (act === 'save') {
      const text = (section.querySelector('.fb-edit')?.value || '').trim();
      if (!text) return toast('Write something first, or delete the note');
      put(id, { ...rec, text: text.slice(0, MAX), edited: true });
      delete drafts[id]; editing = null; redraw();
    } else if (act === 'delete') {
      if (!n || !(await confirmDelete(n.text))) return;
      put(id, null);
      if (editing === id) editing = null;
      redraw();
    } else if (act === 'copy') {
      toast((await copyText(openText())) ? 'Open feedback copied 📋' : 'Couldn’t copy, sorry');
    }
  });
  redraw();
}
