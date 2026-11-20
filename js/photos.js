// Photos and floorplans, kept in a Supabase Storage bucket ("property-photos").
//
// Each photo is shrunk on the phone first: a 1600 px copy (about 200–300 KB)
// and a 400 px thumbnail (about 30 KB) that lists and galleries use, so
// downloads stay small. File names never change, so phones can cache them for
// good. The property document only holds a small record per photo:
//   photo:<id> = { kind: 'listing' | 'ours' | 'floorplan' | 'evidence', year, caption, w, h }
// and the files are <space>/<property>/<id>.jpg and <id>_t.jpg.

import * as store from './store.js';
import { CONFIG, apiBase } from './config.js';
import { setProp } from './props.js';

export const BUCKET = 'property-photos';
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const headers = extra => ({ apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, ...extra });

const base = (propId, photoId) => `${store.getSession().space}/${propId}/${photoId}`;
export const fullUrl = (propId, photoId) => `${apiBase()}/storage/v1/object/public/${BUCKET}/${base(propId, photoId)}.jpg`;
export const thumbUrl = (propId, photoId) => `${apiBase()}/storage/v1/object/public/${BUCKET}/${base(propId, photoId)}_t.jpg`;

/** Shrinks an image file to fit `max` px on its longest side, as a JPEG. */
export async function shrink(file, max, quality = 0.82) {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  const blob = await new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('Could not read that image'))), 'image/jpeg', quality));
  return { blob, w, h };
}
async function loadImage(file) {
  // createImageBitmap also turns phone photos the right way up.
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Could not read that image')); i.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

async function upload(path, blob) {
  const r = await fetch(`${apiBase()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '31536000' }),
    body: blob,
    // A weak signal at an inspection shouldn't leave it "Uploading…" forever.
    signal: AbortSignal.timeout ? AbortSignal.timeout(90000) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(/bucket not found/i.test(t) ? 'NO_BUCKET' : `Upload failed (${r.status})`);
  }
}

// ── Storage use ───────────────────────────────────────────────────────────
// Supabase's free plan holds 1 GB of files (Human Being and Human Doing don't
// use file storage, so it's all for photos). Every photo record keeps its
// size, so the app can add them up without asking the server.
export const LIMIT = 1024 ** 3;
export const WARN_AT = 0.8, FULL_AT = 0.95;
const OLD_GUESS = 250 * 1024;   // photos saved before sizes were recorded

/** { bytes, count, share (0–1), level: 'ok' | 'warn' | 'full' | 'over', byProperty: [{ id, bytes, count }] } */
export function storageUse() {
  let bytes = 0, count = 0;
  const per = new Map();
  for (const doc of store.docsLike('prop-')) {
    const pid = doc.slice(5);
    for (const [k, r] of Object.entries(store.merged(doc))) {
      if (!k.startsWith('photo:') || !r.v) continue;
      const b = r.v.bytes || OLD_GUESS;
      bytes += b; count++;
      const x = per.get(pid) || { id: pid, bytes: 0, count: 0 };
      x.bytes += b; x.count++;
      per.set(pid, x);
    }
  }
  const share = bytes / LIMIT;
  const level = share >= 1 ? 'over' : share >= FULL_AT ? 'full' : share >= WARN_AT ? 'warn' : 'ok';
  return { bytes, count, share, level, byProperty: [...per.values()].sort((a, b) => b.bytes - a.bytes) };
}
export const mb = b => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + ' GB' : Math.max(0.1, b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0) + ' MB');

/** Shrinks and uploads one image; returns its photo id and size (the record is not saved). */
export async function uploadImage(propId, file) {
  if (storageUse().level === 'over') throw new Error('FULL');
  const id = newId();
  const big = await shrink(file, 1600);
  const small = await shrink(file, 400, 0.75);
  await upload(base(propId, id) + '.jpg', big.blob);
  await upload(base(propId, id) + '_t.jpg', small.blob);
  return { id, w: big.w, h: big.h, bytes: big.blob.size + small.blob.size };
}

/** Adds photos to a property. onEach(done, total) reports progress. */
export async function addPhotos(propId, fileList, { kind = 'ours', year = '' } = {}, onEach = () => {}) {
  const fs = [...fileList];
  let done = 0;
  for (const f of fs) {
    const { id, w, h, bytes } = await uploadImage(propId, f);
    setProp(propId, 'photo:' + id, { kind, year: year || String(new Date().getFullYear()), caption: '', w, h, bytes });
    onEach(++done, fs.length);
  }
  return done;
}

/** Deletes every photo file a property has (used when the property is deleted). */
export async function deleteAllPhotos(p) {
  const ids = Object.entries(p.rec).filter(([k, r]) => k.startsWith('photo:') && r.v).map(([k]) => k.slice(6));
  if (!ids.length) return;
  try {
    await fetch(`${apiBase()}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: ids.flatMap(i => [base(p.id, i) + '.jpg', base(p.id, i) + '_t.jpg']) }),
    });
  } catch (e) { /* best effort */ }
}

/** Takes a photo off the property and deletes its files (best effort). */
export async function deletePhoto(propId, photoId) {
  setProp(propId, 'photo:' + photoId, null);
  try {
    await fetch(`${apiBase()}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [base(propId, photoId) + '.jpg', base(propId, photoId) + '_t.jpg'] }),
    });
  } catch (e) { /* the record is gone; a leftover file is harmless */ }
}

/** A property's photos, oldest listing photos first, then yours, then floorplans. */
export function photosOf(p) {
  const order = { listing: 0, ours: 1, floorplan: 2 };
  return Object.entries(p.rec)
    .filter(([k, r]) => k.startsWith('photo:') && r.v && r.v.kind !== 'evidence')
    .map(([k, r]) => ({ id: k.slice(6), ...r.v, by: r.by, t: r.t }))
    // ids start with the time they were added, so editing a caption doesn't reorder them
    .sort((a, b) => (order[a.kind] ?? 1) - (order[b.kind] ?? 1) || String(a.year).localeCompare(String(b.year)) || a.id.localeCompare(b.id));
}

export const uploadError = e => (e && e.message === 'NO_BUCKET'
  ? 'Photos aren’t set up in Supabase yet (the property-photos bucket is missing).'
  : e && e.message === 'FULL'
    ? 'Photo storage is full (1 GB). Delete some photos first: Us → Photo storage shows which properties use the most.'
    : e && e.name === 'TimeoutError'
      ? 'The upload took too long (weak signal?). Try again, or add them later on Wi-Fi.'
      : 'Couldn’t upload the photo. Check your connection and try again.');

/** A warning card for the Lists screen and the Us sheet, or '' when there's plenty of room. */
export function storageBanner(u = storageUse()) {
  if (u.level === 'ok') return '';
  const pct = Math.round(u.share * 100);
  const tone = u.level === 'warn' ? 'amber' : 'red';
  const head = u.level === 'warn' ? `Photo storage is ${pct}% full` : u.level === 'full' ? `Photo storage is almost full (${pct}%)` : 'Photo storage is full';
  return `<div class="flag ${tone}" role="status"><span class="ic">!</span><span class="t"><span><b>${head}</b></span>
    <small>${mb(u.bytes)} of 1 GB used by ${u.count} photos.${u.level === 'over' ? ' New photos can’t be added until you delete some.' : ' Delete photos you no longer need, for example from Sold properties.'}</small>
    <button class="btn sm" data-storage style="align-self:flex-start;margin-top:4px">See what’s using it</button></span></div>`;
}
