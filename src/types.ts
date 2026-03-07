export type AnyObj = Record<string, any>;

export type CmdResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  command: string;
  args: string[];
  cwd?: string;
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: AnyObj;
};

export type HashType = "BLAKE3" | "XXH3" | "CRC32";
export type CropDetect = "none" | "letterbox" | "motion";

export type CzkawkaPluginConfig = {
  czkawkaCliPath?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  cacheRoot?: string;
  configRoot?: string;
  outputRoot: string;
  defaultThreads: number;
  defaultHashType: HashType;
  defaultSimilarVideoTolerance: number;
  defaultSimilarVideoScanDuration: number;
  defaultSimilarVideoSkipForwardAmount: number;
  defaultSimilarVideoCropDetect: CropDetect;
};

export type ArtifactDirs = {
  rawDir: string;
  normalizedDir: string;
  manifestsDir: string;
};

export type ScanKind = "dup_hash" | "similar_video";

export type ScanPaths = {
  scanId: string;
  ts: string;
  rawJsonPath: string | null;
  normalizedJsonlPath: string | null;
  manifestPath: string;
};

export type NormalizedMember = {
  path: string;
  scope: "target" | "reference";
  sizeBytes: number | null;
  modifiedAt: string | null;
  videoMeta?: {
    durationSec: number | null;
    width: number | null;
    height: number | null;
    fps: string | null;
    codec?: string | null;
    bitrate?: number | null;
  };
};
