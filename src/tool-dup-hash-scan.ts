import fs from "node:fs";
import { cleanupTempArtifacts, makeScanPaths, writeScanManifest } from "./artifacts";
import { buildDupHashArgs, effectiveCacheRoot, effectiveConfigRoot, getVersion, isWindowsStylePath, loadRawJsonIfExists, normalizeFsPathArray, normalizePathArray, runCzkawkaCli } from "./czkawka";
import { normalizeDupHashRaw } from "./normalize";
import { ensureDir, toToolResult, writeJsonlFile } from "./runtime";
import { getToolDefinition } from "./tool-definitions";
import { pluginVersion } from "./plugin-meta";
import type { AnyObj } from "./types";

function metaLine(payload: AnyObj) {
  return { _meta: payload };
}

export function registerToolDupHashScan(api: any, getCfg: (api: any) => any) {
  const def = getToolDefinition("czkawka_cli_dup_hash_scan");
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
        const hashType = ["BLAKE3", "XXH3", "CRC32"].includes(String(params.hashType || "").toUpperCase())
          ? String(params.hashType).toUpperCase()
          : cfg.defaultHashType;
        const threads = Math.max(1, Math.min(128, Number(params.threads ?? cfg.defaultThreads) || cfg.defaultThreads));
        const useCache = params.useCache !== false;
        const minFileSizeBytes = Math.max(0, Number(params.minFileSizeBytes ?? 1) || 0);
        const saveRawJson = params.saveRawJson !== false;
        const saveNormalizedJsonl = params.saveNormalizedJsonl === true;
        const cacheRootEffective = effectiveCacheRoot(cfg, typeof params.cacheRootOverride === "string" ? params.cacheRootOverride : undefined);
        const configRootEffective = effectiveConfigRoot(cfg, typeof params.configRootOverride === "string" ? params.configRootOverride : undefined);
        ensureDir(cfg.outputRoot);
        ensureDir(cacheRootEffective);
        ensureDir(configRootEffective);

        const scan = makeScanPaths({ outputRoot: cfg.outputRoot, kind: "dup_hash", saveRawJson, saveNormalizedJsonl, tag: params.tag });
        const args = buildDupHashArgs({
          directories,
          referenceDirectories,
          allowedExtensions,
          excludedDirectories,
          excludedItems,
          hashType: hashType as any,
          threads,
          useCache,
          minFileSizeBytes,
          rawJsonPath: scan.rawJsonPath!,
        });
        const { result, binaries } = runCzkawkaCli({ cfg, cacheRootEffective, configRootEffective, args, useWindowsCli });
        const paramsResolved = {
          directories,
          referenceDirectories,
          allowedExtensions,
          excludedDirectories,
          excludedItems,
          hashType,
          threads,
          useCache,
          minFileSizeBytes,
          cacheRootEffective,
          configRootEffective,
        };

        if (!result.ok) {
          const rawJsonPath = scan.rawJsonPath && fs.existsSync(scan.rawJsonPath) ? scan.rawJsonPath : null;
          return toToolResult({
            ok: false,
            tool: def.name,
            kind: "dup_hash",
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
            kind: "dup_hash",
            scanId: scan.scanId,
            rawJsonPath: scan.rawJsonPath,
            normalizeError: rawLoaded.error,
            paramsResolved,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        }

        const normalized = normalizeDupHashRaw(rawLoaded.data, { referenceDirectories });
        const rows = [
          metaLine({
            kind: "czkawka_dup_hash_scan",
            scanId: scan.scanId,
            generatedAt: new Date().toISOString(),
            hashType,
            directories,
            referenceDirectories,
            rawJsonPath: saveRawJson ? scan.rawJsonPath : null,
          }),
          ...normalized.groups.map((g, idx) => ({ ...g, hashAlgo: hashType, groupId: `dup-${String(idx + 1).padStart(6, "0")}` })),
        ];
        if (saveNormalizedJsonl) writeJsonlFile(scan.normalizedJsonlPath!, rows);

        const czkVer = getVersion(binaries.czkawkaCliPath, ["--version"]);
        const manifest = {
          scanId: scan.scanId,
          kind: "dup_hash",
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
        };
        writeScanManifest(scan.manifestPath, manifest);
        cleanupTempArtifacts(scan, { keepRaw: saveRawJson, keepNormalized: saveNormalizedJsonl });

        return toToolResult({
          ok: true,
          tool: def.name,
          scanId: scan.scanId,
          kind: "dup_hash",
          paramsResolved,
          rawJsonPath: saveRawJson ? scan.rawJsonPath : null,
          normalizedJsonlPath: saveNormalizedJsonl ? scan.normalizedJsonlPath : null,
          manifestPath: scan.manifestPath,
          summary: normalized.summary,
          reviewRequired: false,
          normalizeWarnings: normalized.warnings,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      },
    },
    { optional: true },
  );
}
