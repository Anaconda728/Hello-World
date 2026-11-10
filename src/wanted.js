// Wanted level. Unprovoked violence raises heat; patrol drones hunt you while stars are lit.
// Lose them by breaking contact (faster hidden in a dark alley), paying to wipe your record
// at a Data Spire or Chrome Clinic, or flatlining.
export const CRIME = {
  robot: { hit: 0.6, kill: 1.0 },
  ped: { hit: 1.0, kill: 1.2 },
  gang: { hit: 0.45, kill: 0.6 },  // only when they weren't already fighting you
  drone: { hit: 0.5, kill: 1.3 },
};

export class Wanted {
  constructor(ui) {
    this.ui = ui;
    this.heat = 0;
    this.evade = 0;
    this.seen = false;
  }
  get stars() { return Math.min(5, Math.floor(this.heat)); }
  evadeNeeded() { return 10 + this.stars * 4; }

  crime(amount, witnessed) {
    const before = this.stars;
    this.heat = Math.min(5.99, this.heat + amount * (witnessed ? 1 : 0.5));
    this.evade = 0;
    if (this.stars > before) {
      this.ui.alert(this.stars === 1 ? '◉ WANTED' : `◉ WANTED LEVEL ${this.stars}`, this.stars >= 3 ? 'Heavy enforcer drones dispatched' : 'Patrol drones are hunting you');
    }
  }

  // seen: any pursuer currently has eyes on you. hidden: you're inside a dark alley.
  update(dt, seen, hidden) {
    this.seen = seen;
    if (this.stars === 0) { this.heat = Math.max(0, this.heat - dt * 0.08); this.evade = 0; return; }
    if (seen) { this.evade = 0; return; }
    this.evade += dt * (hidden ? 3 : 1);
    if (this.evade >= this.evadeNeeded()) {
      this.heat = this.stars - 1 + 0.5;
      if (this.stars === 0) { this.heat = 0; this.ui.alert('✔ WANTED CLEARED', 'You lost them'); }
      else this.ui.toast(`Wanted level down to ${this.stars}`, true);
      this.evade = 0;
    }
  }
  clear() { this.heat = 0; this.evade = 0; }
  wipeCost() { return 600 * this.stars; }
}
