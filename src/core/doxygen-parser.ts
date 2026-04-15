export const DOXYGEN_TAGS = [
  "brief",
  "details",
  "param",
  "param[in]",
  "param[out]",
  "param[in,out]",
  "return",
  "retval",
  "exception",
  "throws",
  "warning",
  "deprecated",
  "note",
  "see",
  "sa",
  "satisfies",
  "pre",
  "post",
] as const;

const NON_PARAM_TAGS = DOXYGEN_TAGS.filter(
  (tag) => !["param", "param[in]", "param[in,out]", "param[out]"].includes(tag),
);

const NON_PARAM_TAG_ALTERNATION = [...NON_PARAM_TAGS]
  .sort((a, b) => b.length - a.length)
  .map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const DOXYGEN_TAG_PATTERN = new RegExp(
  String.raw`[@\\](?:(param)(\[[^\]]+\])?|(${NON_PARAM_TAG_ALTERNATION}))`,
  "g",
);

export type DoxygenFieldMap = Record<string, string[]>;

export function parseDoxygenComment(commentText: string): DoxygenFieldMap {
  if (!commentText?.trim()) {
    return {};
  }

  const result: DoxygenFieldMap = {};
  const text = stripCommentDelimiters(commentText.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  const matches = [...text.matchAll(DOXYGEN_TAG_PATTERN)];
  if (matches.length === 0) {
    return {};
  }

  matches.forEach((match, index) => {
    const paramTag = match[1];
    const direction = match[2] ?? "";
    const nonParamTag = match[3];
    const normalizedTag = paramTag ? `param${direction}` : nonParamTag;
    if (!normalizedTag) {
      return;
    }

    const startPos = match.index! + match[0].length;
    const endPos = index + 1 < matches.length ? matches[index + 1]!.index! : text.length;
    const content = normalizeWhitespace(text.slice(startPos, endPos).trim());
    if (!content) {
      return;
    }

    result[normalizedTag] ??= [];
    result[normalizedTag].push(content);
  });

  return result;
}

export function stripCommentDelimiters(text: string): string {
  const cleanedLines: string[] = [];
  for (const line of text.split("\n")) {
    let stripped = line.trim();
    if (["/**", "/*", "*/", '"""', "'''", "/*!", "///", "//!"].includes(stripped)) {
      continue;
    }
    stripped = stripped.replace(/^[/*#]+\s*/, "");
    stripped = stripped.replace(/^\*\s*/, "");
    stripped = stripped.replace(/^\/\/\/?!?\s*/, "");
    stripped = stripped.replace(/^#+\s*/, "");
    if (stripped) {
      cleanedLines.push(stripped);
    }
  }
  return cleanedLines.join("\n");
}

export function normalizeWhitespace(text: string): string {
  const lines = text.replace(/ +/g, " ").split("\n").map((line) => line.trim());
  const normalized: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    if (!line) {
      if (!prevBlank) {
        normalized.push(line);
      }
      prevBlank = true;
    } else {
      normalized.push(line);
      prevBlank = false;
    }
  }
  return normalized.join("\n").trim();
}

export function formatDoxygenFieldsAsMarkdown(doxygenFields: DoxygenFieldMap): string[] {
  const lines: string[] = [];
  for (const tag of DOXYGEN_TAGS) {
    const values = doxygenFields[tag] ?? [];
    for (const value of values) {
      lines.push(`- @${tag} ${value}`);
    }
  }
  return lines;
}
