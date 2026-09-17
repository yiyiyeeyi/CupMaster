import type { NormalizedRect, VisionFrameAnalysis } from "@/domain/brew-runtime";
import type { VideoFrameSample } from "./frame-sampler";

export interface FrameAnalysisThresholds {
  pixelDifferenceThreshold: number;
  globalMotionRatioThreshold: number;
  lightingChangedPixelRatioThreshold: number;
  lightingDirectionConsistencyThreshold: number;
  lightingMeanChangeThreshold: number;
}

export const DEFAULT_FRAME_ANALYSIS_THRESHOLDS: Readonly<FrameAnalysisThresholds> = {
  pixelDifferenceThreshold: 18,
  globalMotionRatioThreshold: 0.9,
  lightingChangedPixelRatioThreshold: 0.8,
  lightingDirectionConsistencyThreshold: 0.9,
  lightingMeanChangeThreshold: 0.08,
};

export interface FrameAnalysisOptions {
  roi: NormalizedRect;
  analysisWidth?: number;
  analysisHeight?: number;
  motionSensitivity?: number;
  thresholds?: Partial<FrameAnalysisThresholds>;
}

export interface FrameAnalysisSnapshot {
  analyzedFrameCount: number;
  lastTimestampMs?: number;
  lastMotionScore?: number;
  lastPourEvidence?: number;
  lastConfidence?: number;
  suspiciousGlobalMotion: boolean;
  suspectedLightingChange: boolean;
  analysisWidth: number;
  analysisHeight: number;
}

interface PixelRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_ANALYSIS_WIDTH = 160;
const DEFAULT_ANALYSIS_HEIGHT = 120;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeDimension(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.round(value)) : fallback;
}

function normalizedValue(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function mapRoi(roi: NormalizedRect, width: number, height: number): PixelRoi | null {
  const left = clamp(normalizedValue(roi.x), 0, 1);
  const top = clamp(normalizedValue(roi.y), 0, 1);
  const right = clamp(normalizedValue(roi.x) + normalizedValue(roi.width), 0, 1);
  const bottom = clamp(normalizedValue(roi.y) + normalizedValue(roi.height), 0, 1);
  if (right <= left || bottom <= top || width <= 0 || height <= 0) return null;

  const x = clamp(Math.floor(left * width), 0, width - 1);
  const y = clamp(Math.floor(top * height), 0, height - 1);
  const endX = clamp(Math.ceil(right * width), x + 1, width);
  const endY = clamp(Math.ceil(bottom * height), y + 1, height);
  return { x, y, width: endX - x, height: endY - y };
}

function outputSize(roi: PixelRoi, maximumWidth: number, maximumHeight: number) {
  const scale = Math.min(maximumWidth / roi.width, maximumHeight / roi.height, 1);
  return {
    width: Math.max(1, Math.round(roi.width * scale)),
    height: Math.max(1, Math.round(roi.height * scale)),
  };
}

function grayscale(sample: Readonly<VideoFrameSample>, roi: PixelRoi, width: number, height: number) {
  const result = new Uint8Array(width * height);
  const pixels = sample.imageData.data;
  for (let targetY = 0; targetY < height; targetY += 1) {
    const sourceY = Math.min(roi.y + roi.height - 1, roi.y + Math.floor((targetY + 0.5) * roi.height / height));
    for (let targetX = 0; targetX < width; targetX += 1) {
      const sourceX = Math.min(roi.x + roi.width - 1, roi.x + Math.floor((targetX + 0.5) * roi.width / width));
      const sourceIndex = (sourceY * sample.width + sourceX) * 4;
      const targetIndex = targetY * width + targetX;
      result[targetIndex] = Math.round(
        0.299 * pixels[sourceIndex]
        + 0.587 * pixels[sourceIndex + 1]
        + 0.114 * pixels[sourceIndex + 2],
      );
    }
  }
  return result;
}

export class FrameAnalysisService {
  private roi: NormalizedRect;
  private readonly maximumWidth: number;
  private readonly maximumHeight: number;
  private readonly motionSensitivity: number;
  private readonly thresholds: FrameAnalysisThresholds;
  private previousGray: Uint8Array | null = null;
  private previousSourceWidth: number | null = null;
  private previousSourceHeight: number | null = null;
  private snapshot: FrameAnalysisSnapshot;

  constructor(options: FrameAnalysisOptions) {
    this.roi = { ...options.roi };
    this.maximumWidth = safeDimension(options.analysisWidth, DEFAULT_ANALYSIS_WIDTH);
    this.maximumHeight = safeDimension(options.analysisHeight, DEFAULT_ANALYSIS_HEIGHT);
    this.motionSensitivity = Number.isFinite(options.motionSensitivity)
      ? clamp(options.motionSensitivity ?? 1, 0, 4)
      : 1;
    this.thresholds = { ...DEFAULT_FRAME_ANALYSIS_THRESHOLDS, ...options.thresholds };
    this.snapshot = this.emptySnapshot();
  }

  analyze(sample: Readonly<VideoFrameSample>): VisionFrameAnalysis {
    const roi = mapRoi(this.roi, sample.width, sample.height);
    if (!roi) {
      this.clearBaseline();
      return this.record(sample.timestampMs, 0, 0, 0, false, false);
    }

    const size = outputSize(roi, this.maximumWidth, this.maximumHeight);
    this.snapshot = { ...this.snapshot, analysisWidth: size.width, analysisHeight: size.height };
    const currentGray = grayscale(sample, roi, size.width, size.height);
    const dimensionsChanged = this.previousSourceWidth !== sample.width
      || this.previousSourceHeight !== sample.height
      || this.previousGray?.length !== currentGray.length;

    if (!this.previousGray || dimensionsChanged) {
      this.storeBaseline(currentGray, sample.width, sample.height);
      return this.record(sample.timestampMs, 0, 0, 0, false, false);
    }

    let changedPixels = 0;
    let totalDifference = 0;
    let signedDifference = 0;
    let positiveChanges = 0;
    let negativeChanges = 0;
    for (let index = 0; index < currentGray.length; index += 1) {
      const signed = currentGray[index] - this.previousGray[index];
      const difference = Math.abs(signed);
      totalDifference += difference;
      signedDifference += signed;
      if (difference >= this.thresholds.pixelDifferenceThreshold) {
        changedPixels += 1;
        if (signed > 0) positiveChanges += 1;
        else if (signed < 0) negativeChanges += 1;
      }
    }

    const pixelCount = currentGray.length;
    const changedPixelRatio = changedPixels / pixelCount;
    const meanDifference = totalDifference / pixelCount / 255;
    const meanLuminanceChange = Math.abs(signedDifference / pixelCount / 255);
    const directionConsistency = changedPixels === 0
      ? 0
      : Math.max(positiveChanges, negativeChanges) / changedPixels;
    const suspiciousGlobalMotion = changedPixelRatio >= this.thresholds.globalMotionRatioThreshold;
    const suspectedLightingChange = changedPixelRatio >= this.thresholds.lightingChangedPixelRatioThreshold
      && directionConsistency >= this.thresholds.lightingDirectionConsistencyThreshold
      && meanLuminanceChange >= this.thresholds.lightingMeanChangeThreshold;

    let motionScore = clamp((changedPixelRatio * 0.7 + meanDifference * 0.3) * this.motionSensitivity, 0, 1);
    let confidence = 1;
    if (suspiciousGlobalMotion) {
      motionScore *= 0.25;
      confidence = Math.min(confidence, 0.25);
    }
    if (suspectedLightingChange) {
      motionScore *= 0.5;
      confidence = Math.min(confidence, 0.35);
    }
    motionScore = clamp(motionScore, 0, 1);

    this.storeBaseline(currentGray, sample.width, sample.height);
    return this.record(
      sample.timestampMs,
      motionScore,
      motionScore,
      confidence,
      suspiciousGlobalMotion,
      suspectedLightingChange,
    );
  }

  setRoi(roi: NormalizedRect) {
    this.roi = { ...roi };
    this.clearBaseline();
  }

  reset() {
    this.clearBaseline();
    this.snapshot = this.emptySnapshot();
  }

  getSnapshot() {
    return { ...this.snapshot };
  }

  private record(
    timestampMs: number,
    motionScore: number,
    pourEvidence: number,
    confidence: number,
    suspiciousGlobalMotion: boolean,
    suspectedLightingChange: boolean,
  ): VisionFrameAnalysis {
    this.snapshot = {
      ...this.snapshot,
      analyzedFrameCount: this.snapshot.analyzedFrameCount + 1,
      lastTimestampMs: timestampMs,
      lastMotionScore: motionScore,
      lastPourEvidence: pourEvidence,
      lastConfidence: confidence,
      suspiciousGlobalMotion,
      suspectedLightingChange,
    };
    return { timestampMs, roiMotionScore: motionScore, pourEvidence, analysisConfidence: confidence };
  }

  private storeBaseline(gray: Uint8Array, sourceWidth: number, sourceHeight: number) {
    this.previousGray = gray;
    this.previousSourceWidth = sourceWidth;
    this.previousSourceHeight = sourceHeight;
  }

  private clearBaseline() {
    this.previousGray = null;
    this.previousSourceWidth = null;
    this.previousSourceHeight = null;
  }

  private emptySnapshot(): FrameAnalysisSnapshot {
    return {
      analyzedFrameCount: 0,
      suspiciousGlobalMotion: false,
      suspectedLightingChange: false,
      analysisWidth: this.maximumWidth,
      analysisHeight: this.maximumHeight,
    };
  }
}
