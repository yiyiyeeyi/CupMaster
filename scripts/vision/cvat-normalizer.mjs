import { inflateRawSync } from "node:zlib";
import { basename } from "node:path";

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found");
}

export function readZipEntry(buffer, requestedName) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("invalid ZIP central-directory entry");
    const flags = buffer.readUInt16LE(centralOffset + 8);
    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
    const nameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");

    if (name === requestedName) {
      if ((flags & 0x1) !== 0) throw new Error(`${requestedName} is encrypted`);
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("invalid ZIP local-file header");
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      const result = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (result === null) throw new Error(`unsupported ZIP compression method ${method}`);
      if (result.length !== uncompressedSize) throw new Error(`${requestedName} has an invalid uncompressed size`);
      return result;
    }

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP entry ${requestedName} was not found`);
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributesFrom(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w-]+)="([^"]*)"/g)) attributes[match[1]] = decodeXml(match[2]);
  return attributes;
}

function visibilityFrom(body) {
  for (const match of body.matchAll(/<attribute\b([^>]*)>([\s\S]*?)<\/attribute>/g)) {
    if (attributesFrom(match[1]).name === "visibility") return decodeXml(match[2].trim());
  }
  return "visible";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseShape(type, attributeSource, body) {
  const attributes = attributesFrom(attributeSource);
  const shape = { type, label: attributes.label ?? "", visibility: visibilityFrom(body) };
  if (type === "box") {
    return {
      ...shape,
      xMin: finiteNumber(attributes.xtl),
      yMin: finiteNumber(attributes.ytl),
      xMax: finiteNumber(attributes.xbr),
      yMax: finiteNumber(attributes.ybr),
    };
  }
  if (type === "ellipse") {
    return {
      ...shape,
      centerX: finiteNumber(attributes.cx),
      centerY: finiteNumber(attributes.cy),
      radiusX: finiteNumber(attributes.rx),
      radiusY: finiteNumber(attributes.ry),
    };
  }
  const coordinates = (attributes.points ?? "").split(";").map((pair) => pair.split(",").map(Number));
  return { ...shape, points: coordinates.filter((pair) => pair.length === 2 && pair.every(Number.isFinite)) };
}

export function parseCvatImagesXml(xml) {
  const version = xml.match(/<version>([^<]+)<\/version>/)?.[1]?.trim();
  if (version !== "1.1") throw new Error(`expected CVAT for images 1.1, received ${version ?? "unknown"}`);
  const images = [];
  for (const match of xml.matchAll(/<image\b([^>]*)>([\s\S]*?)<\/image>/g)) {
    const attributes = attributesFrom(match[1]);
    const shapes = [];
    for (const shapeMatch of match[2].matchAll(/<(box|points|ellipse)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      shapes.push(parseShape(shapeMatch[1], shapeMatch[2], shapeMatch[3] ?? ""));
    }
    images.push({
      id: attributes.id ?? "",
      name: attributes.name ?? "",
      width: finiteNumber(attributes.width),
      height: finiteNumber(attributes.height),
      shapes,
    });
  }
  return { version, images };
}

function oneShape(shapes, label, errors, context, required) {
  const matches = shapes.filter((shape) => shape.label === label);
  if (matches.length > 1) errors.push(`${context} has ${matches.length} ${label} shapes; expected at most one`);
  if (required && matches.length === 0) errors.push(`${context} is missing ${label}`);
  return matches[0];
}

function pointFrom(shape, errors, context) {
  if (!shape) return undefined;
  if (shape.type !== "points" || shape.points.length !== 1) {
    errors.push(`${context} must be exactly one CVAT point`);
    return undefined;
  }
  return { x: shape.points[0][0], y: shape.points[0][1], visibility: shape.visibility };
}

function dripperFrom(shape, errors, context) {
  if (!shape) return undefined;
  if (shape.type === "ellipse") {
    const values = [shape.centerX, shape.centerY, shape.radiusX, shape.radiusY];
    if (values.some((value) => value === null) || shape.radiusX <= 0 || shape.radiusY <= 0) {
      errors.push(`${context} has invalid ellipse coordinates`);
      return undefined;
    }
    return { centerX: shape.centerX, centerY: shape.centerY, radius: Math.sqrt(shape.radiusX * shape.radiusY) };
  }
  if (shape.type === "box") {
    const values = [shape.xMin, shape.yMin, shape.xMax, shape.yMax];
    if (values.some((value) => value === null) || shape.xMin >= shape.xMax || shape.yMin >= shape.yMax) {
      errors.push(`${context} has invalid box coordinates`);
      return undefined;
    }
    return {
      centerX: (shape.xMin + shape.xMax) / 2,
      centerY: (shape.yMin + shape.yMax) / 2,
      radius: ((shape.xMax - shape.xMin) + (shape.yMax - shape.yMin)) / 4,
    };
  }
  errors.push(`${context} must be a CVAT ellipse or box`);
  return undefined;
}

export function normalizeCvatPasses(manifest, passes) {
  const errors = [];
  const warnings = [];
  const manifestByName = new Map();
  for (const frame of manifest.frames) {
    const name = basename(frame.path.replaceAll("\\", "/"));
    if (manifestByName.has(name)) errors.push(`manifest filename ${name} is not unique`);
    manifestByName.set(name, frame);
  }

  const passFrames = [];
  const normalizedPasses = [];
  let negativeFalseAnnotationCount = 0;
  for (const pass of passes) {
    const passHasShapes = pass.document.images.some((image) => image.shapes.length > 0);
    if (!passHasShapes) errors.push(`${pass.passId} contains zero annotation shapes`);
    const seen = new Set();
    const annotations = [];
    let shapeCount = 0;
    let boxCount = 0;
    let tipCount = 0;
    let neckBaseCount = 0;
    let dripperCount = 0;
    let positiveImages = 0;
    let negativeImages = 0;
    for (const image of pass.document.images) {
      const name = basename(image.name.replaceAll("\\", "/"));
      const frame = manifestByName.get(name);
      if (!frame) {
        errors.push(`${pass.passId} image ${image.name} does not match a manifest frame`);
        continue;
      }
      if (seen.has(frame.frameId)) errors.push(`${pass.passId} contains duplicate source frame ${frame.frameId}`);
      seen.add(frame.frameId);
      shapeCount += image.shapes.length;
      if (frame.kind === "positive") positiveImages += 1;
      else negativeImages += 1;

      const context = `${pass.passId}/${frame.frameId}`;
      const requiredPositiveShape = frame.kind === "positive" && passHasShapes;
      const spoutBox = oneShape(image.shapes, "gooseneck_spout", errors, context, requiredPositiveShape);
      const tipShape = oneShape(image.shapes, "spout_tip", errors, context, requiredPositiveShape);
      const neckShape = oneShape(image.shapes, "spout_neck_base", errors, context, false);
      const dripperShape = oneShape(image.shapes, "dripper", errors, context, requiredPositiveShape);
      if (spoutBox) boxCount += 1;
      if (tipShape) tipCount += 1;
      if (neckShape) neckBaseCount += 1;
      if (dripperShape) dripperCount += 1;

      const spoutShapes = image.shapes.filter((shape) => ["gooseneck_spout", "spout_tip", "spout_neck_base"].includes(shape.label));
      if (frame.kind === "negative" && spoutShapes.length > 0) negativeFalseAnnotationCount += 1;
      if (frame.kind === "negative") {
        annotations.push({ frameId: frame.frameId, dripper: { centerX: frame.width / 2, centerY: frame.height / 2, radius: 1 }, objects: [] });
        continue;
      }

      if (spoutBox && spoutBox.type !== "box") errors.push(`${context}/gooseneck_spout must be a CVAT rectangle`);
      const bbox = spoutBox?.type === "box" ? {
        xMin: spoutBox.xMin,
        yMin: spoutBox.yMin,
        xMax: spoutBox.xMax,
        yMax: spoutBox.yMax,
      } : undefined;
      const spoutTip = pointFrom(tipShape, errors, `${context}/spout_tip`);
      const spoutNeckBase = pointFrom(neckShape, errors, `${context}/spout_neck_base`);
      const dripper = dripperFrom(dripperShape, errors, `${context}/dripper`);
      if (bbox && spoutTip && dripper) {
        const object = { class: "gooseneck_spout", bbox, spoutTip };
        if (spoutNeckBase) object.spoutNeckBase = spoutNeckBase;
        annotations.push({ frameId: frame.frameId, dripper, objects: [object] });
      }
    }
    passFrames.push({ passId: pass.passId, frames: seen });
    normalizedPasses.push({ passId: pass.passId, annotations });
    pass.summary = {
      images: pass.document.images.length,
      matchedFrames: seen.size,
      positiveImages,
      negativeImages,
      shapeCount,
      gooseneckSpoutBoxes: boxCount,
      spoutTips: tipCount,
      spoutNeckBases: neckBaseCount,
      dripperReferences: dripperCount,
    };
  }

  let pairedFrames = 0;
  if (passFrames.length >= 2) {
    const primary = passFrames[0].frames;
    for (const frameId of passFrames[1].frames) {
      if (!primary.has(frameId)) errors.push(`${passFrames[1].passId} frame ${frameId} is absent from ${passFrames[0].passId}`);
      else pairedFrames += 1;
    }
  } else warnings.push("fewer than two annotation passes were supplied");

  return {
    errors,
    warnings,
    summary: {
      passes: passes.map((pass) => ({ passId: pass.passId, ...pass.summary })),
      pairedFrames,
      negativeFalseAnnotationCount,
    },
    document: errors.length === 0 ? {
      schemaVersion: 1,
      datasetVersion: manifest.datasetVersion,
      passes: normalizedPasses,
    } : null,
  };
}
