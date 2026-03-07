---
name: czkawka-cli
description: Use the Czkawka CLI OpenClaw plugin for exact duplicate and similar-video scans. Use this when the user wants duplicate detection, similar video detection, plugin validation/status, or cache diagnostics. This skill enforces plugin tool calls (not shell/exec), explains cache policy (acceleration only), and defines success criteria using rawJsonPath/manifestPath artifacts.
---

# Czkawka CLI Plugin Skill

Use this skill when the user wants to:
- find exact duplicate files (hash-based)
- find similar videos (review required)
- validate the Czkawka plugin/runtime setup
- inspect Czkawka cache/config reuse behavior

## Intent Mapping (Required)

Map user intent to plugin tools first. Do not default to shell commands.

- "check if the plugin works" / "smoke test Czkawka plugin"
  - `czkawka_cli_validate`
  - `czkawka_cli_plugin_status`
- "find duplicate files" / "exact duplicates" / "same file content"
  - `czkawka_cli_dup_hash_scan`
- "find similar videos" / "visually similar recordings"
  - `czkawka_cli_similar_video_scan`
- "show cache status / cache files / config path"
  - `czkawka_cli_cache_info`
  - `czkawka_cli_plugin_status`

## Hard Rules

- Use plugin tool calls only. Do not use `exec`/`process` to run:
  - `czkawka_cli ...`
  - `czkawka ...`
  - `czkawka_cli_validate` (tool name, not shell command)
- Do not infer installation/PATH problems from plugin hook blocks.
  - Hook blocks are policy errors, not proof of missing binaries.
- `czkawka_cli_*` names are plugin tools, not CLI commands.
- This plugin is non-destructive in v1. Do not propose delete/move/trash/hardlink operations.
- `similar_video` results are review candidates only. Never treat them as auto-delete or auto-merge decisions.

## Cache Policy (Important)

- Czkawka cache/config paths are used for scan acceleration only.
- Cache contents are not canonical data and should not be used as a data source for decisions.
- Reuse is achieved by running Czkawka with the same effective:
  - `CZKAWKA_CACHE_PATH`
  - `CZKAWKA_CONFIG_PATH`
- Use `czkawka_cli_cache_info` and `czkawka_cli_plugin_status` to inspect effective paths and cache files.

## Current Wrapped Tools (v1)

- `czkawka_cli_plugin_status`
- `czkawka_cli_validate`
- `czkawka_cli_cache_info`
- `czkawka_cli_dup_hash_scan`
- `czkawka_cli_similar_video_scan`

Not wrapped yet (do not promise these):
- `broken`
- `bad-names`
- `image`
- `music`
- destructive operations (`delete-method`, trash, hardlink, symlink, move)

## Quick Start

1. Validate runtime:
   - call `czkawka_cli_validate`
2. Check resolved paths and latest artifacts:
   - call `czkawka_cli_plugin_status`
3. Run exact duplicate scan:
   - call `czkawka_cli_dup_hash_scan`
4. Run similar video scan (review-only):
   - call `czkawka_cli_similar_video_scan`

## Recommended Parameters

### Exact duplicate (`czkawka_cli_dup_hash_scan`)

- Prefer `hashType: "BLAKE3"`
- Use `referenceDirectories` when comparing target vs known library
- Keep `useCache: true` unless debugging cache behavior
- `saveRawJson: true` recommended
- `saveNormalizedJsonl: false` is the current default (enable only if a consumer needs stable JSONL)

### Similar video (`czkawka_cli_similar_video_scan`)

- Start with:
  - `tolerance: 4`
  - `scanDuration: 10`
  - `skipForwardAmount: 15`
  - `cropDetect: "letterbox"`
- `reviewRequired` is always expected in the result

### tolerance semantics (important)

`tolerance` is the **maximum allowed difference** between video frame hashes.

- **Lower (closer to 0) = stricter** — only near-identical videos are detected
- **Higher (closer to 20) = more lenient** — videos with more visual differences are detected

"Detect more pairs / broaden search" = increase tolerance.
"Detect fewer pairs / narrow search" = decrease tolerance.

## Success Criteria (Do Not Skip)

A scan is only considered successfully executed if the plugin tool returns structured output and artifacts, not just console help text.

For `dup_hash_scan` / `similar_video_scan`, require:
- `ok: true`
- `manifestPath` present
- `rawJsonPath` present (if `saveRawJson=true`)
- `summary` present

Optional:
- `normalizedJsonlPath` only if `saveNormalizedJsonl=true`

If the run only produced CLI help text (`Usage: czkawka_cli ...`) via `exec`, the test is invalid.

## Reporting Rules

When reporting results:
- include the tool name actually called
- include `paramsResolved`
- include `rawJsonPath`, `manifestPath` (and `normalizedJsonlPath` only if requested)
- include `summary`
- for similar video scans, explicitly state: `reviewRequired: true`

Do not:
- summarize from shell help output
- claim plugin success without artifact paths
- describe similar video matches as confirmed duplicates

## Troubleshooting

### Hook blocked an `exec` call

Interpretation:
- This means the workflow policy correctly blocked a shell command.
- It does **not** mean `czkawka_cli` is missing from PATH.

Correct action:
- call the plugin tool directly (`czkawka_cli_validate`, etc.)

### Plugin validate fails

Use `czkawka_cli_validate` output to determine which dependency failed:
- `czkawka_cli`
- `ffmpeg`
- writable `outputRoot`

Then report the exact failed check(s), not a generic installation guess.
