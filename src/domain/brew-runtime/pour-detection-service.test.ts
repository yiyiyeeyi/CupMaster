import { describe, expect, it } from "vitest";
import type { PourDetectionThresholds, VisionFrameAnalysis } from "./index";
import { PourDetectionService } from "./index";

function frame(pourEvidence: number, timestampMs = 100, analysisConfidence = 0.8): VisionFrameAnalysis {
  return { timestampMs, roiMotionScore: 0, pourEvidence, analysisConfidence };
}

function processMany(service: PourDetectionService, evidence: number, count: number) {
  return Array.from({ length: count }, (_, index) => service.process(frame(evidence, index)));
}

function startedService() {
  const service = new PourDetectionService();
  processMany(service, 0.8, 4);
  return service;
}

describe("PourDetectionService start hysteresis", () => {
  it("begins in the confirmed not-pouring state", () => expect(new PourDetectionService().process(frame(0)).snapshot.state).toBe("not_pouring"));
  it("does not start after one positive frame", () => expect(new PourDetectionService().process(frame(0.8)).transition).toBeNull());
  it("does not start after three positive frames", () => expect(processMany(new PourDetectionService(), 0.8, 3).at(-1)?.transition).toBeNull());
  it("emits POUR_STARTED on the fourth positive frame", () => expect(processMany(new PourDetectionService(), 0.8, 4).at(-1)).toMatchObject({ transition: "POUR_STARTED", snapshot: { state: "pouring", consecutivePositiveFrames: 0 } }));
  it("does not re-emit start during sustained positive evidence", () => { const results = processMany(new PourDetectionService(), 0.8, 10); expect(results.filter((result) => result.transition === "POUR_STARTED")).toHaveLength(1); });
});

describe("PourDetectionService stop hysteresis", () => {
  it("does not stop with fewer than six negative frames", () => expect(processMany(startedService(), 0.2, 5).at(-1)).toMatchObject({ transition: null, snapshot: { state: "pouring", consecutiveNegativeFrames: 5 } }));
  it("emits POUR_STOPPED on the sixth negative frame", () => expect(processMany(startedService(), 0.2, 6).at(-1)).toMatchObject({ transition: "POUR_STOPPED", snapshot: { state: "not_pouring", consecutiveNegativeFrames: 0 } }));
  it("does not re-emit stop during sustained negative evidence", () => { const service = startedService(), results = processMany(service, 0.2, 12); expect(results.filter((result) => result.transition === "POUR_STOPPED")).toHaveLength(1); });
});

describe("noise and hysteresis", () => {
  it("resets start accumulation on uncertain evidence", () => { const service = new PourDetectionService(); service.process(frame(0.8)); service.process(frame(0.8)); const uncertain = service.process(frame(0.5)); expect(uncertain.snapshot).toMatchObject({ state: "uncertain", consecutivePositiveFrames: 0, consecutiveNegativeFrames: 0 }); expect(processMany(service, 0.8, 3).at(-1)?.transition).toBeNull(); });
  it("resets stop accumulation on uncertain evidence", () => { const service = startedService(); service.process(frame(0.2)); service.process(frame(0.2)); const uncertain = service.process(frame(0.5)); expect(uncertain.snapshot).toMatchObject({ state: "uncertain", consecutivePositiveFrames: 0, consecutiveNegativeFrames: 0 }); expect(processMany(service, 0.2, 5).at(-1)?.transition).toBeNull(); });
  it("does not stop for a brief negative dropout while pouring", () => { const service = startedService(); expect(processMany(service, 0.2, 2).at(-1)).toMatchObject({ transition: null, snapshot: { state: "pouring" } }); expect(service.process(frame(0.8))).toMatchObject({ transition: null, snapshot: { state: "pouring", consecutiveNegativeFrames: 0 } }); });
  it("does not flap confirmed state around evidence 0.5", () => { const service = startedService(); const results = [0.49, 0.51, 0.5, 0.48].map((value) => service.process(frame(value))); expect(results.every((result) => result.transition === null && result.snapshot.state === "uncertain")).toBe(true); expect(processMany(service, 0.2, 5).at(-1)?.transition).toBeNull(); });
  it("requires consecutive evidence despite alternating positive and negative frames", () => { const service = new PourDetectionService(); const results = [0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8].map((value) => service.process(frame(value))); expect(results.every((result) => result.transition === null)).toBe(true); });
});

describe("complete cycles", () => {
  it("emits one start and one stop in a full cycle", () => { const service = new PourDetectionService(); const results = [...processMany(service, 0.8, 4), ...processMany(service, 0.2, 6)]; expect(results.map((result) => result.transition).filter(Boolean)).toEqual(["POUR_STARTED", "POUR_STOPPED"]); });
  it("can start a second cycle after stopping", () => { const service = new PourDetectionService(); processMany(service, 0.8, 4); processMany(service, 0.2, 6); expect(processMany(service, 0.8, 4).at(-1)?.transition).toBe("POUR_STARTED"); });
});

describe("reset", () => {
  it("clears the confirmed pouring state", () => { const service = startedService(); service.reset(); expect(service.process(frame(0.8))).toMatchObject({ transition: null, snapshot: { state: "not_pouring", consecutivePositiveFrames: 1 } }); });
  it("clears both counters", () => { const service = new PourDetectionService(); service.process(frame(0.8)); service.process(frame(0.8)); service.reset(); expect(service.process(frame(0.5)).snapshot).toMatchObject({ consecutivePositiveFrames: 0, consecutiveNegativeFrames: 0 }); });
});

describe("confirmed-state synchronization", () => {
  it("synchronizes to pouring and clears counters", () => {
    const service = new PourDetectionService();
    service.process(frame(0.8));
    service.syncConfirmedState("pouring");
    expect(service.process(frame(0.2))).toMatchObject({
      transition: null,
      snapshot: { state: "pouring", consecutivePositiveFrames: 0, consecutiveNegativeFrames: 1 },
    });
  });

  it("synchronizes to not pouring and clears counters", () => {
    const service = startedService();
    service.process(frame(0.2));
    service.syncConfirmedState("not_pouring");
    expect(service.process(frame(0.8))).toMatchObject({
      transition: null,
      snapshot: { state: "not_pouring", consecutivePositiveFrames: 1, consecutiveNegativeFrames: 0 },
    });
  });
});

describe("evidence safety", () => {
  it("clamps finite evidence below zero", () => expect(new PourDetectionService().process(frame(-2)).snapshot.rawEvidence).toBe(0));
  it("clamps finite evidence above one", () => expect(new PourDetectionService().process(frame(2)).snapshot.rawEvidence).toBe(1));
  it("treats NaN as uncertain with finite snapshot evidence", () => { const result = new PourDetectionService().process(frame(Number.NaN)); expect(result).toMatchObject({ transition: null, snapshot: { state: "uncertain", rawEvidence: 0.5 } }); });
  it("treats Infinity as uncertain with finite snapshot evidence", () => { const result = new PourDetectionService().process(frame(Number.POSITIVE_INFINITY)); expect(result).toMatchObject({ transition: null, snapshot: { state: "uncertain", rawEvidence: 0.5 } }); });
});

describe("custom configuration and snapshots", () => {
  const thresholds: PourDetectionThresholds = { startEvidenceThreshold: 0.8, stopEvidenceThreshold: 0.2, minPositiveFramesForStart: 2, minNegativeFramesForStop: 3 };
  it("uses custom evidence thresholds", () => { const service = new PourDetectionService(thresholds); expect(service.process(frame(0.7)).snapshot.state).toBe("uncertain"); expect(service.process(frame(0.9)).transition).toBeNull(); });
  it("uses custom consecutive frame counts", () => { const service = new PourDetectionService(thresholds); expect(processMany(service, 0.9, 2).at(-1)?.transition).toBe("POUR_STARTED"); expect(processMany(service, 0.1, 3).at(-1)?.transition).toBe("POUR_STOPPED"); });
  it("copies the frame timestamp to the snapshot even when time moves backward", () => { const service = new PourDetectionService(); service.process(frame(0.8, 200)); expect(service.process(frame(0.8, 100)).snapshot.timestampMs).toBe(100); });
  it("copies frame analysis confidence directly", () => expect(new PourDetectionService().process(frame(0.5, 100, 0.37)).snapshot.confidence).toBe(0.37));
  it("reports counters and opposite-counter resets", () => { const service = new PourDetectionService(); expect(service.process(frame(0.8)).snapshot).toMatchObject({ consecutivePositiveFrames: 1, consecutiveNegativeFrames: 0 }); expect(service.process(frame(0.2)).snapshot).toMatchObject({ consecutivePositiveFrames: 0, consecutiveNegativeFrames: 1 }); });
});
