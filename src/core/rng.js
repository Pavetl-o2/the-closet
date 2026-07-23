// RNG determinista con semilla. Misma semilla → mismo laberinto,
// mismas baterías, mismo punto de aparición del monstruo.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

// ?seed=123 en la URL fija la partida; sin parámetro → semilla aleatoria.
export function getSeedFromURL() {
  const p = new URLSearchParams(globalThis.location?.search ?? '').get('seed');
  if (!p) return (Math.random() * 2 ** 32) >>> 0;
  const n = Number(p);
  return Number.isFinite(n) ? n >>> 0 : hashStringToSeed(p);
}
