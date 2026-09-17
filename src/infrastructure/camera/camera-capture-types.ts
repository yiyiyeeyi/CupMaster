export type CameraCaptureState =
  | "idle"
  | "requesting"
  | "ready"
  | "permission_denied"
  | "unavailable"
  | "unsupported"
  | "error";

export type CameraCaptureErrorCode =
  | "camera_permission_denied"
  | "camera_not_found"
  | "camera_not_supported"
  | "camera_in_use"
  | "camera_constraints_failed"
  | "camera_start_failed";

export interface CameraCaptureSnapshot {
  state: CameraCaptureState;
  hasStream: boolean;
  width?: number;
  height?: number;
  deviceId?: string;
  errorCode?: CameraCaptureErrorCode;
}

export interface StartCameraOptions {
  preferredFacingMode?: "environment" | "user";
  idealWidth?: number;
  idealHeight?: number;
  idealFrameRate?: number;
}

export class CameraCaptureError extends Error {
  readonly code: CameraCaptureErrorCode;

  constructor(code: CameraCaptureErrorCode) {
    super(code);
    this.name = "CameraCaptureError";
    this.code = code;
  }
}
