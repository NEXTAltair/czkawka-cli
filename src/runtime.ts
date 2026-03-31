import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { AnyObj, CmdResult } from "./types";

const EXT_SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT_DIR = path.resolve(EXT_SRC_DIR, "..");

export function getExtensionRootDir(): string {
  return EXT_ROOT_DIR;
}

export function runCmd(
  command: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): CmdResult {
  const cp = spawnSync(command, args, {
    cwd: opts?.cwd,
    env: opts?.env ?? process.env,
    encoding: "utf-8",
    timeout: opts?.timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: cp.status === 0,
    code: cp.status ?? 1,
    stdout: cp.stdout ?? "",
    stderr: cp.stderr ?? "",
    command,
    args,
    cwd: opts?.cwd,
  };
}

// Openclaw の実行コンテキストでは Windows PATH が継承されないため
// pwsh.exe をフルパスで解決する。
const PWSH_CANDIDATES = [
  "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
  "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
];

function resolvePwsh(): string {
  const pathVar = process.env.PATH || "";
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, "pwsh.exe");
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* continue */ }
  }
  for (const p of PWSH_CANDIDATES) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* continue */ }
  }
  return "pwsh.exe";
}

export function runCmdViaPwsh(
  command: string,
  args: string[],
  opts?: { timeoutMs?: number },
): CmdResult {
  const pwsh = resolvePwsh();
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const psCommand = `& ${[command, ...args].map(quote).join(" ")}; exit $LASTEXITCODE`;
  const cp = spawnSync(pwsh, ["-NoProfile", "-Command", psCommand], {
    encoding: "utf-8",
    timeout: opts?.timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: cp.status === 0,
    code: cp.status ?? 1,
    stdout: cp.stdout ?? "",
    stderr: cp.stderr ?? "",
    command,
    args,
  };
}

export function toToolResult(obj: Record<string, unknown>) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function ensureDirForFile(filePath: string) {
  ensureDir(path.dirname(filePath));
}

export function writeJsonFile(filePath: string, data: unknown) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function writeJsonlFile(filePath: string, rows: unknown[]) {
  ensureDirForFile(filePath);
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  fs.writeFileSync(filePath, body, "utf-8");
}

export function readJsonFile<T = AnyObj>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

export function latestFileByPrefix(dir: string, prefix: string, suffix: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(prefix) && n.endsWith(suffix))
    .map((n) => path.join(dir, n))
    .map((p) => ({ p, m: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0]?.p ?? null;
}

export function tsCompact(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${pad(d.getMilliseconds(), 3)}`
  );
}

export function newScanId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export function sanitizeTag(tag?: string): string | undefined {
  if (!tag || !tag.trim()) return undefined;
  const s = tag.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s || undefined;
}

export function detectDefaultCacheRoot(): string {
  const env = process.env.CZKAWKA_CACHE_PATH;
  if (env?.trim()) return path.resolve(env);
  if (process.platform === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localApp, "czkawka", "cache");
  }
  return path.join(os.homedir(), ".cache", "czkawka");
}

export function detectDefaultConfigRoot(): string {
  const env = process.env.CZKAWKA_CONFIG_PATH;
  if (env?.trim()) return path.resolve(env);
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "czkawka");
  }
  return path.join(os.homedir(), ".config", "czkawka");
}

export function checkPathWritable(p: string): { exists: boolean; writable: boolean; checkedPath: string } {
  try {
    if (fs.existsSync(p)) {
      fs.accessSync(p, fs.constants.W_OK);
      return { exists: true, writable: true, checkedPath: p };
    }
    const parent = path.dirname(p);
    fs.accessSync(parent, fs.constants.W_OK);
    return { exists: false, writable: true, checkedPath: parent };
  } catch {
    return { exists: fs.existsSync(p), writable: false, checkedPath: fs.existsSync(p) ? p : path.dirname(p) };
  }
}

export function findExecutableOnPath(name: string): string | null {
  const pathVar = process.env.PATH || "";
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, `${name}${ext}`);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        // continue
      }
    }
  }
  return null;
}

export function resolveExecutable(configuredPath: string | undefined, fallbackName: string): string | null {
  if (configuredPath && configuredPath.trim()) {
    const p = configuredPath.trim();
    return fs.existsSync(p) ? p : p;
  }
  return findExecutableOnPath(fallbackName) ?? fallbackName;
}

export function prependPathDirs(env: NodeJS.ProcessEnv, filePaths: Array<string | undefined>): NodeJS.ProcessEnv {
  const dirs = Array.from(
    new Set(
      filePaths
        .filter((p): p is string => !!p && p.trim().length > 0)
        .map((p) => path.dirname(p)),
    ),
  );
  if (!dirs.length) return env;
  const pathVar = env.PATH || "";
  return { ...env, PATH: `${dirs.join(path.delimiter)}${pathVar ? path.delimiter + pathVar : ""}` };
}

export function buildCzkawkaEnv(opts: {
  cacheRootEffective: string;
  configRootEffective: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}): NodeJS.ProcessEnv {
  let env: NodeJS.ProcessEnv = { ...process.env };
  env.CZKAWKA_CACHE_PATH = opts.cacheRootEffective;
  env.CZKAWKA_CONFIG_PATH = opts.configRootEffective;
  env = prependPathDirs(env, [opts.ffmpegPath, opts.ffprobePath]);
  return env;
}

export function normalizeExtensionsForCzkawka(list?: string[]): string[] {
  return (list || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\./, ""));
}

export function pathStartsWithAny(inputPath: string, roots: string[]): boolean {
  const norm = canonicalPathForCompare(inputPath);
  return roots.some((r) => {
    const rr = canonicalPathForCompare(r);
    return norm === rr || norm.startsWith(rr + "/");
  });
}

export function canonicalPathForCompare(p: string): string {
  return String(p || "")
    .replace(/\\+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "")
    .replace(/^([A-Za-z]):/, (_, d) => `${d.toLowerCase()}:`);
}
