import { describe, expect, it } from "vitest";
import { normalizeCvatPasses, parseCvatImagesXml, readZipEntry } from "./cvat-normalizer.mjs";

function storedZip(name, content) {
  const filename = Buffer.from(name);
  const payload = Buffer.from(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(payload.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + filename.length, 12);
  eocd.writeUInt32LE(local.length + filename.length + payload.length, 16);
  return Buffer.concat([local, filename, payload, central, filename, eocd]);
}

function xml(images) {
  return `<?xml version="1.0"?><annotations><version>1.1</version>${images}</annotations>`;
}

function positiveImage(name, offset = 0) {
  return `<image id="0" name="${name}" width="1080" height="1920">
    <box label="gooseneck_spout" xtl="${100 + offset}" ytl="200" xbr="400" ybr="500" />
    <points label="spout_tip" points="300,450"><attribute name="visibility">visible</attribute></points>
    <points label="spout_neck_base" points="150,250"><attribute name="visibility">partially_occluded</attribute></points>
    <ellipse label="dripper" cx="540" cy="700" rx="250" ry="270" />
  </image>`;
}

const manifest = {
  datasetVersion: "cupmaster-spout-pilot-v0",
  frames: [
    { frameId: "frame-positive", path: "frames/session/frame-positive.jpg", width: 1080, height: 1920, kind: "positive" },
    { frameId: "frame-negative", path: "frames/session/frame-negative.jpg", width: 1080, height: 1920, kind: "negative" },
  ],
};

describe("CVAT for images 1.1 normalization", () => {
  it("reads annotations.xml directly from a ZIP archive", () => {
    const archive = storedZip("annotations.xml", "<annotations />");
    expect(readZipEntry(archive, "annotations.xml").toString("utf8")).toBe("<annotations />");
  });

  it("parses actual image, rectangle, point, visibility, and ellipse structures", () => {
    const parsed = parseCvatImagesXml(xml(positiveImage("frame-positive.jpg")));
    expect(parsed.version).toBe("1.1");
    expect(parsed.images[0]).toMatchObject({ name: "frame-positive.jpg", width: 1080, height: 1920 });
    expect(parsed.images[0].shapes.map((shape) => shape.label)).toEqual([
      "gooseneck_spout",
      "spout_tip",
      "spout_neck_base",
      "dripper",
    ]);
    expect(parsed.images[0].shapes[2].visibility).toBe("partially_occluded");
  });

  it("pairs passes by source filename and builds normalized annotations", () => {
    const first = parseCvatImagesXml(xml(`${positiveImage("frame-positive.jpg")}<image id="1" name="frame-negative.jpg" width="1080" height="1920"></image>`));
    const second = parseCvatImagesXml(xml(positiveImage("frame-positive.jpg", 10)));
    const result = normalizeCvatPasses(manifest, [
      { passId: "pilot-pass-1", document: first },
      { passId: "pilot-pass-2", document: second },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.summary).toMatchObject({ pairedFrames: 1, negativeFalseAnnotationCount: 0 });
    expect(result.document.passes[0].annotations[0]).toMatchObject({
      frameId: "frame-positive",
      dripper: { centerX: 540, centerY: 700, radius: Math.sqrt(250 * 270) },
      objects: [{ class: "gooseneck_spout", spoutTip: { visibility: "visible" } }],
    });
  });

  it("reports empty exports without fabricating a normalized document", () => {
    const first = parseCvatImagesXml(xml('<image id="0" name="frame-positive.jpg" width="1080" height="1920"></image>'));
    const second = parseCvatImagesXml(xml('<image id="0" name="frame-positive.jpg" width="1080" height="1920"></image>'));
    const result = normalizeCvatPasses(manifest, [
      { passId: "pilot-pass-1", document: first },
      { passId: "pilot-pass-2", document: second },
    ]);
    expect(result.document).toBeNull();
    expect(result.summary.pairedFrames).toBe(1);
    expect(result.summary.passes[0].shapeCount).toBe(0);
    expect(result.errors).toContain("pilot-pass-1 contains zero annotation shapes");
  });
});
