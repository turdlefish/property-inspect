// Small shared UI helpers: escaping, money, the bottom sheet and the toast.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-AU');
export const HOUSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 11.5 12 4.5l8.5 7"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>';

// A stable colour for a property's placeholder picture, from its id.
export function hueOf(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const sheetEl = () => document.getElementById('sheet');
export function openSheet(html) {
  const s = sheetEl();
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  s.hidden = false;
  const f = s.querySelector('input,textarea,select,button');
  if (f) f.focus();
  return s.firstElementChild;
}
export function closeSheet() { const s = sheetEl(); s.hidden = true; s.innerHTML = ''; }
export const sheetOpen = () => !sheetEl().hidden;

let toastT;
export function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 2800);
}

export async function copyText(text) {
  // In the Android app, the phone's own clipboard (the web one isn't always allowed there).
  if (window.PropNative && window.PropNative.copy) { try { if (window.PropNative.copy(String(text))) return true; } catch (e) {} }
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}
