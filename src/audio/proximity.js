// ── Adelanto mínimo de la Fase 2 ──
// Sin ninguna pista sonora, morir se sentiría injusto ("el juego hizo
// trampa", justo lo que el GDD prohíbe). Este módulo sintetiza SOLO los
// pasos del monstruo (volumen por distancia, paneo por dirección) y el
// clic de la linterna. El sistema completo de audio espacial llega en Fase 2.
// Se puede apagar con CONFIG.AUDIO.enabled = false.

export class ProximityAudio {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.stepT = 0;
    this.dead = false;
  }

  init() {
    if (this.ctx || !this.cfg.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.cfg.masterVolume;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ctx?.resume?.();
  }

  // Muerte y victoria: silencio (GDD)
  silence() {
    this.dead = true;
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  click() {
    if (!this.ctx || this.dead) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.06);
  }

  thump(pan, vol) {
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, t0);
    o.frequency.exponentialRampToValueAtTime(28, t0 + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.26);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.master);
    } else {
      o.connect(g).connect(this.master);
    }
    o.start(t0);
    o.stop(t0 + 0.3);
  }

  update(dt, monster, player) {
    if (!this.ctx || this.dead) return;
    const d = monster.distanceToPlayer;
    if (d > this.cfg.maxDistance || !monster.isMoving) return;

    const interval =
      monster.state === 'HUNT' ? 0.3 : monster.state === 'IDLE' ? 0.64 : 0.48;
    this.stepT -= dt;
    if (this.stepT > 0) return;
    this.stepT = interval;

    // Paneo según el ángulo del monstruo respecto a la mirada del jugador
    const dx = monster.group.position.x - player.position.x;
    const dz = monster.group.position.z - player.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const yaw = player.yaw;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const pan = Math.max(-1, Math.min(1, (dx / len) * rightX + (dz / len) * rightZ));

    const base = 1 - d / this.cfg.maxDistance;
    const vol = base * base * (monster.state === 'HUNT' ? 0.5 : 0.26);
    this.thump(pan, Math.max(0.02, vol));
  }
}
