#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateAnnotations, validateManifest } from "./dataset-tools.mjs";

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function main() {
  const manifestPath = valueAfter("--manifest");
  const annotationsPath = valueAfter("--annotations");
  if (!manifestPath) throw new Error("usage: npm run vision:validate -- --manifest data/vision/manifest.json [--annotations data/vision/annotations/pilot.json]");
  const manifest = readJson(manifestPath);
  const manifestResult = validateManifest(manifest);
  const output = { manifest: manifestResult };
  let hasErrors = manifestResult.errors.length > 0;
  if (annotationsPath && !hasErrors) {
    const annotationResult = validateAnnotations(manifest, readJson(annotationsPath));
    output.annotations = annotationResult;
    hasErrors = annotationResult.errors.length > 0;
  }
  console.log(JSON.stringify(output, null, 2));
  if (hasErrors) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
