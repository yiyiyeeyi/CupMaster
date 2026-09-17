#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { normalizeCvatPasses, parseCvatImagesXml, readZipEntry } from "./cvat-normalizer.mjs";

function valuesAfter(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function valueAfter(flag) {
  return valuesAfter(flag)[0];
}

function passId(path, index) {
  const match = path.match(/pass[-_]?([a-z0-9]+)/i);
  return match ? `pilot-pass-${match[1]}` : `pilot-pass-${index + 1}`;
}

function main() {
  const manifestPath = valueAfter("--manifest");
  const passPaths = valuesAfter("--pass");
  const outputPath = valueAfter("--output");
  const qaOutputPath = valueAfter("--qa-output");
  if (!manifestPath || passPaths.length === 0) {
    throw new Error("usage: npm run vision:normalize:cvat -- --manifest MANIFEST --pass PASS.zip [--pass PASS.zip] --output ANNOTATIONS.json [--qa-output QA.json]");
  }
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
  const passes = passPaths.map((path, index) => {
    const archive = readFileSync(resolve(path));
    const xml = readZipEntry(archive, "annotations.xml").toString("utf8");
    return { passId: passId(path, index), document: parseCvatImagesXml(xml) };
  });
  const result = normalizeCvatPasses(manifest, passes);
  const qa = { format: "CVAT for images 1.1", errors: result.errors, warnings: result.warnings, summary: result.summary };
  if (qaOutputPath) {
    const resolvedQaOutput = resolve(qaOutputPath);
    mkdirSync(dirname(resolvedQaOutput), { recursive: true });
    writeFileSync(resolvedQaOutput, `${JSON.stringify(qa, null, 2)}\n`);
  }
  if (result.document && outputPath) {
    const resolvedOutput = resolve(outputPath);
    mkdirSync(dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, `${JSON.stringify(result.document, null, 2)}\n`);
  }
  console.log(JSON.stringify(qa, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
