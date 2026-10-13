/**
 * Lightweight perf monitor: EMA fps + segment cost, with auto-degrade callback.
 * No dependencies; safe to call every frame.
 */

export class PerfMonitor {
  constructor({ onDegrade = null } = {}) {
    this.onDegrade = onDegrade;
    this.frames = 0;
    this.fps = 60;
    this._lastFpsT = 0;
    this.avgSegMs = 0;
    this.avgRenderMs = 0;
    this.degraded = false;
    this._lowSince = 0;
  }

  beginFrame(now) {
    if (!this._lastFpsT) this._lastFpsT = now;
    return now;
  }

  endFrame(now, start) {
    const dt = now - start;
    // EMA render cost
    this.avgRenderMs = this.avgRenderMs ? this.avgRenderMs * 0.9 + dt * 0.1 : dt;
    this.frames++;
    const elapsed = now - this._lastFpsT;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frames * 1000) / elapsed);
      this.frames = 0;
      this._lastFpsT = now;
      this._checkAutoDegrade(now);
    }
  }

  recordSeg(ms) {
    this.avgSegMs = this.avgSegMs ? this.avgSegMs * 0.85 + ms * 0.15 : ms;
  }

  _checkAutoDegrade(now) {
    if (this.degraded || !this.onDegrade) return;
    // Sustained low fps + heavy frames -> ask host app to drop a tier
    const slow = this.fps < 22 && this.avgRenderMs > 24;
    if (slow) {
      if (!this._lowSince) this._lowSince = now;
      if (now - this._lowSince > 4000) {
        this.degraded = true;
        try { this.onDegrade({ fps: this.fps, avgRenderMs: this.avgRenderMs }); } catch {}
      }
    } else {
      this._lowSince = 0;
    }
  }

  snapshot() {
    return {
      fps: this.fps,
      avgSegMs: Math.round(this.avgSegMs * 10) / 10,
      avgRenderMs: Math.round(this.avgRenderMs * 10) / 10,
      degraded: this.degraded,
    };
  }
}
