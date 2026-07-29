// Detección de dispositivo y perfil de calidad.
//
// Solo hay dos perfiles: escritorio (el original, intacto) y táctil. Todo lo
// que cambia entre plataformas pasa por aquí, así que la versión de escritorio
// no puede romperse por un ajuste pensado para el móvil.
//
// Se puede forzar por URL para probar: ?mode=touch o ?mode=desktop.

import { CONFIG } from '../config.js';

export function detectDevice() {
  const forced = new URLSearchParams(location.search).get('mode');

  const coarse = matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  // Un portátil con pantalla táctil sigue siendo escritorio: se pide puntero
  // grueso Y ausencia de ratón fino.
  const noFinePointer = !(matchMedia?.('(pointer: fine)').matches ?? false);

  let touch = coarse && hasTouch && noFinePointer;
  if (forced === 'touch') touch = true;
  if (forced === 'desktop') touch = false;

  return {
    touch,
    profile: touch ? CONFIG.QUALITY.touch : CONFIG.QUALITY.desktop,
  };
}

// Resolución adaptativa: la palanca más eficaz en móvil, y se ajusta sola.
// Si el frame tarda demasiado baja la resolución; si sobra margen, la sube.
// En escritorio no se instancia (el perfil la deja desactivada).
export class AdaptiveResolution {
  constructor(renderer, profile) {
    this.renderer = renderer;
    this.p = profile;
    this.scale = Math.min(devicePixelRatio, profile.maxPixelRatio);
    this.acc = 0;
    this.frames = 0;
    this.cooldown = 1.5; // margen inicial para que se estabilice
  }

  update(dt) {
    if (!this.p.adaptiveResolution) return;
    if (this.cooldown > 0) { this.cooldown -= dt; return; }

    this.acc += dt;
    this.frames++;
    if (this.frames < 30) return;

    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;

    const cap = Math.min(devicePixelRatio, this.p.maxPixelRatio);
    let next = this.scale;
    if (avg > 0.0215) next = this.scale * 0.88;        // por debajo de ~46 fps
    else if (avg < 0.0135) next = this.scale * 1.06;   // sobra margen: afinar
    next = Math.max(this.p.minPixelRatio, Math.min(cap, next));

    if (Math.abs(next - this.scale) > 0.01) {
      this.scale = next;
      this.renderer.setPixelRatio(next);
      this.cooldown = 0.6; // deja respirar tras el cambio de tamaño
    }
  }
}
