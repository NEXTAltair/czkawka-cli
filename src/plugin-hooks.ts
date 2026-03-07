import type { AnyObj } from "./types";

const TOOL_NAME_REGEX = /^czkawka_cli_[a-z0-9_]+$/;
const REST_GUESS_RE = /\/api\/v1\/plugins\/czkawka-cli\//i;

function isShellLikeToolName(name: unknown): boolean {
  const s = String(name || "");
  return s === "exec" || s === "process";
}

function isObj(v: unknown): v is AnyObj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function getExecCommand(event: AnyObj): string {
  const params = isObj(event?.params) ? event.params : {};
  const byCommand = typeof params.command === "string" ? params.command : "";
  const byCmd = typeof params.cmd === "string" ? params.cmd : "";
  return String(byCommand || byCmd || "").trim();
}

function getFirstToken(command: string): string {
  return (command.split(/\s+/, 1)[0] || "").trim();
}

function getShellTokens(command: string): string[] {
  return command.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

function getOpenclawSubcommand(command: string): string {
  const tokens = getShellTokens(command);
  if ((tokens[0] || "") !== "openclaw") return "";
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i] || "";
    if (!t) continue;
    if (t.startsWith("-")) continue;
    return t;
  }
  return "";
}

function detectMistakenExecToolName(event: AnyObj): string | null {
  if (!isShellLikeToolName(event?.toolName)) return null;
  const command = getExecCommand(event);
  if (!command) return null;
  const firstToken = getFirstToken(command);
  if (!TOOL_NAME_REGEX.test(firstToken)) return null;
  return firstToken;
}

function detectDirectCzkawkaCliHelpOrRun(event: AnyObj): string | null {
  if (!isShellLikeToolName(event?.toolName)) return null;
  const command = getExecCommand(event);
  if (!command) return null;
  const firstToken = getFirstToken(command).toLowerCase();
  if (firstToken !== "czkawka_cli" && firstToken !== "czkawka") return null;
  return command;
}

function detectMistakenOpenclawCliPluginToolInvocation(event: AnyObj): string | null {
  if (!isShellLikeToolName(event?.toolName)) return null;
  const command = getExecCommand(event);
  if (!command) return null;
  const firstToken = getFirstToken(command);
  // Only inspect commands that actually invoke the `openclaw` CLI.
  // This avoids false positives for normal path probes like:
  //   ls ~/.openclaw/extensions/czkawka-cli/
  // which contains both ".openclaw" and "czkawka-cli" as path segments.
  if (firstToken !== "openclaw") return null;
  // Common confusion patterns:
  // - `openclaw czkawka-cli status`
  // - `openclaw czkawka-cli plugin-status`
  // - `openclaw plugin(s) ... czkawka_cli_<tool>`
  const openclawSubcommand = getOpenclawSubcommand(command).toLowerCase();
  if (openclawSubcommand === "czkawka-cli") return command;
  if (!/\bplugins?\b/i.test(command)) return null;
  if (!/\bczkawka_cli_[a-z0-9_]+\b/i.test(command)) return null;
  return command;
}

function detectGuessedPluginRestEndpointCall(event: AnyObj): string | null {
  if (!isShellLikeToolName(event?.toolName)) return null;
  const command = getExecCommand(event);
  if (!command) return null;
  if (!/\bcurl\b/i.test(command)) return null;
  if (!REST_GUESS_RE.test(command)) return null;
  return command;
}

export function registerPluginHooks(api: any) {
  api.on("before_tool_call", (event: AnyObj) => {
    const mistakenTool = detectMistakenExecToolName(event);
    if (mistakenTool) {
      return {
        block: true,
        blockReason:
          `blocked mistaken shell call: '${mistakenTool}' is a plugin tool name, not a shell command. ` +
          `Call the tool directly as ${mistakenTool} with JSON params. ` +
          "This is a hook policy block, not a PATH/install error.",
      };
    }

    const directCli = detectDirectCzkawkaCliHelpOrRun(event);
    if (directCli) {
      return {
        block: true,
        blockReason:
          "blocked shell call: do not run Czkawka CLI directly in this workflow. " +
          "Use plugin tools instead: czkawka_cli_validate, czkawka_cli_plugin_status, " +
          "czkawka_cli_dup_hash_scan, czkawka_cli_similar_video_scan. " +
          "This is a hook policy block, not a PATH/install error.",
      };
    }

    const openclawCliMistake = detectMistakenOpenclawCliPluginToolInvocation(event);
    if (openclawCliMistake) {
      return {
        block: true,
        blockReason:
          "blocked shell call: 'czkawka-cli' plugin id is not an OpenClaw CLI subcommand. " +
          "Also, plugin tools are not shell/CLI commands. " +
          "Call czkawka_cli_validate / czkawka_cli_plugin_status / czkawka_cli_dup_hash_scan / " +
          "czkawka_cli_similar_video_scan directly as plugin tools with JSON params. " +
          "This is a hook policy block, not a PATH/install error.",
      };
    }

    const guessedRest = detectGuessedPluginRestEndpointCall(event);
    if (guessedRest) {
      return {
        block: true,
        blockReason:
          "blocked shell call: guessed REST endpoint access is not the supported plugin invocation path. " +
          "Use plugin tool calls (czkawka_cli_*) instead of curl /api/v1/plugins/... endpoints. " +
          "This is a hook policy block, not a PATH/install error.",
      };
    }

    return undefined;
  });
}
