// HUD (GDD): solo batería y una pequeña intensidad de luz. Nada más.
// También administra los overlays de inicio / pausa / muerte / victoria.
//
// Estética PS1: los títulos se dibujan a baja resolución en un canvas, con
// los bordes de las letras cortados a píxel duro, y se escalan sin suavizar.
// La batería son celdas, como la vida en un juego de la época.

const CELLS = 5;

// Texto pixelado: se rasteriza pequeño (≈ lo que mediría en una pantalla de
// 240 líneas) y se umbraliza el alfa para que no quede ni un píxel
// antialiasado. La sombra va en una pasada aparte, desplazada un píxel.
function pixelText(text, { px = 22, color = '#c6c9ba', shadow = '#050505', spacing = 0.22 } = {}) {
  const font = `${px}px Georgia, 'Times New Roman', serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const chars = [...text];
  const gap = px * spacing;
  const widths = chars.map((ch) => probe.measureText(ch).width);
  const w = Math.ceil(widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1) + 6);
  const h = Math.ceil(px * 1.35);

  const layer = (fill, ox, oy) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.font = font;
    ctx.fillStyle = fill;
    let x = 2 + ox;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, Math.round(x), Math.round(px * 1.02 + oy));
      x += widths[i] + gap;
    });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 96 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    return c;
  };

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(layer(shadow, 1, 1), 0, 0);
  ctx.drawImage(layer(color, 0, 0), 0, 0);
  return out;
}

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.dot = this.el('light-dot');
    this.screens = {
      start: this.el('screen-start'),
      pause: this.el('screen-pause'),
      dead: this.el('screen-dead'),
      win: this.el('screen-win'),
    };

    // Títulos: el texto queda en el DOM para lectores de pantalla; lo que se
    // ve es el canvas.
    for (const h of document.querySelectorAll('.pixel-title')) {
      const text = h.dataset.text || h.textContent.trim();
      h.setAttribute('aria-label', text);
      h.textContent = '';
      const canvas = pixelText(text, { color: h.dataset.color || '#c6c9ba', px: +(h.dataset.px || 22) });
      canvas.setAttribute('aria-hidden', 'true');
      h.appendChild(canvas);
    }

    const battery = this.el('battery');
    battery.textContent = '';
    this.cells = Array.from({ length: CELLS }, () => {
      const c = document.createElement('div');
      c.className = 'cell';
      battery.appendChild(c);
      return c;
    });
    this.lastBattery = -1;
    this.setBattery(1, 0); // pila llena desde la pantalla de inicio
  }

  setBattery(battery, lightLevel) {
    // Cada celda es un 20 %. Por debajo del 25 % se oxidan; en la última
    // parpadea, igual que la linterna.
    const q = Math.round(battery * 100);
    if (q !== this.lastBattery) {
      this.lastBattery = q;
      const lit = Math.ceil(battery * CELLS - 1e-6);
      this.cells.forEach((c, i) => {
        c.classList.toggle('off', i >= lit);
        c.classList.toggle('low', battery <= 0.25);
        c.classList.toggle('blink', battery <= 0.1 && i === lit - 1);
      });
    }
    this.dot.style.opacity = (0.12 + 0.88 * Math.min(1, lightLevel)).toFixed(2);
  }

  show(name) {
    for (const k in this.screens) {
      this.screens[k].classList.toggle('hidden', k !== name);
    }
  }

  hideAll() {
    for (const k in this.screens) this.screens[k].classList.add('hidden');
  }

  reveal(id) {
    this.el(id).classList.remove('hidden');
  }

  setText(id, text) {
    this.el(id).textContent = text;
  }
}
