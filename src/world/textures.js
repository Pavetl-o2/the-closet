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

// Ruido de puntitos grises
function speckle(ctx, size, rand, count, cMin, cMax, aMin, aMax, rMax = 3) {
  for (let i = 0; i < count; i++) {
    const g = (cMin + rand() * (cMax - cMin)) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},${(aMin + rand() * (aMax - aMin)).toFixed(3)})`;
    const r = 1 + rand() * rMax;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

// Yeso viejo: manchas de humedad que escurren + grietas
export function makeWallTexture(rand) {
  const [c, ctx] = makeCanvas();
  ctx.fillStyle = '#3d3a34';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, rand, 2600, 30, 90, 0.04, 0.16, 4);

  for (let i = 0; i < 9; i++) {
    const x = rand() * 512, y = rand() * 200;
    const w = 14 + rand() * 50, h = 120 + rand() * 300;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(18,16,12,0.35)');
    g.addColorStop(1, 'rgba(18,16,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  ctx.strokeStyle = 'rgba(15,14,11,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = rand() * 512, y = rand() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rand() - 0.5) * 60;
      y += rand() * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

// Concreto sucio con manchas circulares
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
  ctx.fillStyle = '#5a3a26';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2200; i++) {
    const r = (60 + rand() * 90) | 0;
    const g = (32 + rand() * 40) | 0;
    const b = (16 + rand() * 22) | 0;
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.06 + rand() * 0.2).toFixed(3)})`;
    const s = 1 + rand() * 3;
    ctx.fillRect(rand() * 256, rand() * 256, s, s);
  }

  ctx.fillStyle = 'rgba(20,12,8,0.18)';
  for (let y = 0; y < 256; y += 48) ctx.fillRect(0, y, 256, 6);
  return finish(c);
}
