// Animación procedural del monstruo. El GLB no trae clips, así que el ciclo
// de marcha se genera aquí, hueso por hueso.
//
// El rig quedó alineado a los ejes del modelo (ver model.js), lo que permite
// razonar en términos anatómicos directos:
//   · miembro que cuelga  → rotación X negativa lo lanza al frente
//   · columna / cuello    → rotación X positiva encorva hacia adelante
//   · rotación Z          → abre el miembro hacia la izquierda del modelo (+X)
//
// Las piernas NO se animan por ángulos: se define la trayectoria del pie
// sobre el suelo y se resuelven cadera y rodilla por cinemática inversa. Esa
// es la única forma de garantizar lo que pide una persecución creíble:
//
//   1. El pie de apoyo retrocede exactamente a la velocidad a la que avanza
//      el cuerpo → nunca patina, ni caminando ni corriendo.
//   2. El bamboleo de la cadera lo absorben las piernas, no despega los pies.
//   3. El pie muerto puede quedarse pegado al suelo todo el ciclo: arrastra
//      de verdad en lugar de flotar.
//
// La fase avanza con la DISTANCIA recorrida, no con el tiempo, así que la
// frecuencia del paso sale sola de la velocidad real del monstruo.
//
// El cojeo: la pierna izquierda camina; la derecha va muerta, rezagada y
// rígida, raspando la punta del pie. El cuerpo se desploma sobre ella en cada
// apoyo — de ahí el bamboleo asimétrico.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
const smoothstep = (q) => q * q * (3 - 2 * q);

const T = {
  // Metros por ciclo completo (dos pasos) y fracción del ciclo que cada pie
  // pasa apoyado. Al correr el apoyo se acorta: aparece fase de vuelo.
  cycleWalk: 1.0,
  cycleRun: 2.4,
  stanceWalk: 0.62,
  stanceRun: 0.40,
  speedWalk: 2.0,
  speedRun: 6.0,

  stepLift: 0.09,      // altura del pie bueno en vuelo (m)
  groundY: 0.005,      // holgura de la punta contra el suelo (m)
  dragBias: 0.20,      // el pie muerto se queda rezagado esta distancia (m)
  dragToe: 0.55,       // punta clavada hacia abajo: raspa
  dragStiff: 0.55,     // cuánto se le impide doblar la rodilla

  crouchWalk: 0.05,    // hundimiento general de cadera (m)
  crouchRun: 0.10,     // corriendo va más agazapado (sin pasarse: si la
                       // cadera baja más que el largo de la pierna muerta,
                       // esta ya no alcanza el suelo)
  bobStance: 0.015,
  bobLimp: 0.045,      // desplome extra al cargar sobre la pierna muerta
  lean: 0.10,
  twist: 0.13,

  hunchIdle: 0.24,
  hunchHunt: 0.50,
  shoulderDrop: 0.30,

  armSwing: 0.22,
  armHang: 0.16,
  armReach: 1.30,
  elbowHang: 0.50,
  elbowReach: 0.70,

  headLoll: 0.30,
  breathe: 0.02,
};

// Trayectoria del pie a lo largo del ciclo, en metros respecto a su posición
// de reposo. Devuelve avance (z, hacia el frente), altura sobre el suelo (y)
// y cabeceo del tobillo (pitch; positivo = punta hacia abajo).
// `stance` = fracción del ciclo con el pie apoyado.
function footPath(phase, excursion, stance, lift, dragging) {
  if (dragging) {
    // La pierna muerta nunca despega: la punta va clavada hacia abajo y
    // raspa el suelo todo el ciclo.
    const z = phase < stance
      ? excursion * (0.5 - phase / stance)                             // apoyo
      : excursion * (Math.pow((phase - stance) / (1 - stance), 1.7) - 0.5); // arrastre
    const tremor = phase < stance ? 0 : 0.006 * Math.abs(Math.sin(phase * Math.PI * 9));
    return { z, y: tremor, pitch: T.dragToe };
  }
  if (phase < stance) {
    // Apoyado: retrocede linealmente. Esto es lo que impide el patinaje —
    // el pie retrocede justo lo que el cuerpo avanza.
    const q = phase / stance;
    // del talón al despegue de punta
    return { z: excursion * (0.5 - q), y: 0, pitch: lerp(-0.14, 0.30, q) };
  }
  const q = (phase - stance) / (1 - stance);
  return {
    z: excursion * (smoothstep(q) - 0.5),
    y: lift * Math.sin(Math.PI * q),
    pitch: lerp(0.1, -0.16, Math.min(1, q * 2)), // recoge la punta para no tropezar
  };
}

export class ZombieAnimator {
  // `root` es el nodo raíz del rig (escala y giro del modelo); los objetivos
  // de los pies se calculan en su espacio local, donde el suelo es y = 0.
  constructor(bones, root, rand = Math.random) {
    this.b = bones;
    this.root = root;
    this.phase = rand();          // cada monstruo entra en el ciclo distinto
    this.t = rand() * 100;
    this.seed = rand() * 100;
    this.moving = 0;
    this.reach = 0;
    this.lungeAmount = 0;
    this.headYaw = 0;
    this.headPitch = 0;

    // Escala del rig: convierte metros a unidades de modelo
    this.scale = root.scale.x || 1;

    const hip = bones.get('Hip');
    this.hipRestY = hip ? hip.position.y : 0;

    // Longitudes de muslo y pantorrilla (unidades de modelo)
    this.legs = ['L', 'R'].map((side) => {
      const thigh = bones.get(`${side}_Thigh`);
      const calf = bones.get(`${side}_Calf`);
      const foot = bones.get(`${side}_Foot`);
      const toe = bones.get(`${side}_ToeBase`);
      return {
        side, thigh, calf, foot, toe,
        upper: calf ? calf.position.length() : 0.25,
        lower: foot ? foot.position.length() : 0.28,
        rest: new THREE.Vector3(),
        target: new THREE.Vector3(),
        toeLen: 0.16, // tobillo→punta en metros; se mide abajo
      };
    });

    // Posición de reposo de cada tobillo, y largo del pie: al inclinar el
    // tobillo hay que subirlo otro tanto para que la punta roce el suelo
    // en vez de atravesarlo.
    root.updateMatrixWorld(true);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const leg of this.legs) {
      if (!leg.foot) continue;
      leg.foot.getWorldPosition(leg.rest);
      root.worldToLocal(leg.rest);
      if (leg.toe) {
        leg.foot.getWorldPosition(a);
        leg.toe.getWorldPosition(b);
        leg.toeLen = Math.hypot(b.x - a.x, b.z - a.z); // en metros (mundo)
      }
    }

    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._qr = new THREE.Quaternion();
  }

  set(name, x, y, z) {
    const b = this.b.get(name);
    if (b) b.rotation.set(x, y, z);
  }

  // Cinemática inversa de dos huesos. `target` va en espacio local del rig.
  // Deja el pie plano respecto al suelo, más el cabeceo extra que se pida.
  solveLeg(leg, target, footPitch, maxKnee) {
    const { thigh, calf, foot } = leg;
    if (!thigh || !calf) return;

    // Cadera y orientación del padre, en espacio del rig
    const hip = this._v;
    thigh.getWorldPosition(hip);
    this.root.worldToLocal(hip);

    this.root.getWorldQuaternion(this._qr);
    thigh.parent.getWorldQuaternion(this._q);
    this._q.premultiply(this._qr.invert()); // orientación del padre en el rig
    this._q.invert();

    const t = this._t
      .set(target.x - hip.x, target.y - hip.y, target.z - hip.z)
      .applyQuaternion(this._q);

    const L1 = leg.upper;
    const L2 = leg.lower;
    const dMax = (L1 + L2) * 0.999;
    const dMin = Math.abs(L1 - L2) + 1e-3;
    let d = t.length();
    if (d < 1e-5) return;
    const dc = clamp(d, dMin, dMax);
    t.multiplyScalar(dc / d); // si no alcanza, se estira sin romperse
    d = dc;

    // Ángulo interior de la rodilla y desvío del muslo respecto a la recta
    // cadera→tobillo (ley de cosenos).
    let knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    if (maxKnee !== undefined && knee > maxKnee) {
      // Rodilla agarrotada (pierna muerta): al forzarla más estirada de lo
      // que pide el objetivo, la distancia que realmente alcanza el tobillo
      // cambia. Hay que recalcularla o el pie aterriza pasado de largo.
      knee = maxKnee;
      d = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(Math.PI - knee));
    }
    const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));

    // Dirección del muslo: la recta al objetivo, girada `alpha` hacia el
    // frente para que la rodilla apunte hacia adelante.
    const n = t.normalize();
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const ux = n.x;
    const uy = n.y * ca + n.z * sa;
    const uz = -n.y * sa + n.z * ca;

    // Descomposición en Euler XYZ desde la vertical (0,-1,0):
    //   Rz abre el miembro hacia +X, Rx lo lanza hacia +Z.
    const rz = Math.asin(clamp(ux, -1, 1));
    const rx = Math.atan2(-uz, -uy);

    thigh.rotation.set(rx, 0, rz);
    calf.rotation.set(knee, 0, 0);
    // Planta paralela al suelo: se compensa todo lo que acumuló la pierna.
    // Solo el cabeceo — el giro lateral del pie lo pone quien llama.
    if (foot) foot.rotation.x = -(rx + knee) + footPitch;
  }

  // moved: metros recorridos desde el último frame · speed: m/s actual
  // hunting: true si va a por el jugador · lookYaw: giro extra de cabeza
  update(dt, { moved = 0, speed = 0, hunting = false, lookYaw = 0 }) {
    this.t += dt;
    if (this.lungeAmount > 0) { this.poseLunge(dt); return; }

    this.moving = damp(this.moving, speed > 0.25 ? 1 : 0, 6, dt);
    this.reach = damp(this.reach, hunting ? 1 : 0, 2.5, dt);
    const m = this.moving;

    // --- fase por distancia: el paso mide lo que mide el desplazamiento ---
    const k = clamp((speed - T.speedWalk) / (T.speedRun - T.speedWalk), 0, 1);
    const cycle = lerp(T.cycleWalk, T.cycleRun, k);
    const stance = lerp(T.stanceWalk, T.stanceRun, k);
    this.phase = (this.phase + moved / cycle) % 1;

    const p = this.phase * TAU;
    const sin = Math.sin(p);
    const excursion = cycle * stance * m; // en reposo el paso se cierra

    const jt = this.t * 1.7 + this.seed;
    const jitter = Math.sin(jt) * Math.sin(jt * 2.3) * 0.035;

    // ---------------- cadera y tronco ----------------
    // Bamboleo asimétrico: el desplome al cargar sobre la pierna muerta es
    // mucho más profundo que el apoyo bueno → se lee como cojera.
    const crouch = lerp(T.crouchWalk, T.crouchRun, k) * m;
    const bob = (T.bobStance * Math.max(0, sin) + T.bobLimp * Math.max(0, -sin)) * m;
    const hipDrop = (crouch + bob) / this.scale; // metros → unidades de modelo

    const hip = this.b.get('Hip');
    if (hip) hip.position.y = this.hipRestY - hipDrop;

    this.set('Hip', 0, -T.twist * 0.5 * sin * m, T.lean * sin * m);

    const hunch = lerp(T.hunchIdle, T.hunchHunt, this.reach);
    const breathe = Math.sin(this.t * 1.1) * T.breathe * (1 - m * 0.6);
    this.set('Waist', hunch * 0.35 + breathe, T.twist * sin * m, -T.lean * 0.4 * sin * m);
    this.set('Spine01', hunch * 0.4, T.twist * 0.4 * sin * m, 0.04);
    this.set('Spine02', hunch * 0.25, 0, -0.05 + jitter);

    // ---------------- cabeza ----------------
    // Vencida de lado mientras merodea; en cacería se endereza y se clava en
    // el jugador. Como la columna va encorvada, hay que compensar hacia atrás
    // para que mire al frente y no al suelo.
    const loll = T.headLoll * (1 - this.reach);
    this.headYaw = damp(this.headYaw, lookYaw + loll * 0.8, 4, dt);
    this.headPitch = damp(this.headPitch, -hunch * 0.55 + 0.1 - this.reach * 0.12, 4, dt);
    const headBounce = -Math.abs(sin) * 0.05 * m;

    this.set('NeckTwist01', -hunch * 0.3 + headBounce, this.headYaw * 0.4, loll * 0.4);
    this.set('Head', this.headPitch, this.headYaw * 0.6, loll + jitter * 2);

    // ---------------- brazos ----------------
    // Cuelgan muertos y se balancean por inercia, desfasados de las piernas.
    // En cacería suben al frente, buscando.
    const swingL = T.armSwing * Math.cos(p) * m;
    const swingR = -T.armSwing * Math.cos(p) * m;
    const upperHunt = -T.armReach;

    this.set('L_Clavicle', 0, 0, -0.08);
    this.set('R_Clavicle', 0, 0, 0.08 - T.shoulderDrop * this.reach);

    this.set('L_Upperarm', lerp(swingL, upperHunt, this.reach), 0,
      lerp(T.armHang, -0.30, this.reach));
    this.set('R_Upperarm', lerp(swingR - T.shoulderDrop * 0.2, upperHunt - 0.12, this.reach), 0,
      lerp(-T.armHang - 0.06, 0.30, this.reach));

    const elbow = lerp(T.elbowHang, T.elbowReach, this.reach);
    this.set('L_Forearm', -elbow, 0, 0);
    this.set('R_Forearm', -elbow - 0.15 * (1 - this.reach), 0, 0);
    this.set('L_Hand', lerp(0.25, -0.45, this.reach), 0, 0);
    this.set('R_Hand', lerp(0.30, -0.45, this.reach), 0, 0);

    // ---------------- piernas (IK) ----------------
    // El tronco ya está colocado: hay que refrescar las matrices para que la
    // cadera esté donde toca antes de resolver.
    this.root.updateMatrixWorld(true);

    const s = this.scale;

    // El pie muerto va girado hacia afuera con la punta rota. Se coloca
    // antes de resolver para que la corrección de altura lo tenga en cuenta.
    this.set('L_ToeBase', 0, 0, 0);
    this.set('R_ToeBase', 0.10 * m, 0, 0);
    const lFoot = this.b.get('L_Foot');
    if (lFoot) { lFoot.rotation.y = 0; lFoot.rotation.z = 0; }
    const rFoot = this.b.get('R_Foot');
    if (rFoot) { rFoot.rotation.y = 0.22 * m; rFoot.rotation.z = -0.12 * m; }

    const pending = [];
    for (const leg of this.legs) {
      const dragging = leg.side === 'R';
      const ph = dragging ? (this.phase + 0.5) % 1 : this.phase;
      // La pierna buena marca el paso exacto (es la que impide el patinaje).
      // La muerta recoge su recorrido conforme sube la velocidad: no puede
      // quedarse tan atrás, y estirada de más la pierna no alcanzaría el
      // suelo. Que raspe hacia adelante es justo lo que se quiere ver.
      const legExcursion = dragging ? excursion * lerp(1, 0.62, k) : excursion;
      const path = footPath(ph, legExcursion, stance, T.stepLift, dragging);
      const pitch = path.pitch * (dragging ? 1 : m); // parado, el pie se aplana

      // Con la punta hacia abajo el tobillo sube otro tanto, o el pie
      // atravesaría el suelo. Esto es lo que pone al pie muerto de puntillas.
      const clearance = T.groundY + Math.max(0, Math.sin(pitch)) * leg.toeLen;

      // metros → unidades de modelo, sobre la posición de reposo del tobillo
      const target = leg.target.set(
        leg.rest.x,
        leg.rest.y + (path.y + clearance) / s,
        leg.rest.z + (path.z - (dragging ? T.dragBias * lerp(1, 0.4, k) * m : 0)) / s
      );

      // Corriendo, la pierna muerta cede un poco: con la rodilla del todo
      // agarrotada no llegaría al suelo desde la cadera agazapada.
      const maxKnee = dragging ? lerp(T.dragStiff, 1.15, k) : undefined;
      this.solveLeg(leg, target, pitch, maxKnee);
      pending.push({ leg, target, pitch, maxKnee, dragging, grounded: dragging || ph < stance });
    }

    // Corrección: medir dónde acabó la punta y reajustar el tobillo. El
    // cabeceo del pie, el balanceo de la pelvis y el giro del pie muerto se
    // acumulan de formas difíciles de predecir; medir y corregir sale más
    // barato que compensarlo analíticamente. Dos pasadas convergen de sobra.
    const floor = T.groundY / s;
    for (let pass = 0; pass < 2; pass++) {
      this.root.updateMatrixWorld(true);
      for (const e of pending) {
        if (!e.leg.toe) continue;
        e.leg.toe.getWorldPosition(this._v);
        this.root.worldToLocal(this._v);
        const lift = floor - this._v.y;
        // El pie apoyado se pega al suelo; el que va en vuelo solo se
        // corrige si llegara a hundirse.
        if (e.grounded ? Math.abs(lift) > 1e-4 : lift > 0) {
          e.target.y += lift;
          this.solveLeg(e.leg, e.target, e.pitch, e.maxKnee);
        }
      }
    }
  }

  // Secuencia de captura: se echa encima con los brazos por delante.
  // Idempotente: se llama cada frame mientras dura la captura, pero solo
  // arranca el gesto una vez (si no, se reiniciaría sin llegar a completarse).
  startLunge() {
    if (this.lungeAmount === 0) this.lungeAmount = 1e-4;
  }

  poseLunge(dt) {
    this.lungeAmount = Math.min(1, this.lungeAmount + dt * 4);
    const a = this.lungeAmount;
    const shake = Math.sin(this.t * 40) * 0.04 * a;

    const hip = this.b.get('Hip');
    if (hip) hip.position.y = this.hipRestY - 0.02 * a;

    this.set('Hip', 0, 0, 0);
    this.set('Waist', 0.25 * a, 0, 0);
    this.set('Spine01', 0.2 * a, 0, 0);
    this.set('Spine02', 0.15 * a, 0, shake);
    this.set('NeckTwist01', -0.35 * a, 0, 0);
    this.set('Head', -0.45 * a, 0, shake * 2); // la cara, encima de ti

    this.set('L_Clavicle', 0, 0, -0.25 * a);
    this.set('R_Clavicle', 0, 0, 0.25 * a);
    this.set('L_Upperarm', -2.0 * a, 0, -0.35 * a);
    this.set('R_Upperarm', -2.0 * a, 0, 0.35 * a);
    this.set('L_Forearm', -0.5 * a, 0, 0);
    this.set('R_Forearm', -0.5 * a, 0, 0);
    this.set('L_Hand', -0.6 * a, 0, 0);
    this.set('R_Hand', -0.6 * a, 0, 0);

    this.set('L_Thigh', -0.5 * a, 0, 0.05);
    this.set('L_Calf', 0.5 * a, 0, 0);
    this.set('R_Thigh', 0.35 * a, 0, -0.1);
    this.set('R_Calf', 0.4 * a, 0, 0);
    this.set('L_Foot', 0.2 * a, 0, 0);
    this.set('R_Foot', -0.3 * a, 0, 0);
  }
}
