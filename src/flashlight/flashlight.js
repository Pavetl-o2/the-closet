// La linterna: el recurso más importante y el mayor peligro.
// Implementa los estados de batería del GDD (100/75/50/25/10/0)
// como multiplicadores de intensidad, alcance y apertura del cono.
//
// También decide dónde está la linterna que llevas en la mano (`hand`): abajo
// a la derecha del campo de visión, apuntando con retraso hacia donde miras.
// El foco de luz nace en su lente y apunta por su eje, así que el haz que ves
// sale exactamente de la linterna que ves (el modelo está en model.js).

import * as THREE from 'three';
import { FlashlightModel } from './model.js';

export class Flashlight {
  constructor(scene, cfg, quality) {
    this.cfg = cfg;

    this.spot = new THREE.SpotLight(
      cfg.color, 0, cfg.distance, cfg.angle, cfg.penumbra, cfg.decay
    );
    // La sombra del haz es media atmósfera del juego, así que se conserva
    // incluso en móvil; solo baja la resolución del mapa.
    this.spot.castShadow = quality.shadows;
    const sm = quality.shadowMapSize;
    this.spot.shadow.mapSize.set(sm, sm);
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

    // Pose de la linterna en la mano (en coordenadas de mundo). No está en la
    // escena: la leen el foco de luz y el modelo que se dibuja.
    this.hand = new THREE.Object3D();
    this.kick = 0;   // sacudida del pulgar al pulsar el interruptor
    this.maze = null;

    this._pos = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._lens = new THREE.Vector3();
  }

  // Con el laberinto, el foco no puede quedar dentro de un muro cuando te
  // pegas a él (la lente sobresale de tu radio de colisión).
  setMaze(maze) { this.maze = maze; }

  toggle() {
    if (this.battery <= 0) { this.on = false; return false; }
    this.on = !this.on;
    this.kick = 1;
    return true;
  }

  nearWall(x, z, m) {
    const M = this.maze;
    for (const [dx, dz] of [[-m, -m], [m, -m], [-m, m], [m, m]]) {
      const [tx, ty] = M.worldToTile(x + dx, z + dz);
      if (M.isWall(tx, ty)) return true;
    }
    return false;
  }

  // Fracción del segmento ojo → punto que queda en aire libre (1 = todo).
  // Deja en `out` el punto más lejano que no toca un muro.
  freeFraction(eye, to, out) {
    if (!this.maze) { out.copy(to); return 1; }
    for (const f of [1, 0.75, 0.5, 0.25]) {
      out.lerpVectors(eye, to, f);
      if (!this.nearWall(out.x, out.z, 0.08)) return f;
    }
    out.copy(eye);
    return 0;
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

    // La mano: abajo-derecha de la cámara, apuntando con retraso respecto a
    // la mirada → se siente sostenida. El vaivén del paso llega a la mano
    // amortiguado (el brazo absorbe parte) y encima respira un poco.
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this._pos);
    camera.getWorldDirection(this._dir);
    const blend = 1 - Math.exp(-c.swayResponse * dt);
    this.smoothDir.lerp(this._dir, blend).normalize();

    this.kick = Math.max(0, this.kick - dt * 7);
    const H = c.hold;
    const k = Math.sin(this.kick * Math.PI); // ida y vuelta
    this._local.set(
      H.x - camera.position.x * 0.5 + Math.sin(this.time * 1.1) * 0.002,
      H.y - camera.position.y * 0.55 + Math.sin(this.time * 1.7) * 0.003 - k * 0.006,
      H.z + k * 0.01
    );
    this.hand.position.copy(camera.localToWorld(this._local));

    // Apunta al punto que miras a `aimDistance`, pero con el retraso de la
    // mano: los giros rápidos la dejan atrás un instante.
    this._aim.copy(this._pos).addScaledVector(this.smoothDir, c.aimDistance);
    this._aim.y += Math.sin(this.time * 2.3) * 0.05;
    this.hand.lookAt(this._aim);
    this.hand.rotateZ(-k * 0.08);
    this.hand.updateMatrix();

    // El haz nace en la lente y sale por el eje de la linterna
    this._lens.set(0, 0, FlashlightModel.LENS_Z).applyMatrix4(this.hand.matrix);
    this.freeFraction(this._pos, this._lens, this.spot.position);
    this.spot.target.position.copy(this._aim);
    // El rebote tampoco puede quedar al otro lado del muro que tienes delante.
    // Si no hay sitio, se queda en tus ojos y se apaga en proporción: pegado
    // a un muro, lo que ilumina es el disco del haz, no un resplandor que
    // quema la pared entera.
    this._local.copy(this._pos).addScaledVector(this.smoothDir, 1.2);
    const free = this.freeFraction(this._pos, this._local, this.spill.position);
    if (free < 1) this.spill.position.copy(this._pos);
    this.spill.intensity = this.lightLevel * c.spill.intensity * free * free;
  }
}
