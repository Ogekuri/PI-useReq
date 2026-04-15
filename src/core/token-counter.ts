import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";

export class TokenCounter {
  private encoding;

  constructor(encodingName = "cl100k_base") {
    this.encoding = getEncoding(encodingName);
  }

  countTokens(content: string): number {
    try {
      return this.encoding.encode(content).length;
    } catch {
      return 0;
    }
  }

  static countChars(content: string): number {
    return content.length;
  }
}

export function countFileMetrics(content: string, encodingName = "cl100k_base"): { tokens: number; chars: number } {
  const counter = new TokenCounter(encodingName);
  return {
    tokens: counter.countTokens(content),
    chars: TokenCounter.countChars(content),
  };
}

export function countFilesMetrics(filePaths: string[], encodingName = "cl100k_base") {
  const counter = new TokenCounter(encodingName);
  return filePaths.map((filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return {
        file: filePath,
        tokens: counter.countTokens(content),
        chars: TokenCounter.countChars(content),
      };
    } catch (error) {
      return {
        file: filePath,
        tokens: 0,
        chars: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export function formatPackSummary(results: Array<{ file: string; tokens: number; chars: number; error?: string }>): string {
  const lines: string[] = [];
  let totalTokens = 0;
  let totalChars = 0;
  const totalFiles = results.length;

  for (const result of results) {
    const fileName = path.basename(result.file);
    totalTokens += result.tokens;
    totalChars += result.chars;
    if (result.error) {
      lines.push(`  ❌ ${fileName}: ERROR - ${result.error}`);
    } else {
      lines.push(`  📄 ${fileName}: ${result.tokens.toLocaleString()} tokens, ${result.chars.toLocaleString()} chars`);
    }
  }

  lines.push("");
  lines.push("📊 Pack Summary:");
  lines.push("────────────────");
  lines.push(`  Total Files: ${totalFiles} files`);
  lines.push(` Total Tokens: ${totalTokens.toLocaleString()} tokens`);
  lines.push(`  Total Chars: ${totalChars.toLocaleString()} chars`);
  return lines.join("\n");
}
