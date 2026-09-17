import { describe, expect, it } from "vitest";
import { PourDetectionService, type NormalizedRect } from "@/domain/brew-runtime";
import { FrameAnalysisService } from "./frame-analysis-service";
import type { VideoFrameSample } from "./frame-sampler";

const FULL_ROI: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

function sample(
  width: number,
  height: number,
  luminance: (x: number, y: number) => number,
  timestampMs = 100,
): VideoFrameSample {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = luminance(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const imageData = Object.create(null) as ImageData;
  Object.defineProperties(imageData, {
    data: { value: data },
    width: { value: width },
    height: { value: height },
  });
  return { timestampMs, width, height, imageData };
}

function solid(value: number, timestampMs = 100, width = 4, height = 4) {
  return sample(width, height, () => value, timestampMs);
}

function analyzer(roi = FULL_ROI) {
  return new FrameAnalysisService({ roi });
}

describe("FrameAnalysisService ROI", () => {
  it("maps a normalized full-frame ROI", () => {
    const service = analyzer();
    service.analyze(solid(0));
    expect(service.analyze(sample(4, 4, () => 80)).roiMotionScore).toBeGreaterThan(0);
  });

  it("analyzes only a partial ROI", () => {
    const service = analyzer({ x: 0.5, y: 0, width: 0.5, height: 1 });
    service.analyze(solid(0));
    const result = service.analyze(sample(4, 4, (x) => x < 2 ? 255 : 0));
    expect(result.roiMotionScore).toBe(0);
  });

  it("clamps a negative ROI to the frame", () => {
    const service = analyzer({ x: -0.5, y: 0, width: 1, height: 1 });
    service.analyze(solid(0));
    expect(service.analyze(sample(4, 4, (x) => x >= 2 ? 255 : 0)).roiMotionScore).toBe(0);
  });

  it("clamps an ROI crossing the upper frame boundary", () => {
    const service = analyzer({ x: 0.5, y: 0, width: 1, height: 2 });
    service.analyze(solid(0));
    expect(service.analyze(sample(4, 4, (x) => x < 2 ? 255 : 0)).roiMotionScore).toBe(0);
  });

  it("returns a safe low-confidence result for zero-area ROI", () => {
    const result = analyzer({ x: 0, y: 0, width: 0, height: 1 }).analyze(solid(100));
    expect(result).toEqual({ timestampMs: 100, roiMotionScore: 0, pourEvidence: 0, analysisConfidence: 0 });
  });

  it("supports an ROI that maps to one pixel", () => {
    const service = analyzer({ x: 0, y: 0, width: 0.01, height: 0.01 });
    service.analyze(solid(0));
    expect(service.analyze(sample(4, 4, (x, y) => x === 0 && y === 0 ? 100 : 0)).roiMotionScore).toBeGreaterThan(0);
  });
});

describe("FrameAnalysisService first frame and motion", () => {
  it("downscales within 160x120 while preserving ROI aspect ratio", () => {
    const service = analyzer();
    service.analyze(solid(0, 100, 320, 180));
    expect(service.getSnapshot()).toMatchObject({ analysisWidth: 160, analysisHeight: 90 });
  });

  it("uses the first frame only as a zero-confidence baseline", () => {
    expect(analyzer().analyze(solid(120))).toEqual({ timestampMs: 100, roiMotionScore: 0, pourEvidence: 0, analysisConfidence: 0 });
  });

  it("stores a grayscale baseline for the next frame", () => {
    const service = analyzer();
    service.analyze(solid(80));
    expect(service.analyze(solid(80, 200))).toMatchObject({ roiMotionScore: 0, analysisConfidence: 1 });
  });

  it("gives identical frames zero motion", () => {
    const service = analyzer();
    service.analyze(sample(4, 4, (x, y) => x * 20 + y));
    expect(service.analyze(sample(4, 4, (x, y) => x * 20 + y)).pourEvidence).toBe(0);
  });

  it("scores a small local change lower than a large local change", () => {
    const small = analyzer();
    small.analyze(solid(0));
    const smallScore = small.analyze(sample(4, 4, (x, y) => x === 0 && y === 0 ? 100 : 0)).roiMotionScore;
    const large = analyzer();
    large.analyze(solid(0));
    const largeScore = large.analyze(sample(4, 4, (x) => x < 2 ? 100 : 0)).roiMotionScore;
    expect(smallScore).toBeGreaterThan(0);
    expect(largeScore).toBeGreaterThan(smallScore);
  });

  it("keeps motion and pour evidence bounded", () => {
    const service = new FrameAnalysisService({ roi: FULL_ROI, motionSensitivity: 4 });
    service.analyze(solid(0));
    const result = service.analyze(sample(4, 4, (x, y) => (x + y) % 2 ? 255 : 0));
    expect(result.roiMotionScore).toBeGreaterThanOrEqual(0);
    expect(result.roiMotionScore).toBeLessThanOrEqual(1);
    expect(result.pourEvidence).toBeGreaterThanOrEqual(0);
    expect(result.pourEvidence).toBeLessThanOrEqual(1);
  });

  it("ignores differences below the pixel threshold in changed-pixel ratio", () => {
    const service = analyzer();
    service.analyze(solid(100));
    expect(service.analyze(solid(110)).roiMotionScore).toBeLessThan(0.02);
  });

  it("includes differences above the pixel threshold", () => {
    const service = analyzer();
    service.analyze(solid(100));
    expect(service.analyze(sample(4, 4, (x) => x < 2 ? 130 : 100)).roiMotionScore).toBeGreaterThan(0.3);
  });

  it("applies configurable motion sensitivity", () => {
    const normal = analyzer();
    const sensitive = new FrameAnalysisService({ roi: FULL_ROI, motionSensitivity: 2 });
    normal.analyze(solid(0));
    sensitive.analyze(solid(0));
    const changed = sample(4, 4, (x) => x === 0 ? 100 : 0);
    expect(sensitive.analyze(changed).roiMotionScore).toBeGreaterThan(normal.analyze(changed).roiMotionScore);
  });
});

describe("FrameAnalysisService camera-shake and lighting guards", () => {
  it("flags near-whole ROI changes as suspicious global motion", () => {
    const service = analyzer();
    service.analyze(solid(128));
    service.analyze(sample(4, 4, (x, y) => (x + y) % 2 ? 0 : 255));
    expect(service.getSnapshot().suspiciousGlobalMotion).toBe(true);
  });

  it("lowers confidence for suspicious global motion", () => {
    const service = analyzer();
    service.analyze(solid(128));
    expect(service.analyze(sample(4, 4, (x, y) => (x + y) % 2 ? 0 : 255)).analysisConfidence).toBeLessThan(1);
  });

  it("detects uniform brightening as a lighting change", () => {
    const service = analyzer();
    service.analyze(solid(20));
    service.analyze(solid(120));
    expect(service.getSnapshot().suspectedLightingChange).toBe(true);
  });

  it("detects uniform darkening as a lighting change", () => {
    const service = analyzer();
    service.analyze(solid(180));
    service.analyze(solid(40));
    expect(service.getSnapshot().suspectedLightingChange).toBe(true);
  });

  it("does not give lighting flashes maximum-confidence pour evidence", () => {
    const service = analyzer();
    service.analyze(solid(20));
    const result = service.analyze(solid(220));
    expect(result.analysisConfidence).toBeLessThan(1);
    expect(result.pourEvidence).toBeLessThan(0.65);
  });
});

describe("FrameAnalysisService lifecycle and diagnostics", () => {
  it("resets its baseline when source resolution changes", () => {
    const service = analyzer();
    service.analyze(solid(0, 100, 4, 4));
    expect(service.analyze(solid(255, 200, 8, 8))).toMatchObject({ roiMotionScore: 0, analysisConfidence: 0 });
  });

  it("resumes comparison on the next same-resolution frame", () => {
    const service = analyzer();
    service.analyze(solid(0, 100, 4, 4));
    service.analyze(solid(0, 200, 8, 8));
    expect(service.analyze(sample(8, 8, (x) => x < 4 ? 100 : 0, 300)).analysisConfidence).toBe(1);
  });

  it("reset clears frame count and diagnostics", () => {
    const service = analyzer();
    service.analyze(solid(0));
    service.analyze(sample(4, 4, (x) => x < 2 ? 100 : 0));
    service.reset();
    expect(service.getSnapshot()).toMatchObject({ analyzedFrameCount: 0, suspiciousGlobalMotion: false, suspectedLightingChange: false });
    expect(service.getSnapshot()).not.toHaveProperty("lastTimestampMs");
  });

  it("treats the first frame after reset as a new baseline", () => {
    const service = analyzer();
    service.analyze(solid(0));
    service.reset();
    expect(service.analyze(solid(255))).toMatchObject({ roiMotionScore: 0, analysisConfidence: 0 });
  });

  it("setRoi clears the comparison baseline", () => {
    const service = analyzer();
    service.analyze(solid(0));
    service.setRoi({ x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(service.analyze(solid(255))).toMatchObject({ roiMotionScore: 0, analysisConfidence: 0 });
  });

  it("copies the exact sample timestamp", () => {
    expect(analyzer().analyze(solid(0, 987.25)).timestampMs).toBe(987.25);
  });

  it("tracks frame count and last scores", () => {
    const service = analyzer();
    service.analyze(solid(0, 1));
    const result = service.analyze(sample(4, 4, (x) => x < 2 ? 100 : 0, 2));
    expect(service.getSnapshot()).toMatchObject({
      analyzedFrameCount: 2,
      lastTimestampMs: 2,
      lastMotionScore: result.roiMotionScore,
      lastPourEvidence: result.pourEvidence,
      lastConfidence: result.analysisConfidence,
      analysisWidth: 4,
      analysisHeight: 4,
    });
  });

  it("retains grayscale rather than the mutable full raw frame", () => {
    const service = analyzer();
    const first = solid(50);
    service.analyze(first);
    first.imageData.data.fill(255);
    expect(service.analyze(solid(50)).roiMotionScore).toBe(0);
    expect(service.getSnapshot()).not.toHaveProperty("imageData");
  });

  it("is deterministic for the same input sequence", () => {
    const sequence = [solid(0, 1), sample(4, 4, (x) => x < 3 ? 100 : 0, 2), solid(0, 3)];
    const analyze = () => {
      const service = analyzer();
      return sequence.map((item) => service.analyze(item));
    };
    expect(analyze()).toEqual(analyze());
  });
});

describe("FrameAnalysisService and PourDetectionService integration", () => {
  it("produces one start and stop transition from deterministic synthetic motion", () => {
    const analysis = analyzer();
    const detection = new PourDetectionService();
    const transitions: Array<string> = [];
    analysis.analyze(solid(0, 0));
    for (let index = 1; index <= 4; index += 1) {
      const moving = index % 2 === 1
        ? sample(4, 4, (x) => x < 3 ? 255 : 0, index)
        : solid(0, index);
      const transition = detection.process(analysis.analyze(moving)).transition;
      if (transition) transitions.push(transition);
    }
    for (let index = 5; index <= 10; index += 1) {
      const transition = detection.process(analysis.analyze(solid(0, index))).transition;
      if (transition) transitions.push(transition);
    }
    expect(transitions).toEqual(["POUR_STARTED", "POUR_STOPPED"]);
  });
});
