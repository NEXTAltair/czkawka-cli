import os from "node:os";
import path from "node:path";
import { getExtensionRootDir } from "./runtime";
import type { AnyObj, CropDetect, CzkawkaPluginConfig, HashType } from "./types";

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined;
}

export function resolveConfig(raw: AnyObj): CzkawkaPluginConfig {
  const outputRoot = asNonEmptyString(raw.outputRoot) || path.join(getExtensionRootDir(), "var");

  const cpuCount = Math.max(1, os.cpus()?.length || 1);
  const defaultThreads = Math.min(128, Math.max(1, asInt(raw.defaultThreads) ?? Math.min(cpuCount, 8)));
  const defaultHashType = (asNonEmptyString(raw.defaultHashType)?.toUpperCase() as HashType | undefined) ?? "BLAKE3";
  const defaultSimilarVideoTolerance = Math.min(
    20,
    Math.max(0, asInt(raw.defaultSimilarVideoTolerance) ?? 4),
  );
  const defaultSimilarVideoScanDuration = Math.min(
    60,
    Math.max(2, asInt(raw.defaultSimilarVideoScanDuration) ?? 10),
  );
  const defaultSimilarVideoSkipForwardAmount = Math.min(
    300,
    Math.max(0, asInt(raw.defaultSimilarVideoSkipForwardAmount) ?? 15),
  );
  const crop = (asNonEmptyString(raw.defaultSimilarVideoCropDetect) as CropDetect | undefined) ?? "letterbox";

  return {
    czkawkaCliPath: asNonEmptyString(raw.czkawkaCliPath),
    ffmpegPath: asNonEmptyString(raw.ffmpegPath),
    ffprobePath: asNonEmptyString(raw.ffprobePath),
    cacheRoot: asNonEmptyString(raw.cacheRoot),
    configRoot: asNonEmptyString(raw.configRoot),
    outputRoot: path.resolve(outputRoot),
    defaultThreads,
    defaultHashType,
    defaultSimilarVideoTolerance,
    defaultSimilarVideoScanDuration,
    defaultSimilarVideoSkipForwardAmount,
    defaultSimilarVideoCropDetect: ["none", "letterbox", "motion"].includes(crop) ? crop : "letterbox",
  };
}
