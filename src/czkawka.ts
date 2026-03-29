import fs from "node:fs";
import path from "node:path";
import { buildCzkawkaEnv, normalizeExtensionsForCzkawka, resolveExecutable, runCmd, runCmdViaPwsh } from "./runtime";
import type { AnyObj, CmdResult, CzkawkaPluginConfig, CropDetect, HashType } from "./types";

export function effectiveCacheRoot(cfg: CzkawkaPluginConfig, override?: string): string {
  return path.resolve(override || cfg.cacheRoot || process.env.CZKAWKA_CACHE_PATH || requireDefault("cache"));
}

export function effectiveConfigRoot(cfg: CzkawkaPluginConfig, override?: string): string {
  return path.resolve(override || cfg.configRoot || process.env.CZKAWKA_CONFIG_PATH || requireDefault("config"));
}

function requireDefault(kind: "cache" | "config"): string {
  // defer to runtime defaults without import cycle via dynamic require-equivalent is not available in ESM.
  // fallback heuristic matches runtime helpers.
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  if (process.platform === "win32") {
    if (kind === "cache") return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "czkawka", "cache");
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "czkawka");
  }
  return kind === "cache" ? path.join(home, ".cache", "czkawka") : path.join(home, ".config", "czkawka");
}

export function resolveBinaries(cfg: CzkawkaPluginConfig) {
  return {
    czkawkaCliPath: resolveExecutable(cfg.czkawkaCliPath, "czkawka_cli"),
    ffmpegPath: resolveExecutable(cfg.ffmpegPath, "ffmpeg"),
    ffprobePath: resolveExecutable(cfg.ffprobePath, "ffprobe"),
  };
}

export function getVersion(pathOrCmd: string | null, args: string[] = ["--version"], env?: NodeJS.ProcessEnv): {
  ok: boolean;
  version: string;
  path: string | null;
  stderr: string;
  stdout: string;
} {
  if (!pathOrCmd) return { ok: false, version: "", path: null, stderr: "not configured", stdout: "" };
  const r = runCmd(pathOrCmd, args, { env, timeoutMs: 15000 });
  const line = (r.stdout || r.stderr).split(/\r?\n/).find((s) => s.trim()) || "";
  return { ok: r.ok, version: line.trim(), path: pathOrCmd, stderr: r.stderr.trim(), stdout: r.stdout.trim() };
}

function pushRepeated(args: string[], flag: string, values?: string[]) {
  for (const v of values || []) {
    if (typeof v === "string" && v.trim()) args.push(flag, v.trim());
  }
}

export function buildDupHashArgs(input: {
  directories: string[];
  referenceDirectories?: string[];
  allowedExtensions?: string[];
  excludedDirectories?: string[];
  excludedItems?: string[];
  hashType: HashType;
  threads: number;
  useCache: boolean;
  minFileSizeBytes: number;
  rawJsonPath: string;
}) {
  const args: string[] = ["dup", "--search-method", "HASH", "--hash-type", input.hashType];
  pushRepeated(args, "--directories", input.directories);
  pushRepeated(args, "--reference-directories", input.referenceDirectories);
  pushRepeated(args, "--excluded-directories", input.excludedDirectories);
  pushRepeated(args, "--excluded-items", input.excludedItems);
  pushRepeated(args, "--allowed-extensions", normalizeExtensionsForCzkawka(input.allowedExtensions));
  args.push("--thread-number", String(input.threads));
  args.push("--minimal-file-size", String(Math.max(0, input.minFileSizeBytes)));
  if (!input.useCache) args.push("--disable-cache");
  args.push("--compact-file-to-save", input.rawJsonPath);
  return args;
}

export function buildSimilarVideoArgs(input: {
  directories: string[];
  referenceDirectories?: string[];
  allowedExtensions?: string[];
  excludedDirectories?: string[];
  excludedItems?: string[];
  tolerance: number;
  scanDuration: number;
  skipForwardAmount: number;
  cropDetect: CropDetect;
  threads: number;
  useCache: boolean;
  rawJsonPath: string;
}) {
  const args: string[] = [
    "video",
    "--tolerance",
    String(input.tolerance),
    "--scan-duration",
    String(input.scanDuration),
    "--skip-forward-amount",
    String(input.skipForwardAmount),
    "--crop-detect",
    input.cropDetect,
  ];
  pushRepeated(args, "--directories", input.directories);
  pushRepeated(args, "--reference-directories", input.referenceDirectories);
  pushRepeated(args, "--excluded-directories", input.excludedDirectories);
  pushRepeated(args, "--excluded-items", input.excludedItems);
  pushRepeated(args, "--allowed-extensions", normalizeExtensionsForCzkawka(input.allowedExtensions));
  args.push("--thread-number", String(input.threads));
  if (!input.useCache) args.push("--disable-cache");
  args.push("--compact-file-to-save", input.rawJsonPath);
  return args;
}

export function runCzkawkaCli(opts: {
  cfg: CzkawkaPluginConfig;
  cacheRootEffective: string;
  configRootEffective: string;
  args: string[];
  useWindowsCli?: boolean;
}): { result: CmdResult; binaries: ReturnType<typeof resolveBinaries>; env: NodeJS.ProcessEnv } {
  const binaries = resolveBinaries(opts.cfg);

  if (opts.useWindowsCli) {
    const cmd = opts.cfg.czkawkaCliPath || "windows_czkawka_cli";
    const winArgs = [...opts.args, "-W"].map((arg) =>
      arg.startsWith("/") ? wslPathToWinUncPath(arg) : arg,
    );
    const result = runCmdViaPwsh(cmd, winArgs, { timeoutMs: 60 * 60 * 1000 });
    // exit 11 = "results found" (documented czkawka exit code, not a crash)
    if (result.code === 11) result.ok = true;
    return { result, binaries, env: process.env as NodeJS.ProcessEnv };
  }

  const env = buildCzkawkaEnv({
    cacheRootEffective: opts.cacheRootEffective,
    configRootEffective: opts.configRootEffective,
    ffmpegPath: binaries.ffmpegPath || undefined,
    ffprobePath: binaries.ffprobePath || undefined,
  });
  const cmd = binaries.czkawkaCliPath || "czkawka_cli";
  const result = runCmd(cmd, opts.args, { env, timeoutMs: 60 * 60 * 1000 });
  // czkawka exit code 11 = "duplicates found" (intentional, not a crash)
  if (result.code === 11) result.ok = true;
  return { result, binaries, env };
}

export function loadRawJsonIfExists(filePath: string | null): { ok: boolean; data: unknown | null; error?: string } {
  if (!filePath) return { ok: false, data: null, error: "raw_json_path_missing" };
  if (!fs.existsSync(filePath)) return { ok: false, data: null, error: `raw_json_not_found: ${filePath}` };
  try {
    const txt = fs.readFileSync(filePath, "utf-8");
    return { ok: true, data: JSON.parse(txt) };
  } catch (e: any) {
    return { ok: false, data: null, error: `raw_json_parse_failed: ${String(e?.message || e)}` };
  }
}

export function normalizePathArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
}

export function normalizeFsPathArray(v: unknown): string[] {
  return normalizePathArray(v).map(toCzkawkaFsPath);
}

export function toCzkawkaFsPath(input: string): string {
  const s = String(input || "").trim();
  if (!s) return s;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(s);
  if (!m) return s;
  const drive = m[1].toLowerCase();
  const rest = (m[2] || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return rest ? `/mnt/${drive}/${rest}` : `/mnt/${drive}`;
}

export function isWindowsStylePath(p: string): boolean {
  return /^[A-Za-z]:[\\\/]/.test(p);
}

function wslPathToWinUncPath(wslPath: string): string {
  const distro = process.env.WSL_DISTRO_NAME || "Ubuntu";
  return `\\\\wsl.localhost\\${distro}${wslPath.replace(/\//g, "\\")}`;
}
