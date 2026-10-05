/**
 * @file
 * @brief Measures runtime character and token sizes of the canonical context files.
 * @details Provides reusable helpers that compute character and `cl100k_base` token estimates for `REQUIREMENTS.md`, `REFERENCES.md`, and `WORKFLOW.md` under `<base-path>/<docs-dir>` so configuration menus and command summaries share one measurement contract. Measurements are memoized per resolved path against the file `mtimeMs` plus `size` signature and reuses the process-cached shared tokenizer, so repeated menu renders resolve unchanged files through filesystem stats only. Runtime is O(n) on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and module-local cache mutation.
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_DOCS_DIR, type UseReqConfig } from "./config.js";
import { normalizeRelativeDirContract } from "./path-context.js";
import { countFileMetrics } from "./token-counter.js";

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
 * @brief Stores the module-local context-file measurement cache keyed by resolved path.
 * @details Maps each measured absolute context-file path to its stat-signed facts so repeated configuration-menu renders and command summaries reuse identical measurements while any content revision invalidates only the affected entry. Cache state is module-local and never serialized into configuration.
 */
const contextFileSizeCache = new Map<string, CachedContextFileSizeEntry>();

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
 * @details Probes the target with one `stat` call, returns the memoized facts when the observed `mtimeMs` plus `size` signature matches the cached entry, and otherwise reads UTF-8 content and reuses the process-cached shared tokenizer behind `countFileMetrics` for the `cl100k_base` token estimate before storing the fresh facts in the bounded cache. Missing, non-file, and unreadable targets return `MISSING_CONTEXT_FILE_SIZE` facts without throwing and without caching. Runtime is O(1) for unchanged remeasures and O(n) in file size on first measurement per content revision. Side effects are limited to filesystem reads and module-local cache mutation.
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
  const cachedEntry = contextFileSizeCache.get(filePath);
  if (cachedEntry && cachedEntry.statSignature === statSignature) {
    return cachedEntry.facts;
  }
  try {
    const metrics = countFileMetrics(fs.readFileSync(filePath, "utf8"));
    const facts: ContextFileSizeFacts = { exists: true, chars: metrics.chars, tokens: metrics.tokens };
    if (contextFileSizeCache.size >= CONTEXT_FILE_SIZE_CACHE_LIMIT) {
      contextFileSizeCache.clear();
    }
    contextFileSizeCache.set(filePath, { statSignature, facts });
    return facts;
  } catch {
    return MISSING_CONTEXT_FILE_SIZE;
  }
}

/**
 * @brief Measures every canonical context file for one project base.
 * @details Iterates `CONTEXT_FILE_NAMES` in documented order, resolves each configured `<base-path>/<docs-dir>` target through `resolveContextFilePath`, and returns the keyed facts record consumed by configuration menus and command summaries. Repeated invocations with unchanged files resolve through the stat-signed measurement cache. Runtime is O(n) in aggregate context-file size on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and module-local cache mutation.
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
 * @brief Formats one measured context-file size as a compact character and token estimate.
 * @details Emits the deterministic `<chars>c/<tokens>t` shape reused by menu rows, the top-level summary, and the command invocation summary so every surface exposes identical size facts. Runtime is O(n) in rendered length. No external state is mutated.
 * @param[in] facts {ContextFileSizeFacts} Measured context-file size facts.
 * @return {string} Compact `<chars>c/<tokens>t` size string.
 * @satisfies REQ-375, REQ-376, REQ-377
 */
export function formatContextFileSize(facts: ContextFileSizeFacts): string {
  return `${facts.chars}c/${facts.tokens}t`;
}
