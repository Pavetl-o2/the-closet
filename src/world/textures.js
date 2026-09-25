// Texturas procedurales generadas en canvas (sin assets externos).
// Deterministas: reciben el RNG con semilla de la partida.
//
// Estética PS1: resoluciones pequeñas (128 px para superficies grandes,
// 64 px para props), sin filtrado bilineal ni anisotrópico, y grano por
// píxel para que el texel se lea como texel. El dibujo se hace en
// coordenadas de "diseño" fijas y se escala al tamaño real del canvas, así
// la composición no depende de la resolución final.
//
// Paleta tomada de la referencia: cemento y yeso grises, sucios, con
// humedad que escurre y una franja de mugre en la base de los muros.

import * as THREE from 'three';

function makeCanvas(size, design = size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.scale(size / design, size / design);
  return [c, ctx];
}

function pixelFilters(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;              // el texel se ve como texel
  t.minFilter = THREE.NearestMipmapNearestFilter; // a lo lejos, sin centelleo
  t.anisotropy = 1;
  return t;
}

function finish(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return pixelFilters(t);
}

// Para calcomanías (charcos, manchas): sin repetición, con alpha
function finishDecal(c) {
  return pixelFilters(new THREE.CanvasTexture(c));
}

// Ruido por píxel real (no por coordenada de diseño): es lo que da el grano
// de la referencia. Solo toca píxeles con algo de opacidad.
function pixelNoise(c, rand, amount) {
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rand() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  ctx.restore();
}

// Ruido de puntitos grises (en coordenadas de diseño)
function speckle(ctx, size, rand, count, cMin, cMax, aMin, aMax, rMax = 3) {
  for (let i = 0; i < count; i++) {
    const g = (cMin + rand() * (cMax - cMin)) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},${(aMin + rand() * (aMax - aMin)).toFixed(3)})`;
    const r = 1 + rand() * rMax;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

// Mancha blanda circular
function blob(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Grieta: polilínea fina que avanza en una dirección general
function crack(ctx, rand, x, y, steps, stepLen, dirY, rgba) {
  ctx.strokeStyle = rgba;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let s = 0; s < steps; s++) {
    x += (rand() - 0.5) * stepLen;
    y += dirY ? rand() * stepLen : (rand() - 0.5) * stepLen;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Yeso/cemento viejo de los muros, como en la referencia: gris sucio, con
// parches de enlucido, escurrimientos de humedad desde arriba y una franja
// de mugre en la base.
export function makeWallTexture(rand) {
  const S = 256;
  const [c, ctx] = makeCanvas(128, S);
  ctx.fillStyle = '#5a5751';
  ctx.fillRect(0, 0, S, S);

  // enlucido desigual: parches más claros y más oscuros
  for (let i = 0; i < 26; i++) {
    const light = rand() < 0.45;
    blob(ctx, rand() * S, rand() * S, 18 + rand() * 70,
      light ? '128,125,114' : '22,21,19', 0.07 + rand() * 0.13);
  }

  // desconchones: el yeso caído deja ver el cemento de debajo
  for (let i = 0; i < 7; i++) {
    const x = rand() * S, y = rand() * S * 0.8, w = 8 + rand() * 26, h = 6 + rand() * 18;
    ctx.fillStyle = `rgba(40,38,34,${(0.35 + rand() * 0.3).toFixed(2)})`;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(150,146,134,0.18)'; // borde del yeso roto
    ctx.fillRect(x, y, w, 1.5);
  }

  // humedad que escurre desde el techo
  for (let i = 0; i < 16; i++) {
    const x = rand() * S, w = 2 + rand() * 9, h = 50 + rand() * 170;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(18,17,14,${(0.25 + rand() * 0.25).toFixed(2)})`);
    g.addColorStop(1, 'rgba(18,17,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, h);
  }

  for (let i = 0; i < 5; i++) {
    crack(ctx, rand, rand() * S, rand() * S * 0.6, 7, 22, true, 'rgba(16,15,12,0.6)');
  }

  // franja de mugre en la base, con borde irregular de humedad
  const band = ctx.createLinearGradient(0, S * 0.62, 0, S);
  band.addColorStop(0, 'rgba(10,9,7,0)');
  band.addColorStop(0.35, 'rgba(10,9,7,0.35)');
  band.addColorStop(1, 'rgba(10,9,7,0.72)');
  ctx.fillStyle = band;
  ctx.fillRect(0, S * 0.62, S, S * 0.38);
  for (let i = 0; i < 18; i++) {
    blob(ctx, rand() * S, S * (0.66 + rand() * 0.08), 8 + rand() * 20, '12,11,9', 0.25);
  }

  pixelNoise(c, rand, 34);
  return finish(c);
}

// Cemento del suelo: oscuro, con manchas de aceite y agua, polvo y grietas
export function makeFloorTexture(rand) {
  const S = 256;
  const [c, ctx] = makeCanvas(128, S);
  ctx.fillStyle = '#3d3b37';
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 18; i++) {
    const light = rand() < 0.35;
    blob(ctx, rand() * S, rand() * S, 16 + rand() * 60,
      light ? '104,100,92' : '14,13,11', 0.08 + rand() * 0.16);
  }
  for (let i = 0; i < 6; i++) {
    crack(ctx, rand, rand() * S, rand() * S, 8, 30, false, 'rgba(12,11,9,0.55)');
  }
  speckle(ctx, S, rand, 500, 20, 110, 0.06, 0.2, 2);

  pixelNoise(c, rand, 36);
  return finish(c);
}

// Techo de losa: gris, con cercos de goteras
export function makeCeilingTexture(rand) {
  const S = 256;
  const [c, ctx] = makeCanvas(128, S);
  ctx.fillStyle = '#4c4a45';
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 16; i++) {
    blob(ctx, rand() * S, rand() * S, 20 + rand() * 60,
      rand() < 0.5 ? '112,108,98' : '20,19,16', 0.08 + rand() * 0.12);
  }
  // cercos de agua: anillos pardos de las goteras
  for (let i = 0; i < 6; i++) {
    const x = rand() * S, y = rand() * S, r = 10 + rand() * 30;
    ctx.strokeStyle = `rgba(52,42,28,${(0.25 + rand() * 0.25).toFixed(2)})`;
    ctx.lineWidth = 1.5 + rand() * 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    blob(ctx, x, y, r, '40,32,22', 0.15);
  }

  pixelNoise(c, rand, 30);
  return finish(c);
}

// Óxido para tuberías, barriles y puerta
export function makeRustTexture(rand) {
  const S = 256;
  const [c, ctx] = makeCanvas(64, S);
  ctx.fillStyle = '#46301f';
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 1400; i++) {
    const r = (48 + rand() * 70) | 0;
    const g = (28 + rand() * 32) | 0;
    const b = (14 + rand() * 18) | 0;
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.08 + rand() * 0.22).toFixed(3)})`;
    const s = 2 + rand() * 6;
    ctx.fillRect(rand() * S, rand() * S, s, s);
  }
  ctx.fillStyle = 'rgba(20,12,8,0.22)';
  for (let y = 0; y < S; y += 48) ctx.fillRect(0, y, S, 8);

  pixelNoise(c, rand, 22);
  return finish(c);
}

// Tubería: metal gris ennegrecido con chorretones de óxido y juntas.
// En la textura, V recorre la tubería a lo largo (se repite ~cada 1.25 m).
export function makePipeTexture(rand) {
  const S = 256;
  const [c, ctx] = makeCanvas(64, S);
  ctx.fillStyle = '#4b4a47';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, rand, 900, 40, 100, 0.08, 0.25, 4);
  for (let i = 0; i < 7; i++) {
    blob(ctx, rand() * S, rand() * S, 18 + rand() * 40, '92,58,34', 0.3 + rand() * 0.25);
  }
  // escurrimientos: el óxido baja por el costado inferior
  for (let i = 0; i < 10; i++) {
    const x = 150 + rand() * 90;
    ctx.fillStyle = `rgba(80,48,28,${(0.15 + rand() * 0.25).toFixed(2)})`;
    ctx.fillRect(x, rand() * S, 3 + rand() * 5, 20 + rand() * 60);
  }
  ctx.fillStyle = 'rgba(18,17,16,0.55)'; // junta entre tramos
  ctx.fillRect(0, 118, S, 10);
  pixelNoise(c, rand, 18);
  return finish(c);
}

// Madera vieja: tablones con veta, para cajas y tarimas
export function makeWoodTexture(rand) {
  const S = 256;
  const [c, ctx] = makeCanvas(64, S);
  ctx.fillStyle = '#41321f';
  ctx.fillRect(0, 0, S, S);

  for (let x = 0; x < S; x += 42) {
    const rr = (58 + rand() * 18) | 0;
    const gg = (44 + rand() * 12) | 0;
    const bb = (28 + rand() * 8) | 0;
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    ctx.fillRect(x, 0, 40, S);
    for (let i = 0; i < 10; i++) { // veta
      ctx.strokeStyle = `rgba(28,18,9,${(0.2 + rand() * 0.3).toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const yy = rand() * S;
      ctx.moveTo(x, yy);
      for (let s = 1; s <= 4; s++) ctx.lineTo(x + s * 10, yy + (rand() - 0.5) * 12);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; // ranura entre tablones
    ctx.fillRect(x + 40, 0, 4, S);
  }

  pixelNoise(c, rand, 20);
  return finish(c);
}

// Contorno irregular cerrado (curvas cuadráticas entre puntos con radio al azar)
function wobbly(ctx, rand, cx, cy, r, n = 11, jitter = 0.45) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - jitter / 2 + rand() * jitter);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.beginPath();
  const mid = (i) => {
    const [x1, y1] = pts[i % n];
    const [x2, y2] = pts[(i + 1) % n];
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  };
  ctx.moveTo(...mid(0));
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(pts[i % n][0], pts[i % n][1], ...mid(i));
  ctx.closePath();
}

// Charco de agua: varias manchas fusionadas en un contorno irregular, casi
// negro, rodeado de un halo de cemento mojado. Sin filo claro: con el borde
// resaltado parecía una tapa de registro. El brillo lo pone el material.
export function makePuddleTexture(rand) {
  const S = 256;
  const [c, ctx] = makeCanvas(64, S);
  ctx.clearRect(0, 0, S, S);

  for (let i = 0; i < 6; i++) {
    blob(ctx, 128 + (rand() - 0.5) * 60, 128 + (rand() - 0.5) * 60, 58 + rand() * 36, '18,17,15', 0.3);
  }
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * 44;
    wobbly(ctx, rand, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 26 + rand() * 30);
    ctx.fillStyle = 'rgba(13,15,17,0.93)';
    ctx.fill();
  }
  // reflejo tenue del techo en el centro
  blob(ctx, 128 + (rand() - 0.5) * 30, 128 + (rand() - 0.5) * 30, 34, '60,64,66', 0.35);

  pixelNoise(c, rand, 8);
  return finishDecal(c);
}

// Mancha para el piso. blood=true → sangre seca; false → mugre/aceite.
export function makeStainTexture(rand, blood) {
  const S = 256;
  const [c, ctx] = makeCanvas(64, S);
  ctx.clearRect(0, 0, S, S);
  const col = blood ? [58, 14, 10] : [16, 15, 12];

  for (let i = 0; i < 7; i++) {
    const x = 96 + rand() * 64, y = 96 + rand() * 64, r = 26 + rand() * 52;
    const a = blood ? 0.5 + rand() * 0.3 : 0.35 + rand() * 0.25;
    blob(ctx, x, y, r, col.join(','), a);
  }
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const d = 40 + rand() * 80;
    ctx.fillStyle = `rgba(${col.join(',')},${(0.3 + rand() * 0.45).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3 + rand() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (blood) { // arrastre: algo fue llevado de aquí
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(rand() * Math.PI * 2);
    const g = ctx.createLinearGradient(0, 0, 110, 0);
    g.addColorStop(0, 'rgba(58,14,10,0.45)');
    g.addColorStop(1, 'rgba(58,14,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, -14, 110, 28);
    ctx.restore();
  }
  return finishDecal(c);
}
