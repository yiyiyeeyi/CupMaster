export type BrewRuntimeEvent =
  | { type: "SESSION_STARTED"; timestampMs: number }
  | { type: "SESSION_PAUSED"; timestampMs: number }
  | { type: "SESSION_RESUMED"; timestampMs: number }
  | { type: "SESSION_RESTARTED"; timestampMs: number }
  | { type: "SESSION_RESET"; timestampMs: number }
  | { type: "CAMERA_READY"; timestampMs: number }
  | { type: "RUNTIME_TICK"; timestampMs: number }
  | { type: "POUR_STARTED"; timestampMs: number; source: "camera" | "manual"; confidence?: number }
  | { type: "POUR_STOPPED"; timestampMs: number; source: "camera" | "manual"; confidence?: number }
  | { type: "MANUAL_ADVANCE_STAGE"; timestampMs: number }
  | { type: "BREW_COMPLETED"; timestampMs: number; source: "automatic" | "manual" }
  | { type: "CAMERA_ERROR"; timestampMs: number; code: string };
