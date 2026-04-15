import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function formatSubstitutedPath(value: string): string {
  return value ? value.split(path.sep).join("/") : "";
}

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

export function resolveAbsolute(normalized: string, projectBase: string): string | undefined {
  if (!normalized) return undefined;
  return path.isAbsolute(normalized) ? normalized : path.resolve(projectBase, normalized);
}

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

export function makeRelativeToken(raw: string, keepTrailing = false): string {
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";
  const suffix = keepTrailing && /[/\\]$/.test(raw) ? "/" : "";
  return `${normalized}${suffix}`;
}

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

export function homeRelative(absolutePath: string): string {
  const home = os.homedir();
  if (absolutePath === home) return "~";
  if (absolutePath.startsWith(`${home}${path.sep}`)) {
    return `~/${formatSubstitutedPath(path.relative(home, absolutePath))}`;
  }
  return formatSubstitutedPath(absolutePath);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
