// Player settings, kept per browser.
const KEY = 'brinebound-settings';
export const QUALITY = {
  low: { shadows: 0, ratio: 1.25, clouds: true },
  medium: { shadows: 1024, ratio: 1.5, clouds: true },
  high: { shadows: 2048, ratio: 2, clouds: true },
};
export const VIEW = { near: 100, normal: 140, far: 180 };
export class Settings {
  constructor(isTouch) {
    this.isTouch = isTouch;
    this.v = { quality: 'auto', view: 'normal', sens: 1, invertY: false, fov: 72, volume: 0.8, music: true, fps: false, camera: 'first' };
    try { const s = localStorage.getItem(KEY); if (s) Object.assign(this.v, JSON.parse(s)); } catch (e) { /* storage unavailable */ }
  }
  get(k) { return this.v[k]; }
  set(k, val) { this.v[k] = val; this.save(); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) { /* storage unavailable */ } }
  qualityName() { return this.v.quality === 'auto' ? (this.isTouch ? 'low' : 'medium') : this.v.quality; }
  preset() {
    const q = QUALITY[this.qualityName()] || QUALITY.medium;
    return { ...q, view: (VIEW[this.v.view] || VIEW.normal) * (this.qualityName() === 'low' ? 0.85 : 1) };
  }
}
