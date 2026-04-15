import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { loadConfig, saveConfig, type UseReqConfig } from "./config.js";
import { countFilesMetrics, formatPackSummary } from "./token-counter.js";
import { generateMarkdown } from "./generate-markdown.js";
import { compressFiles } from "./compress-files.js";
import { findConstructsInFiles } from "./find-constructs.js";
import { STATIC_CHECK_EXT_TO_LANG, dispatchStaticCheckForFile } from "./static-check.js";
import { makeRelativeIfContainsProject } from "./utils.js";

export interface ToolResult {
  stdout: string;
  stderr: string;
  code: number;
}

export const EXCLUDED_DIRS = new Set<string>();
export const SUPPORTED_EXTENSIONS = new Set(Object.keys(STATIC_CHECK_EXT_TO_LANG));

function ok(stdout = "", stderr = ""): ToolResult {
  return { stdout, stderr, code: 0 };
}

function fail(message: string, code = 1, stdout = "", stderr = ""): never {
  const error = new ReqError(message, code);
  (error as ReqError & { stdout?: string; stderr?: string }).stdout = stdout;
  (error as ReqError & { stdout?: string; stderr?: string }).stderr = stderr || message;
  throw error;
}

function runCapture(command: string[], options: { cwd?: string } = {}) {
  return spawnSync(command[0]!, command.slice(1), {
    cwd: options.cwd,
    encoding: "utf8",
  });
}

export function isInsideGitRepo(targetPath: string): boolean {
  const result = runCapture(["git", "rev-parse", "--is-inside-work-tree"], { cwd: targetPath });
  return result.status === 0 && result.stdout.trim() === "true";
}

export function resolveGitRoot(targetPath: string): string {
  const result = runCapture(["git", "rev-parse", "--show-toplevel"], { cwd: targetPath });
  if (result.error || result.status !== 0) {
    fail(`Error: '${targetPath}' is not inside a git repository.`, 3);
  }
  return path.resolve(result.stdout.trim());
}

export function sanitizeBranchName(branch: string): string {
  return branch.replace(/[<>:"/\\|?*\x00-\x1f\s~^{}\[\]]/g, "-");
}

export function validateWtName(wtName: string): boolean {
  if (!wtName || wtName === "." || wtName === "..") return false;
  return !/[<>:"/\\|?*\x00-\x1f\s]/.test(wtName);
}

export function collectSourceFiles(srcDirs: string[], projectBase: string): string[] {
  const result = runCapture(
    ["git", "-C", projectBase, "ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: projectBase },
  );
  if (result.error || result.status !== 0) {
    fail("Error: failed to collect source files with `git ls-files` in project root.", 1);
  }
  const normalizedSrcDirs = srcDirs.map((srcDir) => makeRelativeIfContainsProject(srcDir, projectBase).split(path.sep).join("/").replace(/^\.?\/?/, "").replace(/\/+$/, ""));
  const collected = new Set<string>();
  for (const relPathRaw of result.stdout.split(/\r?\n/)) {
    let relPath = relPathRaw.trim().replace(/^\.\//, "");
    if (!relPath) continue;
    if (
      !normalizedSrcDirs.some(
        (srcDir) => srcDir === "" || srcDir === "." || relPath === srcDir || relPath.startsWith(`${srcDir}/`),
      )
    ) {
      continue;
    }
    const relObj = relPath.split("/");
    if (relObj.slice(0, -1).some((part) => EXCLUDED_DIRS.has(part))) continue;
    const ext = path.extname(relPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    collected.add(path.resolve(projectBase, relPath));
  }
  return [...collected].sort();
}

function buildAsciiTree(paths: string[]): string {
  const tree: Record<string, Record<string, unknown> | null> = {};
  for (const relPath of [...paths].sort()) {
    let node = tree;
    const parts = relPath.split("/");
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        node[part] ??= null;
      } else {
        node[part] = (node[part] as Record<string, unknown> | null) ?? {};
        node = node[part] as Record<string, Record<string, unknown> | null>;
      }
    });
  }
  const lines = ["."];
  const emit = (branch: Record<string, Record<string, unknown> | null>, prefix = "") => {
    const entries = Object.entries(branch).sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([name, child], index) => {
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${name}`);
      if (child && Object.keys(child).length > 0) {
        emit(child as Record<string, Record<string, unknown> | null>, `${prefix}${last ? "    " : "│   "}`);
      }
    });
  };
  emit(tree);
  return lines.join("\n");
}

function formatFilesStructureMarkdown(files: string[], projectBase: string): string {
  const relativePaths = files.map((filePath) => path.relative(projectBase, filePath).split(path.sep).join("/"));
  return `# Files Structure\n\`\`\`\n${buildAsciiTree(relativePaths)}\n\`\`\``;
}

export function resolveProjectBase(projectBase?: string): string {
  const base = projectBase ? path.resolve(projectBase) : process.cwd();
  if (!fs.existsSync(base)) {
    fail(`Error: PROJECT_BASE '${base}' does not exist`, 2);
  }
  return base;
}

export function resolveProjectSrcDirs(projectBase: string, config?: UseReqConfig): [string, string[]] {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const srcDirs = effectiveConfig["src-dir"];
  if (!Array.isArray(srcDirs) || srcDirs.length === 0) {
    fail("Error: no source directories configured.", 1);
  }
  return [base, srcDirs];
}

export function loadAndRepairConfig(projectBase: string): UseReqConfig {
  const base = resolveProjectBase(projectBase);
  const config = loadConfig(base);
  config["base-path"] = base;
  if (isInsideGitRepo(base)) {
    config["git-path"] = resolveGitRoot(base);
  }
  saveConfig(base, config);
  return config;
}

export function runFilesTokens(files: string[]): ToolResult {
  const validFiles: string[] = [];
  const stderrLines: string[] = [];
  files.forEach((filePath) => {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      stderrLines.push(`  Warning: skipping (not found): ${filePath}`);
    } else {
      validFiles.push(filePath);
    }
  });
  if (validFiles.length === 0) fail("Error: no valid files provided.", 1, "", stderrLines.join("\n"));
  return ok(`${formatPackSummary(countFilesMetrics(validFiles))}\n`, stderrLines.join("\n"));
}

export function runFilesReferences(files: string[], cwd = process.cwd(), verbose = false): ToolResult {
  return ok(`${generateMarkdown(files, verbose, cwd)}\n`);
}

export function runFilesCompress(files: string[], cwd = process.cwd(), enableLineNumbers = false, verbose = false): ToolResult {
  return ok(`${compressFiles(files, enableLineNumbers, verbose, cwd)}\n`);
}

export function runFilesFind(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult {
  if (argsList.length < 3) {
    fail("Error: --files-find requires at least TAG, PATTERN, and one FILE.", 1);
  }
  const [tagFilter, pattern, ...files] = argsList;
  return ok(`${findConstructsInFiles(files, tagFilter!, pattern!, enableLineNumbers, verbose)}\n`);
}

export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  const markdown = generateMarkdown(files, verbose, base);
  return ok(`${formatFilesStructureMarkdown(files, base)}\n\n${markdown}\n`);
}

export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  return ok(`${compressFiles(files, enableLineNumbers, verbose, base)}\n`);
}

export function runFind(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  try {
    return ok(`${findConstructsInFiles(files, tagFilter, pattern, enableLineNumbers, verbose)}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
}

export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const docsDir = effectiveConfig["docs-dir"].replace(/[/\\]+$/, "");
  const docsPath = path.join(base, docsDir);
  const canonicalNames = ["REQUIREMENTS.md", "WORKFLOW.md", "REFERENCES.md"];
  const files = canonicalNames.map((name) => path.join(docsPath, name)).filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (files.length === 0) fail("Error: no canonical docs files found in --docs-dir.", 1);
  return runFilesTokens(files);
}

export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const scConfig = effectiveConfig["static-check"] ?? {};
  let stderr = "";
  let overall = 0;
  let stdout = "";
  for (const rawPath of files) {
    if (!fs.existsSync(rawPath) || !fs.statSync(rawPath).isFile()) {
      stderr += `${stderr ? "\n" : ""}  Warning: skipping (not found or not a file): ${rawPath}`;
      continue;
    }
    const filePath = path.resolve(rawPath);
    const lang = STATIC_CHECK_EXT_TO_LANG[path.extname(filePath).toLowerCase()];
    if (!lang) continue;
    const langConfigs = scConfig[lang] ?? [];
    for (const langConfig of langConfigs) {
      const previousWrite = process.stdout.write.bind(process.stdout);
      let captured = "";
      (process.stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array) => {
        captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
      }) as unknown as typeof process.stdout.write;
      try {
        const rc = dispatchStaticCheckForFile(filePath, langConfig, {
          failOnly: true,
          projectBase: base,
        });
        if (rc !== 0) overall = 1;
      } finally {
        process.stdout.write = previousWrite;
      }
      stdout += captured;
    }
  }
  return { stdout, stderr, code: overall };
}

export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const selectionDirs = [...effectiveConfig["src-dir"], effectiveConfig["tests-dir"]];
  let files = collectSourceFiles(selectionDirs, base);
  const testsDirRel = makeRelativeIfContainsProject(effectiveConfig["tests-dir"], base).split(path.sep).join("/").replace(/^\.?\/?/, "").replace(/\/+$/, "");
  const fixtureRoots = new Set(["tests/fixtures", testsDirRel ? `${testsDirRel}/fixtures` : "fixtures"]);
  files = files.filter((filePath) => {
    const rel = path.relative(base, filePath).split(path.sep).join("/");
    return ![...fixtureRoots].some((fixtureRoot) => rel === fixtureRoot || rel.startsWith(`${fixtureRoot}/`));
  });
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  return runFilesStaticCheck(files, base, effectiveConfig);
}

export function runGitCheck(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const command = "git rev-parse --is-inside-work-tree && ! git status --porcelain | grep -q . && { git symbolic-ref -q HEAD || git rev-parse --verify HEAD ; }";
  const result = spawnSync("bash", ["-c", command], { cwd: gitPath, encoding: "utf8" });
  if (result.error || result.status !== 0) fail("ERROR: Git status unclear!", 1);
  return ok();
}

export function runDocsCheck(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const docsDir = effectiveConfig["docs-dir"].replace(/[/\\]+$/, "");
  const basePath = effectiveConfig["base-path"] ?? base;
  const docPath = path.join(basePath, docsDir);
  for (const [filename, promptCmd] of [
    ["REQUIREMENTS.md", "/req-write"],
    ["WORKFLOW.md", "/req-workflow"],
    ["REFERENCES.md", "/req-references"],
  ] as const) {
    const fullPath = path.join(docPath, filename);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      const message = `ERROR: File ${docPath}/${filename} does not exist, generate it with the ${promptCmd} prompt!`;
      fail(message, 1, `${message}\n`, message);
    }
  }
  return ok();
}

export function runGitWtName(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const projectName = path.basename(gitPath);
  const branchResult = runCapture(["git", "branch", "--show-current"], { cwd: gitPath });
  const branch = branchResult.error ? "unknown" : branchResult.stdout.trim();
  const sanitizedBranch = sanitizeBranchName(branch);
  const now = new Date();
  const executionId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return ok(`useReq-${projectName}-${sanitizedBranch}-${executionId}\n`);
}

function worktreePathExistsExact(gitPath: string, targetPath: string): boolean {
  const result = runCapture(["git", "worktree", "list", "--porcelain"], { cwd: gitPath });
  if (result.error || result.status !== 0) fail("Error: unable to query git worktree list.", 3);
  const normalizedTarget = path.resolve(targetPath);
  return result.stdout.split(/\r?\n/).some((line) => line.startsWith("worktree ") && path.resolve(line.slice("worktree ".length).trim()) === normalizedTarget);
}

function rollbackWorktreeCreate(gitPath: string, wtPath: string, wtName: string): void {
  const removeResult = runCapture(["git", "worktree", "remove", wtPath, "--force"], { cwd: gitPath });
  const branchResult = runCapture(["git", "branch", "-D", wtName], { cwd: gitPath });
  if (removeResult.error || branchResult.error || removeResult.status !== 0 || branchResult.status !== 0) {
    fail(`ERROR: Rollback failed for worktree or branch ${wtName}.`, 1);
  }
}

export function runGitWtCreate(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult {
  if (!validateWtName(wtName)) {
    const message = `ERROR: Invalid worktree/branch name: ${wtName}.`;
    fail(message, 1, `${message}\n`, message);
  }
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  const basePath = effectiveConfig["base-path"] ?? base;
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const gitRoot = path.resolve(gitPath);
  const resolvedBasePath = path.resolve(basePath);
  const parentPath = path.dirname(gitRoot);
  const baseDir = (() => {
    const rel = path.relative(gitRoot, resolvedBasePath);
    return rel.startsWith("..") ? "." : rel;
  })();
  const wtDest = path.join(parentPath, wtName);
  const addResult = runCapture(["git", "worktree", "add", wtDest, "-b", wtName], { cwd: gitRoot });
  if (addResult.error || addResult.status !== 0) {
    fail(`Error: git worktree add failed: ${addResult.stderr.trim()}`, 1);
  }
  try {
    const wtBaseDir = path.join(wtDest, baseDir);
    const srcReq = path.join(resolvedBasePath, ".pi", "pi-usereq");
    const dstReq = path.join(wtBaseDir, ".pi", "pi-usereq");
    if (fs.existsSync(srcReq) && fs.statSync(srcReq).isDirectory() && !fs.existsSync(dstReq)) {
      fs.mkdirSync(path.dirname(dstReq), { recursive: true });
      fs.cpSync(srcReq, dstReq, { recursive: true });
    }
  } catch {
    rollbackWorktreeCreate(gitRoot, wtDest, wtName);
    fail(`ERROR: Unable to finalize worktree creation for ${wtName}.`, 1);
  }
  return ok();
}

export function runGitWtDelete(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  const basePath = effectiveConfig["base-path"] ?? base;
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const gitRoot = path.resolve(gitPath);
  const parentPath = path.dirname(gitRoot);
  const wtPath = path.join(parentPath, wtName);
  const branchExists = (() => {
    const result = runCapture(["git", "show-ref", "--verify", `refs/heads/${wtName}`], { cwd: gitRoot });
    return result.status === 0;
  })();
  const wtExists = worktreePathExistsExact(gitRoot, wtPath);
  if (!branchExists && !wtExists) {
    const message = `ERROR: Invalid worktree or branch name: ${wtName}.`;
    fail(message, 1, `${message}\n`, message);
  }
  const deleteCwd = path.resolve(basePath);
  let errorOccurred = false;
  if (wtExists) {
    const result = runCapture(["git", "worktree", "remove", wtPath, "--force"], { cwd: deleteCwd });
    errorOccurred ||= !!result.error || result.status !== 0;
  }
  if (branchExists) {
    const result = runCapture(["git", "branch", "-D", wtName], { cwd: deleteCwd });
    errorOccurred ||= !!result.error || result.status !== 0;
  }
  if (errorOccurred) {
    const message = `ERROR: Unable to remove worktree or branch ${wtName}.`;
    fail(message, 1, `${message}\n`, message);
  }
  return ok();
}

export function runGitPath(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  return ok(`${effectiveConfig["git-path"] ?? ""}\n`);
}

export function runGetBasePath(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  return ok(`${effectiveConfig["base-path"] ?? base}\n`);
}
