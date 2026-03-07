import type { ToolDef } from "./types";

export const TOOL_DEFINITIONS: ToolDef[] = [
  {
    name: "czkawka_cli_plugin_status",
    description: "Show Czkawka CLI plugin runtime/config status, effective cache/config paths, and latest artifacts.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        includeRawPaths: {
          type: "boolean",
          description: "Include raw filesystem paths in the status output.",
          default: false,
        },
      },
    },
  },
  {
    name: "czkawka_cli_validate",
    description: "Validate Czkawka CLI, ffmpeg/ffprobe availability, and writable artifact/cache/config paths.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        checkVideoDeps: {
          type: "boolean",
          description: "Also validate ffmpeg and ffprobe required for similar-video scans.",
          default: true,
        },
        checkWritablePaths: {
          type: "boolean",
          description: "Verify artifact, cache, and config directories are writable.",
          default: true,
        },
      },
    },
  },
  {
    name: "czkawka_cli_cache_info",
    description: "Inspect Czkawka cache/config roots and list cache files for reuse diagnostics.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        includeFiles: {
          type: "boolean",
          description: "Include cache file entries in the response.",
          default: true,
        },
        maxFiles: {
          type: "integer",
          description: "Maximum number of cache files to list.",
          minimum: 1,
          maximum: 5000,
          default: 200,
        },
      },
    },
  },
  {
    name: "czkawka_cli_dup_hash_scan",
    description: "Run Czkawka exact duplicate scan using HASH search method and save raw JSON artifacts (optional normalized JSONL).",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["directories"],
      properties: {
        directories: {
          type: "array",
          description: "Target directories to scan for exact duplicates.",
          minItems: 1,
          items: { type: "string" },
        },
        referenceDirectories: {
          type: "array",
          description: "Reference-only directories used for cross-set duplicate comparison.",
          items: { type: "string" },
        },
        allowedExtensions: {
          type: "array",
          description: "Optional file extensions to include (without glob syntax).",
          items: { type: "string" },
        },
        excludedDirectories: {
          type: "array",
          description: "Directories to exclude from scanning.",
          items: { type: "string" },
        },
        excludedItems: {
          type: "array",
          description: "Files or directory names/patterns to exclude.",
          items: { type: "string" },
        },
        hashType: {
          type: "string",
          description: "Hash algorithm used by Czkawka for duplicate detection.",
          enum: ["BLAKE3", "XXH3", "CRC32"],
        },
        threads: {
          type: "integer",
          description: "Number of worker threads to use for the scan.",
          minimum: 1,
          maximum: 128,
        },
        useCache: {
          type: "boolean",
          description: "Reuse and update Czkawka cache data when available.",
          default: true,
        },
        minFileSizeBytes: {
          type: "integer",
          description: "Ignore files smaller than this size in bytes.",
          minimum: 0,
          maximum: 1099511627776,
          default: 1,
        },
        saveRawJson: {
          type: "boolean",
          description: "Save the raw Czkawka JSON output artifact.",
          default: true,
        },
        saveNormalizedJsonl: {
          type: "boolean",
          description: "Also save normalized JSONL output for downstream processing.",
          default: false,
        },
        tag: {
          type: "string",
          description: "Optional tag appended to artifact filenames/metadata.",
        },
        cacheRootOverride: {
          type: "string",
          description: "Override cache root directory for this run.",
        },
        configRootOverride: {
          type: "string",
          description: "Override config root directory for this run.",
        },
      },
    },
  },
  {
    name: "czkawka_cli_similar_video_scan",
    description: "Run Czkawka similar-video scan and save raw JSON artifacts (optional normalized JSONL; review required).",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["directories"],
      properties: {
        directories: {
          type: "array",
          description: "Target directories to scan for similar videos.",
          minItems: 1,
          items: { type: "string" },
        },
        referenceDirectories: {
          type: "array",
          description: "Reference-only directories used for cross-set similarity comparison.",
          items: { type: "string" },
        },
        allowedExtensions: {
          type: "array",
          description: "Optional video file extensions to include.",
          items: { type: "string" },
        },
        excludedDirectories: {
          type: "array",
          description: "Directories to exclude from scanning.",
          items: { type: "string" },
        },
        excludedItems: {
          type: "array",
          description: "Files or directory names/patterns to exclude.",
          items: { type: "string" },
        },
        tolerance: {
          type: "integer",
          description: "Maximum allowed difference between video frame hashes (0 = identical only / strictest, 20 = very different still matches / most lenient). Lower values are stricter and detect fewer pairs; higher values are more lenient and detect more pairs.",
          minimum: 0,
          maximum: 20,
        },
        scanDuration: {
          type: "integer",
          description: "Per-video analysis duration in seconds.",
          minimum: 2,
          maximum: 60,
        },
        skipForwardAmount: {
          type: "integer",
          description: "Seconds to skip forward between sampled frames.",
          minimum: 0,
          maximum: 300,
        },
        cropDetect: {
          type: "string",
          description: "Crop detection mode applied before similarity analysis.",
          enum: ["none", "letterbox", "motion"],
        },
        threads: {
          type: "integer",
          description: "Number of worker threads to use for the scan.",
          minimum: 1,
          maximum: 128,
        },
        useCache: {
          type: "boolean",
          description: "Reuse and update Czkawka cache data when available.",
          default: true,
        },
        saveRawJson: {
          type: "boolean",
          description: "Save the raw Czkawka JSON output artifact.",
          default: true,
        },
        saveNormalizedJsonl: {
          type: "boolean",
          description: "Also save normalized JSONL output for downstream processing.",
          default: false,
        },
        tag: {
          type: "string",
          description: "Optional tag appended to artifact filenames/metadata.",
        },
        cacheRootOverride: {
          type: "string",
          description: "Override cache root directory for this run.",
        },
        configRootOverride: {
          type: "string",
          description: "Override config root directory for this run.",
        },
      },
    },
  },
];

export function getToolDefinition(name: string): ToolDef {
  const d = TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!d) throw new Error(`tool definition not found: ${name}`);
  return d;
}
