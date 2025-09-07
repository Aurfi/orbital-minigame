import type { GameState, RocketState } from '../core/types.js';
import { calculateTerminalVelocity } from '../physics/AtmosphericPhysics.js';
import { Vector2 } from '../physics/Vector2.js';
import type { CanvasRenderer } from '../rendering/CanvasRenderer.js';
import { getPlanetTexture } from '../rendering/PlanetTextureGen.js';

export class HUDSystem {
  private canvas: HTMLCanvasElement;
  public restartButtonBounds?: { x: number; y: number; width: number; height: number };
  public confirmYesBounds?: { x: number; y: number; width: number; height: number };
  public confirmNoBounds?: { x: number; y: number; width: number; height: number };
  private _modeConfirm?: { pending: boolean; targetAuto: boolean };
  // Cached mini planet texture
  private miniPlanetTex?: HTMLCanvasElement;
  private miniAngle = 0;
  // Mini-map trajectory caching
  private cachedPath: Array<{ x: number; y: number }> | null = null;
  private lastProjTimeMs = 0;
  private lastVel: { x: number; y: number } | null = null;
  private lastStage = -1;
  private lastThrusting = false;
  private cachedInfo: {
    apoAlt: number;
    apoPos: { x: number; y: number } | null;
    periAlt: number;
    periPos: { x: number; y: number } | null;
    stableOrbit: boolean;
  } | null = null;
  // No continent geometry; all land with polar cap only

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Cache mini planet texture
    this.miniPlanetTex = getPlanetTexture(256);
  }

  // Expose last projected apo/peri data for other systems (e.g., autopilot)
  getLastProjectedInfo(): { apoAlt: number; periAlt: number } | null {
    if (this.cachedInfo) {
      return { apoAlt: this.cachedInfo.apoAlt, periAlt: this.cachedInfo.periAlt };
    }
    return null;
  }

  /**
   * Render the HUD overlay with flight data
   */
  render(renderer: CanvasRenderer, gameState: GameState, missionTimer?: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Save current transformation state
    ctx.save();

    // Reset transformation to screen coordinates for HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Calculate flight data (base altitude at engine exit)
    const pos = gameState.rocket.position;
    const rmag = pos.magnitude();
    const exY = gameState.rocket.exhaustY ?? 0; // local Y of stage bottom
    const bottomDistance = Math.max(0, -exY) + 6; // add small nozzle drop
    const altitude = Math.max(0, rmag - gameState.world.planetRadius - bottomDistance);
    // Ground-relative velocity near the surface to avoid showing rotation speed
    const u = rmag > 1e-6 ? new Vector2(pos.x / rmag, pos.y / rmag) : new Vector2(0, 1);
    const tVec = new Vector2(-u.y, u.x);
    const omega = gameState.world.earthRotationRate || 0;
    const groundVel = tVec.multiply(omega * rmag);
    const rawVel = gameState.rocket.velocity;
    const relVel = rawVel.subtract(groundVel);
    const velocity =
      gameState.rocket.isClamped || altitude < 1000 ? relVel.magnitude() : rawVel.magnitude();
    const mass = gameState.rocket.mass;
    const fuel = gameState.rocket.fuel;
    const throttle = gameState.rocket.throttle;

    // Get rocket configuration for TWR and ISP calculations
    const rocket = gameState.rocket;
    let currentTWR = 0;
    let currentISP = 0;

    if (rocket.isEngineIgnited && rocket.throttle > 0) {
      const gravity = gameState.world.getGravitationalAcceleration(
        gameState.rocket.position.magnitude()
      );
      const thrust = rocket.stages[rocket.currentStage]?.thrust || 0;
      const actualThrust = thrust * throttle;
      currentTWR = actualThrust / (mass * gravity);
      currentISP = rocket.stages[rocket.currentStage]?.specificImpulse || 0;
    }

    // UI scale: detect mobile and compute size using CSS pixels (not device pixels)
    const dpr = (typeof window !== 'undefined' && (window.devicePixelRatio || 1)) || 1;
    const cssW =
      (this.canvas as HTMLCanvasElement).clientWidth || Math.round(this.canvas.width / dpr);
    const cssH =
      (this.canvas as HTMLCanvasElement).clientHeight || Math.round(this.canvas.height / dpr);
    const minDim = Math.min(cssW, cssH);
    const isCoarse =
      typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
    const hasTouch =
      typeof navigator !== 'undefined' &&
      'maxTouchPoints' in navigator &&
      (navigator as Navigator & { maxTouchPoints: number }).maxTouchPoints > 0;
    const isMobile = isCoarse || hasTouch;
    let uiScale = 1.0;
    if (isMobile && minDim <= 700) {
      uiScale = 1.8; // smaller than before (was 2.4)
    } else if (isMobile && minDim <= 1000) {
      uiScale = 1.5;
    } else if (!isMobile && minDim <= 1000) {
      uiScale = 1.15; // small tablets / small windows
    } else if (minDim < 1600) {
      uiScale = 1.0; // keep 1.0 between 1200 and 1600
    } else if (minDim < 2000) {
      uiScale = 0.85; // very large screens
    } else {
      uiScale = 0.8; // ultra-wide/4k
    }

    // HUD styling
    ctx.font = `${Math.round(14 * uiScale)}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;

    // Layout metrics
    const panelX = 10;
    const panelY = 10;
    const panelW = 250 * uiScale; // slightly wider to fit "Unsafe" text
    const startY = 24 * uiScale;
    const lineHeight = 18 * uiScale; // tighter line spacing
    const gaugeH = 18 * uiScale;
    // Compute exact height for 9 rows
    const rows = 9;
    const contentBottom = startY + lineHeight * rows;
    const gaugeTopGap = 8 * uiScale;
    const bottomPad = 12 * uiScale;
    const panelH = contentBottom + gaugeTopGap + gaugeH + bottomPad;
    // Draw background panel sized to content
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // Draw flight data
    ctx.fillStyle = '#ffffff';
    let y = startY;

    // Format and display data
    ctx.fillText(`Altitude:   ${this.formatNumber(altitude, 0)} m`, 20, y);
    y += lineHeight;
    // Velocity + safety indicator (color-coded by proximity to atmospheric limit)
    ctx.fillStyle = '#ffffff';
    const velText = `Velocity:   ${this.formatNumber(velocity, 1)} m/s`;
    ctx.fillText(velText, 20, y);

    // Safety indicator based on vMax (derived from terminal velocity)
    const density = gameState.world.getAtmosphericDensity(altitude);
    const gravity = gameState.world.getGravitationalAcceleration(
      gameState.rocket.position.magnitude()
    );
    const cd = rocket.dragCoefficient ?? gameState.world.defaultDragCoefficient ?? 0.3;
    const area = rocket.crossSectionalArea ?? gameState.world.defaultCrossSectionalArea ?? 10;
    const vTerm = calculateTerminalVelocity(mass, density, cd, area, gravity);
    const vMax = (Number.isFinite(vTerm) ? vTerm : 10_000) * 1.25 + 50;
    // Determine label and color: only Safe (green) or Unsafe (orange→red)
    let label = 'Safe';
    let safetyColor = '#00ff66'; // green
    if (altitude < 80_000 && Number.isFinite(vTerm)) {
      const ratio = velocity / Math.max(1, vMax);
      if (ratio > 0.85) {
        label = 'Unsafe';
        // Blend color from orange (#ff9933) at 0.85 up to red (#ff3333) at 1.10
        const t = Math.max(0, Math.min(1, (ratio - 0.85) / (1.1 - 0.85)));
        const mix = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
        const r = mix(0xff, 0xff, t);
        const g = mix(0x99, 0x33, t);
        const b = mix(0x33, 0x33, t);
        safetyColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
    ctx.fillStyle = safetyColor;
    // Place label next to the velocity text, with a small gap; clamp to panel right
    const velW = ctx.measureText(velText).width;
    const gap = 10 * uiScale;
    let labelX = 20 + velW + gap;
    const rightPad = 10;
    const maxX = panelX + panelW - rightPad;
    if (labelX > maxX) labelX = maxX;
    const oldAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    ctx.fillText(label, labelX, y);
    ctx.textAlign = oldAlign;
    // Reset color so only the safety text is colorized
    ctx.fillStyle = '#ffffff';
    y += lineHeight;
    ctx.fillText(`Mass:       ${this.formatNumber(mass, 0)} kg`, 20, y);
    y += lineHeight;
    ctx.fillText(`Throttle:   ${Math.round(throttle * 100)}%`, 20, y);
    y += lineHeight;
    ctx.fillText(`TWR:        ${currentTWR.toFixed(2)}`, 20, y);
    y += lineHeight;
    ctx.fillText(`ISP:        ${Math.round(currentISP)} s`, 20, y);
    y += lineHeight;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Stage:      ${rocket.currentStage + 1}`, 20, y);

    // Engine status indicator
    y += lineHeight;
    const engineStatus = rocket.isEngineIgnited ? 'ON' : 'OFF';
    const statusColor = rocket.isEngineIgnited ? '#00ff00' : '#ff0000';
    ctx.fillStyle = statusColor;
    ctx.fillText(`Engines:    ${engineStatus}`, 20, y);

    // Delta-V estimate (uses current altitude for current-stage Isp; later stages assume vacuum Isp)
    y += lineHeight;
    ctx.fillStyle = '#ffffff';
    const g0 = 9.81;
    // Compute remaining delta-v including staging dry-mass drops
    let dvTotal = 0;
    let mCurrent = mass;
    // Helper to blend Isp based on local density (0..1)
    const densityNow = gameState.world.getAtmosphericDensity(altitude);
    const sea = gameState.world.surfaceDensity;
    const vacBlend = Math.max(0, Math.min(1, 1 - densityNow / Math.max(1e-6, sea)));
    for (let i = rocket.currentStage; i < rocket.stages.length; i++) {
      const st = rocket.stages[i];
      const fuel = Math.max(0, st.fuelRemaining);
      let isp = st.specificImpulse ?? 0;
      if (i === rocket.currentStage) {
        // Blend between sea-level and vacuum for current stage
        const ispSea = st.seaLevelIsp ?? st.specificImpulse ?? 0;
        const ispVac = st.vacuumIsp ?? st.specificImpulse ?? 0;
        isp = ispSea + (ispVac - ispSea) * vacBlend;
      } else {
        // Assume upper stages burn in thin atmosphere: use vacuum Isp if available
        isp = st.vacuumIsp ?? st.specificImpulse ?? 0;
      }
      if (fuel > 0 && isp > 0) {
        const mAfter = Math.max(1e-6, mCurrent - fuel);
        if (mAfter > 0 && mAfter < mCurrent) {
          dvTotal += isp * g0 * Math.log(mCurrent / mAfter);
          mCurrent = mAfter;
        }
      }
      const hasLater = i < rocket.stages.length - 1;
      if (hasLater) {
        mCurrent = Math.max(1e-6, mCurrent - st.dryMass);
      }
    }
    const dvText =
      dvTotal >= 1000 ? `${(dvTotal / 1000).toFixed(2)} km/s` : `${dvTotal.toFixed(0)} m/s`;
    ctx.fillText(`Delta-V:   ${dvText}`, 20, y);

    // Draw fuel gauge
    y += lineHeight + 12 * uiScale; // add full line spacing before gauge
    // Center a slightly longer gauge within the panel
    const desiredGW = Math.max(180 * uiScale, Math.min(panelW - 30 * uiScale, 220 * uiScale));
    const gaugeX = panelX + (panelW - desiredGW) / 2;
    this.drawFuelGauge(ctx, gaugeX, y, fuel, rocket, gameState, uiScale, desiredGW);

    // Draw mission timer and restart button in top-right corner
    // MENU on top, then Mission timer under it for alignment with orbit view
    this.drawRestartButton(ctx, uiScale);
    this.drawMissionTimer(ctx, missionTimer || 0, uiScale);

    // Confirmation overlay for mode switch
    if (this._modeConfirm?.pending) {
      this.drawModeConfirm(ctx, this._modeConfirm.targetAuto === true);
    }

    // Mini-globe rotation: use world's rotation rate and game time
    const earthAngle = (gameState.currentTime || 0) * gameState.world.earthRotationRate;
    this.miniAngle = earthAngle; // base angle

    // Mini-planet map in bottom-right corner
    this.drawMiniMap(ctx, gameState, uiScale);

    // Controls/Commands help panel (dynamic size). When in Auto Pilot, show a
    // short command cheat sheet to hint the console language.
    ctx.font = `${Math.round(12 * uiScale)}px monospace`;
    const lines = [
      'Controls:',
      'Space - Start Engine',
      'B - Cut Engine',
      'T - Full Throttle',
      'G - Zero Throttle',
      'Up/Down - Throttle ±10%',
      'Left/Right - Turn',
      'S - Stage',
      'Scroll - Zoom',
    ];
    let maxW = 0;
    for (const ln of lines) {
      const w = ctx.measureText(ln).width;
      if (w > maxW) maxW = w;
    }
    const pad = 10;
    const lineH = 15 * uiScale;
    const helpW = Math.ceil(maxW) + pad * 2;
    const helpH = lineH * lines.length + pad * 2;
    const helpX = 10;
    const helpY0 = this.canvas.height - helpH - 20; // start higher and fit content

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(helpX, helpY0, helpW, helpH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(helpX, helpY0, helpW, helpH);

    ctx.fillStyle = '#ffffff';
    let helpY = helpY0 + pad + 12;
    for (const ln of lines) {
      ctx.fillText(ln, panelX + pad, helpY);
      helpY += lineH;
    }
    // Auto-release clamps on ignite; no manual key needed

    // Draw autopilot running indicator at bottom center when scripts are active
    if (gameState.autopilotRunning) {
      const text = 'Auto Pilot Active';
      const margin = 14;
      const padX = 12;
      const h = 22; // fixed height for a steady bar
      ctx.save();
      ctx.font = '14px monospace';
      const metrics = ctx.measureText(text);
      const w = Math.ceil(metrics.width) + padX * 2;
      const x = Math.round((this.canvas.width - w) / 2);
      const y = this.canvas.height - h - margin;
      // Background
      ctx.fillStyle = 'rgba(0, 230, 118, 0.12)';
      ctx.fillRect(x, y, w, h);
      // Border
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // Text
      ctx.fillStyle = '#00e676';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, Math.round(x + w / 2), Math.round(y + h / 2));
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Restore transformation state
    ctx.restore();
  }

  // No-op: previous continent geometry removed

  /**
   * Mini 2D planet view with rocket and projected path
   * Drawn in bottom-right corner as a HUD overlay
   */
  private drawMiniMap(ctx: CanvasRenderingContext2D, gameState: GameState, uiScale = 1): void {
    const margin = Math.round(18 * uiScale);
    const size = Math.max(120, Math.round(160 * uiScale));
    const x = this.canvas.width - size - margin;
    const y = this.canvas.height - size - margin;

    // Panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#88aaff';
    ctx.lineWidth = Math.max(1, Math.round(1 * uiScale));
    ctx.strokeRect(x, y, size, size);

    // Planet disc centered in panel
    const cx = x + size / 2;
    const cy = y + size / 2;
    const planetRadiusWorld = gameState.world.planetRadius;
    const planetRadiusMini = Math.min(size * 0.24, size * 0.26); // smaller earth on HUD
    const panelEdgeRadius = size / 2 - Math.max(4, Math.round(6 * uiScale)); // keep a small border inside the panel

    // Use the same planet texture as the main view, scaled down
    if (this.miniPlanetTex) {
      ctx.save();
      ctx.translate(cx, cy);

      // Get the planet rotation angle from game state
      // Using padBaseAngle + rotation to match the main planet
      // Negate because screen Y is inverted
      const omega = gameState.world.earthRotationRate || 0;
      const padBaseAngle = Math.PI / 2; // Launch island is at top (π/2 radians)
      const worldAng = -(padBaseAngle + omega * gameState.currentTime);
      ctx.rotate(worldAng);

      // Draw the planet texture
      const texSize = planetRadiusMini * 2;
      ctx.drawImage(this.miniPlanetTex, -texSize / 2, -texSize / 2, texSize, texSize);
      ctx.restore();
    } else {
      // Fallback to simple circle if texture not available
      ctx.beginPath();
      ctx.arc(cx, cy, planetRadiusMini, 0, Math.PI * 2);
      ctx.fillStyle = '#0b3766';
      ctx.fill();
      ctx.strokeStyle = '#204f25';
      ctx.stroke();
    }

    // Draw projected trajectory (no thrust/drag). Simple two-body preview
    // over enough time to reveal crash, orbit, or escape.
    const info = this.getProjectedPath(gameState, 8 * 3600, 1.0);
    const pathPreview = this.cachedPath || [];
    // Dynamic outer scale: use the maximum radius in the preview, fallback to apoapsis
    let maxR = planetRadiusWorld;
    for (let i = 0; i < pathPreview.length; i++) {
      const p = pathPreview[i];
      const r = Math.hypot(p.x, p.y);
      if (r > maxR) maxR = r;
    }
    if (info.apoAlt && Number.isFinite(info.apoAlt)) {
      const rA = planetRadiusWorld + Math.max(0, info.apoAlt);
      if (rA > maxR) maxR = rA;
    }
    // Clamp overall outer scale so escape doesn't blow up the map
    const maxDisplayR = Math.min(maxR, planetRadiusWorld * 6);
    // Ensure a comfortable outer scale so near-ground altitudes do not jump too far
    // Set a minimum of ~1000 km to make ~500 km sit near mid-radius.
    const aMaxDynamic = Math.max(1_000_000, maxDisplayR - planetRadiusWorld);

    // Helper: map world (wx, wy) to minimap using logarithmic radial scaling.
    // Log scale keeps far points visible without crushing near ones.
    const worldToMini = (wx: number, wy: number) => {
      const rWorld = Math.hypot(wx, wy);
      const ux = rWorld > 0 ? wx / rWorld : 0;
      const uy = rWorld > 0 ? wy / rWorld : 1; // default up

      // Don't rotate the rocket position - it's already in the correct frame
      // The planet texture is rotated to show the continent at the right position
      // and the rocket world position is already correct
      const alt = Math.max(0, rWorld - planetRadiusWorld);

      // Log radial mapping: 0 -> planet edge, aMaxDynamic -> panel edge.
      // Make early altitudes (e.g., 50 km) stay visually close to the planet.
      // Target: ~50% radius near ~250 km rather than ~50 km.
      const aRef = 250_000; // reference scale: balances near-ground vs orbit
      const tLog = Math.min(1, Math.log1p(alt / aRef) / Math.log1p(aMaxDynamic / aRef));
      // Compress low altitudes so ~500 km is around mid-radius
      const shape = 1.6; // >1 compresses early values
      const tRadial = tLog ** shape;
      const rMini = planetRadiusMini + (panelEdgeRadius - planetRadiusMini) * tRadial;

      // Convert unit vector to mini coords (y-up to screen space)
      const dx = ux * rMini;
      const dy = uy * rMini;
      const sx = cx + dx;
      const sy = cy - dy;
      return { sx, sy };
    };
    const pathPts = this.cachedPath || [];
    if (pathPts.length > 1) {
      const maxDots = 1000; // cap for performance
      const step = Math.max(1, Math.floor(pathPts.length / maxDots));
      const dotR = Math.max(1, 1.1 * uiScale);
      ctx.fillStyle = 'rgba(200,220,255,0.9)';
      for (let i = 0; i < pathPts.length; i += step) {
        const p = worldToMini(pathPts[i].x, pathPts[i].y);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Apoapsis and periapsis markers
      if (info.apoPos) {
        const ap = worldToMini(info.apoPos.x, info.apoPos.y);
        ctx.fillStyle = '#00ff66'; // green
        ctx.beginPath();
        ctx.arc(ap.sx, ap.sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (info.periPos) {
        const pp = worldToMini(info.periPos.x, info.periPos.y);
        ctx.fillStyle = '#ff3333'; // red
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Legend above panel (stacked)
      const apoY = y - Math.round(24 * uiScale);
      const periY = y - Math.round(10 * uiScale);
      ctx.font = `${Math.round(12 * uiScale)}px monospace`;
      // Apoapsis label (green)
      ctx.fillStyle = '#00ff66';
      const apoLabel = Number.isFinite(info.apoAlt)
        ? `${(info.apoAlt / 1000).toFixed(0)} km`
        : '∞ (escape)';
      ctx.fillText(`Apoapsis: ${apoLabel}`, x, apoY);
      // Periapsis label (red)
      ctx.fillStyle = '#ff6666';
      const periLabel = Number.isFinite(info.periAlt)
        ? `${(info.periAlt / 1000).toFixed(0)} km`
        : '—';
      ctx.fillText(`Periapsis: ${periLabel}`, x, periY);

      // Stable orbit notice (place higher so it doesn't overlap apo/peri labels)
      if (info.stableOrbit) {
        ctx.fillStyle = '#00ff99';
        const noticeY = y - Math.round(54 * uiScale);
        ctx.fillText('Stable orbit achieved! 🎉', x, noticeY);
      }
    }

    // Rocket marker as a small X
    const rpos = gameState.rocket.position;
    const m = worldToMini(rpos.x, rpos.y);
    const r = Math.max(3, Math.round(4 * uiScale));
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m.sx - r, m.sy - r);
    ctx.lineTo(m.sx + r, m.sy + r);
    ctx.moveTo(m.sx - r, m.sy + r);
    ctx.lineTo(m.sx + r, m.sy - r);
    ctx.stroke();

    // Label
    ctx.font = `${Math.round(11 * uiScale)}px monospace`;
    ctx.fillStyle = '#a8c0ff';
    ctx.fillText('Orbit view', x + 8, y + 14);
  }

  /**
   * Projected path integrator (simple two-body, no thrust/drag)
   * steps: number of seconds (dtSeconds per step)
   */
  private computeProjectedPath(
    gameState: GameState,
    steps: number,
    dtSeconds: number
  ): Array<{ x: number; y: number }> {
    const mu = gameState.world.gravitationalParameter as unknown as number;
    const out: Array<{ x: number; y: number }> = [];
    // Clone current state
    let rx = gameState.rocket.position.x;
    let ry = gameState.rocket.position.y;
    let vx = gameState.rocket.velocity.x;
    let vy = gameState.rocket.velocity.y;
    const dt = Math.max(0.05, dtSeconds);
    for (let i = 0; i < steps; i++) {
      const r2 = rx * rx + ry * ry;
      const r = Math.sqrt(r2);
      // Stop if would hit the planet
      if (r <= gameState.world.planetRadius) break;
      // Gravity accel: -mu * r_hat / r^2
      const invr3 = 1 / (r2 * r);
      const ax = -mu * rx * invr3;
      const ay = -mu * ry * invr3;
      // Semi-implicit Euler
      vx += ax * dt;
      vy += ay * dt;
      rx += vx * dt;
      ry += vy * dt;
      // Save every step; caller will subsample if needed
      out.push({ x: rx, y: ry });
    }
    return out;
  }

  /**
   * Cached accessor for projected path. Recomputes slowly while coasting in
   * vacuum to keep apoapsis/periapsis steady.
   */
  private getProjectedPath(
    gameState: GameState,
    steps: number,
    dtSeconds: number
  ): {
    apoAlt: number;
    apoPos: { x: number; y: number } | null;
    periAlt: number;
    periPos: { x: number; y: number } | null;
    stableOrbit: boolean;
  } {
    const now = Date.now();
    const thrusting = gameState.rocket.isEngineIgnited && gameState.rocket.throttle > 0;
    const vel = gameState.rocket.velocity;
    const stage = gameState.rocket.currentStage;
    const rmag = gameState.rocket.position.magnitude();
    const altitude = rmag - gameState.world.planetRadius;
    const inVacuumCoast = !thrusting && altitude >= 80_000;

    // Decide if we need to recompute
    let needRecalc = false;

    // Always recompute if we have no cache
    if (!this.cachedPath) needRecalc = true;

    // If thrusting state or stage changed, recompute
    if (this.lastThrusting !== thrusting || this.lastStage !== stage) needRecalc = true;

    // If velocity changed significantly (magnitude or direction), recompute
    if (this.lastVel && !inVacuumCoast) {
      const dvx = vel.x - this.lastVel.x;
      const dvy = vel.y - this.lastVel.y;
      const dv = Math.hypot(dvx, dvy);
      // Thresholds: 0.5 m/s magnitude change triggers recompute
      if (dv > 0.5) needRecalc = true;
      else {
        // Check direction change (~0.5°)
        const v1 = this.lastVel;
        const dot = v1.x * vel.x + v1.y * vel.y;
        const m1 = Math.hypot(v1.x, v1.y);
        const m2 = Math.hypot(vel.x, vel.y);
        if (m1 > 1e-3 && m2 > 1e-3) {
          const c = Math.min(1, Math.max(-1, dot / (m1 * m2)));
          const ang = Math.acos(c); // radians
          if (ang > (0.5 * Math.PI) / 180) needRecalc = true; // >0.5°
        }
      }
    } else {
      needRecalc = true;
    }

    // Rate limiting: 1 Hz normally, 0.1 Hz when coasting in vacuum to keep apo/peri steady
    const minInterval = inVacuumCoast ? 10_000 : 1000;
    if (!needRecalc && now - this.lastProjTimeMs < minInterval && this.cachedInfo)
      return this.cachedInfo;

    // If not thrusting and velocity hasn't changed and we have cache, keep it
    if (!needRecalc && this.cachedInfo) return this.cachedInfo;

    // Recompute
    const res = this.computeProjectedPathInfo(gameState, steps, dtSeconds);
    const path = res.points;
    this.cachedPath = path;
    this.lastProjTimeMs = now;
    this.lastVel = { x: vel.x, y: vel.y };
    this.lastStage = stage;
    this.lastThrusting = thrusting;
    this.cachedInfo = {
      apoAlt: res.apoAlt,
      apoPos: res.apoPos,
      periAlt: res.periAlt,
      periPos: res.periPos,
      stableOrbit: res.stableOrbit,
    };
    return this.cachedInfo;
  }

  /**
   * Compute trajectory points plus apoapsis/periapsis and stable-orbit detection.
   * Uses orbital elements (eccentricity e, angular momentum h) to get
   * rp = h^2/(μ*(1+e)) and ra = h^2/(μ*(1−e)) when e < 1. If specific energy > 0,
   * apoapsis is infinite (escape).
   */
  private computeProjectedPathInfo(
    gameState: GameState,
    simSeconds: number,
    _dtSeconds: number
  ): {
    points: Array<{ x: number; y: number }>;
    apoAlt: number;
    apoPos: { x: number; y: number } | null;
    periAlt: number;
    periPos: { x: number; y: number } | null;
    stableOrbit: boolean;
  } {
    const mu = gameState.world.gravitationalParameter as unknown as number;
    const R = gameState.world.planetRadius;
    const out: Array<{ x: number; y: number }> = [];

    // Clone current state
    let rx = gameState.rocket.position.x;
    let ry = gameState.rocket.position.y;
    let vx = gameState.rocket.velocity.x;
    let vy = gameState.rocket.velocity.y;

    // Compute instantaneous orbital elements (two-body, no thrust/drag)
    const r0 = Math.hypot(rx, ry);
    const v2_0 = vx * vx + vy * vy;
    const rv = rx * vx + ry * vy;
    const eVecX = (1 / mu) * ((v2_0 - mu / r0) * rx - rv * vx);
    const eVecY = (1 / mu) * ((v2_0 - mu / r0) * ry - rv * vy);
    const eMag = Math.hypot(eVecX, eVecY);
    const h = Math.abs(rx * vy - ry * vx);
    const rp = (h * h) / (mu * (1 + eMag));
    let ra = Number.POSITIVE_INFINITY;
    if (eMag < 1) {
      ra = (h * h) / (mu * (1 - eMag));
    }
    let apoAlt = Number.isFinite(ra) ? Math.max(0, ra - R) : Number.POSITIVE_INFINITY;
    const periAlt = Math.max(0, rp - R);
    let apoPos: { x: number; y: number } | null = null;
    let periPos: { x: number; y: number } | null = null;
    const stableThreshold = 80_000;
    let stableOrbit = eMag < 1 && rp - R > stableThreshold;

    // Adaptive timestep: precise for the first hour, then progressively coarser
    const pickDt = (tSim: number): number => {
      if (tSim < 3600) return 1.0; // first hour: 1 s
      if (tSim < 3 * 3600) return 5.0; // 1–3 h: 5 s
      if (tSim < 6 * 3600) return 15.0; // 3–6 h: 15 s
      return 30.0; // 6–8 h: 30 s
    };

    let lastAngle = Math.atan2(ry, rx);
    let rotAccum = 0; // accumulate angle traversed
    // If we already confirmed a stable ellipse, we can stop early after about one rev

    const escapeRenderRadius = R * 6; // stop rendering once far away if escaping
    let tSim = 0;
    for (;;) {
      const dt = pickDt(tSim);
      if (tSim >= simSeconds) break;
      const r2 = rx * rx + ry * ry;
      const r = Math.sqrt(r2);
      const alt = r - R;
      if (r <= R) break; // collision

      // Track closest/farthest positions for markers only if we don't have analytic ellipse
      if (!Number.isFinite(ra)) {
        // Hyperbolic: apoapsis undefined; keep the farthest point encountered for a marker
        if (!apoPos || r > Math.hypot(apoPos.x, apoPos.y)) {
          apoPos = { x: rx, y: ry };
          apoAlt = alt;
        }
      } else {
        // Elliptic: set approximate apo/peri marker positions near expected radii when crossed
        if (!apoPos && Math.abs(r - ra) < 1000) apoPos = { x: rx, y: ry };
        if (!periPos && Math.abs(r - rp) < 1000) periPos = { x: rx, y: ry };
      }

      // Save point
      out.push({ x: rx, y: ry });

      // Grav accel
      const invr3 = 1 / (r2 * r);
      const ax = -mu * rx * invr3;
      const ay = -mu * ry * invr3;
      // Semi-implicit Euler
      vx += ax * dt;
      vy += ay * dt;
      rx += vx * dt;
      ry += vy * dt;
      tSim += dt;

      // Escape detection (specific orbital energy > 0)
      const v2 = vx * vx + vy * vy;
      const energy = 0.5 * v2 - mu / r; // >0 => hyperbolic escape
      if (energy > 0 && r > escapeRenderRadius) {
        break; // sufficiently far on escape trajectory
      }

      // Angle accumulation for orbit detection
      const ang = Math.atan2(ry, rx);
      let dAng = ang - lastAngle;
      // Wrap to [-pi, pi]
      if (dAng > Math.PI) dAng -= 2 * Math.PI;
      if (dAng < -Math.PI) dAng += 2 * Math.PI;
      rotAccum += Math.abs(dAng);
      lastAngle = ang;

      // If we have completed ~one full revolution on an ellipse with perigee above threshold, stop
      if (!stableOrbit && eMag < 1 && rotAccum >= 2 * Math.PI && rp - R > stableThreshold) {
        stableOrbit = true;
        // draw approximately one full revolution and stop early
        break;
      }
    }
    if (!Number.isFinite(ra)) {
      // No apoapsis in hyperbolic case
      apoAlt = Number.POSITIVE_INFINITY;
    }

    return { points: out, apoAlt, apoPos, periAlt, periPos, stableOrbit };
  }

  /**
   * Format number with appropriate units and precision
   */
  private formatNumber(value: number, decimals = 0): string {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(decimals)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(decimals)}k`;
    }
    return value.toFixed(decimals);
  }

  /**
   * Draw rocket position and attitude indicator
   */
  private drawRocketPositionIndicator(ctx: CanvasRenderingContext2D, gameState: GameState): void {
    const width = 180;
    const height = 120;
    const x = this.canvas.width - width - 20;
    const y = this.canvas.height - height - 20;

    // Background panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // Calculate rocket data
    const rocketPos = gameState.rocket.position;
    const altitude = gameState.world.getAltitude(rocketPos.magnitude());
    const rocketRotation = gameState.rocket.rotation;
    const velocity = gameState.rocket.velocity;

    // Draw ground horizon line
    const horizonY = y + height - 30;
    const centerX = x + width / 2;

    // Ground (brown)
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x + 1, horizonY, width - 2, 30);

    // Sky (gradient blue)
    const gradient = ctx.createLinearGradient(0, y + 1, 0, horizonY);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#4169E1');
    ctx.fillStyle = gradient;
    ctx.fillRect(x + 1, y + 1, width - 2, horizonY - y - 1);

    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 10, horizonY);
    ctx.lineTo(x + width - 10, horizonY);
    ctx.stroke();

    // Draw rocket representation
    this.drawRocketIcon(
      ctx,
      centerX,
      horizonY - 20,
      rocketRotation,
      gameState.rocket.isEngineIgnited
    );

    // Velocity vector arrow
    if (velocity.magnitude() > 1) {
      this.drawVelocityArrow(ctx, centerX, horizonY - 20, velocity, rocketRotation);
    }

    // Attitude and altitude info
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px monospace';

    // Rotation angle (degrees from vertical)
    const rotationDeg = ((rocketRotation * 180) / Math.PI).toFixed(0);
    ctx.fillText(`Attitude: ${rotationDeg}°`, x + 10, y + 15);

    // Velocity magnitude and direction
    const velMag = velocity.magnitude();
    const velAngleDeg = ((Math.atan2(velocity.x, velocity.y) * 180) / Math.PI).toFixed(0);
    ctx.fillText(`Velocity: ${velMag.toFixed(1)} m/s`, x + 10, y + 30);
    ctx.fillText(`Direction: ${velAngleDeg}°`, x + 10, y + 45);

    // Distance from center (position magnitude)
    const distanceFromCenter = rocketPos.magnitude();
    ctx.fillText(`Radius: ${this.formatNumber(distanceFromCenter, 1)} m`, x + 10, y + 60);

    // Label
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('POSITION & ATTITUDE', centerX, y + height - 5);
    ctx.textAlign = 'left'; // Reset
  }

  /**
   * Draw small rocket icon showing orientation
   */
  private drawRocketIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    engineOn: boolean
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Rocket body (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, -8, 4, 16);

    // Rocket nose (orange)
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-2, -12);
    ctx.lineTo(2, -12);
    ctx.closePath();
    ctx.fill();

    // Engine exhaust (if on)
    if (engineOn) {
      ctx.fillStyle = '#ff4500';
      ctx.fillRect(-1, 8, 2, 6);
    }

    // Fins
    ctx.fillStyle = '#666666';
    ctx.fillRect(-3, 4, 2, 4);
    ctx.fillRect(1, 4, 2, 4);

    ctx.restore();
  }

  /**
   * Draw velocity direction arrow
   */
  private drawVelocityArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    velocity: Vector2,
    rocketRotation: number
  ): void {
    const velAngle = Math.atan2(velocity.x, velocity.y);
    const arrowLength = 20;

    ctx.save();
    ctx.translate(x, y);

    // Green velocity arrow
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;

    // Arrow line
    const endX = Math.sin(velAngle) * arrowLength;
    const endY = -Math.cos(velAngle) * arrowLength;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrow head
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(velAngle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, -6);
    ctx.lineTo(3, -6);
    ctx.closePath();
    ctx.fillStyle = '#00ff00';
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  /**
   * Draw fuel gauge for current stage
   */
  private drawFuelGauge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    totalFuel: number,
    rocket: RocketState,
    gameState: GameState,
    uiScale = 1,
    forcedWidth?: number
  ): void {
    const currentStage = rocket.stages[rocket.currentStage];
    if (!currentStage) return;

    const maxFuel = currentStage.propellantMass;
    const currentFuel = currentStage.fuelRemaining;
    const fuelRatio = Math.min(1, Math.max(0, currentFuel / maxFuel));

    // Gauge dimensions
    const gaugeWidth = typeof forcedWidth === 'number' ? forcedWidth : 200 * uiScale;
    const gaugeHeight = 20 * uiScale;

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(14 * uiScale)}px monospace`;
    ctx.fillText(
      `Fuel: ${this.formatNumber(currentFuel, 0)}/${this.formatNumber(maxFuel, 0)} kg`,
      x,
      y - 5
    );

    // Gauge background
    ctx.fillStyle = '#333333';
    ctx.fillRect(x, y, gaugeWidth, gaugeHeight);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, gaugeWidth, gaugeHeight);

    // Fuel bar - color coded
    const fuelBarWidth = gaugeWidth * fuelRatio;
    let fuelColor: string;

    if (fuelRatio > 0.5) {
      fuelColor = '#00ff00'; // Green - good
    } else if (fuelRatio > 0.2) {
      fuelColor = '#ffff00'; // Yellow - warning
    } else {
      fuelColor = '#ff0000'; // Red - critical
    }

    ctx.fillStyle = fuelColor;
    ctx.fillRect(x + 1, y + 1, fuelBarWidth - 2, gaugeHeight - 2);

    // Percentage text
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(12 * uiScale)}px monospace`;
    const percentText = `${Math.round(fuelRatio * 100)}%`;
    const textWidth = ctx.measureText(percentText).width;
    ctx.fillText(percentText, x + gaugeWidth / 2 - textWidth / 2, y + Math.round(14 * uiScale));
  }

  /**
   * Draw mission timer
   */
  private drawMissionTimer(ctx: CanvasRenderingContext2D, missionTime: number, uiScale = 1): void {
    // Divide by 2 since base game speed is 2x (to show wall clock time)
    const wallClockTime = missionTime / 2;
    const minutes = Math.floor(wallClockTime / 60);
    const seconds = Math.floor(wallClockTime % 60);
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Timer background
    const timerW = 140 * uiScale;
    const timerH = 30 * uiScale;
    const margin = 10;
    // Center horizontally to Earth's center in the orbit view (mini-map)
    const miniMargin = Math.round(18 * uiScale);
    const miniSize = Math.max(120, Math.round(160 * uiScale));
    const miniX = this.canvas.width - miniSize - miniMargin;
    const centerX = miniX + miniSize / 2;
    // fine-tune slight visual offset to the right to match stroke widths
    const fine = Math.round(2 * uiScale);
    const timerX = Math.round(centerX - timerW / 2 + fine);
    // Place under the MENU button
    const buttonH = 30 * uiScale;
    const gap = Math.round(6 * uiScale);
    const timerY = margin + buttonH + gap;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(timerX, timerY, timerW, timerH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(timerX, timerY, timerW, timerH);

    // Timer text
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(14 * uiScale)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`Mission: ${timeText}`, timerX + timerW / 2, timerY + Math.round(20 * uiScale));
    ctx.textAlign = 'left'; // Reset
  }

  /**
   * Draw restart button
   */
  private drawRestartButton(ctx: CanvasRenderingContext2D, uiScale = 1): void {
    // Match Mission timer size for visual coherence
    const buttonW = 140 * uiScale;
    const buttonH = 30 * uiScale;
    const margin = 10;
    // Center horizontally to Earth's center in the orbit view (mini-map)
    const miniMargin = Math.round(18 * uiScale);
    const miniSize = Math.max(120, Math.round(160 * uiScale));
    const miniX = this.canvas.width - miniSize - miniMargin;
    const centerX = miniX + miniSize / 2;
    const fine = Math.round(2 * uiScale);
    const buttonX = Math.round(centerX - buttonW / 2 + fine);
    const buttonY = margin; // MENU above, mission under

    // Button background
    ctx.fillStyle = 'rgba(200, 50, 50, 0.8)';
    ctx.fillRect(buttonX, buttonY, buttonW, buttonH);
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 1;
    ctx.strokeRect(buttonX, buttonY, buttonW, buttonH);

    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(14 * uiScale)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('MENU', buttonX + buttonW / 2, buttonY + Math.round(20 * uiScale));
    ctx.textAlign = 'left'; // Reset

    // Store button bounds for click detection
    this.restartButtonBounds = { x: buttonX, y: buttonY, width: buttonW, height: buttonH };
  }

  // Autopilot HUD button removed; handled in the HTML console toolbar instead.

  // Called by GameEngine to set confirmation UI state
  setModeConfirm(pending: boolean, targetAuto: boolean): void {
    this._modeConfirm = { pending, targetAuto };
  }

  private drawModeConfirm(ctx: CanvasRenderingContext2D, toAuto: boolean): void {
    // Dim backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const panelW = 360;
    const panelH = 120;
    const x = (this.canvas.width - panelW) / 2;
    const y = (this.canvas.height - panelH) / 2;
    ctx.fillStyle = 'rgba(20,20,30,0.95)';
    ctx.strokeStyle = '#88aaff';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeRect(x, y, panelW, panelH);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    // Friendly text based on target mode
    const text = toAuto ? 'Restart into Auto Pilot mode?' : 'Restart into Manual mode?';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + panelW / 2, y + 35);

    // Buttons
    const btnW = 120;
    const btnH = 28;
    const yesX = x + 40;
    const noX = x + panelW - 40 - btnW;
    const btnY = y + panelH - 45;
    ctx.fillStyle = '#2d6a3e';
    ctx.fillRect(yesX, btnY, btnW, btnH);
    ctx.strokeStyle = '#55cc77';
    ctx.strokeRect(yesX, btnY, btnW, btnH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('YES', yesX + btnW / 2, btnY + 19);

    ctx.fillStyle = '#7a2d2d';
    ctx.strokeStyle = '#ff7777';
    ctx.fillRect(noX, btnY, btnW, btnH);
    ctx.strokeRect(noX, btnY, btnW, btnH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('NO', noX + btnW / 2, btnY + 19);

    // Expose bounds for clicks
    this.confirmYesBounds = { x: yesX, y: btnY, width: btnW, height: btnH };
    this.confirmNoBounds = { x: noX, y: btnY, width: btnW, height: btnH };

    ctx.textAlign = 'left';
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    // HUD automatically adapts to canvas size
  }
}
