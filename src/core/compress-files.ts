import fs from "node:fs";
import path from "node:path";
import { compressFile, detectLanguage } from "./compress.js";

function extractLineRange(compressedWithLineNumbers: string): [number, number] {
  const lineNumbers = compressedWithLineNumbers
    .split(/\r?\n/)
    .map((line) => line.match(/^(\d+):/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => Number.parseInt(match[1]!, 10));
  if (lineNumbers.length === 0) return [0, 0];
  return [lineNumbers[0]!, lineNumbers[lineNumbers.length - 1]!];
}

function formatOutputPath(filePath: string, outputBase?: string): string {
  if (!outputBase) return filePath;
  return path.posix.normalize(path.relative(outputBase, path.resolve(filePath)).split(path.sep).join("/"));
}

export function compressFiles(
  filePaths: string[],
  includeLineNumbers = true,
  verbose = false,
  outputBase?: string,
): string {
  const parts: string[] = [];
  let okCount = 0;
  let failCount = 0;
  const resolvedOutputBase = outputBase ? path.resolve(outputBase) : undefined;

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      if (verbose) console.error(`  SKIP  ${filePath} (not found)`);
      continue;
    }
    const language = detectLanguage(filePath);
    if (!language) {
      if (verbose) console.error(`  SKIP  ${filePath} (unsupported extension)`);
      continue;
    }
    try {
      const compressedWithLineNumbers = compressFile(filePath, language, true);
      const [lineStart, lineEnd] = extractLineRange(compressedWithLineNumbers);
      const compressed = includeLineNumbers ? compressedWithLineNumbers : compressFile(filePath, language, false);
      const outputPath = formatOutputPath(filePath, resolvedOutputBase);
      parts.push(`@@@ ${outputPath} | ${language}\n> Lines: ${lineStart}-${lineEnd}\n\
\`\`\`\n${compressed}\n\`\`\``);
      okCount += 1;
      if (verbose) console.error(`  OK    ${filePath}`);
    } catch (error) {
      failCount += 1;
      if (verbose) console.error(`  FAIL  ${filePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (parts.length === 0) {
    throw new Error("No valid source files processed");
  }
  if (verbose) console.error(`\n  Compressed: ${okCount} ok, ${failCount} failed`);
  return parts.join("\n\n");
}
