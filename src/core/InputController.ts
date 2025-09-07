import type { GameEngine } from '@/core/GameEngine';
import type { GameState } from '@/core/types';
import type { Camera } from '@/rendering/CanvasRenderer';
import type { HUDSystem } from '@/ui/HUDSystem';

/**
 * Simple input controller for the canvas and page.
 *
 * Goal: keep GameEngine lighter. This file listens DOM events
 * and translates them into engine actions. The style stays very
 * direct so it is easy to read later.
 */
export class InputController {
  constructor(
    private engine: GameEngine,
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private hud: HUDSystem,
    private state: GameState
  ) {}

  init(): void {
    // keyboard + mouse + html buttons
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    // passive must be false to prevent default scrolling on wheel
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('click', this.onClick);
    this.setupSpeedControls();
  }

  private onResize = () => {
    this.engine.handleResize();
    this.hud.handleResize();
  };

  private onWheel = (event: WheelEvent) => {
    // zoom in/out around current center, keep limits small on purpose
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const currentZoom = this.camera.zoom;
    const newZoom = Math.max(0.00005, Math.min(3.0, currentZoom * zoomFactor));
    this.camera.setZoom(newZoom);
    this.state.manualZoomControl = true;
  };

  private onKeyDown = (event: KeyboardEvent) => {
    // Don't process game controls if user is typing in an input field
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
    ) {
      return;
    }

    if (this.engine.isAutopilotRunning()) {
      // when script runs, keep controls quiet
      return;
    }
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        if (!this.state.rocket.isEngineIgnited) this.engine.igniteEngines();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.engine.nudgeThrottle?.(+0.1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.engine.nudgeThrottle?.(-0.1);
        break;
      case 'KeyT':
        this.engine.setThrottle(1.0);
        break;
      case 'KeyG':
        this.engine.setThrottle(0.0);
        break;
      case 'KeyB':
        this.engine.cutEngines();
        break;
      case 'ArrowLeft':
        this.engine.setTurnLeft(true);
        break; // smooth turn left
      case 'ArrowRight':
        this.engine.setTurnRight(true);
        break; // smooth turn right
      case 'KeyS':
        this.engine.performStaging();
        break;
      case 'KeyP':
        this.engine.togglePause();
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    // Don't process game controls if user is typing in an input field
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
    ) {
      return;
    }

    if (this.engine.isAutopilotRunning()) return;
    switch (event.code) {
      case 'ArrowLeft':
        this.engine.setTurnLeft(false);
        break;
      case 'ArrowRight':
        this.engine.setTurnRight(false);
        break;
    }
  };

  private onClick = (event: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1; // HUD bounds use device px
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;
    const hud = this.hud;

    // Check for game over Menu button click
    const menuButtonBounds = this.engine.getMenuButtonBounds?.();
    if (menuButtonBounds) {
      const b = menuButtonBounds;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        this.engine.goToMenu(this.engine.isAutopilotOn?.() ?? false);
        return;
      }
    }

    if (hud.restartButtonBounds) {
      const b = hud.restartButtonBounds;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        this.engine.goToMenu(this.engine.isAutopilotOn?.() ?? false);
        return;
      }
    }
    // Autopilot HUD button removed; handled in HTML toolbar
  };

  private setupSpeedControls(): void {
    // attach to small buttons under the canvas
    const speedButtons = document.querySelectorAll('.speed-btn');
    for (const button of speedButtons as unknown as NodeListOf<HTMLButtonElement>) {
      button.addEventListener('click', (event) => {
        const target = event.target as HTMLButtonElement;
        const speed = Number.parseInt(target.dataset.speed || '1');
        const altitude = this.state.world.getAltitude(this.state.rocket.position.magnitude());
        let minAlt = 0;
        if (speed >= 3 && speed < 10) minAlt = 500;
        if (speed >= 10 && speed < 50) minAlt = 1000;
        if (speed >= 50) minAlt = 30000;
        if (altitude < minAlt) {
          const minAltLabel =
            minAlt >= 1000
              ? `${(minAlt / 1000).toFixed(minAlt % 1000 === 0 ? 0 : 1)} km`
              : `${minAlt} m`;
          this.engine.showInfo(`Wait for >${minAltLabel} for x${speed}`, 2.5);
          return;
        }
        this.engine.setGameSpeed(speed);
      });
    }
  }
}
