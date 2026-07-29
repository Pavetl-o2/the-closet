// Carga del modelo del monstruo (GLB con esqueleto, sin animaciones).
//
// El rig viene con dos defectos que hay que reparar antes de poder animarlo:
//
//  1. Está "aplanado": todos los nodos tienen transform identidad y la pose de
//     reposo solo existe dentro de las inverse bind matrices. Cargado tal cual,
//     cada hueso deforma desde el origen y la malla se destroza.
//  2. El esqueleto está girado −90° en Y respecto a la malla (verificado
//     comparando cada hueso con el centroide ponderado de los vértices que
//     controla: error medio 0.075 contra 0.19+ de cualquier otra rotación).
//     Sin corregirlo, las articulaciones pivotarían fuera del cuerpo.
//
// Aquí se reconstruye la pose de reposo — posición = R(−90°,Y) · IBM⁻¹.t — y se
// rearma el esqueleto SIN rotaciones locales. Eso deja un rig alineado a los
// ejes del modelo: rotar un hueso en X es cabecear, en Y girar, en Z inclinar.
// Después se recalculan las inverse bind matrices para que esta pose sea la
// nueva pose de bind y la malla se vea exactamente como fue modelada.
//
// Frame del rig: +Z al frente · +Y arriba · +X hacia la izquierda del modelo.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import modelUrl from '../assets/monster.glb?url';

// Huesos sin peso de piel (no tienen IBM): heredan la posición del hueso
// equivalente que sí la tiene. Los "Twist" nacen en la misma articulación
// que su hueso padre, así que sirven de referencia exacta.
const PROXY = {
  Hip: 'Waist',
  Pelvis: 'Waist',
  L_Thigh: 'L_ThighTwist01',
  R_Thigh: 'R_ThighTwist01',
  L_Calf: 'L_CalfTwist01',
  R_Calf: 'R_CalfTwist01',
  L_Upperarm: 'L_UpperarmTwist01',
  R_Upperarm: 'R_UpperarmTwist01',
  L_Forearm: 'L_ForearmTwist01',
  R_Forearm: 'R_ForearmTwist01',
};

// Los nodos intermedios del esqueleto no son THREE.Bone: GLTFLoader solo
// crea Bone para los joints del skin. Todo lo que no sea malla cuenta.
const isSkeletonNode = (o) => !o.isMesh && !o.isSkinnedMesh;

// --- Repesado de la piel -----------------------------------------------
// Los pesos que trae el GLB son inservibles: el 78 % de los vértices está
// soldado 100 % a "Root" y el 98 % tiene un único hueso de influencia, así
// que al mover cualquier articulación la malla se rompe en púas. Se
// recalculan aquí por distancia a los segmentos óseos.
//
// Cada entrada define el tramo de hueso que "manda" sobre la carne que lo
// rodea: cabeza del hueso → cola. Los extremos (cráneo, manos, dedos) no
// tienen hijo, así que se prolongan en la dirección del hueso anterior.
const LIMB = (side) => [
  { bone: `${side}_Clavicle`, head: 'Spine02', tail: `${side}_UpperarmTwist01` },
  { bone: `${side}_UpperarmTwist01`, tail: `${side}_UpperarmTwist02` },
  { bone: `${side}_UpperarmTwist02`, tail: `${side}_ForearmTwist01` },
  { bone: `${side}_ForearmTwist01`, tail: `${side}_ForearmTwist02` },
  { bone: `${side}_ForearmTwist02`, tail: `${side}_Hand` },
  { bone: `${side}_Hand`, from: `${side}_ForearmTwist02`, extend: 0.9 },
  { bone: `${side}_ThighTwist01`, tail: `${side}_ThighTwist02` },
  { bone: `${side}_ThighTwist02`, tail: `${side}_CalfTwist01` },
  { bone: `${side}_CalfTwist01`, tail: `${side}_CalfTwist02` },
  { bone: `${side}_CalfTwist02`, tail: `${side}_Foot` },
  { bone: `${side}_Foot`, tail: `${side}_ToeBase` },
  { bone: `${side}_ToeBase`, from: `${side}_Foot`, extend: 1.0 },
];

const SEGMENTS = [
  // La pelvis cuelga del Waist: su tramo arranca entre las dos caderas
  { bone: 'Waist', headMid: ['L_ThighTwist01', 'R_ThighTwist01'], tail: 'Spine01' },
  { bone: 'Spine01', tail: 'Spine02' },
  { bone: 'Spine02', tail: 'NeckTwist01' },
  { bone: 'NeckTwist01', tail: 'NeckTwist02' },
  { bone: 'NeckTwist02', tail: 'Head' },
  { bone: 'Head', from: 'NeckTwist02', extend: 2.2 }, // el cráneo entero
  ...LIMB('L'),
  ...LIMB('R'),
];

const MAX_INFLUENCES = 4;
const FALLOFF = 4; // exponente: más alto = piel más rígida por hueso

// Distancia de un punto al segmento ab
function distToSegment(p, a, b, ab, ap) {
  ab.subVectors(b, a);
  ap.subVectors(p, a);
  const len2 = ab.lengthSq();
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ap.dot(ab) / len2)) : 0;
  return Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t, ap.z - ab.z * t);
}

function reskin(skinned, root) {
  const boneIndex = new Map();
  skinned.skeleton.bones.forEach((b, i) => boneIndex.set(b.name, i));

  const nodes = new Map();
  root.traverse((o) => { if (isSkeletonNode(o) && o.name) nodes.set(o.name, o); });
  const worldPos = (name) => {
    const n = nodes.get(name);
    if (!n) return null;
    const v = new THREE.Vector3();
    n.getWorldPosition(v);
    return v;
  };

  // Construir los segmentos en espacio de modelo
  const segs = [];
  for (const s of SEGMENTS) {
    const idx = boneIndex.get(s.bone);
    if (idx === undefined) continue;
    const self = worldPos(s.bone);
    if (!self) continue;
    let head = self;
    if (s.headMid) {
      const a = worldPos(s.headMid[0]);
      const b = worldPos(s.headMid[1]);
      if (a && b) head = a.clone().add(b).multiplyScalar(0.5);
    }
    let tail;
    if (s.tail) {
      tail = worldPos(s.tail);
    } else {
      const prev = worldPos(s.from);
      tail = prev ? self.clone().add(self.clone().sub(prev).multiplyScalar(s.extend)) : null;
    }
    if (!tail) continue;
    segs.push({ idx, head, tail });
  }

  const geo = skinned.geometry;
  const pos = geo.attributes.position;
  const count = pos.count;
  const idxArr = new Uint16Array(count * 4);
  const wArr = new Float32Array(count * 4);

  const p = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();
  const best = [];

  for (let v = 0; v < count; v++) {
    p.fromBufferAttribute(pos, v);
    best.length = 0;
    for (const s of segs) {
      const d = Math.max(distToSegment(p, s.head, s.tail, ab, ap), 1e-4);
      const w = 1 / Math.pow(d, FALLOFF);
      // insertar en el top-4 por peso
      let k = best.length;
      while (k > 0 && best[k - 1].w < w) k--;
      if (k < MAX_INFLUENCES) {
        best.splice(k, 0, { idx: s.idx, w });
        if (best.length > MAX_INFLUENCES) best.length = MAX_INFLUENCES;
      }
    }
    let total = 0;
    for (const b of best) total += b.w;
    for (let c = 0; c < MAX_INFLUENCES; c++) {
      const b = best[c];
      idxArr[v * 4 + c] = b ? b.idx : 0;
      wArr[v * 4 + c] = b ? b.w / total : 0;
    }
  }

  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idxArr, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wArr, 4));
}

function rebindSkeleton(root) {
  let skinned = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) return null;

  const { bones, boneInverses } = skinned.skeleton;

  // 1) Posición de reposo de cada hueso con piel, en el frame de la malla
  const bindPos = new Map();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  bones.forEach((b, i) => {
    m.copy(boneInverses[i]).invert();
    p.setFromMatrixPosition(m);
    bindPos.set(b.name, new THREE.Vector3(-p.z, p.y, p.x)); // R(−90°, Y)
  });

  // 2) Huesos intermedios sin piel: toman la de su proxy
  root.traverse((o) => {
    if (!isSkeletonNode(o) || bindPos.has(o.name)) return;
    const proxy = PROXY[o.name];
    if (proxy && bindPos.has(proxy)) bindPos.set(o.name, bindPos.get(proxy).clone());
  });

  // 3) Repartir como traslaciones locales, sin rotación: el rig queda
  //    alineado a los ejes del modelo. Un nodo sin posición hereda la del padre.
  const assign = (node, parentPos) => {
    const self = bindPos.get(node.name) || parentPos;
    bindPos.set(node.name, self);
    node.position.copy(self).sub(parentPos);
    node.quaternion.identity();
    node.scale.set(1, 1, 1);
    for (const child of node.children) {
      if (isSkeletonNode(child)) assign(child, self);
    }
  };

  const origin = new THREE.Vector3();
  for (const child of root.children) {
    if (isSkeletonNode(child)) assign(child, origin);
  }

  // 4) Esta pose pasa a ser la de bind: la malla vuelve a verse como se modeló
  root.updateMatrixWorld(true);
  skinned.skeleton.calculateInverses();
  skinned.bindMatrix.identity();
  skinned.bindMatrixInverse.identity();

  // 5) Y con los huesos ya en su sitio, repartir la piel entre ellos
  reskin(skinned, root);

  return skinned;
}

let pending = null;

// Carga única y compartida: todos los monstruos clonan el mismo prototipo.
export function loadMonsterModel() {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        const root = gltf.scene;
        const skinned = rebindSkeleton(root);
        if (!skinned) { reject(new Error('el GLB no trae malla con esqueleto')); return; }

        // Altura real de la pose de reposo, para escalar a metros después
        const g = skinned.geometry;
        g.computeBoundingBox();
        const bb = g.boundingBox;
        resolve({ root, height: bb.max.y - bb.min.y, floorY: bb.min.y });
      },
      undefined,
      reject
    );
  });
  return pending;
}

// Una instancia lista para la escena: clon del esqueleto, materiales propios
// (cada monstruo varía de tono) y escalada a la altura pedida en metros.
// El modelo mira a +Z; se gira para que el frente del grupo sea −Z, que es la
// convención que usa el juego para orientar a los personajes.
export function createMonsterInstance(proto, { height, rand }) {
  const root = cloneSkeleton(proto.root);
  const s = height / proto.height;

  const holder = new THREE.Group();
  root.scale.setScalar(s);
  root.position.y = -proto.floorY * s; // plantar los pies en y = 0
  root.rotation.y = Math.PI;
  holder.add(root);

  // Carne enfermiza: el mapa del modelo, oscurecido y desaturado para que
  // solo se lea bajo un foco o el haz de la linterna.
  const tone = 0.22 + rand() * 0.05;
  const bones = new Map();
  root.traverse((o) => {
    if (isSkeletonNode(o) && o.name) bones.set(o.name, o);
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.material = o.material.clone();
    o.material.color.setScalar(tone);
    o.material.roughness = 0.88;
    o.material.metalness = 0;
    o.castShadow = true;
    o.frustumCulled = false; // la deformación se sale del bbox de reposo
    if (o.isSkinnedMesh) {
      o.bindMatrix.identity();
      o.bindMatrixInverse.identity();
    }
  });

  return { holder, root, bones };
}
