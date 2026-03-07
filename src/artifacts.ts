import fs from "node:fs";
import path from "node:path";
import { ensureDir, latestFileByPrefix, newScanId, sanitizeTag, tsCompact, writeJsonFile } from "./runtime";
import type { AnyObj, ArtifactDirs, ScanKind, ScanPaths } from "./types";

export function getArtifactDirs(outputRoot: string): ArtifactDirs {
  return {
    rawDir: path.join(outputRoot, "raw"),
    normalizedDir: path.join(outputRoot, "normalized"),
    manifestsDir: path.join(outputRoot, "manifests"),
  };
}

export function ensureArtifactDirs(outputRoot: string): ArtifactDirs {
  const dirs = getArtifactDirs(outputRoot);
  ensureDir(dirs.rawDir);
  ensureDir(dirs.normalizedDir);
  ensureDir(dirs.manifestsDir);
  return dirs;
}

export function makeScanPaths(opts: {
  outputRoot: string;
  kind: ScanKind;
  saveRawJson: boolean;
  saveNormalizedJsonl: boolean;
  tag?: string;
}): ScanPaths {
  const dirs = ensureArtifactDirs(opts.outputRoot);
  const scanId = newScanId();
  const ts = tsCompact();
  const tag = sanitizeTag(opts.tag);
  const prefix = `${opts.kind}_${ts}${tag ? `_${tag}` : ""}_${scanId}`;
  return {
    scanId,
    ts,
    rawJsonPath: opts.saveRawJson ? path.join(dirs.rawDir, `${prefix}.json`) : path.join(dirs.rawDir, `${prefix}.tmp.json`),
    normalizedJsonlPath: opts.saveNormalizedJsonl
      ? path.join(dirs.normalizedDir, `${prefix}.jsonl`)
      : path.join(dirs.normalizedDir, `${prefix}.tmp.jsonl`),
    manifestPath: path.join(dirs.manifestsDir, `scan_manifest_${ts}_${scanId}.json`),
  };
}

export function cleanupTempArtifacts(paths: ScanPaths, opts: { keepRaw: boolean; keepNormalized: boolean }) {
  if (!opts.keepRaw && paths.rawJsonPath && paths.rawJsonPath.endsWith(".tmp.json") && fs.existsSync(paths.rawJsonPath)) {
    fs.unlinkSync(paths.rawJsonPath);
  }
  if (
    !opts.keepNormalized &&
    paths.normalizedJsonlPath &&
    paths.normalizedJsonlPath.endsWith(".tmp.jsonl") &&
    fs.existsSync(paths.normalizedJsonlPath)
  ) {
    fs.unlinkSync(paths.normalizedJsonlPath);
  }
}

export function writeScanManifest(filePath: string, manifest: AnyObj) {
  writeJsonFile(filePath, manifest);
}

export function latestArtifacts(outputRoot: string) {
  const dirs = getArtifactDirs(outputRoot);
  return {
    dupHash: {
      raw: latestFileByPrefix(dirs.rawDir, "dup_hash_", ".json"),
      normalized: latestFileByPrefix(dirs.normalizedDir, "dup_hash_", ".jsonl"),
    },
    similarVideo: {
      raw: latestFileByPrefix(dirs.rawDir, "similar_video_", ".json"),
      normalized: latestFileByPrefix(dirs.normalizedDir, "similar_video_", ".jsonl"),
    },
    manifest: latestFileByPrefix(dirs.manifestsDir, "scan_manifest_", ".json"),
  };
}
