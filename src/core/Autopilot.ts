import { GameEngine } from './GameEngine.js';

type Step = {
  tick: (dt: number) => boolean; // return true when complete
  onStop?: () => void;           // called if user stops the script
  onComplete?: (remaining: number) => void; // called when step finishes
};

export class Autopilot {
  private engine: GameEngine;
  private queue: Step[] = [];
  private running = false;
  private logFn: ((msg: string) => void) | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  setLogger(fn: (msg: string) => void) { this.logFn = fn; }
  private log(msg: string) { if (this.logFn) this.logFn(msg); }

  update(dt: number): void {
    if (!this.running || this.queue.length === 0) return;
    const step = this.queue[0];
    const done = step.tick(dt);
    if (done) {
      this.queue.shift();
      step.onComplete?.(this.queue.length);
      if (this.queue.length === 0) {
        // Script finished: release holds and restore speed so
        // keyboard/manual controls feel normal again.
        this.running = false;
        this.engine.setAutopilotHold('none');
        this.engine.setGameSpeed(1);
        this.log?.('> script complete');
      }
    }
  }

  stop(): void {
    if (this.queue.length && this.queue[0].onStop) this.queue[0].onStop!();
    this.queue = [];
    this.running = false;
    // release any holds
    this.engine.setAutopilotHold('none');
  }

  isRunning(): boolean { return this.running && this.queue.length > 0; }

  runScript(text: string): void {
    this.stop();
    // Split helpers: support '////', 'then', and implicit splits before keywords
    let normalized = text.replace(/\s*\/\/\/\/\s*/g, '\n');
    normalized = normalized.replace(/\bthen\b/gi, '\n');
    // Split before most keywords, but NOT before 'until' because it belongs
    // with the previous token (e.g., 'throttle 1 until apoapsis ...' or
    // 'wait until apoapsis').
    const keywords = ['ignite','ignit','start','engine on','cut','engine off','stop','hold','throttle','wait','burn_until','pitch'];
    for (const kw of keywords) {
      const re = new RegExp(`(?!^)\\b${kw.replace(' ', '\\s+')}\\b`, 'gi');
      normalized = normalized.replace(re, (m)=>`\n${m}`);
    }
    const lines = normalized.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    let ok = true;
    for (const line of lines) ok = this.enqueueCommand(line) && ok;
    if (!ok) {
      this.log('ERR: Script has errors; nothing started.');
      this.queue = [];
      this.running = false;
      return;
    }
    this.running = this.queue.length > 0;
    this.log(`Queued ${this.queue.length} steps.`);
  }

  runCommand(cmd: string): void {
    let normalized = cmd.replace(/\s*\/\/\/\/\s*/g, '\n');
    normalized = normalized.replace(/\bthen\b/gi, '\n');
    const keywords = ['ignite','ignit','start','engine on','cut','engine off','stop','hold','throttle','wait','burn_until','pitch'];
    for (const kw of keywords) {
      const re = new RegExp(`(?!^)\\b${kw.replace(' ', '\\s+')}\\b`, 'gi');
      normalized = normalized.replace(re, (m)=>`\n${m}`);
    }
    const parts = normalized.split(/\n+/).map(p=>p.trim()).filter(Boolean);
    let ok = true;
    for (const p of parts) ok = this.enqueueCommand(p) && ok;
    if (!ok) {
      this.log('ERR: Command has errors; nothing started.');
      return;
    }
    this.running = this.queue.length > 0;
  }

  private enqueueCommand(cmd: string): boolean {
    // Simple parse: tokens by space, lowercase keyword
    const raw = cmd.replace(/#/g,'//').split('//')[0].trim();
    if (!raw) return true;
    const lower = raw.toLowerCase();
    if (lower.startsWith('throttle')) {
      const m = raw.match(/throttle\s+([0-9.]+)/i);
      const val = m ? Math.max(0, Math.min(1, parseFloat(m[1]))) : 0;
      if (!m || isNaN(val)) {
        this.log(`ERR: throttle expects a number 0..1 (in: "${raw}")`);
        return false;
      }
      this.queue.push({ tick: () => { this.engine.setThrottle(val); this.log(`throttle ${val}`); return true; } });
      return true;
    }
    if (lower === 'ignite' || lower === 'ignit' || lower === 'engine on' || lower === 'start') {
      this.queue.push({ tick: () => { this.engine.igniteEngines(); this.log('ignite'); return true; } });
      return true;
    }
    if (lower === 'cut' || lower === 'engine off' || lower === 'stop') {
      this.queue.push({ tick: () => { this.engine.cutEngines(); this.log('cut'); return true; } });
      return true;
    }
    if (lower === 'stage') {
      this.queue.push({ tick: () => { this.engine.performStaging(); this.log('stage'); return true; } });
      return true;
    }
    if (lower.startsWith('wait')) {
      // wait N  OR  wait until apoapsis/periapsis
      const m = raw.match(/wait\s+([0-9.]+)/i);
      const muApo = /wait\s+until\s+apoapsis/i.test(raw);
      const muPeri = /wait\s+until\s+periapsis/i.test(raw);
      const muAlt = raw.match(/wait\s+until\s+altitude\s+([0-9_.]+)/i);
      const muStage = /wait\s+until\s+stage\s+(empty|depleted)/i.test(raw);
      if (muApo) { this.queue.push(this.waitApo()); return true; }
      if (muPeri) { this.queue.push(this.waitPeri()); return true; }
      if (muStage) { this.queue.push(this.waitStageEmpty()); return true; }
      if (muAlt) {
        const targ = parseFloat(muAlt[1].replace(/_/g, ''));
        if (!isFinite(targ)) { this.log(`ERR: wait until altitude expects a number (in: "${raw}")`); return false; }
        this.queue.push(this.waitAlt(targ));
        return true;
      }
      let time = m ? parseFloat(m[1]) : NaN;
      if (!m || isNaN(time)) {
        this.log(`ERR: wait expects seconds or "wait until apoapsis|periapsis|altitude N" (in: "${raw}")`);
        return false;
      }
      this.queue.push({ tick: (dt)=>{ time -= dt; return time <= 0; } });
      return true;
    }
    if (lower.startsWith('hold')) {
      const m = raw.match(/hold\s+(prograde|retrograde|up|none)/i);
      const mode = (m ? m[1] : 'none').toLowerCase() as any;
      this.queue.push({ tick: ()=>{ this.engine.setAutopilotHold(mode); this.log(`hold ${mode}`); return true; } });
      return true;
    }
    if (lower.startsWith('pitch')) {
      // pitch east 5  |  pitch west 5
      const m = raw.match(/pitch\s+(east|west)\s+([0-9.]+)/i);
      if (!m) { this.log(`ERR: pitch expects 'pitch east|west <deg>' (in: "${raw}")`); return false; }
      const dir = m[1].toLowerCase();
      const deg = parseFloat(m[2]);
      if (!isFinite(deg)) { this.log(`ERR: pitch angle invalid (in: "${raw}")`); return false; }
      const signed = dir === 'east' ? -Math.abs(deg) : Math.abs(deg);
      this.queue.push({ tick: ()=>{ this.engine.setAutopilotTargetAngle(signed); this.log(`pitch ${dir} ${deg}`); return true; } });
      return true;
    }
    // until apoapsis >= 100000 then throttle 0.3
    if (lower.startsWith('until apoapsis')) {
      // If a number is provided, burn/wait until target apoapsis; otherwise wait until reaching apoapsis
      const mv = raw.match(/apoapsis\s*(?:=|>=|<=)?\s*([0-9_.]+)/i);
      const mt = raw.match(/throttle\s*([0-9.]+)/i);
      const target = mv ? parseFloat(mv[1].replace(/_/g,'')) : NaN;
      const thr = mt ? Math.max(0, Math.min(1, parseFloat(mt[1]))) : undefined;
      if (!isFinite(target)) {
        // No number: interpret as waiting until passing apoapsis
        this.queue.push(this.waitApo());
        return true;
      }
      this.queue.push(this.untilApo(target, thr));
      return true;
    }
    // until stage empty|depleted
    if (lower.startsWith('until stage')) {
      if (/until\s+stage\s+(empty|depleted)/i.test(raw)) {
        this.queue.push(this.waitStageEmpty());
        return true;
      }
      this.log(`ERR: until stage expects 'empty|depleted' (in: "${raw}")`);
      return false;
    }
    // burn_until apoapsis 120000 throttle 0.6
    if (lower.startsWith('burn_until apoapsis')) {
      const mv = raw.match(/apoapsis\s*([0-9_.]+)/i);
      const mt = raw.match(/throttle\s*([0-9.]+)/i);
      const target = mv ? parseFloat(mv[1].replace(/_/g,'')) : NaN;
      const thr = mt ? Math.max(0, Math.min(1, parseFloat(mt[1]))) : 1.0;
      if (!isFinite(target)) {
        this.log(`ERR: burn_until apoapsis expects a number (in: "${raw}")`);
        return false;
      }
      this.queue.push(this.untilApo(target, thr));
      return true;
    }
    if (lower.startsWith('until periapsis')) {
      const mv = raw.match(/periapsis\s*(?:=|>=|<=)?\s*([0-9_.]+)/i);
      const mt = raw.match(/throttle\s*([0-9.]+)/i);
      const target = mv ? parseFloat(mv[1].replace(/_/g,'')) : NaN;
      const thr = mt ? Math.max(0, Math.min(1, parseFloat(mt[1]))) : undefined;
      if (!isFinite(target)) {
        // no number -> wait until periapsis pass (when radial velocity > 0)
        this.queue.push(this.waitPeri());
        return true;
      }
      this.queue.push(this.untilPeri(target, thr));
      return true;
    }
    // until twr <= X  [then throttle Y]
    if (lower.startsWith('until twr')) {
      const m = raw.match(/twr\s*([<>]=?)\s*([0-9.]+)/i);
      const mt = raw.match(/throttle\s*([0-9.]+)/i);
      if (m) {
        const op = m[1]; const val = parseFloat(m[2]);
        const thr = mt ? Math.max(0, Math.min(1, parseFloat(mt[1]))) : undefined;
        if (!isFinite(val)) { this.log(`ERR: until twr expects a number (in: "${raw}")`); return false; }
        this.queue.push(this.untilTwr(op, val, thr));
        return true;
      }
      this.log(`ERR: until twr expects '<= or >=' then a number (in: "${raw}")`);
      return false;
    }
    this.queue.push({ tick: ()=>{ this.log(`ERR: Unknown command: ${raw}`); return true; } });
    return false;
  }

  private untilApo(target: number, thr?: number): Step {
    let prev = Number.NaN;
    return {
      tick: (_dt) => {
        if (!isFinite(target)) return true;
        if (typeof thr === 'number') this.engine.setThrottle(thr);
        if (!this.engine.isEngineOn() && (thr ?? 0) > 0) this.engine.igniteEngines();
        const apo = this.engine.getApoapsisAltitude();
        // If already above target, stop immediately if it is increasing (moving away)
        if (apo >= target) {
          if (!Number.isNaN(prev) && apo > prev + 0.01) {
            return true; // increasing away from target -> stop immediately
          }
          // If not increasing and has dropped to target or below, stop
          if (!Number.isNaN(prev) && apo <= target) {
            return true;
          }
        }
        prev = apo;
        // Normal case: continue until reaches target
        if (apo >= target) return true;
        return false;
      },
      onComplete: (remaining) => {
        if (remaining === 0) this.engine.cutEngines();
      },
    };
  }

  private untilTwr(op: string, val: number, thr?: number): Step {
    const cmp = (x: number) => op === '<=' ? x <= val : op === '>=' ? x >= val : false;
    return {
      tick: (_dt) => {
        if (typeof thr === 'number') this.engine.setThrottle(thr);
        const twr = this.engine.getCurrentTWR();
        return cmp(twr);
      },
    };
  }

  private untilPeri(target: number, thr?: number): Step {
    let prev = Number.NaN;
    return {
      tick: (_dt) => {
        if (!isFinite(target)) return true;
        if (typeof thr === 'number') this.engine.setThrottle(thr);
        if (!this.engine.isEngineOn() && (thr ?? 0) > 0) this.engine.igniteEngines();
        const p = this.engine.getPeriapsisAltitude();
        if (p >= target) {
          if (!Number.isNaN(prev) && p > prev + 0.01) {
            return true; // increasing away when already above target -> stop
          }
          if (!Number.isNaN(prev) && p <= target) {
            return true;
          }
        }
        prev = p;
        if (p >= target) return true;
        return false;
      },
      onComplete: (remaining) => {
        if (remaining === 0) this.engine.cutEngines();
      },
    };
  }

  // Wait until passing apoapsis (radial velocity becomes negative)
  private waitApo(): Step {
    let boosted = false;
    return {
      tick: (_dt) => {
        if (!boosted) { this.engine.setGameSpeed(10); boosted = true; }
        const v = this.engine.getRadialVelocity();
        // passing apo when v_rad switches from + to -; accept near zero
        return v <= 0;
      },
      onStop: () => { this.engine.setGameSpeed(1); },
      onComplete: () => { this.engine.setGameSpeed(1); },
    };
  }

  // Wait until passing periapsis (radial velocity becomes positive)
  private waitPeri(): Step {
    return {
      tick: (_dt) => {
        const v = this.engine.getRadialVelocity();
        return v >= 0;
      },
    };
  }

  // Wait until altitude >= target (meters)
  private waitAlt(target: number): Step {
    return {
      tick: (_dt) => {
        if (!isFinite(target)) return true;
        const p = this.engine.getAltitude();
        return p >= target;
      },
    };
  }

  // Wait until current stage is empty (fuelRemaining <= ~0)
  private waitStageEmpty(): Step {
    return {
      tick: (_dt) => {
        const f = this.engine.getActiveStageFuel();
        if (!isFinite(f)) return false; // keep waiting if unknown
        return f <= 1; // treat <=1 kg as empty
      },
    };
  }
}
