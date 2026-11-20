// Which way a property faces, using the phone's compass when it has one.

import { esc, openSheet, closeSheet } from './ui.js';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const dirOf = d => DIRS[Math.round((((d % 360) + 360) % 360) / 45) % 8];

export function compassSVG(deg) {
  return `<svg viewBox="0 0 120 120" role="img" aria-label="Facing ${dirOf(deg)}">
  <circle cx="60" cy="60" r="54" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2"/>
  ${DIRS.map((d, i) => { const a = i * 45 * Math.PI / 180, r = 44; return `<text x="${(60 + r * Math.sin(a)).toFixed(1)}" y="${(60 - r * Math.cos(a) + 4).toFixed(1)}" text-anchor="middle" font-size="${d.length > 1 ? 9 : 12}" font-weight="700" fill="${d === 'N' ? 'var(--red)' : 'var(--muted)'}" font-family="Inter,sans-serif">${d}</text>`; }).join('')}
  <g transform="rotate(${deg} 60 60)"><path d="M60 22 L67 62 L60 56 L53 62 Z" fill="var(--accent)"/><circle cx="60" cy="60" r="4" fill="var(--ink)"/></g></svg>`;
}

/** Opens the live compass; calls save(degrees) when you tap Save. */
export async function compassSheet(save) {
  let heading = null, got = false;
  const s = openSheet(`<h3>Use phone compass</h3>
    <p class="small muted">Stand at the living-room window and point the top of your phone straight out of it. Hold it flat for a moment.</p>
    <div style="display:grid;place-items:center" id="cLive">${compassSVG(0)}</div>
    <div class="big-dir" id="cText" style="text-align:center">Looking for the compass…</div>
    <div class="row-btns"><button class="btn primary" id="cSave" disabled>Save this direction</button><button class="btn" data-close>Cancel</button></div>`);
  s.querySelector('#cLive svg').style.cssText = 'width:180px;height:180px';

  const show = h => {
    heading = Math.round(h) % 360; got = true;
    s.querySelector('#cLive').innerHTML = compassSVG(heading);
    s.querySelector('#cLive svg').style.cssText = 'width:180px;height:180px';
    s.querySelector('#cText').innerHTML = `${dirOf(heading)} <span class="num muted" style="font-size:15px">${heading}°</span>`;
    s.querySelector('#cSave').disabled = false;
  };
  const onEvent = e => {
    if (e.webkitCompassHeading != null) return show(e.webkitCompassHeading);   // iPhone
    if (e.absolute && e.alpha != null) show((360 - e.alpha) % 360);           // Android: alpha from north
  };
  const stop = () => {
    window.removeEventListener('deviceorientationabsolute', onEvent);
    window.removeEventListener('deviceorientation', onEvent);
  };

  try {
    // iPhones ask permission first (it has to come from a tap, which this is).
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('denied');
    }
    window.addEventListener('deviceorientationabsolute', onEvent);
    window.addEventListener('deviceorientation', onEvent);
  } catch (e) {
    s.querySelector('#cText').innerHTML = '<span style="font-size:15px">Compass permission was turned down. Use the slider instead.</span>';
  }
  setTimeout(() => {
    if (!got && document.body.contains(s)) s.querySelector('#cText').innerHTML = `<span style="font-size:15px">${esc('This device has no compass. Use the slider instead, or try on your phone.')}</span>`;
  }, 2500);

  s.onclick = e => {
    if (e.target.closest('[data-close]')) { stop(); closeSheet(); }
    if (e.target.closest('#cSave') && heading != null) { stop(); closeSheet(); save(heading); }
  };
}
