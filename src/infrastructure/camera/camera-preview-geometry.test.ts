import { describe, expect, it } from "vitest";
import { previewRectToFrameRoi } from "./camera-preview-geometry";

describe("previewRectToFrameRoi", () => {
  it("maps the visible overlay through a landscape source cropped by object-fit cover", () => {
    const result = previewRectToFrameRoi(
      { x: 0.2, y: 0.22, width: 0.6, height: 0.5 },
      1280,
      720,
      400,
      300,
    );
    expect(result?.x).toBeCloseTo(0.275);
    expect(result?.y).toBeCloseTo(0.22);
    expect(result?.width).toBeCloseTo(0.45);
    expect(result?.height).toBeCloseTo(0.5);
  });

  it("maps a portrait source cropped vertically", () => {
    const result = previewRectToFrameRoi(
      { x: 0.2, y: 0.25, width: 0.6, height: 0.5 },
      720,
      1280,
      400,
      300,
    );

    expect(result?.x).toBeCloseTo(0.2);
    expect(result?.y).toBeCloseTo(0.39453125);
    expect(result?.width).toBeCloseTo(0.6);
    expect(result?.height).toBeCloseTo(0.2109375);
  });

  it("clamps rectangles that cross the visible frame edge", () => {
    expect(previewRectToFrameRoi(
      { x: 0.8, y: 0.8, width: 0.4, height: 0.4 },
      400,
      300,
      400,
      300,
    )).toMatchObject({ x: 0.8, y: 0.8, width: expect.closeTo(0.2), height: expect.closeTo(0.2) });
  });

  it("returns null until video and preview dimensions are available", () => {
    expect(previewRectToFrameRoi({ x: 0, y: 0, width: 1, height: 1 }, 0, 720, 400, 300)).toBeNull();
  });
});
