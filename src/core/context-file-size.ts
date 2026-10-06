/**
 * @file
 * @brief Measures runtime character and token sizes of the canonical context files.
 * @details Provides reusable helpers that compute character and `cl100k_base` token estimates for `REQUIREMENTS.md`, `REFERENCES.md`, and `WORKFLOW.md` under `<base-path>/<docs-dir>` so configuration menus and command summaries share one measurement contract. Measurements are memoized per resolved path against the file `mtimeMs` plus `size` signature inside a process-scoped cache that survives extension rebinds, reuse the lean process-cached shared tokenizer counter, and expose idle-time pre-warm scheduling plus a yielding async measurement variant so the one-time tokenizer module load and per-revision content encodes never execute inside a synchronous menu critical path. Runtime is O(n) on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and process-scoped cache mutation.
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_DOCS_DIR, type UseReqConfig } from "./config.js";
import { normalizeRelativeDirContract } from "./path-context.js";
import { countTextTokensAndChars, prewarmTokenCounterEncoder } from "./token-counter.js";
import { ReqError } from "./errors.js";

/**
 * @brief Stores the canonical context-file names in their documented injection order.
 * @details The tuple is the single ordering source reused by measurement helpers and size renderers so every caller reports `REQUIREMENTS.md`, `REFERENCES.md`, and `WORKFLOW.md` consistently. Lookup complexity is O(1).
 * @satisfies REQ-373
 */
export const CONTEXT_FILE_NAMES = ["REQUIREMENTS.md", "REFERENCES.md", "WORKFLOW.md"] as const;

/**
 * @brief Narrows context-file identifiers to the canonical measured document set.
 * @details Compile-time alias derived from `CONTEXT_FILE_NAMES` and reused by the measured-facts record keys. The alias introduces no runtime cost.
 */
export type ContextFileName = (typeof CONTEXT_FILE_NAMES)[number];

/**
 * @brief Describes the measured size facts of one canonical context file.
 * @details Stores the filesystem existence flag plus the exact character count and the `cl100k_base` token estimate computed from the file content. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-374
 */
export interface ContextFileSizeFacts {
  readonly exists: boolean;
  readonly chars: number;
  readonly tokens: number;
}

/**
 * @brief Stores the canonical missing-file size facts.
 * @details Reused as the deterministic result for missing, non-file, and unreadable targets so callers never receive `undefined` facts. Lookup complexity is O(1).
 * @satisfies REQ-374
 */
export const MISSING_CONTEXT_FILE_SIZE: ContextFileSizeFacts = Object.freeze({ exists: false, chars: 0, tokens: 0 });

/**
 * @brief Stores one memoized context-file measurement with its staleness signature.
 * @details Pairs the measured facts with the `mtimeMs` plus `size` filesystem signature observed at measurement time so later probes can decide, through one stat call, whether the cached facts still describe the current file content. The interface is compile-time only and introduces no runtime cost.
 */
interface CachedContextFileSizeEntry {
  readonly statSignature: string;
  readonly facts: ContextFileSizeFacts;
}

/**
 * @brief Bounds the module-local context-file measurement cache.
 * @details Worktree-backed prompt runs measure three context files per execution path, so unbounded caching would accumulate one entry triplet per generated worktree in long-lived pi hosts. Exceeding the bound clears the cache completely, which only costs one re-measurement per live path. Lookup complexity is O(1).
 */
const CONTEXT_FILE_SIZE_CACHE_LIMIT = 64;

/**
 * @brief Describes the process-scoped context-file measurement state persisted across extension rebinds.
 * @details Stores the stat-signed measurement cache plus the pending pre-warm schedule guards on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, while the hosting process persists across those operations, so session rebinds never re-trigger the heavy first-measurement path for unchanged context files. The interface is compile-time only and introduces no runtime cost.
 */
interface ProcessScopedContextFileSizeStore {
  readonly contextFileSizeCache: Map<string, CachedContextFileSizeEntry>;
  readonly scheduledPrewarmBases: Set<string>;
}

/**
 * @brief Returns the process-scoped context-file measurement store.
 * @details Lazily initializes one `globalThis` record so session rebinds reuse already measured facts and never double-schedule the idle-time pre-warm for one project base. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedContextFileSizeStore} Mutable process-scoped measurement store.
 */
function getProcessScopedContextFileSizeStore(): ProcessScopedContextFileSizeStore {
  const globalScope = globalThis as typeof globalThis & { __piUsereqContextFileSizeStore?: ProcessScopedContextFileSizeStore };
  if (!globalScope.__piUsereqContextFileSizeStore) {
    globalScope.__piUsereqContextFileSizeStore = {
      contextFileSizeCache: new Map<string, CachedContextFileSizeEntry>(),
      scheduledPrewarmBases: new Set<string>(),
    };
  }
  return globalScope.__piUsereqContextFileSizeStore;
}

/**
 * @brief Resolves one canonical context-file absolute path for one project base.
 * @details Joins the project base with the trailing-slash-free configured `docs-dir` (falling back to `DEFAULT_DOCS_DIR`) and the supplied canonical file name so menus, summaries, and the `%%CONTEXT_FILES%%` renderer address identical targets. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
 * @param[in] fileName {ContextFileName} Canonical context-file name.
 * @return {string} Absolute context-file path.
 * @satisfies REQ-373
 */
export function resolveContextFilePath(
  projectBase: string,
  config: UseReqConfig,
  fileName: ContextFileName,
): string {
  const normalizedDocsDir = normalizeRelativeDirContract(config["docs-dir"]) || DEFAULT_DOCS_DIR;
  return path.join(projectBase, normalizedDocsDir, fileName);
}

/**
 * @brief Measures one context file into deterministic size facts.
 * @details Probes the target with one `stat` call, returns the memoized facts when the observed `mtimeMs` plus `size` signature matches the cached entry, and otherwise reads UTF-8 content and reuses the lean process-cached shared tokenizer counter behind `countTextTokensAndChars` for the `cl100k_base` token estimate before storing the fresh facts in the bounded process-scoped cache. Missing, non-file, and unreadable targets return `MISSING_CONTEXT_FILE_SIZE` facts without throwing and without caching. Runtime is O(1) for unchanged remeasures and O(n) in file size on first measurement per content revision. Side effects are limited to filesystem reads and process-scoped cache mutation.
 * @param[in] filePath {string} Absolute context-file path to measure.
 * @return {ContextFileSizeFacts} Measured size facts for the target.
 * @satisfies REQ-373, REQ-374
 */
export function measureContextFileSize(filePath: string): ContextFileSizeFacts {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = undefined;
  }
  if (!stat || !stat.isFile()) {
    return MISSING_CONTEXT_FILE_SIZE;
  }
  const statSignature = `${stat.mtimeMs}:${stat.size}`;
  const cache = getProcessScopedContextFileSizeStore().contextFileSizeCache;
  const cachedEntry = cache.get(filePath);
  if (cachedEntry && cachedEntry.statSignature === statSignature) {
    return cachedEntry.facts;
  }
  try {
    const metrics = countTextTokensAndChars(fs.readFileSync(filePath, "utf8"));
    const facts: ContextFileSizeFacts = { exists: true, chars: metrics.chars, tokens: metrics.tokens };
    if (cache.size >= CONTEXT_FILE_SIZE_CACHE_LIMIT) {
      cache.clear();
    }
    cache.set(filePath, { statSignature, facts });
    return facts;
  } catch {
    return MISSING_CONTEXT_FILE_SIZE;
  }
}

/**
 * @brief Measures every canonical context file for one project base.
 * @details Iterates `CONTEXT_FILE_NAMES` in documented order, resolves each configured `<base-path>/<docs-dir>` target through `resolveContextFilePath`, and returns the keyed facts record consumed by configuration menus and command summaries. Repeated invocations with unchanged files resolve through the process-scoped stat-signed measurement cache. Runtime is O(n) in aggregate context-file size on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and process-scoped cache mutation.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
 * @return {Record<ContextFileName, ContextFileSizeFacts>} Measured size facts keyed by canonical file name.
 * @satisfies REQ-373, REQ-374
 */
export function measureContextFileSizes(
  projectBase: string,
  config: UseReqConfig,
): Record<ContextFileName, ContextFileSizeFacts> {
  const facts = {} as Record<ContextFileName, ContextFileSizeFacts>;
  for (const fileName of CONTEXT_FILE_NAMES) {
    facts[fileName] = measureContextFileSize(resolveContextFilePath(projectBase, config, fileName));
  }
  return facts;
}

/**
 * @brief Yields one macrotask turn to the host event loop.
 * @details Resolves after `setImmediate`, letting pending UI renders, lifecycle callbacks, and input events process between CPU-bound measurement slices. Runtime is O(1). Side effect: schedules one process task.
 * @return {Promise<void>} Promise resolved on the next macrotask turn.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * @brief Measures one context file into deterministic size facts with an event-loop yield before re-encoding.
 * @details Applies the identical stat-signature freshness contract as `measureContextFileSize`, but awaits one macrotask yield between the stat probe and the read-plus-encode slice when the signature misses, so the TUI can process pending events instead of blocking for the full CPU-bound encode. Cache hits resolve synchronously without yielding. Missing, non-file, and unreadable targets return `MISSING_CONTEXT_FILE_SIZE` facts without throwing and without caching. Runtime is O(1) for unchanged remeasures and O(n) in file size on first measurement per content revision, plus one deferred macrotask per re-encode. Side effects are limited to filesystem reads and process-scoped cache mutation.
 * @param[in] filePath {string} Absolute context-file path to measure.
 * @return {Promise<ContextFileSizeFacts>} Measured size facts for the target.
 * @satisfies REQ-373, REQ-374
 */
export async function measureContextFileSizeAsync(filePath: string): Promise<ContextFileSizeFacts> {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = undefined;
  }
  if (!stat || !stat.isFile()) {
    return MISSING_CONTEXT_FILE_SIZE;
  }
  const statSignature = `${stat.mtimeMs}:${stat.size}`;
  const cache = getProcessScopedContextFileSizeStore().contextFileSizeCache;
  const cachedEntry = cache.get(filePath);
  if (cachedEntry && cachedEntry.statSignature === statSignature) {
    return cachedEntry.facts;
  }
  await yieldToEventLoop();
  try {
    const metrics = countTextTokensAndChars(fs.readFileSync(filePath, "utf8"));
    const facts: ContextFileSizeFacts = { exists: true, chars: metrics.chars, tokens: metrics.tokens };
    if (cache.size >= CONTEXT_FILE_SIZE_CACHE_LIMIT) {
      cache.clear();
    }
    cache.set(filePath, { statSignature, facts });
    return facts;
  } catch {
    return MISSING_CONTEXT_FILE_SIZE;
  }
}

/**
 * @brief Measures every canonical context file for one project base with event-loop yields between files.
 * @details Iterates `CONTEXT_FILE_NAMES` in documented order, resolves each configured `<base-path>/<docs-dir>` target through `resolveContextFilePath`, and awaits `measureContextFileSizeAsync` per file so CPU-bound re-encode slices are separated by macrotask turns consumed by configuration-menu and command-summary rendering. Returned facts are bit-identical to `measureContextFileSizes`. Runtime is O(n) in aggregate context-file size on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and process-scoped cache mutation.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
 * @return {Promise<Record<ContextFileName, ContextFileSizeFacts>>} Measured size facts keyed by canonical file name.
 * @satisfies REQ-373, REQ-374
 */
export async function measureContextFileSizesAsync(
  projectBase: string,
  config: UseReqConfig,
): Promise<Record<ContextFileName, ContextFileSizeFacts>> {
  const facts = {} as Record<ContextFileName, ContextFileSizeFacts>;
  for (const fileName of CONTEXT_FILE_NAMES) {
    facts[fileName] = await measureContextFileSizeAsync(resolveContextFilePath(projectBase, config, fileName));
  }
  return facts;
}

/**
 * @brief Schedules idle-time pre-warm measurement of the canonical context files for one project base.
 * @details Chains one `setImmediate` task per canonical context file plus one encoder pre-warm task, so the one-time `js-tiktoken` module load, bundled BPE-rank parse, and first per-file content encodes execute outside any synchronous menu or preflight critical path and later menu renders resolve through stat-signed cache hits. Duplicate scheduling for one resolved project base is suppressed through a process-scoped pending set until the chain completes. The operation is best-effort: every measurement failure is swallowed because measurement already degrades to `MISSING_CONTEXT_FILE_SIZE` facts and later renders re-measure through the identical stat-signature contract. Runtime is O(1) for scheduling; deferred cost is the standard first-measurement cost per file. Side effects include scheduled process tasks, filesystem reads, encoder construction, and process-scoped cache mutation.
 * @param[in] projectBase {string} Absolute project root path whose canonical context files should pre-warm.
 * @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
 * @return {void} No return value.
 */
export function prewarmContextFileMeasurements(projectBase: string, config: UseReqConfig): void {
  const store = getProcessScopedContextFileSizeStore();
  const normalizedBase = path.resolve(projectBase);
  if (store.scheduledPrewarmBases.has(normalizedBase)) {
    return;
  }
  store.scheduledPrewarmBases.add(normalizedBase);
  const releaseSchedule = (): void => {
    store.scheduledPrewarmBases.delete(normalizedBase);
  };
  prewarmTokenCounterEncoder();
  const filePaths = CONTEXT_FILE_NAMES.map((fileName) => resolveContextFilePath(normalizedBase, config, fileName));
  const measureRemaining = (index: number): void => {
    if (index >= filePaths.length) {
      releaseSchedule();
      return;
    }
    setImmediate(() => {
      try {
        measureContextFileSize(filePaths[index]);
      } catch {
        // Best-effort pre-warm: measurement failures surface unchanged at render time.
      }
      measureRemaining(index + 1);
    });
  };
  measureRemaining(0);
}

/**
 * @brief Formats one measured context-file size as a compact character and token estimate.
 * @details Emits the deterministic `<chars>c/<tokens>t` shape reused by menu rows, the top-level summary, and the command invocation summary so every surface exposes identical size facts. Runtime is O(n) in rendered length. No external state is mutated.
 * @param[in] facts {ContextFileSizeFacts} Measured context-file size facts.
 * @return {string} Compact `<chars>c/<tokens>t` size string.
 * @satisfies REQ-375, REQ-376, REQ-377
 */
export function formatContextFileSize(facts: ContextFileSizeFacts): string {
  return `${facts.chars}c/${facts.tokens}t`;
}

/**
 * @brief Stores the documented fallback context-window token budget.
 * @details Used as the occupancy computation basis and as the early-check limit whenever the selected model max input context is unknown, and always renders behind the `*` marker so consumers can detect the assumed basis. Lookup complexity is O(1).
 * @satisfies REQ-403
 */
export const CONTEXT_OCCUPANCY_FALLBACK_CONTEXT_WINDOW_TOKENS = 1_000_000;

/**
 * @brief Maps every canonical context file to its persisted configuration flag key.
 * @details Single mapping source shared by the token summation and segment renderers so enabled-file selection stays identical across every occupancy surface. Lookup complexity is O(1). No external state is mutated.
 */
const CONTEXT_FILE_FLAG_KEYS: Record<ContextFileName, "context-files-requirements" | "context-files-references" | "context-files-workflow"> = {
  "REQUIREMENTS.md": "context-files-requirements",
  "REFERENCES.md": "context-files-references",
  "WORKFLOW.md": "context-files-workflow",
};

/**
 * @brief Describes the computed context-occupancy facts of one enabled context-file set.
 * @details Stores the aggregate token total, the resolved selected-model max input context (undefined when unknown), the effective basis tokens used for the percentage, the rendered percentage label, the rendered max-context label, and the final bracketed occupancy suffix. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-400
 */
export interface ContextOccupancyFacts {
  readonly totalTokens: number;
  readonly maxContextTokens: number | undefined;
  readonly basisTokens: number;
  readonly percentLabel: string;
  readonly maxLabel: string;
  readonly suffix: string;
}

/**
 * @brief Sums the `cl100k_base` token estimates of every enabled existing context file.
 * @details Iterates `CONTEXT_FILE_NAMES` in documented order, skips disabled flags and missing or unreadable files, and accumulates the measured token estimates so occupancy surfaces and the prompt-dispatch early check share one total. Runtime is O(1) in file count. No external state is mutated.
 * @param[in] config {Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">} Effective configuration supplying the three context-file flags.
 * @param[in] sizes {Record<string, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
 * @return {number} Aggregate token estimate of enabled existing context files.
 * @satisfies REQ-400
 */
export function sumEnabledContextFileTokens(
  config: Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">,
  sizes: Record<string, ContextFileSizeFacts>,
): number {
  let totalTokens = 0;
  for (const fileName of CONTEXT_FILE_NAMES) {
    const facts = sizes[fileName];
    if (!config[CONTEXT_FILE_FLAG_KEYS[fileName]] || !facts || !facts.exists) {
      continue;
    }
    totalTokens += facts.tokens;
  }
  return totalTokens;
}

/**
 * @brief Formats one context-window token count as a compact human-readable label.
 * @details Renders token counts of one million or more as `<x.x>M`, counts of one thousand or more as `<x.x>K`, and smaller counts as rounded integers so the documented `1.0M` fallback shape stays deterministic. Runtime is O(1). No external state is mutated.
 * @param[in] tokens {number} Context-window token count to label.
 * @return {string} Compact context-window label such as `1.0M`, `200.0K`, or `512`.
 * @satisfies REQ-403
 */
export function formatContextWindowTokensLabel(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(Math.round(tokens));
}

/**
 * @brief Formats one occupancy percentage as a compact label with one decimal place.
 * @details Rounds the percentage to one decimal place and removes a trailing `.0` so whole percentages render as `36%` and fractional values keep their decimal digit. Runtime is O(1). No external state is mutated.
 * @param[in] percent {number} Occupancy percentage value.
 * @return {string} Percentage label such as `36%`, `0.4%`, or `0%`.
 * @satisfies REQ-402
 */
export function formatContextOccupancyPercentLabel(percent: number): string {
  const fixed = percent.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/**
 * @brief Computes the context-occupancy facts of one enabled context-file token total.
 * @details Resolves the effective basis from the supplied max input context or the documented 1,000,000-token fallback, derives the percentage label, derives the max label with the `*` marker only for the unknown fallback, and renders `[<percent>% context]` for a known max or `[<percent>%/1.0M* context]` for the fallback basis. Runtime is O(1). No external state is mutated.
 * @param[in] totalTokens {number} Aggregate enabled existing context-file token estimate.
 * @param[in] maxContextTokens {number | undefined} Selected model max input context tokens; undefined selects the fallback basis.
 * @return {ContextOccupancyFacts} Computed occupancy facts including the rendered suffix.
 * @satisfies REQ-400, REQ-402, REQ-403
 */
export function computeContextOccupancyFacts(
  totalTokens: number,
  maxContextTokens: number | undefined,
): ContextOccupancyFacts {
  const knownMax = typeof maxContextTokens === "number" && Number.isFinite(maxContextTokens) && maxContextTokens > 0
    ? maxContextTokens
    : undefined;
  const basisTokens = knownMax ?? CONTEXT_OCCUPANCY_FALLBACK_CONTEXT_WINDOW_TOKENS;
  const percentLabel = formatContextOccupancyPercentLabel((totalTokens / basisTokens) * 100);
  const maxLabel = knownMax === undefined
    ? `${formatContextWindowTokensLabel(basisTokens)}*`
    : formatContextWindowTokensLabel(knownMax);
  const suffix = knownMax === undefined
    ? `[${percentLabel}%/${maxLabel} context]`
    : `[${percentLabel}% context]`;
  return { totalTokens, maxContextTokens: knownMax, basisTokens, percentLabel, maxLabel, suffix };
}

/**
 * @brief Renders every enabled existing context file as a `name(<chars>c/<tokens>t)` segment list.
 * @details Iterates `CONTEXT_FILE_NAMES` in documented order, skips disabled flags and missing or unreadable files, and joins the remaining segments with the documented ` • ` separator so early-check diagnostics reuse the same segment shape as the configuration summary. Runtime is O(1) in file count. No external state is mutated.
 * @param[in] config {Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">} Effective configuration supplying the three context-file flags.
 * @param[in] sizes {Record<string, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
 * @return {string} Joined segment list, or the empty string when no enabled existing context file contributes.
 * @satisfies REQ-410
 */
export function formatEnabledContextFileSegments(
  config: Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">,
  sizes: Record<string, ContextFileSizeFacts>,
): string {
  const segments: string[] = [];
  for (const fileName of CONTEXT_FILE_NAMES) {
    const facts = sizes[fileName];
    if (!config[CONTEXT_FILE_FLAG_KEYS[fileName]] || !facts || !facts.exists) {
      continue;
    }
    segments.push(`${fileName}(${formatContextFileSize(facts)})`);
  }
  return segments.join(" • ");
}

/**
 * @brief Enforces the context-occupancy early check for one prepared prompt command.
 * @details Sums the enabled existing context-file tokens, computes the occupancy facts against the supplied max input context or the documented fallback, and throws one deterministic ReqError diagnostic listing every enabled existing file segment, the aggregate token total, and the occupancy suffix whenever the total strictly exceeds the basis. Runtime is O(1) in file count. No external state is mutated.
 * @param[in] config {Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">} Effective configuration supplying the three context-file flags.
 * @param[in] sizes {Record<string, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
 * @param[in] maxContextTokens {number | undefined} Selected model max input context tokens; undefined selects the fallback basis.
 * @return {ContextOccupancyFacts} Computed occupancy facts when the check passes.
 * @throws {ReqError} Throws when the enabled token total strictly exceeds the effective basis.
 * @satisfies REQ-408, REQ-409, REQ-410
 */
export function enforceContextOccupancyLimit(
  config: Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">,
  sizes: Record<string, ContextFileSizeFacts>,
  maxContextTokens: number | undefined,
): ContextOccupancyFacts {
  const facts = computeContextOccupancyFacts(sumEnabledContextFileTokens(config, sizes), maxContextTokens);
  const segments = formatEnabledContextFileSegments(config, sizes);
  if (segments.length > 0 && facts.totalTokens > facts.basisTokens) {
    throw new ReqError(
      `Context occupancy early check failed: enabled context files total ${facts.totalTokens}t exceed ` +
        `${facts.maxLabel} selected model input context. ${segments} ${facts.suffix}`,
      1,
    );
  }
  return facts;
}
