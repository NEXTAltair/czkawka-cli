import { canonicalPathForCompare, pathStartsWithAny } from "./runtime";
import type { AnyObj, NormalizedMember } from "./types";

function looksObject(v: unknown): v is AnyObj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function looksDupEntry(v: unknown): v is AnyObj {
  return looksObject(v) && typeof v.path === "string";
}

function looksVideoEntry(v: unknown): v is AnyObj {
  return looksObject(v) && typeof v.path === "string";
}

function toIsoMaybe(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = v > 1e12 ? v : v > 1e10 ? v : v * 1000;
    try {
      return new Date(n).toISOString();
    } catch {
      return String(v);
    }
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function inferScope(p: string, refRoots: string[]): "target" | "reference" {
  return refRoots.length && pathStartsWithAny(p, refRoots) ? "reference" : "target";
}

function dupMemberFromEntry(entry: AnyObj, refRoots: string[], scopeOverride?: "target" | "reference"): NormalizedMember {
  const p = String(entry.path || "");
  return {
    path: p,
    scope: scopeOverride ?? inferScope(p, refRoots),
    sizeBytes: num(entry.size),
    modifiedAt: toIsoMaybe(entry.modified_date),
  };
}

function videoMemberFromEntry(entry: AnyObj, refRoots: string[], scopeOverride?: "target" | "reference"): NormalizedMember {
  const p = String(entry.path || "");
  return {
    path: p,
    scope: scopeOverride ?? inferScope(p, refRoots),
    sizeBytes: num(entry.size),
    modifiedAt: toIsoMaybe(entry.modified_date),
    videoMeta: {
      durationSec: num(entry.duration),
      width: num(entry.width),
      height: num(entry.height),
      fps: str(entry.fps),
      codec: str(entry.codec),
      bitrate: num(entry.bitrate),
    },
  };
}

export function normalizeDupHashRaw(raw: unknown, opts: { referenceDirectories?: string[] }) {
  const refRoots = (opts.referenceDirectories || []).map(canonicalPathForCompare);
  const warnings: string[] = [];
  const groups: AnyObj[] = [];
  let groupSeq = 0;

  const pushPlainGroup = (entries: AnyObj[]) => {
    if (entries.length < 2) return;
    groupSeq += 1;
    const members = entries.map((e) => dupMemberFromEntry(e, refRoots));
    const hashVal = entries.map((e) => str(e.hash)).find(Boolean) ?? null;
    const hasReferenceMember = members.some((m) => m.scope === "reference");
    groups.push({
      groupId: `dup-${String(groupSeq).padStart(6, "0")}`,
      kind: "exact_duplicate_group",
      hashAlgo: hashVal ? null : null,
      hashValue: hashVal,
      fileCount: members.length,
      hasReferenceMember,
      members,
    });
  };

  const pushReferenceGroup = (refEntry: AnyObj, others: AnyObj[]) => {
    if (!others.length) return;
    groupSeq += 1;
    const members = [dupMemberFromEntry(refEntry, refRoots, "reference"), ...others.map((e) => dupMemberFromEntry(e, refRoots, "target"))];
    const hashVal = [refEntry, ...others].map((e) => str(e.hash)).find(Boolean) ?? null;
    groups.push({
      groupId: `dup-${String(groupSeq).padStart(6, "0")}`,
      kind: "exact_duplicate_group",
      hashAlgo: null,
      hashValue: hashVal,
      fileCount: members.length,
      hasReferenceMember: true,
      members,
    });
  };

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      if (
        node.length === 2 &&
        looksDupEntry(node[0]) &&
        Array.isArray(node[1]) &&
        (node[1] as unknown[]).every(looksDupEntry)
      ) {
        pushReferenceGroup(node[0], node[1] as AnyObj[]);
        return;
      }
      if (node.length >= 2 && node.every(looksDupEntry)) {
        pushPlainGroup(node as AnyObj[]);
        return;
      }
      for (const child of node) visit(child);
      return;
    }
    if (looksObject(node)) {
      for (const v of Object.values(node)) visit(v);
    }
  };

  visit(raw);
  if (groupSeq === 0) {
    if (Array.isArray(raw) || looksObject(raw)) {
      warnings.push("no_duplicate_groups_parsed");
    } else {
      warnings.push("unexpected_raw_json_shape");
    }
  }

  return {
    groups,
    warnings,
    summary: {
      groupsTotal: groups.length,
      filesTotal: groups.reduce((n, g) => n + Number(g.fileCount || 0), 0),
      groupsWithReferenceMatches: groups.filter((g) => g.hasReferenceMember === true).length,
      targetFilesOnlyGroups: groups.filter((g) => g.hasReferenceMember !== true).length,
      ignoredByFilters: 0,
    },
  };
}

export function normalizeSimilarVideoRaw(raw: unknown, opts: { referenceDirectories?: string[] }) {
  const refRoots = (opts.referenceDirectories || []).map(canonicalPathForCompare);
  const warnings: string[] = [];
  const groups: AnyObj[] = [];
  let groupSeq = 0;

  const pushPlainGroup = (entries: AnyObj[]) => {
    if (entries.length < 2) return;
    groupSeq += 1;
    const members = entries.map((e) => videoMemberFromEntry(e, refRoots));
    const hasReferenceMember = members.some((m) => m.scope === "reference");
    groups.push({
      groupId: `sv-${String(groupSeq).padStart(6, "0")}`,
      kind: "similar_video_group",
      fileCount: members.length,
      hasReferenceMember,
      members,
      similarity: { metric: "czkawka_video_group", score: null },
    });
  };

  const pushReferenceGroup = (refEntry: AnyObj, others: AnyObj[]) => {
    if (!others.length) return;
    groupSeq += 1;
    const members = [videoMemberFromEntry(refEntry, refRoots, "reference"), ...others.map((e) => videoMemberFromEntry(e, refRoots, "target"))];
    groups.push({
      groupId: `sv-${String(groupSeq).padStart(6, "0")}`,
      kind: "similar_video_group",
      fileCount: members.length,
      hasReferenceMember: true,
      members,
      similarity: { metric: "czkawka_video_group", score: null },
    });
  };

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      if (
        node.length === 2 &&
        looksVideoEntry(node[0]) &&
        Array.isArray(node[1]) &&
        (node[1] as unknown[]).every(looksVideoEntry)
      ) {
        pushReferenceGroup(node[0], node[1] as AnyObj[]);
        return;
      }
      if (node.length >= 2 && node.every(looksVideoEntry)) {
        pushPlainGroup(node as AnyObj[]);
        return;
      }
      for (const child of node) visit(child);
      return;
    }
    if (looksObject(node)) {
      for (const v of Object.values(node)) visit(v);
    }
  };

  visit(raw);
  if (groupSeq === 0) {
    if (Array.isArray(raw) || looksObject(raw)) warnings.push("no_similar_video_groups_parsed");
    else warnings.push("unexpected_raw_json_shape");
  }

  return {
    groups,
    warnings,
    summary: {
      groupsTotal: groups.length,
      filesTotal: groups.reduce((n, g) => n + Number(g.fileCount || 0), 0),
      groupsWithReferenceMatches: groups.filter((g) => g.hasReferenceMember === true).length,
      targetFilesOnlyGroups: groups.filter((g) => g.hasReferenceMember !== true).length,
    },
  };
}
