export type BrewRuntimeEvent =
  | { type: "SESSION_STARTED"; timestampMs: number }
  | { type: "CAMERA_READY"; timestampMs: number }
  | { type: "POUR_STARTED"; timestampMs: number; source: "camera" | "manual"; confidence?: number }
  | { type: "POUR_STOPPED"; timestampMs: number; source: "camera" | "manual"; confidence?: number }
  | { type: "MANUAL_ADVANCE_STAGE"; timestampMs: number }
  | { type: "BREW_COMPLETED"; timestampMs: number; source: "automatic" | "manual" }
  | { type: "CAMERA_ERROR"; timestampMs: number; code: string };
