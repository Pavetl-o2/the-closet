// Controles táctiles para móvil en horizontal.
//
// Reparto de la pantalla: mitad izquierda = joystick de movimiento (con
// origen donde caiga el pulgar, no fijo, que es lo que se siente natural en
// un teléfono); mitad derecha = arrastrar para mirar. Encima, dos botones:
// linterna y pausa.
//
// El joystick es analógico: el recorrido del pulgar gradúa la velocidad, y al
// llegar casi al tope se pasa a correr. Eso importa en este juego — correr
// hace ruido y es la diferencia entre escapar y ser oído.
//
// No se instancia nada en escritorio: la capa vive oculta y sin escuchas.

// Capturar el puntero mantiene el gesto vivo aunque el dedo salga de la zona.
// No todos los navegadores lo aceptan siempre; si falla, el gesto sigue
// funcionando mientras el dedo no se salga.
function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* opcional */ }
}

export class TouchControls {
  constructor(cfg, handlers = {}) {
    this.cfg = cfg;
    this.handlers = handlers;

    // Salida que lee el Player
    this.move = { x: 0, z: 0 };
    this.analog = 0;   // 0..1, cuánto se ha desplazado el pulgar
    this.running = false;
    this.lookDx = 0;   // deltas de mirada pendientes de consumir
    this.lookDy = 0;

    this.root = document.getElementById('touch');
    this.stickZone = document.getElementById('stick-zone');
    this.lookZone = document.getElementById('look-zone');
    this.base = document.getElementById('stick-base');
    this.knob = document.getElementById('stick-knob');

    this.stickId = null;
    this.lookId = null;
    this.origin = { x: 0, y: 0 };
    this.lastLook = { x: 0, y: 0 };
    this.enabled = false;

    this.bind();
  }

  bind() {
    const z = this.stickZone;
    z.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.stickId !== null) return;
      this.stickId = e.pointerId;
      capture(z, e.pointerId);
      this.origin.x = e.clientX;
      this.origin.y = e.clientY;
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('active');
      this.setKnob(0, 0);
      e.preventDefault();
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      this.updateStick(e.clientX - this.origin.x, e.clientY - this.origin.y);
      e.preventDefault();
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.move.x = 0;
      this.move.z = 0;
      this.analog = 0;
      this.running = false;
      this.base.classList.remove('active');
      this.setKnob(0, 0);
    };
    z.addEventListener('pointerup', endStick);
    z.addEventListener('pointercancel', endStick);

    const l = this.lookZone;
    l.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.lookId !== null) return;
      this.lookId = e.pointerId;
      capture(l, e.pointerId);
      this.lastLook.x = e.clientX;
      this.lastLook.y = e.clientY;
      e.preventDefault();
    });
    l.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.lookDx += e.clientX - this.lastLook.x;
      this.lookDy += e.clientY - this.lastLook.y;
      this.lastLook.x = e.clientX;
      this.lastLook.y = e.clientY;
      e.preventDefault();
    });
    const endLook = (e) => {
      if (e.pointerId !== this.lookId) return;
      this.lookId = null;
    };
    l.addEventListener('pointerup', endLook);
    l.addEventListener('pointercancel', endLook);

    const btn = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.enabled) fn();
      });
    };
    btn('btn-light', () => this.handlers.onLight?.());
    btn('btn-pause', () => this.handlers.onPause?.());
  }

  updateStick(dx, dy) {
    const r = this.cfg.touchStickRadius;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, r);
    const nx = len > 1e-3 ? (dx / len) * clamped : 0;
    const ny = len > 1e-3 ? (dy / len) * clamped : 0;
    this.setKnob(nx, ny);

    this.analog = clamped / r;
    // Zona muerta pequeña: evita derivar con el pulgar apenas apoyado
    if (this.analog < 0.12) {
      this.move.x = 0;
      this.move.z = 0;
      this.analog = 0;
      this.running = false;
      return;
    }
    // Dirección normalizada; hacia arriba en pantalla = hacia adelante
    this.move.x = nx / clamped;
    this.move.z = -ny / clamped;
    this.running = this.analog >= this.cfg.touchRunAt;
  }

  setKnob(x, y) {
    this.knob.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  // El bucle principal consume los deltas acumulados y los deja a cero
  consumeLook() {
    const dx = this.lookDx;
    const dy = this.lookDy;
    this.lookDx = 0;
    this.lookDy = 0;
    return [dx, dy];
  }

  setVisible(v) {
    this.enabled = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.stickId = null;
      this.lookId = null;
      this.move.x = 0;
      this.move.z = 0;
      this.analog = 0;
      this.running = false;
      this.lookDx = 0;
      this.lookDy = 0;
      this.base.classList.remove('active');
    }
  }
}
