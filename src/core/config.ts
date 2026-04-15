import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReqError } from "./errors.js";
import { normalizeEnabledPiUsereqTools } from "./pi-usereq-tools.js";
import { homeRelative, makeRelativeIfContainsProject } from "./utils.js";

export interface StaticCheckEntry {
  module: string;
  cmd?: string;
  params?: string[];
}

export interface UseReqConfig {
  "docs-dir": string;
  "tests-dir": string;
  "src-dir": string[];
  "static-check": Record<string, StaticCheckEntry[]>;
  "enabled-tools": string[];
  "base-path"?: string;
  "git-path"?: string;
}

export const DEFAULT_DOCS_DIR = "req/docs";
export const DEFAULT_TESTS_DIR = "tests";
export const DEFAULT_SRC_DIRS = ["src"];
export const CONFIG_DIRNAME = "pi-usereq";

export function getProjectConfigPath(projectBase: string): string {
  return path.join(projectBase, ".pi", CONFIG_DIRNAME, "config.json");
}

export function getHomeResourceRoot(): string {
  return path.join(os.homedir(), ".pi", CONFIG_DIRNAME, "resources");
}

export function getDefaultConfig(projectBase: string): UseReqConfig {
  return {
    "docs-dir": DEFAULT_DOCS_DIR,
    "tests-dir": DEFAULT_TESTS_DIR,
    "src-dir": [...DEFAULT_SRC_DIRS],
    "static-check": {},
    "enabled-tools": normalizeEnabledPiUsereqTools(undefined),
    "base-path": projectBase,
  };
}

export function loadConfig(projectBase: string): UseReqConfig {
  const configPath = getProjectConfigPath(projectBase);
  if (!fs.existsSync(configPath)) {
    return getDefaultConfig(projectBase);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new ReqError(`Error: invalid ${configPath}`, 11);
  }

  if (!payload || typeof payload !== "object") {
    throw new ReqError(`Error: invalid ${configPath}`, 11);
  }
  const data = payload as Record<string, unknown>;
  const docsDir = typeof data["docs-dir"] === "string" && data["docs-dir"].trim() ? data["docs-dir"] : DEFAULT_DOCS_DIR;
  const testsDir = typeof data["tests-dir"] === "string" && data["tests-dir"].trim() ? data["tests-dir"] : DEFAULT_TESTS_DIR;
  const srcDir = Array.isArray(data["src-dir"]) && data["src-dir"].every((item) => typeof item === "string" && item.trim())
    ? (data["src-dir"] as string[])
    : [...DEFAULT_SRC_DIRS];
  const staticCheck = typeof data["static-check"] === "object" && data["static-check"] !== null
    ? (data["static-check"] as Record<string, StaticCheckEntry[]>)
    : {};
  const enabledTools = normalizeEnabledPiUsereqTools(data["enabled-tools"]);
  const basePath = typeof data["base-path"] === "string" ? data["base-path"] : projectBase;
  const gitPath = typeof data["git-path"] === "string" ? data["git-path"] : undefined;

  return {
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDir,
    "static-check": staticCheck,
    "enabled-tools": enabledTools,
    "base-path": basePath,
    "git-path": gitPath,
  };
}

export function saveConfig(projectBase: string, config: UseReqConfig): void {
  const configPath = getProjectConfigPath(projectBase);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig {
  const docsDir = makeRelativeIfContainsProject(config["docs-dir"], projectBase).replace(/[/\\]+$/, "") || DEFAULT_DOCS_DIR;
  const testsDir = makeRelativeIfContainsProject(config["tests-dir"], projectBase).replace(/[/\\]+$/, "") || DEFAULT_TESTS_DIR;
  const srcDirs = config["src-dir"].map((value) => makeRelativeIfContainsProject(value, projectBase).replace(/[/\\]+$/, "")).filter(Boolean);
  return {
    ...config,
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDirs.length > 0 ? srcDirs : [...DEFAULT_SRC_DIRS],
  };
}

export function buildPromptReplacementPaths(projectBase: string, config: UseReqConfig): Record<string, string> {
  const resourcesRoot = getHomeResourceRoot();
  const guidelinesDir = path.join(resourcesRoot, "guidelines");
  const guidelineEntries = fs.existsSync(guidelinesDir)
    ? fs.readdirSync(guidelinesDir)
        .filter((entry) => !entry.startsWith("."))
        .map((entry) => homeRelative(path.join(guidelinesDir, entry)))
        .sort()
    : [];

  const srcValue = config["src-dir"].map((value) => `\`${value.replace(/[/\\]+$/, "")}/\``).join(", ");
  const testValue = `\`${config["tests-dir"].replace(/[/\\]+$/, "")}/\``;
  const guidelinesValue = guidelineEntries.length > 0
    ? guidelineEntries.map((entry) => `\`${entry}\``).join(", ")
    : `\`${homeRelative(guidelinesDir)}/\``;

  return {
    "%%DOC_PATH%%": config["docs-dir"].replace(/[/\\]+$/, ""),
    "%%GUIDELINES_FILES%%": guidelinesValue,
    "%%GUIDELINES_PATH%%": homeRelative(guidelinesDir),
    "%%SRC_PATHS%%": srcValue,
    "%%TEST_PATH%%": testValue,
    "%%PROJECT_BASE%%": projectBase,
  };
}
