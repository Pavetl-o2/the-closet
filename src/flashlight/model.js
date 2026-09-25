// La linterna que llevas en la mano, vista en primera persona.
//
// Una linterna de plástico rojo, sencilla, de las de toda la vida: cuerpo
// cilíndrico con estrías de agarre, interruptor de goma negra, cabeza
// ensanchada con aro metálico y la lente. Poca geometría (8–10 lados) y una
// textura de 64 px sin filtrar, como el resto del juego.
//
// Se dibuja en una pasada aparte, encima de la escena y con la profundidad
// borrada: así nunca atraviesa un muro al pegarte a él. Como esa pasada no
// ve las luces del mundo, lleva las suyas, copiadas cada frame de las que
// de verdad la alcanzarían: la luz base, el rebote de su propio haz en lo
// que tienes delante y el foco colgante más cercano.
//
// La POSE no se decide aquí: la calcula Flashlight (objeto `hand`), que es
// quien coloca el foco de luz en la lente. Así el haz sale exactamente de
// donde se ve la linterna y apunta hacia donde apunta ella.

import * as THREE from 'three';

// Plástico rojo gastado: estrías de agarre, rozaduras claras y mugre
function makeBodyTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8e1d16';
  ctx.fillRect(0, 0, S, S);
  // estrías: en la textura, V recorre el cuerpo a lo largo
  for (let y = 22; y < 54; y += 4) {
    ctx.fillStyle = 'rgba(40,6,4,0.55)';
    ctx.fillRect(0, y, S, 1);
    ctx.fillStyle = 'rgba(230,110,90,0.18)';
    ctx.fillRect(0, y + 1, S, 1);
  }
  // rozaduras y mugre
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(240,170,150,0.25)' : 'rgba(20,8,6,0.3)';
    ctx.fillRect(r() * S, r() * S, 1 + r() * 3, 1);
  }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n * 0.4));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * 0.4));
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

// Cilindro a lo largo de +Z, de z0 a z1, con radios r0 → r1
function tube(r0, r1, z0, z1, sides, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, sides, 1, open);
  g.rotateX(Math.PI / 2); // eje Y → eje Z (el radio r1 queda en +Z)
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

export class FlashlightModel {
  // Medidas en metros. El origen del modelo es el punto de agarre; la lente
  // mira hacia +Z (Object3D.lookAt orienta +Z hacia el objetivo).
  static LENS_Z = 0.155;

  constructor(renderCfg) {
    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const red = new THREE.MeshStandardMaterial({ map: makeBodyTexture(), roughness: 0.48, metalness: 0 });
    const redPlain = new THREE.MeshStandardMaterial({ color: 0x8e1d16, roughness: 0.45 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.9 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.3, metalness: 0.85 });
    this.lensMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a26, roughness: 0.1, emissive: 0xfff0d0, emissiveIntensity: 0,
    });
    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0x9a9690, roughness: 0.3, metalness: 0.85, emissive: 0xffe2b0, emissiveIntensity: 0,
    });

    const Z = FlashlightModel.LENS_Z;
    const parts = [
      // tapa trasera de goma
      [tube(0.0165, 0.0165, -0.105, -0.09, 8), rubber],
      // cuerpo con estrías
      [tube(0.016, 0.016, -0.09, 0.075, 8), red],
      // cuello que se ensancha hacia la cabeza
      [tube(0.016, 0.026, 0.075, 0.115, 10), redPlain],
      // cabeza
      [tube(0.026, 0.027, 0.115, Z - 0.008, 10), redPlain],
    ];
    for (const [g, m] of parts) this.group.add(new THREE.Mesh(g, m));

    // aro metálico de la cabeza: por su borde asoma la luz
    this.group.add(new THREE.Mesh(tube(0.0285, 0.0285, Z - 0.008, Z, 10, true), this.rimMat));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 10), this.lensMat);
    lens.position.z = Z - 0.002;
    this.group.add(lens);

    // interruptor de goma negra, arriba, donde cae el pulgar
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.007, 0.022), rubber);
    sw.position.set(0, 0.017, 0.03);
    this.group.add(sw);
    // banda cromada fina detrás del interruptor
    this.group.add(new THREE.Mesh(tube(0.0168, 0.0168, 0.012, 0.016, 8), chrome));

    this.group.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false; // pegada a la cámara: nunca se descarta
    });

    // --- luces propias de la pasada
    const R = renderCfg;
    // La mano tapa media luz base (tu cuerpo hace sombra): sin esto el
    // plástico rojo, que refleja mucho más que el cemento, brillaba a oscuras.
    this.hemi = new THREE.HemisphereLight(R.hemiSky, R.hemiGround, R.ambientIntensity * 0.5);
    this.bounce = new THREE.PointLight(0xffe9c4, 0, 3, 2); // su haz rebotando hacia la mano
    this._fwd = new THREE.Vector3();
    this.lamp = new THREE.PointLight(0xe8dcc0, 0, 10, 2);  // el foco colgante más cercano
    this.scene.add(this.hemi, this.bounce, this.lamp);
  }

  // Copia la pose de la mano y las luces que la alcanzan.
  update(flashlight, lampPool) {
    const h = flashlight.hand;
    this.group.position.copy(h.position);
    this.group.quaternion.copy(h.quaternion);

    // la lente brilla con lo que emite la linterna (parpadeos incluidos)
    const lvl = flashlight.lightLevel;
    this.lensMat.emissiveIntensity = lvl * 6;
    this.rimMat.emissiveIntensity = lvl * 0.5;

    // Lo que su propio haz devuelve: una luz tenue delante de la mano, hacia
    // donde apunta. Pegado a un muro la linterna queda a contraluz del disco,
    // pero no negra.
    this._fwd.set(0, 0, 1).applyQuaternion(h.quaternion);
    this.bounce.position.copy(h.position).addScaledVector(this._fwd, 0.5);
    this.bounce.position.y += 0.3; // de delante y de arriba: le da en el lomo, que es lo que ves
    this.bounce.intensity = flashlight.lightLevel * 3;

    // el foco con más luz sobre la mano
    let best = null;
    let bestI = 0;
    for (const l of lampPool) {
      if (l.intensity <= 0) continue;
      const d = l.position.distanceTo(h.position);
      const i = l.intensity / (1 + d * d);
      if (i > bestI) { bestI = i; best = l; }
    }
    if (best) {
      this.lamp.position.copy(best.position);
      this.lamp.intensity = best.intensity;
      this.lamp.distance = best.distance;
      this.lamp.color.copy(best.color);
    } else {
      this.lamp.intensity = 0;
    }
  }
}
