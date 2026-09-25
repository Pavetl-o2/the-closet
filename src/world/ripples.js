// Ondas en los charcos: cada gota que suena deja un anillo que se abre y se
// apaga. Es la otra mitad del goteo — si lo ves con la linterna, sabes de
// dónde venía el sonido.
//
// Un solo InstancedMesh con unas pocas ondas recicladas. El material es
// iluminado a propósito: a oscuras apenas se ven, bajo el haz brillan.

import * as THREE from 'three';

export class Ripples {
  constructor(scene, max = 10) {
    const geo = new THREE.RingGeometry(0.82, 1, 20, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xaab2b6,
      roughness: 0.2,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // el color de instancia a negro = invisible
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.items = Array.from({ length: max }, () => ({ x: 0, z: 0, t: 1, life: 1, on: false }));
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this._m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, this._c);
    }
    this.next = 0;
    scene.add(this.mesh);
  }

  spawn(x, z) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    Object.assign(it, { x, z, t: 0, life: 0.8 + Math.random() * 0.4, on: true });
  }

  update(dt) {
    let dirty = false;
    this.items.forEach((it, i) => {
      if (!it.on) return;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        it.on = false;
        this._m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this._m);
      } else {
        const r = 0.04 + k * 0.38;
        this._m.makeScale(r, 1, r).setPosition(it.x, 0.02, it.z);
        this.mesh.setMatrixAt(i, this._m);
        this.mesh.setColorAt(i, this._c.setScalar((1 - k) * (1 - k) * 0.38));
      }
      dirty = true;
    });
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
