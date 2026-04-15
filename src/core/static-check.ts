import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import fg from "fast-glob";
import type { StaticCheckEntry } from "./config.js";
import { ReqError } from "./errors.js";

export const STATIC_CHECK_LANG_CANONICAL: Record<string, string> = {
  python: "Python",
  c: "C",
  "c++": "C++",
  cpp: "C++",
  "c#": "C#",
  csharp: "C#",
  rust: "Rust",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  java: "Java",
  go: "Go",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  lua: "Lua",
  shell: "Shell",
  sh: "Shell",
  perl: "Perl",
  haskell: "Haskell",
  zig: "Zig",
  elixir: "Elixir",
};

export const STATIC_CHECK_EXT_TO_LANG: Record<string, string> = {
  ".py": "Python",
  ".c": "C",
  ".cpp": "C++",
  ".cs": "C#",
  ".rs": "Rust",
  ".js": "JavaScript",
  ".mjs": "JavaScript",
  ".ts": "TypeScript",
  ".java": "Java",
  ".go": "Go",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".scala": "Scala",
  ".lua": "Lua",
  ".sh": "Shell",
  ".pl": "Perl",
  ".hs": "Haskell",
  ".zig": "Zig",
  ".ex": "Elixir",
};

export const STATIC_CHECK_MODULES = ["Dummy", "Pylance", "Ruff", "Command"] as const;

export interface StaticCheckLanguageSupport {
  language: string;
  extensions: string[];
}

const CANONICAL_MODULES: Record<string, (typeof STATIC_CHECK_MODULES)[number]> = {
  dummy: "Dummy",
  pylance: "Pylance",
  ruff: "Ruff",
  command: "Command",
};

export function getSupportedStaticCheckLanguages(): string[] {
  return [...new Set(Object.values(STATIC_CHECK_EXT_TO_LANG))].sort((left, right) => left.localeCompare(right));
}

export function getSupportedStaticCheckLanguageSupport(): StaticCheckLanguageSupport[] {
  const extensionsByLanguage = new Map<string, string[]>();
  for (const [extension, language] of Object.entries(STATIC_CHECK_EXT_TO_LANG)) {
    const extensions = extensionsByLanguage.get(language) ?? [];
    extensions.push(extension);
    extensionsByLanguage.set(language, extensions);
  }
  return getSupportedStaticCheckLanguages().map((language) => ({
    language,
    extensions: [...(extensionsByLanguage.get(language) ?? [])].sort((left, right) => left.localeCompare(right)),
  }));
}

function formatStaticCheckModules(): string {
  return STATIC_CHECK_MODULES.join(", ");
}

function splitCsvLikeTokens(specRhs: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let activeQuote: string | undefined;
  for (const ch of specRhs) {
    if (!activeQuote) {
      if (ch === '"' || ch === "'") {
        activeQuote = ch;
      } else if (ch === ",") {
        tokens.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    } else if (ch === activeQuote) {
      activeQuote = undefined;
    } else {
      current += ch;
    }
  }
  tokens.push(current.trim());
  return tokens;
}

export function parseEnableStaticCheck(spec: string): [string, StaticCheckEntry] {
  if (!spec.includes("=")) {
    throw new ReqError(
      "Error: --enable-static-check requires format LANG=MODULE[,CMD[,PARAM...]]; missing '=' separator.",
      1,
    );
  }
  const [langRaw, rest] = spec.split(/=(.*)/s, 2) as [string, string];
  const langKey = langRaw.trim().toLowerCase();
  if (!(langKey in STATIC_CHECK_LANG_CANONICAL)) {
    const valid = [...new Set(Object.values(STATIC_CHECK_LANG_CANONICAL))].sort((a, b) => a.localeCompare(b));
    throw new ReqError(
      `Error: unknown language '${langRaw.trim()}' in --enable-static-check. Valid language names (case-insensitive): ${valid.join(", ")}`,
      1,
    );
  }
  const canonicalLang = STATIC_CHECK_LANG_CANONICAL[langKey]!;
  const parts = splitCsvLikeTokens(rest);
  if (parts.length === 0 || !parts[0]?.trim()) {
    throw new ReqError(
      `Error: --enable-static-check requires MODULE after '='. Valid modules (case-insensitive): ${formatStaticCheckModules()}`,
      1,
    );
  }
  const moduleRaw = parts[0]!.trim();
  const moduleKey = moduleRaw.toLowerCase();
  if (!(moduleKey in CANONICAL_MODULES)) {
    throw new ReqError(
      `Error: unknown module '${moduleRaw}' in --enable-static-check. Valid modules (case-insensitive): ${formatStaticCheckModules()}`,
      1,
    );
  }
  const moduleName = CANONICAL_MODULES[moduleKey]!;
  const remaining = parts.slice(1).map((value) => value.trim()).filter(Boolean);
  const config: StaticCheckEntry = { module: moduleName };
  if (moduleName === "Command") {
    if (remaining.length === 0) {
      throw new ReqError(
        "Error: Command module requires a cmd argument in --enable-static-check. Format: LANG=Command,CMD[,PARAM...]",
        1,
      );
    }
    config.cmd = remaining[0]!;
    if (remaining.length > 1) config.params = remaining.slice(1);
  } else if (remaining.length > 0) {
    config.params = remaining;
  }
  return [canonicalLang, config];
}

function resolveFiles(inputs: string[]): string[] {
  const resolved = new Map<string, true>();
  for (const entry of inputs) {
    if (/[*?[]/.test(entry)) {
      for (const match of fg.sync(entry, { onlyFiles: true, dot: false, unique: true })) {
        resolved.set(path.resolve(match), true);
      }
      continue;
    }
    if (fs.existsSync(entry) && fs.statSync(entry).isDirectory()) {
      for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
        if (child.isFile()) {
          resolved.set(path.resolve(entry, child.name), true);
        }
      }
      continue;
    }
    if (fs.existsSync(entry) && fs.statSync(entry).isFile()) {
      resolved.set(path.resolve(entry), true);
    } else {
      console.error(`  Warning: skipping (not found or not a file): ${entry}`);
    }
  }
  return [...resolved.keys()];
}

export class StaticCheckBase {
  static LABEL = "Dummy";
  protected files: string[];
  protected extraArgs: string[];
  protected failOnly: boolean;
  protected label: string;

  constructor(inputs: string[], extraArgs?: string[], failOnly = false) {
    this.extraArgs = extraArgs ?? [];
    this.failOnly = failOnly;
    this.files = resolveFiles(inputs);
    this.label = (this.constructor as typeof StaticCheckBase).LABEL;
  }

  run(): number {
    if (this.files.length === 0) {
      console.error("  Warning: no files resolved for static check.");
      return 0;
    }
    let overall = 0;
    for (const filePath of this.files) {
      const rc = this.checkFile(filePath);
      if (rc !== 0) overall = 1;
      if (!this.failOnly || rc !== 0) this.emitLine("");
    }
    return overall;
  }

  protected headerLine(filePath: string): string {
    const options = this.extraArgs.length > 0 ? ` [${this.extraArgs.join(" ")}]` : "";
    return `# Static-Check(${this.label}): ${filePath}${options}`;
  }

  protected checkFile(filePath: string): number {
    if (!this.failOnly) {
      this.emitLine(this.headerLine(filePath));
      this.emitLine("Result: OK");
    }
    return 0;
  }

  protected emitLine(line: string): void {
    console.log(line);
  }
}

function detectPythonExecutable(projectBase?: string): string {
  const candidates = [
    projectBase ? path.join(projectBase, ".venv", "bin", "python") : undefined,
    process.env.PI_USEREQ_PYTHON,
    "python3",
    "python",
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
      continue;
    }
    if (findExecutable(candidate)) {
      return candidate;
    }
  }
  return "python3";
}

export class StaticCheckPylance extends StaticCheckBase {
  static override LABEL = "Pylance";
  private projectBase?: string;

  constructor(inputs: string[], extraArgs?: string[], failOnly = false, projectBase?: string) {
    super(inputs, extraArgs, failOnly);
    this.projectBase = projectBase;
    this.label = "Pylance";
  }

  protected override checkFile(filePath: string): number {
    const pythonExec = detectPythonExecutable(this.projectBase);
    const command = [pythonExec, "-m", "pyright", "--pythonpath", pythonExec, filePath, ...this.extraArgs];
    const result = spawnSync(command[0]!, command.slice(1), {
      cwd: this.projectBase,
      encoding: "utf8",
    });
    if (result.error) {
      this.emitLine(this.headerLine(filePath));
      this.emitLine("Result: FAIL");
      this.emitLine("Evidence:");
      this.emitLine("  pyright module not available via sys.executable");
      return 1;
    }
    if (result.status === 0) {
      if (!this.failOnly) {
        this.emitLine(this.headerLine(filePath));
        this.emitLine("Result: OK");
      }
      return 0;
    }
    this.emitLine(this.headerLine(filePath));
    this.emitLine("Result: FAIL");
    this.emitLine("Evidence:");
    this.emitLine(`${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd());
    return 1;
  }
}

export class StaticCheckRuff extends StaticCheckBase {
  static override LABEL = "Ruff";
  private projectBase?: string;

  constructor(inputs: string[], extraArgs?: string[], failOnly = false, projectBase?: string) {
    super(inputs, extraArgs, failOnly);
    this.label = "Ruff";
    this.projectBase = projectBase;
  }

  protected override checkFile(filePath: string): number {
    const pythonExec = detectPythonExecutable(this.projectBase);
    const command = [pythonExec, "-m", "ruff", "check", filePath, ...this.extraArgs];
    const result = spawnSync(command[0]!, command.slice(1), { encoding: "utf8", cwd: this.projectBase });
    if (result.error) {
      this.emitLine(this.headerLine(filePath));
      this.emitLine("Result: FAIL");
      this.emitLine("Evidence:");
      this.emitLine("  ruff module not available via sys.executable");
      return 1;
    }
    if (result.status === 0) {
      if (!this.failOnly) {
        this.emitLine(this.headerLine(filePath));
        this.emitLine("Result: OK");
      }
      return 0;
    }
    this.emitLine(this.headerLine(filePath));
    this.emitLine("Result: FAIL");
    this.emitLine("Evidence:");
    this.emitLine(`${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd());
    return 1;
  }
}

export class StaticCheckCommand extends StaticCheckBase {
  private cmd: string;

  constructor(cmd: string, inputs: string[], extraArgs?: string[], failOnly = false) {
    if (!findExecutable(cmd)) {
      throw new ReqError(`Error: external command '${cmd}' not found on PATH.`, 1);
    }
    super(inputs, extraArgs, failOnly);
    this.cmd = cmd;
    this.label = `Command[${cmd}]`;
  }

  protected override checkFile(filePath: string): number {
    const result = spawnSync(this.cmd, [...this.extraArgs, filePath], { encoding: "utf8" });
    if (result.error) {
      this.emitLine(this.headerLine(filePath));
      this.emitLine("Result: FAIL");
      this.emitLine("Evidence:");
      this.emitLine(`  command '${this.cmd}' not found on PATH`);
      return 1;
    }
    if (result.status === 0) {
      if (!this.failOnly) {
        this.emitLine(this.headerLine(filePath));
        this.emitLine("Result: OK");
      }
      return 0;
    }
    this.emitLine(this.headerLine(filePath));
    this.emitLine("Result: FAIL");
    this.emitLine("Evidence:");
    this.emitLine(`${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd());
    return 1;
  }
}

function findExecutable(cmd: string): string | undefined {
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, cmd);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

export function dispatchStaticCheckForFile(
  filePath: string,
  langConfig: StaticCheckEntry,
  options: { failOnly?: boolean; projectBase?: string } = {},
): number {
  const moduleName = String(langConfig.module ?? "");
  const params = Array.isArray(langConfig.params) ? langConfig.params.map(String) : [];
  const cmd = typeof langConfig.cmd === "string" ? langConfig.cmd : undefined;
  const failOnly = options.failOnly ?? false;
  const projectBase = options.projectBase;
  switch (moduleName.toLowerCase()) {
    case "dummy":
      return new StaticCheckBase([filePath], params, failOnly).run();
    case "pylance":
      return new StaticCheckPylance([filePath], params, failOnly, projectBase).run();
    case "ruff":
      return new StaticCheckRuff([filePath], params, failOnly, projectBase).run();
    case "command":
      if (!cmd) {
        throw new ReqError(`Error: Command module requires 'cmd' in static-check config for '${filePath}'.`, 1);
      }
      return new StaticCheckCommand(cmd, [filePath], params, failOnly).run();
    default:
      throw new ReqError(
        `Error: unknown static-check module '${moduleName}'. Valid modules: ${formatStaticCheckModules()}`,
        1,
      );
  }
}

export function runStaticCheck(argv: string[]): number {
  if (argv.length === 0) {
    throw new ReqError("Error: --test-static-check requires a subcommand: dummy, pylance, ruff, command.", 1);
  }
  const [subcommand, ...rest] = argv;
  switch (subcommand) {
    case "dummy":
      return new StaticCheckBase(rest).run();
    case "pylance":
      return new StaticCheckPylance(rest).run();
    case "ruff":
      return new StaticCheckRuff(rest, undefined, false, process.cwd()).run();
    case "command": {
      if (rest.length === 0) {
        throw new ReqError("Error: --test-static-check command requires a <cmd> argument.", 1);
      }
      const [cmd, ...files] = rest;
      return new StaticCheckCommand(cmd!, files).run();
    }
    default:
      throw new ReqError(
        `Error: unknown --test-static-check subcommand '${subcommand}'. Valid subcommands: dummy, pylance, ruff, command.`,
        1,
      );
  }
}
