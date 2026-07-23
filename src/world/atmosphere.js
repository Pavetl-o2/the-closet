// Atmósfera: siempre es de noche. La oscuridad domina, pero nunca es
// negro absoluto: una luz base fría deja leer siluetas y volúmenes, y
// los focos colgantes crean islas de luz enferma para navegar sin
// linterna. La niebla evita que jamás se vea "el final" del laberinto.

import * as THREE from 'three';

export function setupAtmosphere(scene, CFG) {
  scene.background = new THREE.Color(CFG.RENDER.fogColor);
  scene.fog = new THREE.FogExp2(CFG.RENDER.fogColor, CFG.RENDER.fogDensity);

  // Resto de luz fría: suficiente para orientarse, nunca para sentirse a salvo.
  const hemi = new THREE.HemisphereLight(0x2b3140, 0x0c0a07, CFG.RENDER.ambientIntensity);
  scene.add(hemi);
}

// Focos colgantes: zumban, parpadean, a veces se apagan del todo.
// Son las islas de luz que permiten avanzar con la linterna apagada
// (y la razón de que apagarla sea una opción real, no un suicidio).
export function updateLamps(lamps, time) {
  for (const l of lamps) {
    const n = Math.sin(time * 13 + l.seed * 7) * Math.sin(time * 7.3 + l.seed * 3);
    let f = 0.66 + 0.34 * Math.max(0, n);
    if (Math.sin(time * 1.7 + l.seed * 11) > 0.96) f = 0.05; // apagones breves
    l.light.intensity = l.base * f;
    if (l.bulbMat) l.bulbMat.emissiveIntensity = 2.4 * f;
  }
}
