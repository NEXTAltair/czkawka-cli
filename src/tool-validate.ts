import fs from "node:fs";
import { checkPathWritable, toToolResult } from "./runtime";
import { getToolDefinition } from "./tool-definitions";
import { effectiveCacheRoot, effectiveConfigRoot, getVersion, resolveBinaries } from "./czkawka";
import type { AnyObj } from "./types";

export function registerToolValidate(api: any, getCfg: (api: any) => any) {
  const def = getToolDefinition("czkawka_cli_validate");
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
        const checkVideoDeps = params.checkVideoDeps !== false;
        const checkWritablePaths = params.checkWritablePaths !== false;

        const czk = getVersion(bins.czkawkaCliPath, ["--version"]);
        const ffm = checkVideoDeps ? getVersion(bins.ffmpegPath, ["-version"]) : { ok: true, version: "skipped", path: bins.ffmpegPath, stderr: "", stdout: "" };
        const ffp = checkVideoDeps ? getVersion(bins.ffprobePath, ["-version"]) : { ok: true, version: "skipped", path: bins.ffprobePath, stderr: "", stdout: "" };

        const cacheCheck = checkWritablePaths ? checkPathWritable(cacheRootEffective) : { exists: fs.existsSync(cacheRootEffective), writable: true, checkedPath: cacheRootEffective };
        const configCheck = checkWritablePaths ? checkPathWritable(configRootEffective) : { exists: fs.existsSync(configRootEffective), writable: true, checkedPath: configRootEffective };
        const outputCheck = checkWritablePaths ? checkPathWritable(cfg.outputRoot) : { exists: fs.existsSync(cfg.outputRoot), writable: true, checkedPath: cfg.outputRoot };

        const checks = {
          czkawkaCli: { ok: czk.ok, version: czk.version, path: czk.path, stderr: czk.stderr },
          ffmpeg: { ok: ffm.ok, version: ffm.version, path: ffm.path, stderr: ffm.stderr, skipped: !checkVideoDeps },
          ffprobe: { ok: ffp.ok, version: ffp.version, path: ffp.path, stderr: ffp.stderr, skipped: !checkVideoDeps },
          cacheRoot: { ok: cacheCheck.writable, path: cacheRootEffective, exists: cacheCheck.exists, writable: cacheCheck.writable, checkedPath: cacheCheck.checkedPath },
          configRoot: { ok: configCheck.writable, path: configRootEffective, exists: configCheck.exists, writable: configCheck.writable, checkedPath: configCheck.checkedPath },
          outputRoot: { ok: outputCheck.writable, path: cfg.outputRoot, exists: outputCheck.exists, writable: outputCheck.writable, checkedPath: outputCheck.checkedPath },
        };

        const errors: string[] = [];
        const warnings: string[] = [];
        if (!checks.czkawkaCli.ok) errors.push("czkawka_cli not available");
        if (checkVideoDeps && !checks.ffmpeg.ok) errors.push("ffmpeg not available");
        if (checkVideoDeps && !checks.ffprobe.ok) errors.push("ffprobe not available");
        if (checkWritablePaths && !checks.outputRoot.ok) errors.push("outputRoot not writable");
        if (checkWritablePaths && !checks.cacheRoot.ok) warnings.push("cacheRoot not writable (czkawka cache reuse may fail)");
        if (checkWritablePaths && !checks.configRoot.ok) warnings.push("configRoot not writable (czkawka config persistence may fail)");

        return toToolResult({
          ok: errors.length === 0,
          tool: def.name,
          checks,
          errors,
          warnings,
        });
      },
    },
    { optional: true },
  );
}
