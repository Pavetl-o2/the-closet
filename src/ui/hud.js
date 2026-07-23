// HUD (GDD): solo batería y una pequeña intensidad de luz. Nada más.
// También administra los overlays de inicio / pausa / muerte / victoria.

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.fill = this.el('battery-fill');
    this.dot = this.el('light-dot');
    this.screens = {
      start: this.el('screen-start'),
      pause: this.el('screen-pause'),
      dead: this.el('screen-dead'),
      win: this.el('screen-win'),
    };
  }

  setBattery(battery, lightLevel) {
    this.fill.style.width = `${Math.round(battery * 100)}%`;
    this.fill.classList.toggle('low', battery <= 0.25);
    this.dot.style.opacity = (0.12 + 0.88 * Math.min(1, lightLevel)).toFixed(2);
  }

  show(name) {
    for (const k in this.screens) {
      this.screens[k].classList.toggle('hidden', k !== name);
    }
  }

  hideAll() {
    for (const k in this.screens) this.screens[k].classList.add('hidden');
  }

  reveal(id) {
    this.el(id).classList.remove('hidden');
  }

  setText(id, text) {
    this.el(id).textContent = text;
  }
}
