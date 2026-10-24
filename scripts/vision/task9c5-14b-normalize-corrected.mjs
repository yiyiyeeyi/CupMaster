#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runNormalization } from "./task9c5-11-normalize-targeted.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DATASET_ROOT = resolve(ROOT, ".vision-work/datasets/task-9c5-11");

const paths = {
  via: resolve(DATASET_ROOT, "annotation/via-task-9c5-11-targeted-v1.json"),
  manifest: resolve(DATASET_ROOT, "annotation/annotation-manifest.json"),
  images: resolve(DATASET_ROOT, "annotation/images"),
  output: resolve(DATASET_ROOT, "annotations/task-9c5-11-targeted-v1.corrected.normalized.json"),
  qa: resolve(DATASET_ROOT, "annotations/task-9c5-11-targeted-v1.corrected.qa.json"),
};

try {
  const result = runNormalization(paths, { datasetVersion: "task-9c5-11-targeted-v1-corrected" });
  console.log(JSON.stringify(result.qa, null, 2));
  if (result.qa.errors.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
