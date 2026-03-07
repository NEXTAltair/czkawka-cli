import { latestArtifacts } from "./artifacts";
import { getToolDefinition } from "./tool-definitions";
import { resolveBinaries, effectiveCacheRoot, effectiveConfigRoot } from "./czkawka";
import { toToolResult } from "./runtime";
import type { AnyObj } from "./types";
import { pluginId } from "./plugin-meta";

export function registerToolStatus(api: any, getCfg: (api: any) => any) {
  const def = getToolDefinition("czkawka_cli_plugin_status");
  api.registerTool(
    {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
      async execute(_id: string, params: AnyObj) {
        const cfg = getCfg(api);
        const bins = resolveBinaries(cfg);
        const cacheRootEffective = effectiveCacheRoot(cfg);
        const configRootEffective = effectiveConfigRoot(cfg);
        const latest = latestArtifacts(cfg.outputRoot);
        const includeRawPaths = !!params.includeRawPaths;
        const slim = (p: string | null) => (includeRawPaths ? p : p?.split(/[/\\]/).pop() || null);
        return toToolResult({
          ok: true,
          tool: def.name,
          pluginId,
          configured: {
            outputRoot: cfg.outputRoot,
            cacheRoot: cfg.cacheRoot ?? null,
            configRoot: cfg.configRoot ?? null,
            defaultThreads: cfg.defaultThreads,
            defaultHashType: cfg.defaultHashType,
            defaultSimilarVideoTolerance: cfg.defaultSimilarVideoTolerance,
            defaultSimilarVideoScanDuration: cfg.defaultSimilarVideoScanDuration,
            defaultSimilarVideoSkipForwardAmount: cfg.defaultSimilarVideoSkipForwardAmount,
            defaultSimilarVideoCropDetect: cfg.defaultSimilarVideoCropDetect,
          },
          resolved: {
            czkawkaCliPath: bins.czkawkaCliPath,
            ffmpegPath: bins.ffmpegPath,
            ffprobePath: bins.ffprobePath,
            cacheRootEffective,
            configRootEffective,
            outputRoot: cfg.outputRoot,
          },
          artifactsLatest: {
            dupHash: { raw: slim(latest.dupHash.raw), normalized: slim(latest.dupHash.normalized) },
            similarVideo: { raw: slim(latest.similarVideo.raw), normalized: slim(latest.similarVideo.normalized) },
            manifest: slim(latest.manifest),
          },
        });
      },
    },
    { optional: true },
  );
}
