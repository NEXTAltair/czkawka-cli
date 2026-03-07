import fs from "node:fs";
import { cleanupTempArtifacts, makeScanPaths, writeScanManifest } from "./artifacts";
import { buildSimilarVideoArgs, effectiveCacheRoot, effectiveConfigRoot, getVersion, isWindowsStylePath, loadRawJsonIfExists, normalizeFsPathArray, normalizePathArray, runCzkawkaCli } from "./czkawka";
import { normalizeSimilarVideoRaw } from "./normalize";
import { ensureDir, toToolResult, writeJsonlFile } from "./runtime";
import { getToolDefinition } from "./tool-definitions";
import { pluginVersion } from "./plugin-meta";
import type { AnyObj } from "./types";

function metaLine(payload: AnyObj) {
  return { _meta: payload };
}

export function registerToolSimilarVideoScan(api: any, getCfg: (api: any) => any) {
  const def = getToolDefinition("czkawka_cli_similar_video_scan");
  api.registerTool(
    {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
      async execute(_id: string, params: AnyObj) {
        const cfg = getCfg(api);
        const rawDirs: string[] = Array.isArray(params.directories)
          ? params.directories.map((d: unknown) => String(d || "").trim()).filter(Boolean)
          : [];
        const useWindowsCli = rawDirs.some(isWindowsStylePath);
        const normPaths = (v: unknown) =>
          useWindowsCli ? normalizePathArray(v) : normalizeFsPathArray(v);
        const directories = normPaths(params.directories);
        if (!directories.length) {
          return toToolResult({ ok: false, tool: def.name, error: "directories is required" });
        }
        const referenceDirectories = normPaths(params.referenceDirectories);
        const allowedExtensions = normalizePathArray(params.allowedExtensions);
        const excludedDirectories = normPaths(params.excludedDirectories);
        const excludedItems = normalizePathArray(params.excludedItems);
        const tolerance = Math.max(0, Math.min(20, Number(params.tolerance ?? cfg.defaultSimilarVideoTolerance) || cfg.defaultSimilarVideoTolerance));
        const scanDuration = Math.max(2, Math.min(60, Number(params.scanDuration ?? cfg.defaultSimilarVideoScanDuration) || cfg.defaultSimilarVideoScanDuration));
        const skipForwardAmount = Math.max(0, Math.min(300, Number(params.skipForwardAmount ?? cfg.defaultSimilarVideoSkipForwardAmount) || cfg.defaultSimilarVideoSkipForwardAmount));
        const cropDetect = ["none", "letterbox", "motion"].includes(String(params.cropDetect || ""))
          ? String(params.cropDetect)
          : cfg.defaultSimilarVideoCropDetect;
        const threads = Math.max(1, Math.min(128, Number(params.threads ?? cfg.defaultThreads) || cfg.defaultThreads));
        const useCache = params.useCache !== false;
        const saveRawJson = params.saveRawJson !== false;
        const saveNormalizedJsonl = params.saveNormalizedJsonl === true;
        const cacheRootEffective = effectiveCacheRoot(cfg, typeof params.cacheRootOverride === "string" ? params.cacheRootOverride : undefined);
        const configRootEffective = effectiveConfigRoot(cfg, typeof params.configRootOverride === "string" ? params.configRootOverride : undefined);
        ensureDir(cfg.outputRoot);
        ensureDir(cacheRootEffective);
        ensureDir(configRootEffective);

        const scan = makeScanPaths({ outputRoot: cfg.outputRoot, kind: "similar_video", saveRawJson, saveNormalizedJsonl, tag: params.tag });
        const args = buildSimilarVideoArgs({
          directories,
          referenceDirectories,
          allowedExtensions,
          excludedDirectories,
          excludedItems,
          tolerance,
          scanDuration,
          skipForwardAmount,
          cropDetect: cropDetect as any,
          threads,
          useCache,
          rawJsonPath: scan.rawJsonPath!,
        });
        const { result, binaries } = runCzkawkaCli({ cfg, cacheRootEffective, configRootEffective, args, useWindowsCli });
        const paramsResolved = {
          directories,
          referenceDirectories,
          allowedExtensions,
          excludedDirectories,
          excludedItems,
          tolerance,
          scanDuration,
          skipForwardAmount,
          cropDetect,
          threads,
          useCache,
          cacheRootEffective,
          configRootEffective,
        };

        if (!result.ok) {
          const rawJsonPath = scan.rawJsonPath && fs.existsSync(scan.rawJsonPath) ? scan.rawJsonPath : null;
          return toToolResult({
            ok: false,
            tool: def.name,
            kind: "similar_video",
            scanId: scan.scanId,
            exitCode: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
            rawJsonPath,
            paramsResolved,
          });
        }

        const rawLoaded = loadRawJsonIfExists(scan.rawJsonPath);
        if (!rawLoaded.ok) {
          return toToolResult({
            ok: false,
            tool: def.name,
            kind: "similar_video",
            scanId: scan.scanId,
            rawJsonPath: scan.rawJsonPath,
            normalizeError: rawLoaded.error,
            paramsResolved,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        }

        const normalized = normalizeSimilarVideoRaw(rawLoaded.data, { referenceDirectories });
        const rows = [
          metaLine({
            kind: "czkawka_similar_video_scan",
            scanId: scan.scanId,
            generatedAt: new Date().toISOString(),
            tolerance,
            scanDuration,
            skipForwardAmount,
            cropDetect,
            directories,
            referenceDirectories,
            rawJsonPath: saveRawJson ? scan.rawJsonPath : null,
            reviewRequired: true,
          }),
          ...normalized.groups.map((g, idx) => ({ ...g, groupId: `sv-${String(idx + 1).padStart(6, "0")}` })),
        ];
        if (saveNormalizedJsonl) writeJsonlFile(scan.normalizedJsonlPath!, rows);

        const czkVer = getVersion(binaries.czkawkaCliPath, ["--version"]);
        const manifest = {
          scanId: scan.scanId,
          kind: "similar_video",
          generatedAt: new Date().toISOString(),
          tag: params.tag ?? null,
          rawJsonPath: saveRawJson ? scan.rawJsonPath : null,
          normalizedJsonlPath: saveNormalizedJsonl ? scan.normalizedJsonlPath : null,
          paramsResolved,
          summary: normalized.summary,
          toolVersion: pluginVersion,
          czkawkaVersion: czkVer.version || null,
          cacheRootEffective,
          configRootEffective,
          reviewRequired: true,
        };
        writeScanManifest(scan.manifestPath, manifest);
        cleanupTempArtifacts(scan, { keepRaw: saveRawJson, keepNormalized: saveNormalizedJsonl });

        return toToolResult({
          ok: true,
          tool: def.name,
          scanId: scan.scanId,
          kind: "similar_video",
          paramsResolved,
          rawJsonPath: saveRawJson ? scan.rawJsonPath : null,
          normalizedJsonlPath: saveNormalizedJsonl ? scan.normalizedJsonlPath : null,
          manifestPath: scan.manifestPath,
          summary: normalized.summary,
          reviewRequired: true,
          reviewHint: "similar video results can include false positives; human review required",
          normalizeWarnings: normalized.warnings,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      },
    },
    { optional: true },
  );
}
