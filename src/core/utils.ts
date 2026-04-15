/**
 * @file
 * @brief Provides path-normalization, shell-tokenization, and regex-escaping helpers.
 * @details Concentrates small pure utilities used by configuration loading, prompt rendering, and command dispatch. Most operations are linear in string length. Side effects are limited to filesystem existence checks in path normalization helpers.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * @brief Normalizes path separators to forward slashes.
 * @details Leaves empty input as an empty string and converts platform-specific separators to POSIX form for prompt-safe display. Time complexity is O(n) in path length. No side effects occur.
 * @param[in] value {string} Path-like string.
 * @return {string} Slash-normalized path string.
 */
export function formatSubstitutedPath(value: string): string {
  return value ? value.split(path.sep).join("/") : "";
}

/**
 * @brief Rewrites a path to be project-relative when it resolves inside the project root.
 * @details Handles absolute paths, repeated project-name prefixes, and embedded project-name segments, then falls back to the original value when safe relativization is not possible. Runtime is O(p) plus filesystem checks for candidate suffixes. Side effects are limited to existence checks.
 * @param[in] pathValue {string} User-supplied path value.
 * @param[in] projectBase {string} Absolute project root used as the relativization anchor.
 * @return {string} Project-relative path when derivable; otherwise the original or best-effort normalized input.
 */
export function makeRelativeIfContainsProject(pathValue: string, projectBase: string): string {
  if (!pathValue) return "";
  let candidate = pathValue;
  const projectName = path.basename(projectBase);

  if (!path.isAbsolute(candidate)) {
    const parts = candidate.split(/[\\/]+/).filter(Boolean);
    if (parts.length > 1 && parts[0] === projectName) {
      candidate = parts.slice(1).join(path.sep);
    } else if (parts.includes(projectName)) {
      const index = parts.lastIndexOf(projectName);
      if (index >= 0 && index + 1 < parts.length) {
        const suffix = parts.slice(index + 1).join(path.sep);
        const suffixResolved = path.resolve(projectBase, suffix);
        if (fs.existsSync(suffixResolved)) {
          candidate = suffix;
        }
      }
    }
  }

  if (path.isAbsolute(candidate)) {
    try {
      return path.relative(projectBase, candidate);
    } catch {
      return candidate;
    }
  }

  const resolved = path.resolve(projectBase, candidate);
  const relative = path.relative(projectBase, resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }

  const projectBaseWithSep = projectBase.endsWith(path.sep) ? projectBase : `${projectBase}${path.sep}`;
  if (pathValue.startsWith(projectBaseWithSep)) {
    return pathValue.slice(projectBaseWithSep.length).replace(/^[/\\]+/, "");
  }
  return pathValue;
}

/**
 * @brief Resolves a normalized path against the project root.
 * @details Returns `undefined` for empty input, preserves absolute paths, and resolves relative paths from `projectBase`. Time complexity is O(p). No side effects occur.
 * @param[in] normalized {string} Normalized path token.
 * @param[in] projectBase {string} Absolute project root.
 * @return {string | undefined} Absolute path or `undefined` for empty input.
 */
export function resolveAbsolute(normalized: string, projectBase: string): string | undefined {
  if (!normalized) return undefined;
  return path.isAbsolute(normalized) ? normalized : path.resolve(projectBase, normalized);
}

/**
 * @brief Computes a slash-normalized project subpath for display or config storage.
 * @details Prefers a relative path derived from the provided absolute path when it stays inside the project root; otherwise formats the normalized input directly. Runtime is O(p). No side effects occur.
 * @param[in] normalized {string} Original normalized path token.
 * @param[in] absolute {string | undefined} Absolute candidate path.
 * @param[in] projectBase {string} Absolute project root.
 * @return {string} Slash-normalized subpath.
 */
export function computeSubPath(normalized: string, absolute: string | undefined, projectBase: string): string {
  if (!normalized) return "";
  if (absolute) {
    const relative = path.relative(projectBase, absolute);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return formatSubstitutedPath(relative);
    }
  }
  return formatSubstitutedPath(normalized);
}

/**
 * @brief Normalizes a raw path token into a relative slash-separated fragment.
 * @details Removes leading and trailing separators, converts backslashes to slashes, and optionally preserves a trailing slash marker. Runtime is O(n). No side effects occur.
 * @param[in] raw {string} Raw token to normalize.
 * @param[in] keepTrailing {boolean} When `true`, preserve a trailing slash if the input contained one.
 * @return {string} Normalized relative token.
 */
export function makeRelativeToken(raw: string, keepTrailing = false): string {
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";
  const suffix = keepTrailing && /[/\\]$/.test(raw) ? "/" : "";
  return `${normalized}${suffix}`;
}

/**
 * @brief Splits a shell-style argument string into tokens.
 * @details Supports single quotes, double quotes, backslash escaping, and whitespace token boundaries without invoking an external shell. Runtime is O(n). No side effects occur.
 * @param[in] value {string} Raw argument string.
 * @return {string[]} Parsed token list.
 */
export function shellSplit(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | undefined;
  let escaped = false;
  for (const ch of value) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = undefined;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * @brief Rewrites an absolute path relative to the user's home directory when possible.
 * @details Returns `~` for the home directory itself, `~/...` for descendants, and a slash-normalized original path otherwise. Runtime is O(p). No side effects occur.
 * @param[in] absolutePath {string} Absolute path candidate.
 * @return {string} Home-relative or slash-normalized path string.
 */
export function homeRelative(absolutePath: string): string {
  const home = os.homedir();
  if (absolutePath === home) return "~";
  if (absolutePath.startsWith(`${home}${path.sep}`)) {
    return `~/${formatSubstitutedPath(path.relative(home, absolutePath))}`;
  }
  return formatSubstitutedPath(absolutePath);
}

/**
 * @brief Escapes regular-expression metacharacters in a literal string.
 * @details Replaces every regex-significant character with its escaped form so the result can be embedded safely into a dynamic pattern. Runtime is O(n). No side effects occur.
 * @param[in] value {string} Literal string to escape.
 * @return {string} Regex-safe literal fragment.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
