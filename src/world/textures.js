// Texturas procedurales generadas en canvas (sin assets externos).
// Deterministas: reciben el RNG con semilla de la partida.

import * as THREE from 'three';

function makeCanvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Para calcomanías (charcos, manchas): sin repetición, con alpha
function finishDecal(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Ruido de puntitos grises
function speckle(ctx, size, rand, count, cMin, cMax, aMin, aMax, rMax = 3) {
  for (let i = 0; i < count; i++) {
    const g = (cMin + rand() * (cMax - cMin)) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},${(aMin + rand() * (aMax - aMin)).toFixed(3)})`;
    const r = 1 + rand() * rMax;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

// Ladrillo viejo: hiladas alternadas, juntas oscuras, desconchones,
// humedad que escurre y moho en la base. Un tile de muro = 3×3.2 m,
// así que cada ladrillo queda de ~37×16 cm.
export function makeWallTexture(rand) {
  const [c, ctx] = makeCanvas();
  ctx.fillStyle = '#211e19'; // mortero
  ctx.fillRect(0, 0, 512, 512);

  const rows = 20;
  const bh = 512 / rows;
  const bw = 64; // 8 ladrillos por hilada
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (bw / 2);
    for (let i = -1; i < 9; i++) {
      const bx = i * bw + off;
      const by = r * bh;
      // tono base del ladrillo: pardo grisáceo, oscuro y desaturado
      const base = 38 + rand() * 20;
      const rr = (base + 8 + rand() * 8) | 0;
      const gg = (base + 3 + rand() * 4) | 0;
      const bb = (base + rand() * 3) | 0;
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      // sombra inferior y brillo superior → relieve
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fillRect(bx + 2, by + bh - 6, bw - 4, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(bx + 2, by + 2, bw - 4, 2);
      // desconchones y ladrillos rotos
      if (rand() < 0.3) {
        ctx.fillStyle = `rgba(14,12,9,${(0.25 + rand() * 0.35).toFixed(2)})`;
        ctx.fillRect(bx + 3 + rand() * (bw - 16), by + 3 + rand() * (bh - 10), 5 + rand() * 10, 3 + rand() * 6);
      }
      if (rand() < 0.05) { // ladrillo faltante: hueco oscuro
        ctx.fillStyle = '#0c0a08';
        ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      }
    }
  }

  // pátina general: manchones grandes de suciedad que rompen la retícula
  for (let i = 0; i < 12; i++) {
    const x = rand() * 512, y = rand() * 512, r = 60 + rand() * 160;
    const g = ctx.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, `rgba(10,9,7,${(0.14 + rand() * 0.18).toFixed(2)})`);
    g.addColorStop(1, 'rgba(10,9,7,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  speckle(ctx, 512, rand, 2600, 14, 60, 0.05, 0.16, 3);

  // manchas de humedad que escurren desde arriba
  for (let i = 0; i < 10; i++) {
    const x = rand() * 512, y = rand() * 160;
    const w = 12 + rand() * 46, h = 140 + rand() * 320;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(12,11,8,0.4)');
    g.addColorStop(1, 'rgba(12,11,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  // moho verdoso acumulado hacia la base del muro
  for (let i = 0; i < 7; i++) {
    const x = rand() * 512, y = 380 + rand() * 120, r = 26 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(26,32,20,0.35)');
    g.addColorStop(1, 'rgba(26,32,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // zócalo de mugre: la base del muro siempre más sucia
  const gb = ctx.createLinearGradient(0, 340, 0, 512);
  gb.addColorStop(0, 'rgba(8,7,5,0)');
  gb.addColorStop(1, 'rgba(8,7,5,0.45)');
  ctx.fillStyle = gb;
  ctx.fillRect(0, 340, 512, 172);
  return finish(c);
}

// Concreto sucio con grietas, juntas y manchas
export function makeFloorTexture(rand) {
  const [c, ctx] = makeCanvas();
  ctx.fillStyle = '#2b2926';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, rand, 3600, 20, 75, 0.05, 0.2, 3);

  for (let i = 0; i < 8; i++) {
    const x = rand() * 512, y = rand() * 512, r = 20 + rand() * 70;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(12,11,9,0.4)');
    g.addColorStop(1, 'rgba(12,11,9,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // grietas: polilíneas oscuras que se ramifican
  ctx.strokeStyle = 'rgba(10,9,7,0.55)';
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = 1 + rand();
    ctx.beginPath();
    let x = rand() * 512, y = rand() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (rand() - 0.5) * 70;
      y += (rand() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // juntas de dilatación tenues
  ctx.strokeStyle = 'rgba(8,7,6,0.28)';
  ctx.lineWidth = 3;
  for (const p of [128, 256, 384]) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
  }
  return finish(c);
}

// Plafón viejo con líneas tenues de paneles
export function makeCeilingTexture(rand) {
  const [c, ctx] = makeCanvas();
  ctx.fillStyle = '#33302b';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, rand, 2200, 25, 70, 0.04, 0.14, 3);

  ctx.strokeStyle = 'rgba(10,9,8,0.12)';
  ctx.lineWidth = 2;
  for (let p = 64; p < 512; p += 64) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
  }
  return finish(c);
}

// Óxido para tuberías y puerta
export function makeRustTexture(rand) {
  const [c, ctx] = makeCanvas(256);
  ctx.fillStyle = '#46301f';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2200; i++) {
    const r = (48 + rand() * 70) | 0;
    const g = (28 + rand() * 32) | 0;
    const b = (14 + rand() * 18) | 0;
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.06 + rand() * 0.2).toFixed(3)})`;
    const s = 1 + rand() * 3;
    ctx.fillRect(rand() * 256, rand() * 256, s, s);
  }

  ctx.fillStyle = 'rgba(20,12,8,0.18)';
  for (let y = 0; y < 256; y += 48) ctx.fillRect(0, y, 256, 6);
  return finish(c);
}

// Madera vieja: tablones con veta, para cajas y tarimas
export function makeWoodTexture(rand) {
  const [c, ctx] = makeCanvas(256);
  ctx.fillStyle = '#41321f';
  ctx.fillRect(0, 0, 256, 256);

  for (let x = 0; x < 256; x += 42) {
    const rr = (46 + rand() * 14) | 0;
    const gg = (36 + rand() * 9) | 0;
    const bb = (25 + rand() * 6) | 0;
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    ctx.fillRect(x, 0, 40, 256);
    for (let i = 0; i < 14; i++) { // veta
      ctx.strokeStyle = `rgba(28,18,9,${(0.15 + rand() * 0.25).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let yy = rand() * 256;
      ctx.moveTo(x, yy);
      for (let s = 1; s <= 4; s++) ctx.lineTo(x + s * 10, yy + (rand() - 0.5) * 10);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; // ranura entre tablones
    ctx.fillRect(x + 40, 0, 2, 256);
  }
  speckle(ctx, 256, rand, 500, 15, 50, 0.05, 0.18, 2);
  return finish(c);
}

// Charco de agua: mancha irregular con borde suave, centro azulado que
// refleja algo de luz y un filo húmedo más claro. Leído como líquido,
// no como agujero.
export function makePuddleTexture(rand) {
  const [c, ctx] = makeCanvas(256);
  ctx.clearRect(0, 0, 256, 256);
  const cx = 128, cy = 128;

  // contorno irregular suavizado con curvas por puntos medios
  const n = 14;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 68 + rand() * 42;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(x1, y1, mx, my);
  }
  const [xl, yl] = pts[0];
  ctx.quadraticCurveTo(xl, yl, (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  ctx.closePath();

  const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 112);
  g.addColorStop(0, 'rgba(40,52,66,0.85)');    // centro: refleja el "cielo" frío
  g.addColorStop(0.6, 'rgba(26,33,42,0.82)');
  g.addColorStop(0.92, 'rgba(16,20,26,0.7)');
  g.addColorStop(1, 'rgba(14,18,24,0)');
  ctx.fillStyle = g;
  ctx.fill();

  // filo húmedo: línea clara donde el agua moja el concreto
  ctx.strokeStyle = 'rgba(150,170,190,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ondas tenues de las gotas que siguen cayendo
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(cx + (rand() - 0.5) * 50, cy + (rand() - 0.5) * 50, 10 + rand() * 28,
      rand() * Math.PI * 2, rand() * Math.PI * 2 + 1.8);
    ctx.strokeStyle = 'rgba(170,190,210,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  return finishDecal(c);
}

// Mancha para el piso. blood=true → sangre seca; false → mugre/aceite.
export function makeStainTexture(rand, blood) {
  const [c, ctx] = makeCanvas(256);
  ctx.clearRect(0, 0, 256, 256);
  const col = blood ? [58, 14, 10] : [16, 15, 12];

  // núcleo: varios blobs superpuestos
  for (let i = 0; i < 7; i++) {
    const x = 96 + rand() * 64, y = 96 + rand() * 64, r = 26 + rand() * 52;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const a = blood ? 0.5 + rand() * 0.3 : 0.35 + rand() * 0.25;
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(2)})`);
    g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // salpicaduras alrededor
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const d = 40 + rand() * 80;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.25 + rand() * 0.45).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + rand() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (blood) { // arrastre: algo fue llevado de aquí
    const a = rand() * Math.PI * 2;
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 110, 0);
    g.addColorStop(0, 'rgba(58,14,10,0.4)');
    g.addColorStop(1, 'rgba(58,14,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, -14, 110, 28);
    ctx.restore();
  }
  return finishDecal(c);
}
