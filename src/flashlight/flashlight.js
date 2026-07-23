// La linterna: el recurso más importante y el mayor peligro.
// Implementa los estados de batería del GDD (100/75/50/25/10/0)
// como multiplicadores de intensidad, alcance y apertura del cono.

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class Flashlight {
  constructor(scene, cfg) {
    this.cfg = cfg;

    this.spot = new THREE.SpotLight(
      cfg.color, 0, cfg.distance, cfg.angle, cfg.penumbra, cfg.decay
    );
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = cfg.distance + 4;
    scene.add(this.spot);
    scene.add(this.spot.target);

    // Rebote suave alrededor del jugador: sin esto, el cono se siente
    // como mirar por un túnel (todo fuera del haz queda negro absoluto).
    this.spill = new THREE.PointLight(cfg.color, 0, cfg.spill.distance, 2);
    scene.add(this.spill);

    this.on = false;
    this.battery = 1;
    this.lightLevel = 0; // 0..1 real emitido (la IA y el HUD leen esto)
    this.time = 0;

    this.smoothDir = new THREE.Vector3(0, 0, -1);
    this.flickT = 0;
    this.flickOn = true;

    this._pos = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  toggle() {
    if (this.battery <= 0) { this.on = false; return false; }
    this.on = !this.on;
    return true;
  }

  tier() {
    const c = this.cfg;
    return c.tiers.find((t) => this.battery > t.min) || c.tiers[c.tiers.length - 1];
  }

  update(dt, camera) {
    const c = this.cfg;
    this.time += dt;

    if (this.on) {
      this.battery = Math.max(0, this.battery - dt / c.batterySeconds);
      if (this.battery === 0) this.on = false; // oscuridad absoluta
    }

    const t = this.tier();
    let eff = this.on ? c.intensity * t.intensity : 0;

    // Al 10%: la linterna falla, parpadea, produce interferencia (GDD)
    if (this.on && t.flicker) {
      this.flickT -= dt;
      if (this.flickT <= 0) {
        this.flickT = 0.04 + Math.random() * 0.2;
        this.flickOn = Math.random() > 0.3;
      }
      if (!this.flickOn) eff *= 0.06;
    }

    // Temblor de mano, casi imperceptible
    eff *= 0.97 + 0.03 * Math.sin(this.time * 9.3) * Math.sin(this.time * 3.1);

    this.spot.intensity = eff;
    this.spot.distance = c.distance * t.range;
    this.spot.angle = c.angle * t.angle;
    this.lightLevel = eff / c.intensity;
    this.spill.intensity = this.lightLevel * c.spill.intensity;

    // Posición: en la "mano" (abajo-derecha de la cámara),
    // apuntando con retraso respecto a la mirada → se siente sostenida.
    camera.getWorldPosition(this._pos);
    camera.getWorldDirection(this._dir);
    const blend = 1 - Math.exp(-c.swayResponse * dt);
    this.smoothDir.lerp(this._dir, blend).normalize();
    this._right.crossVectors(this._dir, UP).normalize();

    this.spot.position.copy(this._pos).addScaledVector(this._right, 0.16);
    this.spot.position.y -= 0.12;
    this.spill.position.copy(this._pos).addScaledVector(this.smoothDir, 1.2);
    this.spot.target.position.copy(this._pos).addScaledVector(this.smoothDir, 12);
    this.spot.target.position.y += Math.sin(this.time * 2.3) * 0.05;
  }
}
