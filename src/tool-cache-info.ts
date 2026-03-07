import fs from "node:fs";
import path from "node:path";
import { effectiveCacheRoot, effectiveConfigRoot } from "./czkawka";
import { getToolDefinition } from "./tool-definitions";
import { toToolResult } from "./runtime";
import type { AnyObj } from "./types";

function kindGuess(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("duplicate") && n.includes("prehash")) return "duplicate_prehash";
  if (n.includes("duplicate")) return "duplicate_hash";
  if (n.includes("similar_videos")) return "similar_video";
  if (n.includes("similar_images")) return "similar_image";
  return "unknown";
}

function listFiles(dir: string, maxFiles: number) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((n) => path.join(dir, n))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
    .map((p) => {
      const st = fs.statSync(p);
      return {
        name: path.basename(p),
        path: p,
        sizeBytes: st.size,
        modifiedAt: new Date(st.mtimeMs).toISOString(),
        kindGuess: kindGuess(path.basename(p)),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, maxFiles);
}

export function registerToolCacheInfo(api: any, getCfg: (api: any) => any) {
  const def = getToolDefinition("czkawka_cli_cache_info");
  api.registerTool(
    {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
      async execute(_id: string, params: AnyObj) {
        const cfg = getCfg(api);
        const includeFiles = params.includeFiles !== false;
        const maxFiles = typeof params.maxFiles === "number" ? Math.max(1, Math.min(5000, Math.trunc(params.maxFiles))) : 200;
        const cacheRoot = effectiveCacheRoot(cfg);
        const configRoot = effectiveConfigRoot(cfg);
        const cacheFiles = includeFiles ? listFiles(cacheRoot, maxFiles) : [];
        return toToolResult({
          ok: true,
          tool: def.name,
          cacheRoot,
          configRoot,
          cacheFiles,
          summary: {
            fileCount: cacheFiles.length,
            totalBytes: cacheFiles.reduce((n, f) => n + Number(f.sizeBytes || 0), 0),
          },
        });
      },
    },
    { optional: true },
  );
}
