#!/usr/bin/env node
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { assertPathWithin, buildExtractionPlan, sha256File } from "./dataset-tools.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${token} requires a value`);
    options[token.slice(2)] = value;
    index += 1;
  }
  return options;
}

function runFfmpeg(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "inherit", shell: false });
    child.once("error", (error) => reject(new Error(`failed to start ffmpeg: ${error.message}`)));
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`ffmpeg exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help !== undefined) throw new Error("use --input VIDEO --output DIRECTORY --fps 2..5 [--start TIME] [--end TIME] [--prefix NAME] [--overwrite]");
  const input = resolve(options.input ?? "");
  const output = resolve(options.output ?? "");
  statSync(input);
  assertPathWithin(resolve("data/vision/frames"), output);
  mkdirSync(output, { recursive: true });
  const plan = buildExtractionPlan({
    input,
    output,
    fps: Number(options.fps),
    start: options.start,
    end: options.end,
    prefix: options.prefix,
    overwrite: options.overwrite === true,
  });
  const sourceSha256 = await sha256File(input);
  console.log(JSON.stringify({ input, output, fps: Number(options.fps), startSeconds: plan.startSeconds, endSeconds: plan.endSeconds, sourceSha256 }, null, 2));
  await runFfmpeg(plan.args);
  console.log("Frame extraction complete. Manually curate for diversity before adding frames to the manifest.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
