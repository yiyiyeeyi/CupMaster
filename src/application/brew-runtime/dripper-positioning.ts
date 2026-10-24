export type DripperPositioningState = "POSITIONING" | "ALIGNED" | "READY";

export interface DripperPositioningConfig {
  stableMotionThreshold: number;
  unstableMotionThreshold: number;
  stableDurationMs: number;
  minimumStableSamples: number;
  unstableSamplesToReset: number;
}

export interface DripperPositioningSnapshot {
  state: DripperPositioningState;
  placementConfirmed: boolean;
  stableSinceMs: number | null;
  stableSamples: number;
  unstableSamples: number;
  lastMotionScore: number | null;
}

export const DEFAULT_DRIPPER_POSITIONING_CONFIG: Readonly<DripperPositioningConfig> = {
  stableMotionThreshold: 0.08,
  unstableMotionThreshold: 0.16,
  stableDurationMs: 1_200,
  minimumStableSamples: 8,
  unstableSamplesToReset: 3,
};

export class DripperPositioningTracker {
  private readonly config: DripperPositioningConfig;
  private snapshot: DripperPositioningSnapshot = this.initialSnapshot();

  constructor(config: Partial<DripperPositioningConfig> = {}) {
    this.config = { ...DEFAULT_DRIPPER_POSITIONING_CONFIG, ...config };
    if (this.config.stableMotionThreshold < 0
      || this.config.unstableMotionThreshold <= this.config.stableMotionThreshold
      || this.config.stableDurationMs <= 0
      || !Number.isInteger(this.config.minimumStableSamples) || this.config.minimumStableSamples < 2
      || !Number.isInteger(this.config.unstableSamplesToReset) || this.config.unstableSamplesToReset < 1) {
      throw new RangeError("Dripper positioning thresholds and persistence values are invalid.");
    }
  }

  confirmPlacement(): DripperPositioningSnapshot {
    if (!this.snapshot.placementConfirmed) {
      this.snapshot = { ...this.snapshot, placementConfirmed: true };
    }
    return this.getSnapshot();
  }

  observe(timestampMs: number, motionScore: number): DripperPositioningSnapshot {
    if (!Number.isFinite(timestampMs) || timestampMs < 0
      || !Number.isFinite(motionScore) || motionScore < 0 || motionScore > 1) {
      throw new RangeError("Positioning observations require valid timestamps and normalized motion scores.");
    }
    if (!this.snapshot.placementConfirmed || this.snapshot.state === "READY") {
      if (this.snapshot.state === "READY" && motionScore >= this.config.unstableMotionThreshold) {
        const unstableSamples = this.snapshot.unstableSamples + 1;
        if (unstableSamples >= this.config.unstableSamplesToReset) {
          this.snapshot = {
            ...this.snapshot,
            state: "POSITIONING",
            stableSinceMs: null,
            stableSamples: 0,
            unstableSamples: 0,
            lastMotionScore: motionScore,
          };
        } else {
          this.snapshot = { ...this.snapshot, unstableSamples, lastMotionScore: motionScore };
        }
      } else {
        this.snapshot = { ...this.snapshot, unstableSamples: 0, lastMotionScore: motionScore };
      }
      return this.getSnapshot();
    }

    if (motionScore <= this.config.stableMotionThreshold) {
      const stableSinceMs = this.snapshot.stableSinceMs ?? timestampMs;
      const stableSamples = this.snapshot.stableSamples + 1;
      const state = timestampMs - stableSinceMs >= this.config.stableDurationMs
        && stableSamples >= this.config.minimumStableSamples
        ? "READY"
        : "ALIGNED";
      this.snapshot = {
        ...this.snapshot,
        state,
        stableSinceMs,
        stableSamples,
        unstableSamples: 0,
        lastMotionScore: motionScore,
      };
      return this.getSnapshot();
    }

    if (motionScore >= this.config.unstableMotionThreshold) {
      this.snapshot = {
        ...this.snapshot,
        state: "POSITIONING",
        stableSinceMs: null,
        stableSamples: 0,
        unstableSamples: 0,
        lastMotionScore: motionScore,
      };
      return this.getSnapshot();
    }

    this.snapshot = { ...this.snapshot, lastMotionScore: motionScore };
    return this.getSnapshot();
  }

  getSnapshot(): DripperPositioningSnapshot {
    return { ...this.snapshot };
  }

  reset(): DripperPositioningSnapshot {
    this.snapshot = this.initialSnapshot();
    return this.getSnapshot();
  }

  private initialSnapshot(): DripperPositioningSnapshot {
    return {
      state: "POSITIONING",
      placementConfirmed: false,
      stableSinceMs: null,
      stableSamples: 0,
      unstableSamples: 0,
      lastMotionScore: null,
    };
  }
}
