// Atmósfera: siempre es de noche. La oscuridad es casi total;
// la niebla evita que jamás se vea "el final" del laberinto.

import * as THREE from 'three';

export function setupAtmosphere(scene, CFG) {
  scene.background = new THREE.Color(CFG.RENDER.fogColor);
  scene.fog = new THREE.FogExp2(CFG.RENDER.fogColor, CFG.RENDER.fogDensity);

  // Resto de luz fría, apenas perceptible: silueta, no visibilidad.
  const hemi = new THREE.HemisphereLight(0x232f42, 0x040404, 0.22);
  scene.add(hemi);
}

// Lámparas rotas: parpadean, a veces se apagan del todo.
// Sirven como puntos de referencia escasos (orientación por memoria, GDD).
export function updateLamps(lamps, time) {
  for (const l of lamps) {
    const n = Math.sin(time * 13 + l.seed * 7) * Math.sin(time * 7.3 + l.seed * 3);
    let f = 0.55 + 0.45 * Math.max(0, n);
    if (Math.sin(time * 1.7 + l.seed * 11) > 0.94) f = 0.05; // apagones breves
    l.light.intensity = l.base * f;
  }
}
