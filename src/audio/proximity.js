// ── Adelanto mínimo de la Fase 2 ──
// Sin pistas sonoras morir se sentiría injusto ("el juego hizo trampa",
// justo lo que el GDD prohíbe). Todo se sintetiza con Web Audio (sin assets):
//   · pasos de cada monstruo (volumen por distancia, paneo por dirección)
//   · zumbido grave de presencia + respiración cuando algo está cerca
//   · estridencia cuando una cacería comienza
//   · chapoteo al pisar charcos, golpe sordo al ser atrapado
//   · ambiente: goteos y golpes lejanos ocasionales
// Se puede apagar con CONFIG.AUDIO.enabled = false.

export class ProximityAudio {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.stepTs = [];
    this.breathT = 0;
    this.ambientT = 5;
    this.stingCd = 0;
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

    // Zumbido de presencia: dos senos graves desafinados, siempre sonando
    // con ganancia 0; la cercanía de un monstruo lo abre.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.master);
    for (const f of [41, 47.3]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(this.droneGain);
      o.start();
    }

    // Ruido blanco compartido (respiración, chapoteos, ambiente)
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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

  // Ráfaga de ruido filtrado: base de chapoteos, respiración y ambiente
  noiseBurst({ freq, q = 1, vol, attack = 0.005, decay = 0.2, pan = 0 }) {
    if (!this.ctx || this.dead) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + attack + decay);
    let out = g;
    if (this.ctx.createStereoPanner && pan !== 0) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    src.connect(f).connect(g);
    out.connect(this.master);
    src.start(t0);
    src.stop(t0 + attack + decay + 0.1);
  }

  // Pisar un charco: chapoteo (correr salpica más)
  splash(running) {
    this.noiseBurst({
      freq: 1800 + Math.random() * 600,
      q: 0.8,
      vol: running ? 0.3 : 0.2,
      decay: 0.22 + Math.random() * 0.08,
    });
    this.noiseBurst({ freq: 500, q: 1.2, vol: running ? 0.16 : 0.1, decay: 0.14 });
  }

  // Una cacería comienza: dos glissandos disonantes + ruido. Inconfundible.
  huntSting() {
    if (!this.ctx || this.dead || this.stingCd > 0) return;
    this.stingCd = 2.5;
    const t0 = this.ctx.currentTime;
    for (const [f0, f1] of [[130, 640], [138, 690]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + 0.7);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.9);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 1);
    }
    this.noiseBurst({ freq: 2400, q: 0.6, vol: 0.06, attack: 0.02, decay: 0.5 });
  }

  // Atrapado: un golpe sordo antes del silencio total
  deathSting() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t0);
    o.frequency.exponentialRampToValueAtTime(26, t0 + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.65);
    this.noiseBurst({ freq: 300, q: 0.7, vol: 0.3, attack: 0.01, decay: 0.3 });
  }

  panTo(target, player) {
    const dx = target.x - player.position.x;
    const dz = target.z - player.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const yaw = player.yaw;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    return Math.max(-1, Math.min(1, (dx / len) * rightX + (dz / len) * rightZ));
  }

  update(dt, monsters, player) {
    if (!this.ctx || this.dead) return;
    this.stingCd = Math.max(0, this.stingCd - dt);

    let nearest = null;
    let nearestD = Infinity;
    let anyHunt = false;

    monsters.forEach((mon, i) => {
      const d = mon.distanceToPlayer;
      if (d < nearestD) { nearestD = d; nearest = mon; }
      if (mon.state === 'HUNT') anyHunt = true;

      // pasos por monstruo
      if (this.stepTs[i] === undefined) this.stepTs[i] = 0;
      this.stepTs[i] -= dt;
      if (d > this.cfg.maxDistance || !mon.isMoving || this.stepTs[i] > 0) return;
      this.stepTs[i] =
        mon.state === 'HUNT' ? 0.3 : mon.state === 'IDLE' ? 0.64 : 0.48;
      const base = 1 - d / this.cfg.maxDistance;
      const vol = base * base * (mon.state === 'HUNT' ? 0.5 : 0.26);
      this.thump(this.panTo(mon.group.position, player), Math.max(0.02, vol));
    });

    // Presencia: el zumbido se abre con la cercanía, más si te está cazando
    const dd = this.cfg.droneMaxDistance;
    let droneVol = 0;
    if (nearestD < dd) {
      const x = 1 - nearestD / dd;
      droneVol = x * x * 0.22 * (anyHunt ? 1.7 : 1);
    }
    this.droneGain.gain.setTargetAtTime(droneVol, this.ctx.currentTime, 0.3);

    // Respiración: exhalaciones roncas cuando algo está casi encima
    if (nearest && nearestD < this.cfg.breathDistance) {
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathT = 1.9 + Math.random() * 0.9;
        const closeness = 1 - nearestD / this.cfg.breathDistance;
        this.noiseBurst({
          freq: 420,
          q: 1.6,
          vol: 0.05 + closeness * 0.1,
          attack: 0.12,
          decay: 0.5,
          pan: this.panTo(nearest.group.position, player),
        });
      }
    }

    // Ambiente: goteos y golpes lejanos, escasos, desde direcciones al azar
    if (this.cfg.ambient) {
      this.ambientT -= dt;
      if (this.ambientT <= 0) {
        this.ambientT = 7 + Math.random() * 14;
        const pan = Math.random() * 2 - 1;
        if (Math.random() < 0.55) {
          // goteo: blip corto y metálico
          this.noiseBurst({ freq: 2600 + Math.random() * 1500, q: 8, vol: 0.05, decay: 0.09, pan });
        } else {
          // golpe lejano en la estructura
          this.thump(pan, 0.05 + Math.random() * 0.04);
        }
      }
    }
  }
}
