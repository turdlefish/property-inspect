// The sea behind the app: jellyfish by day, starfish by night (the picture comes from the
// theme's --deco), scattered at different sizes, angles and depths. A new arrangement each
// time the app opens; they drift slowly unless the phone asks for reduced motion.

export function fillSea(shell, count = 11) {
  if (!shell || shell.querySelector('.sea')) return;
  const sea = document.createElement('div');
  sea.className = 'sea';
  sea.setAttribute('aria-hidden', 'true');
  const rnd = (a, b) => a + Math.random() * (b - a);
  // spread them out: one per band down the screen, at a random spot across it
  for (let i = 0; i < count; i++) {
    const el = document.createElement('i');
    const size = Math.round(rnd(34, 118));
    const small = size < 60;
    el.style.cssText = [
      `width:${size}px`, `height:${Math.round(size * 1.3)}px`,
      `left:${rnd(-6, 92).toFixed(1)}%`, `top:${((i + rnd(0.1, 0.9)) / count * 100).toFixed(1)}%`,
      `opacity:${(small ? rnd(0.18, 0.32) : rnd(0.26, 0.5)).toFixed(2)}`,
      `--rot:${Math.round(rnd(-28, 28))}deg`, `--dur:${rnd(9, 18).toFixed(1)}s`,
      `animation-delay:-${rnd(0, 10).toFixed(1)}s`,
    ].join(';');
    sea.appendChild(el);
  }
  shell.prepend(sea);
}
