import fs from "node:fs";
import path from "node:path";
import { SourceAnalyzer, formatMarkdown } from "./source-analyzer.js";

const EXT_LANG_MAP: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".mjs": "javascript",
  ".ts": "typescript",
  ".rs": "rust",
  ".go": "go",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".lua": "lua",
  ".sh": "shell",
  ".pl": "perl",
  ".hs": "haskell",
  ".zig": "zig",
  ".ex": "elixir",
  ".cs": "csharp",
};

export function detectLanguage(filePath: string): string | undefined {
  return EXT_LANG_MAP[path.extname(filePath).toLowerCase()];
}

function formatOutputPath(filePath: string, outputBase?: string): string {
  if (!outputBase) return filePath;
  return path.relative(outputBase, path.resolve(filePath)).split(path.sep).join("/");
}

export function generateMarkdown(filePaths: string[], verbose = false, outputBase?: string): string {
  const analyzer = new SourceAnalyzer();
  const markdownParts: string[] = [];
  let okCount = 0;
  let failCount = 0;
  const resolvedOutputBase = outputBase ? path.resolve(outputBase) : undefined;

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      if (verbose) console.error(`  SKIP  ${filePath} (file not found)`);
      continue;
    }
    const language = detectLanguage(filePath);
    if (!language) {
      if (verbose) console.error(`  SKIP  ${filePath} (unsupported extension)`);
      continue;
    }
    try {
      const elements = analyzer.analyze(filePath, language);
      const spec = analyzer.specs[language.toLowerCase().trim().replace(/^\./, "")];
      analyzer.enrich(elements, language, filePath);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const totalLines = fileContent === ""
        ? 0
        : fileContent.split(/\r?\n/).length - (fileContent.endsWith("\n") ? 1 : 0);
      markdownParts.push(
        formatMarkdown(
          elements,
          formatOutputPath(filePath, resolvedOutputBase),
          language,
          spec.name,
          totalLines,
          false,
        ),
      );
      okCount += 1;
      if (verbose) console.error(`  OK    ${filePath}`);
    } catch (error) {
      failCount += 1;
      if (verbose) console.error(`  FAIL  ${filePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (markdownParts.length === 0) {
    throw new Error("No valid source files processed");
  }
  if (verbose) console.error(`\n  Processed: ${okCount} ok, ${failCount} failed`);
  return markdownParts.join("\n\n---\n\n");
}
