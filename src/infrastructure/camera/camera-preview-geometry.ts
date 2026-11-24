import type { NormalizedRect } from "@/domain/brew-runtime";

/** A rectangle in percentages of the visible preview element. */
export type CameraPreviewRect = NormalizedRect;

/**
 * Maps a visible overlay rectangle through CSS object-fit: cover into the
 * normalized source-video coordinate contract used by frame analysis.
 */
export function previewRectToFrameRoi(
  rect: CameraPreviewRect,
  frameWidth: number,
  frameHeight: number,
  previewWidth: number,
  previewHeight: number,
): NormalizedRect | null {
  if (![frameWidth, frameHeight, previewWidth, previewHeight].every((value) => Number.isFinite(value) && value > 0)) return null;

  const scale = Math.max(previewWidth / frameWidth, previewHeight / frameHeight);
  const renderedWidth = frameWidth * scale;
  const renderedHeight = frameHeight * scale;
  const cropLeft = (renderedWidth - previewWidth) / 2;
  const cropTop = (renderedHeight - previewHeight) / 2;
  const rawLeft = (rect.x * previewWidth + cropLeft) / renderedWidth;
  const rawTop = (rect.y * previewHeight + cropTop) / renderedHeight;
  const rawRight = ((rect.x + rect.width) * previewWidth + cropLeft) / renderedWidth;
  const rawBottom = ((rect.y + rect.height) * previewHeight + cropTop) / renderedHeight;
  const left = clamp(rawLeft, 0, 1);
  const top = clamp(rawTop, 0, 1);
  const right = clamp(rawRight, left, 1);
  const bottom = clamp(rawBottom, top, 1);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
