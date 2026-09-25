// Atmósfera: siempre es de noche. La oscuridad domina, pero nunca es
// negro absoluto: una luz base fría deja leer siluetas y volúmenes, y
// los focos colgantes crean islas de luz enferma para navegar sin
// linterna. La niebla evita que jamás se vea "el final" del laberinto.

import * as THREE from 'three';

export function setupAtmosphere(scene, CFG) {
  scene.background = new THREE.Color(CFG.RENDER.fogColor);
  scene.fog = new THREE.FogExp2(CFG.RENDER.fogColor, CFG.RENDER.fogDensity);

  // Resto de luz: suficiente para orientarse, nunca para sentirse a salvo.
  const hemi = new THREE.HemisphereLight(
    CFG.RENDER.hemiSky, CFG.RENDER.hemiGround, CFG.RENDER.ambientIntensity
  );
  scene.add(hemi);
}

// Focos colgantes: zumban, parpadean, a veces se apagan del todo.
// Son las islas de luz que permiten avanzar con la linterna apagada
// (y la razón de que apagarla sea una opción real, no un suicidio).
//
// Las luces reales viven en un pool de tamaño fijo (ver builder.js) que se
// reasigna a los focos más cercanos al jugador. El conteo de luces nunca
// cambia, así que no hay recompilaciones de shader; y en móvil basta con
// cuatro para que el pasillo en el que estás se vea igual. Los focos que
// quedan fuera del pool conservan su bombilla encendida: a lo lejos se siguen
// viendo brillar, solo dejan de iluminar el entorno.
const _col = new THREE.Color();

export function updateLamps(lamps, pool, time, playerPos) {
  const bulbs = lamps.bulbs;
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    const n = Math.sin(time * 13 + l.seed * 7) * Math.sin(time * 7.3 + l.seed * 3);
    let f = 0.66 + 0.34 * Math.max(0, n);
    if (Math.sin(time * 1.7 + l.seed * 11) > 0.96) f = 0.05; // apagones breves
    l.flicker = f;
    if (bulbs) bulbs.setColorAt(i, _col.setScalar(f));
  }
  if (bulbs?.instanceColor) bulbs.instanceColor.needsUpdate = true;

  if (!pool.length) return;

  if (pool.length >= lamps.length) {
    // Caben todas: asignación directa, sin ordenar nada
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      pool[i].position.set(l.x, l.y, l.z);
      pool[i].intensity = l.base * l.flicker;
    }
    return;
  }

  // Selección parcial de los `pool.length` más cercanos: se recorre la lista
  // insertando en un top-N pequeño, sin ordenar el conjunto completo.
  const best = [];
  for (const l of lamps) {
    const dx = l.x - playerPos.x;
    const dz = l.z - playerPos.z;
    const d = dx * dx + dz * dz;
    if (best.length < pool.length) {
      best.push({ l, d });
      best.sort((a, b) => a.d - b.d);
    } else if (d < best[best.length - 1].d) {
      best[best.length - 1] = { l, d };
      best.sort((a, b) => a.d - b.d);
    }
  }
  for (let i = 0; i < pool.length; i++) {
    const e = best[i];
    if (!e) { pool[i].intensity = 0; continue; }
    pool[i].position.set(e.l.x, e.l.y, e.l.z);
    pool[i].intensity = e.l.base * e.l.flicker;
  }
}
