// Estética PlayStation 1.
//
// Lo que hace que algo "se vea de PS1" no es un filtro de color: son las
// limitaciones del hardware. Aquí se reproducen las que más pesan:
//
//   · Resolución nativa de ~240 líneas, escalada con vecino más cercano y
//     con factor ENTERO, para que cada píxel del juego mida exactamente N
//     píxeles físicos (con factor no entero salen filas de 4 y de 5 px).
//   · Color de 15 bits (32 niveles por canal) con dithering ordenado Bayer
//     4×4, como hacía la consola para disimular el banding.
//   · Vértices anclados a la rejilla de píxeles: la GTE trabajaba en
//     coordenadas enteras de pantalla, y por eso la geometría "tiembla" al
//     moverse la cámara. Se inyecta en todos los materiales.
//   · Texturas sin filtrar (se hace en textures.js).
//
// Lo que NO se reproduce, a propósito: el mapeo afín de texturas. Con el
// suelo y el techo hechos de un único plano gigante, deformaría el laberinto
// entero; la PS1 lo disimulaba subdividiendo la geometría.

import * as THREE from 'three';

// Rejilla de snapping compartida: todos los materiales leen este mismo objeto,
// así que redimensionar actualiza a la vez cada shader ya compilado.
const SNAP = { value: new THREE.Vector2(160, 120) };

let installed = false;

export function installVertexSnap() {
  if (installed) return;
  installed = true;
  // onBeforeCompile vive en el prototipo de Material: sustituirlo ahí lo
  // aplica a todo lo que se compile después, incluidos los clones del
  // monstruo y los materiales que aún no existen.
  THREE.Material.prototype.onBeforeCompile = function psxSnap(shader) {
    // Los mapas de sombra se dejan sin anclar: anclarlos en el espacio de la
    // luz desalinearía sombra y receptor y llenaría todo de acné.
    if (this.isMeshDepthMaterial || this.isMeshDistanceMaterial) return;
    if (!shader.vertexShader.includes('#include <project_vertex>')) return;
    shader.uniforms.psxSnap = SNAP;
    shader.vertexShader = 'uniform vec2 psxSnap;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      if (gl_Position.w > 0.0) {
        vec2 psxNdc = gl_Position.xy / gl_Position.w;
        psxNdc = floor(psxNdc * psxSnap + 0.5) / psxSnap;
        gl_Position.xy = psxNdc * gl_Position.w;
      }`
    );
  };
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uExposure;
  uniform float uLevels;
  uniform float uGrain;
  uniform float uSaturation;
  uniform vec3 uTint;
  uniform float uDanger;
  uniform float uPulse;
  varying vec2 vUv;

  // ACES filmic, idéntico al de three.js: la escena se sigue viendo con el
  // mismo tono que antes, solo que ahora el tone mapping lo hace esta pasada.
  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 inM = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777));
    const mat3 outM = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602));
    color *= uExposure / 0.6;
    color = outM * RRTAndODTFit(inM * color);
    return clamp(color, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  // Matriz de Bayer 4×4 en forma cerrada: 16 umbrales en [0, 1)
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    c = toSRGB(aces(c));

    // Grado de color de la referencia: desaturado y ligeramente sucio
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, uSaturation) * uTint;

    vec2 px = floor(vUv * uRes);

    // Grano de película, animado. Con el peligro sube: la imagen se ensucia
    // cuando algo se acerca.
    float n = hash(px + floor(uTime * 24.0) * vec2(17.0, 31.0)) - 0.5;
    c += n * (uGrain + uDanger * 0.06);

    // Peligro: bordes que se cierran y un pulso rojo con el latido
    vec2 q = vUv - 0.5;
    float vig = smoothstep(0.25, 0.85, length(q * vec2(1.25, 1.0)));
    c *= 1.0 - vig * (0.45 + uDanger * 0.4);
    c = mix(c, c * vec3(1.35, 0.72, 0.68), uPulse * uDanger * 0.55 * vig);

    // Profundidad de color de 15 bits con dithering ordenado
    float d = bayer4(px);
    c = floor(clamp(c, 0.0, 1.0) * uLevels + d) / uLevels;

    gl_FragColor = vec4(c, 1.0);
  }
`;

export class PSXPipeline {
  constructor(renderer, cfg, exposure) {
    this.renderer = renderer;
    this.cfg = cfg;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,   // la escena sigue en HDR hasta el tone mapping
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });

    this.uniforms = {
      tScene: { value: this.rt.texture },
      uRes: { value: new THREE.Vector2(4, 4) },
      uTime: { value: 0 },
      uExposure: { value: exposure },
      uLevels: { value: Math.pow(2, cfg.colorBits) - 1 },
      uGrain: { value: cfg.grain },
      uSaturation: { value: cfg.saturation },
      uTint: { value: new THREE.Color(cfg.tint) },
      uDanger: { value: 0 },
      uPulse: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.post = new THREE.Scene();
    this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.width = 4;
    this.height = 4;
  }

  // Resolución interna con escala entera en píxeles FÍSICOS: cada píxel del
  // juego mide exactamente `scale` píxeles de pantalla, en cualquier DPR.
  resize(viewW, viewH) {
    const dpr = window.devicePixelRatio || 1;
    const devW = viewW * dpr;
    const devH = viewH * dpr;
    const scale = Math.max(1, Math.round(devH / this.cfg.height));
    const w = Math.ceil(devW / scale);
    const h = Math.ceil(devH / scale);

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = `${(w * scale) / dpr}px`;
    canvas.style.height = `${(h * scale) / dpr}px`;

    this.rt.setSize(w, h);
    this.uniforms.uRes.value.set(w, h);
    SNAP.value.set((w / 2) * this.cfg.snap, (h / 2) * this.cfg.snap);
    this.width = w;
    this.height = h;
    this.scale = scale;
  }

  // `overlay`: escena que se dibuja encima con la profundidad borrada (la
  // linterna en la mano), antes de la pasada PS1 para que reciba el mismo
  // tratamiento de color, grano y dithering que el mundo.
  render(scene, camera, time, overlay = null) {
    const r = this.renderer;
    this.uniforms.uTime.value = time;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    if (overlay) renderOverlay(r, overlay, camera);
    r.setRenderTarget(null);
    r.render(this.post, this.postCam);
  }
}

export function renderOverlay(renderer, overlay, camera) {
  const auto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(overlay, camera);
  renderer.autoClear = auto;
}
