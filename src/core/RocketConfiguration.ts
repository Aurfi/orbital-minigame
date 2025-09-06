// Rocket configuration data models
import { StageConfiguration } from './types.js';

// Holds stage data and exposes simple helpers for mass, thrust and staging.
export class RocketConfiguration {
  public stages: StageConfiguration[];
  public payloadMass: number;
  public dragCoefficient: number;
  public crossSectionalArea: number;

  constructor(
    stages: StageConfiguration[],
    payloadMass: number = 1000,
    dragCoefficient: number = 0.3,
    crossSectionalArea: number = 10
  ) {
    // Clone stages so incoming objects are not mutated by the game
    this.stages = stages.map((stage) => ({
      ...stage,
      fuelRemaining: stage.propellantMass, // Initialize fuel to full
    }));
    this.payloadMass = payloadMass;
    this.dragCoefficient = dragCoefficient;
    this.crossSectionalArea = crossSectionalArea;
  }

  /**
   * Get current total mass including all stages and payload
   * @returns Total mass (kg)
   */
  getCurrentMass(): number {
    const stagesMass = this.stages.reduce(
      (total, stage) => total + stage.dryMass + stage.fuelRemaining,
      0
    );
    return stagesMass + this.payloadMass;
  }

  /**
   * Get current thrust-to-weight ratio
   * @param gravity Current gravitational acceleration (m/s²)
   * @returns TWR (dimensionless)
   */
  getThrustToWeightRatio(gravity: number): number {
    const currentThrust = this.getCurrentThrust();
    const currentWeight = this.getCurrentMass() * gravity;
    return currentWeight > 0 ? currentThrust / currentWeight : 0;
  }

  /**
   * Get current maximum thrust from active stages
   * @returns Maximum thrust (N)
   */
  getCurrentThrust(): number {
    return this.stages
      .filter((stage) => stage.isActive && stage.fuelRemaining > 0)
      .reduce((total, stage) => total + stage.thrust, 0);
  }

  /**
   * Get current specific impulse (mass-weighted average of active stages)
   * @returns Effective specific impulse (s)
   */
  getCurrentSpecificImpulse(): number {
    const activeStages = this.stages.filter((stage) => stage.isActive && stage.fuelRemaining > 0);

    if (activeStages.length === 0) return 0;

    const totalThrust = activeStages.reduce((sum, stage) => sum + stage.thrust, 0);
    if (totalThrust === 0) return 0;

    // Thrust-weighted average of specific impulse
    const weightedIsp = activeStages.reduce(
      (sum, stage) => sum + (stage.specificImpulse * stage.thrust) / totalThrust,
      0
    );

    return weightedIsp;
  }

  /**
   * Calculate fuel consumption rate for current throttle setting
   * @param throttle Throttle setting (0.0 to 1.0)
   * @returns Fuel consumption rate (kg/s)
   */
  // Sum of (thrust / (Isp * g0)) for active stages, scaled by throttle
  getFuelConsumptionRate(throttle: number): number {
    const activeStages = this.stages.filter((stage) => stage.isActive && stage.fuelRemaining > 0);

    return activeStages.reduce((total, stage) => {
      const thrustUsed = stage.thrust * throttle;
      const fuelRate = thrustUsed / (stage.specificImpulse * 9.81); // g₀ = 9.81 m/s²
      return total + fuelRate;
    }, 0);
  }

  /**
   * Consume fuel for given time and throttle setting
   * @param deltaTime Time step (s)
   * @param throttle Throttle setting (0.0 to 1.0)
   * @returns True if fuel was consumed, false if no fuel available
   */
  // Reduces fuel for active stages. Returns true if any fuel was consumed.
  consumeFuel(deltaTime: number, throttle: number): boolean {
    const activeStages = this.stages.filter((stage) => stage.isActive && stage.fuelRemaining > 0);

    if (activeStages.length === 0) return false;

    let fuelConsumed = false;
    for (const stage of activeStages) {
      const thrustUsed = stage.thrust * throttle;
      const fuelRate = thrustUsed / (stage.specificImpulse * 9.81);
      const fuelToConsume = fuelRate * deltaTime;

      if (stage.fuelRemaining > 0) {
        stage.fuelRemaining = Math.max(0, stage.fuelRemaining - fuelToConsume);
        fuelConsumed = true;
      }
    }

    return fuelConsumed;
  }

  /**
   * Get the currently active stage
   * @returns Active stage or null if none active
   */
  getActiveStage(): StageConfiguration | null {
    return this.stages.find((stage) => stage.isActive) || null;
  }

  /**
   * Check if current stage is depleted and ready for staging
   * @returns True if staging is recommended
   */
  isReadyForStaging(): boolean {
    const activeStage = this.getActiveStage();
    return activeStage ? activeStage.fuelRemaining <= 0 : false;
  }

  /**
   * Perform staging - deactivate current stage and activate next
   * @param forceStaging Force staging even if conditions aren't met
   * @returns True if staging was successful
   */
  performStaging(forceStaging: boolean = false): boolean {
    const currentStageIndex = this.stages.findIndex((stage) => stage.isActive);

    if (currentStageIndex === -1 || currentStageIndex >= this.stages.length - 1) {
      return false; // No active stage or already on last stage
    }

    const currentStage = this.stages[currentStageIndex];
    if (!currentStage) {
      return false;
    }

    // Note: We allow staging with fuel remaining - safety is checked at GameEngine level
    // This allows jettisoning stages with remaining fuel when engines are off

    // Deactivate current stage
    currentStage.isActive = false;

    // Activate next stage if it exists
    const nextStage = this.stages[currentStageIndex + 1];
    if (nextStage) {
      nextStage.isActive = true;
    }

    return true;
  }

  /**
   * Check if staging is safe (no thrust - engines off)
   * @param currentThrust Current thrust being applied
   * @returns True if staging is safe
   */
  isStagingSafe(currentThrust: number): boolean {
    const activeStage = this.getActiveStage();
    if (!activeStage) return false;

    // Safe to stage if thrust is zero (engines off)
    // Staging with engines on is possible but dangerous
    return currentThrust === 0;
  }

  /**
   * Check if staging with engines on would cause explosion
   * @param currentThrust Current thrust being applied
   * @returns True if staging would cause explosion
   */
  isHotStaging(currentThrust: number): boolean {
    return currentThrust > 0;
  }

  /**
   * Check if hot staging would cause guaranteed explosion
   * @param currentThrust Current thrust being applied
   * @returns True if guaranteed explosion (any thrust > 0)
   */
  // Simple rule for now: any thrust during staging triggers an explosion.
  wouldExplodeOnStaging(currentThrust: number): boolean {
    // Any thrust during staging = guaranteed boom
    return currentThrust > 0;
  }

  /**
   * Get the next stage that would be activated
   * @returns Next stage or null if none available
   */
  getNextStage(): StageConfiguration | null {
    const currentStageIndex = this.stages.findIndex((stage) => stage.isActive);
    if (currentStageIndex === -1 || currentStageIndex >= this.stages.length - 1) {
      return null;
    }
    return this.stages[currentStageIndex + 1] || null;
  }

  /**
   * Get current stage index
   * @returns Current stage index or -1 if none active
   */
  getCurrentStageIndex(): number {
    return this.stages.findIndex((stage) => stage.isActive);
  }

  /**
   * Check for automatic staging conditions
   * @returns True if automatic staging should occur
   */
  shouldAutoStage(): boolean {
    const activeStage = this.getActiveStage();
    if (!activeStage) return false;

    // Auto-stage when fuel is completely depleted
    return activeStage.fuelRemaining <= 0 && this.getNextStage() !== null;
  }

  /**
   * Get total delta-v remaining
   * @returns Remaining delta-v (m/s)
   */
  getRemainingDeltaV(): number {
    let totalDeltaV = 0;
    let currentMass = this.getCurrentMass();
    // Start from current active stage and above
    const startIndex = this.getCurrentStageIndex() >= 0 ? this.getCurrentStageIndex() : 0;
    for (let i = startIndex; i < this.stages.length; i++) {
      const stage = this.stages[i];
      const fuel = Math.max(0, stage.fuelRemaining);
      if (fuel > 0) {
        const massAfterBurn = Math.max(1e-6, currentMass - fuel);
        if (massAfterBurn > 0 && massAfterBurn < currentMass) {
          const deltaV = stage.specificImpulse * 9.81 * Math.log(currentMass / massAfterBurn);
          totalDeltaV += Math.max(0, deltaV);
          currentMass = massAfterBurn;
        }
      }
      // If there are later stages, jettison dry mass of this stage (staging)
      const hasLater = i < this.stages.length - 1;
      if (hasLater) {
        currentMass = Math.max(1e-6, currentMass - stage.dryMass);
      }
    }
    return totalDeltaV;
  }

  /**
   * Create default tutorial rocket configuration
   * @returns Default rocket configuration
   */
  static createTutorialRocket(): RocketConfiguration {
    const stages: StageConfiguration[] = [
      {
        name: 'First Stage',
        thrust: 480_000, // 480 kN (boosted for TWR ~2.0)
        specificImpulse: 265, // seconds (sea-level realistic)
        seaLevelIsp: 265,
        vacuumIsp: 300,
        propellantMass: 25_000, // 25 tons
        dryMass: 3_000, // 3 tons (a bit heavier)
        isActive: true,
        fuelRemaining: 25_000,
      },
      {
        name: 'Second Stage',
        thrust: 120_000, // 120 kN (doubled for better TWR)
        specificImpulse: 335, // seconds (reduced slightly)
        seaLevelIsp: 300,
        vacuumIsp: 335,
        propellantMass: 5_000, // 5 tons
        dryMass: 1_200, // 1.2 tons (a bit heavier)
        isActive: false,
        fuelRemaining: 5_000,
      },
    ];

    return new RocketConfiguration(stages, 1000); // 1 ton payload
  }
}
