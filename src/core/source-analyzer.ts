/**
 * @file
 * @brief Analyzes source files into language-agnostic structural elements and markdown references.
 * @details Defines the language-spec registry, source-element model, structural analyzer, Doxygen association logic, and markdown rendering helpers used by compression, reference generation, and construct search tools. Runtime is generally linear in source size plus language-pattern count. Side effects are limited to filesystem reads.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";

/**
 * @brief Enumerates the normalized source-element kinds emitted by the analyzer.
 * @details The enum lets language-specific regex matches collapse into a shared symbol taxonomy for downstream markdown generation and construct filtering. Access complexity is O(1).
 */
export enum ElementType {
  FUNCTION = "FUNCTION",
  METHOD = "METHOD",
  CLASS = "CLASS",
  STRUCT = "STRUCT",
  ENUM = "ENUM",
  TRAIT = "TRAIT",
  INTERFACE = "INTERFACE",
  MODULE = "MODULE",
  IMPL = "IMPL",
  MACRO = "MACRO",
  CONSTANT = "CONSTANT",
  VARIABLE = "VARIABLE",
  TYPE_ALIAS = "TYPE_ALIAS",
  IMPORT = "IMPORT",
  DECORATOR = "DECORATOR",
  COMMENT_SINGLE = "COMMENT_SINGLE",
  COMMENT_MULTI = "COMMENT_MULTI",
  COMPONENT = "COMPONENT",
  PROTOCOL = "PROTOCOL",
  EXTENSION = "EXTENSION",
  UNION = "UNION",
  NAMESPACE = "NAMESPACE",
  PROPERTY = "PROPERTY",
  SIGNAL = "SIGNAL",
  TYPEDEF = "TYPEDEF",
}

/**
 * @brief Represents one analyzed source element or comment block.
 * @details Stores location metadata, extracted source text, normalized naming/signature data, hierarchy information, attached Doxygen fields, and body annotations used by downstream renderers. Instance initialization is O(1) aside from object assignment.
 */
export class SourceElement {
  elementType: ElementType;
  lineStart: number;
  lineEnd: number;
  extract: string;
  name?: string;
  signature?: string;
  visibility?: string;
  parentName?: string;
  inherits?: string;
  depth = 0;
  commentSource?: string;
  bodyComments: Array<[number, number, string]> = [];
  exitPoints: Array<[number, string]> = [];
  doxygenFields: Record<string, string[]> = {};

  /**
   * @brief Initializes a source-element record.
   * @details Copies caller-provided metadata, ensures required fields are assigned explicitly, and restores default arrays/maps for optional enrichment fields. Runtime is O(k) in the number of provided properties. Mutates instance fields only.
   * @param[in] init {Partial<SourceElement> & Pick<SourceElement, "elementType" | "lineStart" | "lineEnd" | "extract">} Initial field set.
   */
  constructor(init: Partial<SourceElement> & Pick<SourceElement, "elementType" | "lineStart" | "lineEnd" | "extract">) {
    Object.assign(this, init);
    this.elementType = init.elementType;
    this.lineStart = init.lineStart;
    this.lineEnd = init.lineEnd;
    this.extract = init.extract;
    this.depth = init.depth ?? 0;
    this.bodyComments = init.bodyComments ?? [];
    this.exitPoints = init.exitPoints ?? [];
    this.doxygenFields = init.doxygenFields ?? {};
  }

  /**
   * @brief Returns the normalized public type label for the element.
   * @details Collapses both single-line and multi-line comment variants into the shared `COMMENT` label while leaving all other element types unchanged. Runtime is O(1). No side effects occur.
   * @return {string} Normalized type label.
   */
  get typeLabel(): string {
    switch (this.elementType) {
      case ElementType.COMMENT_SINGLE:
      case ElementType.COMMENT_MULTI:
        return "COMMENT";
      default:
        return this.elementType;
    }
  }
}

/**
 * @brief Describes language-specific parsing behavior for the source analyzer.
 * @details Each spec defines comment syntax, string delimiters, and ordered regex patterns mapping source lines to `ElementType` values. The interface is compile-time only and introduces no runtime cost.
 */
export interface LanguageSpec {
  name: string;
  singleComment?: string;
  multiCommentStart?: string;
  multiCommentEnd?: string;
  stringDelimiters: string[];
  patterns: Array<[ElementType, RegExp]>;
}

/**
 * @brief Creates a regular expression from a raw pattern string.
 * @details Wraps `new RegExp(...)` to keep the language-spec table compact and visually uniform. Runtime is O(1) relative to call-site complexity. No side effects occur.
 * @param[in] pattern {string} Raw regular-expression pattern.
 * @return {RegExp} Constructed regular expression.
 */
function re(pattern: string): RegExp {
  return new RegExp(pattern);
}

/**
 * @brief Builds the analyzer language-spec registry.
 * @details Materializes comment syntax, string delimiters, and ordered construct-detection regexes for all supported languages and aliases. Runtime is O(l) in the number of language definitions. No side effects occur.
 * @return {Record<string, LanguageSpec>} Language-spec map keyed by canonical names and aliases.
 */
export function buildLanguageSpecs(): Record<string, LanguageSpec> {
  const specs: Record<string, LanguageSpec> = {};

  specs.python = {
    name: "Python",
    singleComment: "#",
    multiCommentStart: '"""',
    multiCommentEnd: '"""',
    stringDelimiters: ['"', "'", '"""', "'''"] ,
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*class\s+(\w+)\s*[\(:])`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:async\s+)?def\s+(\w+)\s*\()`)],
      [ElementType.DECORATOR, re(String.raw`^(\s*@((?:\w[\w.]*))\s*)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*(?:from\s+\S+\s+)?import\s+(.+))`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*([A-Z][A-Z_0-9]+)\s*=\s*)`)],
    ],
  };

  specs.c = {
    name: "C",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.STRUCT, re(String.raw`^(\s*(?:typedef\s+)?struct\s+(\w+))`)],
      [ElementType.UNION, re(String.raw`^(\s*(?:typedef\s+)?union\s+(\w+))`)],
      [ElementType.ENUM, re(String.raw`^(\s*(?:typedef\s+)?enum\s+(\w+))`)],
      [ElementType.TYPEDEF, re(String.raw`^(\s*typedef\s+.+?\s+(\w+)\s*;)`)],
      [ElementType.MACRO, re(String.raw`^(\s*#\s*define\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:static\s+|inline\s+|extern\s+|const\s+)*(?:(?:unsigned|signed|long|short|volatile|register)\s+)*(?:void|int|char|float|double|long|short|unsigned|signed|size_t|ssize_t|uint\d+_t|int\d+_t|bool|_Bool|FILE|\w+_t|\w+)\s+(?:\*+\s*)?(\w+)\s*\()`)],
      [ElementType.IMPORT, re(String.raw`^(\s*#\s*include\s+(.+))`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*(?:static\s+|extern\s+|const\s+)*(?:const\s+)?(?:char|int|float|double|void|long|short|unsigned|signed|size_t|bool|_Bool|\w+_t)\s*\**\s+(\w+)\s*(?:=|;|\[))`)],
    ],
  };

  specs.cpp = {
    name: "C++",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:template\s*<[^>]*>\s*)?class\s+(\w+))`)],
      [ElementType.STRUCT, re(String.raw`^(\s*(?:template\s*<[^>]*>\s*)?struct\s+(\w+))`)],
      [ElementType.ENUM, re(String.raw`^(\s*enum\s+(?:class\s+)?(\w+))`)],
      [ElementType.NAMESPACE, re(String.raw`^(\s*namespace\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:static\s+|inline\s+|virtual\s+|explicit\s+|constexpr\s+|consteval\s+|constinit\s+|extern\s+|const\s+)*(?:auto|void|int|char|float|double|long|short|unsigned|signed|bool|string|wstring|size_t|\w+(?:::\w+)*)\s*[&*]*\s*(\w+(?:::\w+)*)\s*\()`)],
      [ElementType.MACRO, re(String.raw`^(\s*#\s*define\s+(\w+))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*#\s*include\s+(.+))`)],
      [ElementType.TYPE_ALIAS, re(String.raw`^(\s*(?:using|typedef)\s+(\w+))`)],
    ],
  };

  specs.rust = {
    name: "Rust",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"C"\s+)?fn\s+(\w+))`)],
      [ElementType.STRUCT, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?struct\s+(\w+))`)],
      [ElementType.ENUM, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?enum\s+(\w+))`)],
      [ElementType.TRAIT, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?(?:unsafe\s+)?trait\s+(\w+))`)],
      [ElementType.IMPL, re(String.raw`^(\s*impl(?:<[^>]*>)?\s+(?:(\w+(?:<[^>]*>)?)\s+for\s+)?(\w+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?mod\s+(\w+))`)],
      [ElementType.MACRO, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?macro_rules!\s+(\w+))`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?(?:const|static)\s+(\w+))`)],
      [ElementType.TYPE_ALIAS, re(String.raw`^(\s*(?:pub(?:\(\w+\))?\s+)?type\s+(\w+))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*use\s+(.+?);)`)],
      [ElementType.DECORATOR, re(String.raw`^(\s*#\[(\w[^\]]*)\])`)],
    ],
  };

  specs.javascript = {
    name: "JavaScript",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'", "`"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:export\s+)?(?:default\s+)?class\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+(\w+)\s*\()`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[a-zA-Z_]\w*\s*=>))`)],
      [ElementType.COMPONENT, re(String.raw`^(\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:React\.)?(?:memo|forwardRef|lazy)\s*\()`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:export\s+)?const\s+([A-Z][A-Z_0-9]+)\s*=)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(.+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+(\w+)\s*=\s*require\s*\()`)],
    ],
  };

  specs.typescript = {
    name: "TypeScript",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'", "`"],
    patterns: [
      [ElementType.INTERFACE, re(String.raw`^(\s*(?:export\s+)?interface\s+(\w+))`)],
      [ElementType.TYPE_ALIAS, re(String.raw`^(\s*(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=)`)],
      [ElementType.ENUM, re(String.raw`^(\s*(?:export\s+)?(?:const\s+)?enum\s+(\w+))`)],
      [ElementType.CLASS, re(String.raw`^(\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+(\w+)\s*)`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*(?::\s*[^=]+)?\s*=>|[a-zA-Z_]\w*\s*=>))`)],
      [ElementType.NAMESPACE, re(String.raw`^(\s*(?:export\s+)?(?:declare\s+)?namespace\s+(\w+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*(?:export\s+)?(?:declare\s+)?module\s+(\w+))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(.+))`)],
      [ElementType.DECORATOR, re(String.raw`^(\s*@((?:\w[\w.]*))\s*)`)],
    ],
  };

  specs.java = {
    name: "Java",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:abstract\s+)?class\s+(\w+))`)],
      [ElementType.INTERFACE, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+)?interface\s+(\w+))`)],
      [ElementType.ENUM, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+)?enum\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:native\s+)?(?:abstract\s+)?(?:<[^>]+>\s+)?(?:void|int|char|float|double|long|short|byte|boolean|String|Object|List|Map|Set|Optional|\w+(?:<[^>]*>)?)\s*(?:\[\])?\s+(\w+)\s*\()`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(?:static\s+)?(.+?);)`)],
      [ElementType.MODULE, re(String.raw`^(\s*package\s+(.+?);)`)],
      [ElementType.DECORATOR, re(String.raw`^(\s*@((?:\w[\w.]*(?:\([^)]*\))?)))`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+)?static\s+final\s+\w+\s+([A-Z_]\w*)\s*=)`)],
    ],
  };

  specs.go = {
    name: "Go",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "`"],
    patterns: [
      [ElementType.FUNCTION, re(String.raw`^(\s*func\s+(\w+)\s*\()`)],
      [ElementType.METHOD, re(String.raw`^(\s*func\s+\(\s*\w+\s+\*?\w+\s*\)\s+(\w+)\s*\()`)],
      [ElementType.STRUCT, re(String.raw`^(\s*type\s+(\w+)\s+struct\b)`)],
      [ElementType.INTERFACE, re(String.raw`^(\s*type\s+(\w+)\s+interface\b)`)],
      [ElementType.TYPE_ALIAS, re(String.raw`^(\s*type\s+(\w+)\s+(?!struct|interface)\w)`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:const|var)\s+(\w+))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(.+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*package\s+(\w+))`)],
    ],
  };

  specs.ruby = {
    name: "Ruby",
    singleComment: "#",
    multiCommentStart: "=begin",
    multiCommentEnd: "=end",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*class\s+(\w+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*module\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*def\s+(?:self\.)?(\w+[?!=]?))`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*([A-Z][A-Z_0-9]+)\s*=)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*require(?:_relative)?\s+(.+))`)],
      [ElementType.DECORATOR, re(String.raw`^(\s*attr_(?:reader|writer|accessor)\s+(.+))`)],
    ],
  };

  specs.php = {
    name: "PHP",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:abstract\s+|final\s+)?class\s+(\w+))`)],
      [ElementType.INTERFACE, re(String.raw`^(\s*interface\s+(\w+))`)],
      [ElementType.TRAIT, re(String.raw`^(\s*trait\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?function\s+(\w+)\s*\()`)],
      [ElementType.NAMESPACE, re(String.raw`^(\s*namespace\s+(.+?);)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*(?:use|require|require_once|include|include_once)\s+(.+?);)`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:const|define)\s*\(?\s*['"]?(\w+))`)],
    ],
  };

  specs.swift = {
    name: "Swift",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:public\s+|private\s+|internal\s+|open\s+|fileprivate\s+)?(?:final\s+)?class\s+(\w+))`)],
      [ElementType.STRUCT, re(String.raw`^(\s*(?:public\s+|private\s+|internal\s+)?struct\s+(\w+))`)],
      [ElementType.ENUM, re(String.raw`^(\s*(?:public\s+|private\s+|internal\s+)?enum\s+(\w+))`)],
      [ElementType.PROTOCOL, re(String.raw`^(\s*(?:public\s+|private\s+|internal\s+)?protocol\s+(\w+))`)],
      [ElementType.EXTENSION, re(String.raw`^(\s*(?:public\s+|private\s+|internal\s+)?extension\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:public\s+|private\s+|internal\s+|open\s+)?(?:static\s+|class\s+)?(?:override\s+)?func\s+(\w+))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(\w+))`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:public\s+|private\s+)?(?:static\s+)?let\s+(\w+)\s*(?::|\s*=))`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*(?:public\s+|private\s+)?(?:static\s+)?var\s+(\w+)\s*(?::|\s*=))`)],
    ],
  };

  specs.kotlin = {
    name: "Kotlin",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:open\s+|abstract\s+|sealed\s+|data\s+|inner\s+)*class\s+(\w+))`)],
      [ElementType.INTERFACE, re(String.raw`^(\s*interface\s+(\w+))`)],
      [ElementType.ENUM, re(String.raw`^(\s*enum\s+class\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:open\s+|override\s+)?(?:suspend\s+)?fun\s+(?:<[^>]+>\s+)?(\w+)\s*\()`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:const\s+)?val\s+(\w+))`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*var\s+(\w+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*(?:object|companion\s+object)\s+(\w*))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(.+))`)],
      [ElementType.DECORATOR, re(String.raw`^(\s*@((?:\w[\w.]*))\s*)`)],
    ],
  };

  specs.scala = {
    name: "Scala",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:abstract\s+|sealed\s+|case\s+)?class\s+(\w+))`)],
      [ElementType.TRAIT, re(String.raw`^(\s*trait\s+(\w+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*object\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:override\s+)?def\s+(\w+))`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*val\s+(\w+))`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*var\s+(\w+))`)],
      [ElementType.TYPE_ALIAS, re(String.raw`^(\s*type\s+(\w+))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(.+))`)],
    ],
  };

  specs.lua = {
    name: "Lua",
    singleComment: "--",
    multiCommentStart: "--[[",
    multiCommentEnd: "]]",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:local\s+)?function\s+(\w[\w.:]*))\s*\(`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:local\s+)?(\w[\w.]*)\s*=\s*function\s*\()`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*local\s+(\w+)\s*=)`)],
    ],
  };

  specs.shell = {
    name: "Shell",
    singleComment: "#",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:function\s+)?(\w+)\s*\(\s*\))`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*(?:export\s+|readonly\s+|declare\s+(?:-\w+\s+)*)?([A-Z_][A-Z_0-9]*)\s*=)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*(?:source|\\.)\s+(.+))`)],
    ],
  };
  specs.bash = specs.shell;
  specs.sh = specs.shell;
  specs.zsh = specs.shell;

  specs.perl = {
    name: "Perl",
    singleComment: "#",
    multiCommentStart: "=pod",
    multiCommentEnd: "=cut",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.FUNCTION, re(String.raw`^(\s*sub\s+(\w+))`)],
      [ElementType.MODULE, re(String.raw`^(\s*package\s+(\w[\w:]*))`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:use\s+constant\s+(\w+)))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*(?:use|require)\s+(.+?);)`)],
    ],
  };

  specs.haskell = {
    name: "Haskell",
    singleComment: "--",
    multiCommentStart: "{-",
    multiCommentEnd: "-}",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.MODULE, re(String.raw`^(\s*module\s+(\w[\w.]*))`)],
      [ElementType.TYPE_ALIAS, re(String.raw`^(\s*type\s+(\w+))`)],
      [ElementType.STRUCT, re(String.raw`^(\s*data\s+(\w+))`)],
      [ElementType.CLASS, re(String.raw`^(\s*class\s+(\w+))`)],
      [ElementType.FUNCTION, re(String.raw`^(([a-z_]\w*)\s*::)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*import\s+(?:qualified\s+)?(.+))`)],
    ],
  };

  specs.zig = {
    name: "Zig",
    singleComment: "//",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:pub\s+|export\s+)?fn\s+(\w+))`)],
      [ElementType.STRUCT, re(String.raw`^(\s*(?:pub\s+)?const\s+(\w+)\s*=\s*(?:extern\s+|packed\s+)?struct\b)`)],
      [ElementType.ENUM, re(String.raw`^(\s*(?:pub\s+)?const\s+(\w+)\s*=\s*enum\b)`)],
      [ElementType.UNION, re(String.raw`^(\s*(?:pub\s+)?const\s+(\w+)\s*=\s*(?:extern\s+|packed\s+)?union\b)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*const\s+(\w+)\s*=\s*@import\()`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:pub\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=)`)],
      [ElementType.VARIABLE, re(String.raw`^(\s*(?:pub\s+)?var\s+(\w+))`)],
    ],
  };

  specs.elixir = {
    name: "Elixir",
    singleComment: "#",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.MODULE, re(String.raw`^(\s*defmodule\s+(\w[\w.]*))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:def|defp|defmacro|defmacrop)\s+(\w+))`)],
      [ElementType.PROTOCOL, re(String.raw`^(\s*defprotocol\s+(\w[\w.]*))`)],
      [ElementType.IMPL, re(String.raw`^(\s*defimpl\s+(\w[\w.]*))`)],
      [ElementType.STRUCT, re(String.raw`^(\s*defstruct\s+(.+))`)],
      [ElementType.IMPORT, re(String.raw`^(\s*(?:import|alias|use|require)\s+(.+))`)],
    ],
  };

  specs.csharp = {
    name: "C#",
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    stringDelimiters: ['"', "'"],
    patterns: [
      [ElementType.CLASS, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:static\s+)?(?:sealed\s+|abstract\s+|partial\s+)?class\s+(\w+))`)],
      [ElementType.INTERFACE, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+|internal\s+)?interface\s+(\w+))`)],
      [ElementType.STRUCT, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:readonly\s+)?struct\s+(\w+))`)],
      [ElementType.ENUM, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+|internal\s+)?enum\s+(\w+))`)],
      [ElementType.NAMESPACE, re(String.raw`^(\s*namespace\s+(\w[\w.]*))`)],
      [ElementType.FUNCTION, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:static\s+)?(?:async\s+)?(?:virtual\s+|override\s+|abstract\s+)?(?:void|int|char|float|double|long|short|byte|bool|decimal|string|object|var|Task|IEnumerable|\w+(?:<[^>]*>)?)\s*(?:\[\])?\s+(\w+)\s*\()`)],
      [ElementType.PROPERTY, re(String.raw`^(\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:static\s+)?(?:virtual\s+|override\s+)?(?:required\s+)?\w+(?:<[^>]*>)?\s+(\w+)\s*\{)`)],
      [ElementType.IMPORT, re(String.raw`^(\s*using\s+(.+?);)`)],
      [ElementType.DECORATOR, re(String.raw`^(\s*\[(\w[\w.]*(?:\([^)]*\))?)\])`)],
      [ElementType.CONSTANT, re(String.raw`^(\s*(?:public\s+|private\s+)?const\s+\w+\s+(\w+)\s*=)`)],
    ],
  };
  specs.cs = specs.csharp;

  specs.js = specs.javascript;
  specs.ts = specs.typescript;
  specs.rs = specs.rust;
  specs.py = specs.python;
  specs.rb = specs.ruby;
  specs.hs = specs.haskell;
  specs.cc = specs.cpp;
  specs.cxx = specs.cpp;
  specs.h = specs.c;
  specs.hpp = specs.cpp;
  specs.kt = specs.kotlin;
  specs.ex = specs.elixir;
  specs.exs = specs.elixir;
  specs.pl = specs.perl;

  return specs;
}

/**
 * @brief Performs language-aware structural analysis and metadata enrichment on source files.
 * @details Parses files into `SourceElement` records, derives signatures, hierarchy, visibility, inheritance, body annotations, and Doxygen fields, then exposes the enriched element list to higher-level renderers. Runtime is generally O(n * p) where n is line count and p is pattern count for the selected language. Side effects are limited to filesystem reads.
 */
export class SourceAnalyzer {
  specs: Record<string, LanguageSpec>;
  /**
   * @brief Matches explicit early-exit statements inside analyzed bodies.
   * @details The regex captures return-like constructs that downstream markdown renderers should surface as exit annotations. Evaluation cost is linear in line length.
   */
  private static readonly EXIT_PATTERNS_RETURN = /^\s*(return\b.*|yield\b.*|raise\b.*|throw\b.*|panic!\(.*)/;
  /**
   * @brief Matches process-terminating calls that imply control-flow exit.
   * @details The regex captures common runtime termination APIs used as implicit exits in body-annotation rendering. Evaluation cost is linear in line length.
   */
  private static readonly EXIT_PATTERNS_IMPLICIT = /^\s*(sys\.exit\(.*|os\._exit\(.*|exit\(.*|process\.exit\(.*)/;

  /**
   * @brief Initializes a source analyzer with the full language-spec registry.
   * @details Builds the language-spec map eagerly so later analysis passes can perform O(1) spec lookups. Construction cost is O(l) in supported-language count. Mutates instance fields only.
   */
  constructor() {
    this.specs = buildLanguageSpecs();
  }

  /**
   * @brief Parses a source file into raw source-element records.
   * @details Loads the file, tokenizes comments and definitions line-by-line using the selected language spec, computes approximate block spans, and returns extracted elements without higher-level enrichment. Runtime is O(n * p) where n is line count and p is pattern count. Side effects are limited to filesystem reads.
   * @param[in] filePath {string} Source file path.
   * @param[in] language {string} Canonical language identifier or alias.
   * @return {SourceElement[]} Raw analyzed elements.
   * @throws {Error} Throws when the requested language is unsupported.
   */
  analyze(filePath: string, language: string): SourceElement[] {
    const normalizedLanguage = language.toLowerCase().trim().replace(/^\./, "");
    const spec = this.specs[normalizedLanguage];
    if (!spec) {
      throw new Error(`Language '${language}' not supported.`);
    }

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    const elements: SourceElement[] = [];

    let inMultilineComment = false;
    let multilineCommentStartLine = 0;
    let multilineCommentLines: string[] = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const stripped = line;

      if (inMultilineComment) {
        multilineCommentLines.push(stripped);
        if (spec.multiCommentEnd && stripped.includes(spec.multiCommentEnd)) {
          inMultilineComment = false;
          const fullText = multilineCommentLines.join("\n");
          const extractLines = multilineCommentLines.length > 5
            ? [...multilineCommentLines.slice(0, 4), "    ..."]
            : multilineCommentLines;
          elements.push(new SourceElement({
            elementType: ElementType.COMMENT_MULTI,
            lineStart: multilineCommentStartLine,
            lineEnd: lineNum,
            extract: extractLines.join("\n"),
            commentSource: fullText,
          }));
          multilineCommentLines = [];
        }
        return;
      }

      if (spec.multiCommentStart && stripped.includes(spec.multiCommentStart)) {
        const startIndex = stripped.indexOf(spec.multiCommentStart);
        if (!this.inStringContext(stripped, startIndex, spec)) {
          const afterStart = stripped.slice(startIndex + spec.multiCommentStart.length);
          if (
            spec.multiCommentEnd &&
            afterStart.includes(spec.multiCommentEnd) &&
            spec.multiCommentStart !== spec.multiCommentEnd
          ) {
            elements.push(new SourceElement({
              elementType: ElementType.COMMENT_MULTI,
              lineStart: lineNum,
              lineEnd: lineNum,
              extract: stripped,
            }));
            return;
          }
          if (["\"\"\"", "'''"] .includes(spec.multiCommentStart)) {
            if (afterStart.includes(spec.multiCommentStart)) {
              elements.push(new SourceElement({
                elementType: ElementType.COMMENT_MULTI,
                lineStart: lineNum,
                lineEnd: lineNum,
                extract: stripped,
              }));
              return;
            }
          }
          inMultilineComment = true;
          multilineCommentStartLine = lineNum;
          multilineCommentLines = [stripped];
          return;
        }
      }

      if (spec.singleComment) {
        const commentIndex = this.findComment(stripped, spec);
        if (commentIndex !== undefined) {
          const beforeComment = stripped.slice(0, commentIndex).trim();
          if (!beforeComment) {
            elements.push(new SourceElement({
              elementType: ElementType.COMMENT_SINGLE,
              lineStart: lineNum,
              lineEnd: lineNum,
              extract: stripped,
            }));
            return;
          }
          const commentText = stripped.slice(commentIndex);
          elements.push(new SourceElement({
            elementType: ElementType.COMMENT_SINGLE,
            lineStart: lineNum,
            lineEnd: lineNum,
            extract: commentText,
            name: "inline",
          }));
        }
      }

      if (!stripped.trim()) return;

      for (const [elementType, pattern] of spec.patterns) {
        const match = pattern.exec(stripped);
        if (!match) continue;
        const name = match.length >= 3 && match[2] ? match[2] : (match[1] || undefined);
        const singleLineTypes = new Set([
          ElementType.IMPORT,
          ElementType.CONSTANT,
          ElementType.VARIABLE,
          ElementType.DECORATOR,
          ElementType.MACRO,
          ElementType.TYPE_ALIAS,
          ElementType.TYPEDEF,
          ElementType.PROPERTY,
        ]);
        const blockEnd = singleLineTypes.has(elementType)
          ? lineNum
          : this.findBlockEnd(lines, index, normalizedLanguage, stripped);
        const extractLines = lines.slice(index, blockEnd).map((value) => value);
        const clipped = extractLines.length > 5 ? [...extractLines.slice(0, 4), "    ..."] : extractLines;
        elements.push(new SourceElement({
          elementType,
          lineStart: lineNum,
          lineEnd: blockEnd,
          extract: clipped.join("\n"),
          name: name?.trim(),
        }));
        break;
      }
    });

    return elements;
  }

  /**
   * @brief Enriches raw analyzed elements with derived metadata.
   * @details Normalizes names, computes signatures, hierarchy, visibility, inheritance, body annotations, and Doxygen associations. When `filePath` is omitted, body-level annotation extraction is skipped. Runtime is O(n log n) plus file-read cost for annotation extraction. Side effects are limited to filesystem reads.
   * @param[in] elements {SourceElement[]} Raw analyzed elements.
   * @param[in] language {string} Canonical language identifier or alias.
   * @param[in] filePath {string | undefined} Optional source file path for body-comment extraction.
   * @return {SourceElement[]} The same array instance after in-place enrichment.
   */
  enrich(elements: SourceElement[], language: string, filePath?: string): SourceElement[] {
    const normalizedLanguage = language.toLowerCase().trim().replace(/^\./, "");
    this.cleanNames(elements, normalizedLanguage);
    this.extractSignatures(elements);
    this.detectHierarchy(elements);
    this.extractVisibility(elements, normalizedLanguage);
    this.extractInheritance(elements, normalizedLanguage);
    if (filePath) {
      this.extractBodyAnnotations(elements, normalizedLanguage, filePath);
      this.extractDoxygenFields(elements);
    }
    return elements;
  }

  /**
   * @brief Refines element names using the primary language patterns.
   * @details Replays the matching regex against each element's first extracted line and stores the most specific non-empty capture group as the normalized name. Runtime is O(n * p). Side effect: mutates `element.name` in place.
   * @param[in,out] elements {SourceElement[]} Elements to normalize.
   * @param[in] language {string} Canonical language identifier.
   * @return {void} No return value.
   */
  private cleanNames(elements: SourceElement[], language: string): void {
    const spec = this.specs[language];
    if (!spec) return;
    for (const element of elements) {
      if (!element.name) continue;
      const firstLine = element.extract.split("\n")[0] ?? "";
      for (const [candidateType, pattern] of spec.patterns) {
        if (candidateType !== element.elementType) continue;
        const match = pattern.exec(firstLine);
        if (!match) continue;
        for (let i = match.length - 1; i >= 1; i -= 1) {
          const value = match[i];
          if (value?.trim()) {
            element.name = value.trim();
            break;
          }
        }
        break;
      }
    }
  }

  /**
   * @brief Derives single-line signatures for non-comment elements.
   * @details Uses the first extracted line, preserves leading tabs when present, trims structural suffixes such as trailing `{`, `:`, or `;`, and stores the result as `element.signature`. Runtime is O(n). Side effect: mutates `element.signature`.
   * @param[in,out] elements {SourceElement[]} Elements to enrich.
   * @return {void} No return value.
   */
  private extractSignatures(elements: SourceElement[]): void {
    const skipTypes = new Set([ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR]);
    for (const element of elements) {
      if (skipTypes.has(element.elementType)) continue;
      let signature = normalizeSourceLineForExtraction(element.extract.split("\n")[0] ?? "");
      for (const suffix of [" {", "{", ":", ";"]) {
        if (signature.endsWith(suffix) && !signature.endsWith("::")) {
          signature = signature.slice(0, -suffix.length).trimEnd();
          break;
        }
      }
      element.signature = signature;
    }
  }

  /**
   * @brief Assigns one-level parent relationships for nested elements.
   * @details Treats classes, structs, modules, interfaces, and similar containers as parents, then attaches each contained non-container element to the nearest enclosing container. Runtime is O(n * c) where c is container count. Side effect: mutates `parentName` and `depth`.
   * @param[in,out] elements {SourceElement[]} Elements to enrich.
   * @return {void} No return value.
   */
  private detectHierarchy(elements: SourceElement[]): void {
    const containerTypes = new Set([
      ElementType.CLASS,
      ElementType.STRUCT,
      ElementType.MODULE,
      ElementType.IMPL,
      ElementType.INTERFACE,
      ElementType.TRAIT,
      ElementType.NAMESPACE,
      ElementType.ENUM,
      ElementType.EXTENSION,
      ElementType.PROTOCOL,
    ]);
    const containers = elements.filter((element) => containerTypes.has(element.elementType));
    const skipTypes = new Set([ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT]);
    for (const element of elements) {
      if (skipTypes.has(element.elementType) || containerTypes.has(element.elementType)) continue;
      let best: SourceElement | undefined;
      for (const container of containers) {
        if (container === element) continue;
        if (container.lineStart <= element.lineStart && container.lineEnd >= element.lineEnd) {
          if (!best || container.lineStart > best.lineStart || (container.lineStart === best.lineStart && container.lineEnd < best.lineEnd)) {
            best = container;
          }
        }
      }
      if (best) {
        element.parentName = best.name;
        element.depth = 1;
      }
    }
  }

  /**
   * @brief Derives visibility metadata for applicable elements.
   * @details Computes a per-element visibility code from the first signature line using language-specific heuristics. Runtime is O(n). Side effect: mutates `element.visibility` when a visibility code is derivable.
   * @param[in,out] elements {SourceElement[]} Elements to enrich.
   * @param[in] language {string} Canonical language identifier.
   * @return {void} No return value.
   */
  private extractVisibility(elements: SourceElement[], language: string): void {
    for (const element of elements) {
      if ([ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT].includes(element.elementType)) continue;
      const signature = element.extract.split("\n")[0]?.trim() ?? "";
      const visibility = this.parseVisibility(signature, element.name, language);
      if (visibility) {
        element.visibility = visibility;
      }
    }
  }

  /**
   * @brief Infers visibility from a signature and language rules.
   * @details Applies language-specific heuristics such as naming conventions, access modifiers, and `pub` markers to return a compact visibility code. Runtime is O(n) in signature length. No side effects occur.
   * @param[in] signature {string} First-line signature text.
   * @param[in] name {string | undefined} Normalized element name.
   * @param[in] language {string} Canonical language identifier.
   * @return {string | undefined} Visibility code such as `pub`, `priv`, `prot`, or `undefined` when unavailable.
   */
  private parseVisibility(signature: string, name: string | undefined, language: string): string | undefined {
    if (["python", "py"].includes(language)) {
      if (name?.startsWith("__") && !name.endsWith("__")) return "priv";
      if (name?.startsWith("_")) return "priv";
      return "pub";
    }
    if (["java", "csharp", "cs", "kotlin", "kt", "php"].includes(language)) {
      if (/\bpublic\b/.test(signature)) return "pub";
      if (/\bprivate\b/.test(signature)) return "priv";
      if (/\bprotected\b/.test(signature)) return "prot";
      if (/\binternal\b/.test(signature)) return "int";
      return undefined;
    }
    if (["rust", "rs", "zig"].includes(language)) {
      return /^\s*pub\b/.test(signature) ? "pub" : "priv";
    }
    if (["go"].includes(language)) {
      return name?.[0]?.toUpperCase() === name?.[0] ? "pub" : "priv";
    }
    if (["swift"].includes(language)) {
      if (/\bprivate\b/.test(signature)) return "priv";
      if (/\bfileprivate\b/.test(signature)) return "fpriv";
      if (/\b(?:public|open)\b/.test(signature)) return "pub";
      return undefined;
    }
    if (["cpp", "cc", "cxx", "h", "hpp"].includes(language)) {
      if (/\bpublic\b/.test(signature)) return "pub";
      if (/\bprivate\b/.test(signature)) return "priv";
      if (/\bprotected\b/.test(signature)) return "prot";
    }
    return undefined;
  }

  /**
   * @brief Derives inheritance metadata for class-like elements.
   * @details Inspects the first line of classes, structs, and interfaces and stores parsed inheritance text when the language-specific parser can extract it. Runtime is O(n). Side effect: mutates `element.inherits`.
   * @param[in,out] elements {SourceElement[]} Elements to enrich.
   * @param[in] language {string} Canonical language identifier.
   * @return {void} No return value.
   */
  private extractInheritance(elements: SourceElement[], language: string): void {
    for (const element of elements) {
      if (![ElementType.CLASS, ElementType.STRUCT, ElementType.INTERFACE].includes(element.elementType)) continue;
      const firstLine = element.extract.split("\n")[0]?.trim() ?? "";
      const inheritance = this.parseInheritance(firstLine, language);
      if (inheritance) {
        element.inherits = inheritance;
      }
    }
  }

  /**
   * @brief Parses inheritance syntax from one declaration line.
   * @details Supports language-specific `extends`, `implements`, `:`, and subclass forms, returning a compact textual summary when present. Runtime is O(n) in line length. No side effects occur.
   * @param[in] firstLine {string} First line of the declaration.
   * @param[in] language {string} Canonical language identifier.
   * @return {string | undefined} Parsed inheritance summary, or `undefined` when absent or unsupported.
   */
  private parseInheritance(firstLine: string, language: string): string | undefined {
    let match: RegExpExecArray | null = null;
    if (["python", "py"].includes(language)) {
      match = /class\s+\w+\s*\(([^)]+)\)/.exec(firstLine);
      return match?.[1]?.trim();
    }
    if (["java", "typescript", "ts", "javascript", "js"].includes(language)) {
      const parts: string[] = [];
      match = /\bextends\s+([\w.<>, ]+)/.exec(firstLine);
      if (match?.[1]) parts.push(match[1].trim());
      match = /\bimplements\s+([\w.<>, ]+)/.exec(firstLine);
      if (match?.[1]) parts.push(match[1].trim());
      return parts.length > 0 ? parts.join(", ") : undefined;
    }
    if (["cpp", "cc", "cxx", "hpp", "csharp", "cs", "swift"].includes(language)) {
      match = /(?:class|struct)\s+\w+\s*:\s*(.+?)(?:\s*\{|$)/.exec(firstLine);
      return match?.[1]?.trim();
    }
    if (["kotlin", "kt"].includes(language)) {
      match = /class\s+\w+\s*(?:\([^)]*\))?\s*:\s*(.+?)(?:\s*\{|$)/.exec(firstLine);
      return match?.[1]?.trim();
    }
    if (["ruby", "rb"].includes(language)) {
      match = /class\s+\w+\s*<\s*(\w+)/.exec(firstLine);
      return match?.[1];
    }
    return undefined;
  }

  /**
   * @brief Extracts body comments and exit points for multi-line elements.
   * @details Reads the full file, scans each eligible element body for standalone and inline comments plus explicit or implicit exit statements, and stores the results on the element. Runtime is O(total body lines). Side effects are limited to filesystem reads and in-place element mutation.
   * @param[in,out] elements {SourceElement[]} Elements to enrich.
   * @param[in] language {string} Canonical language identifier.
   * @param[in] filePath {string} Source file path.
   * @return {void} No return value.
   */
  private extractBodyAnnotations(elements: SourceElement[], language: string, filePath: string): void {
    const spec = this.specs[language];
    if (!spec) return;
    const allLines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    const singleLineTypes = new Set([
      ElementType.IMPORT,
      ElementType.CONSTANT,
      ElementType.VARIABLE,
      ElementType.DECORATOR,
      ElementType.MACRO,
      ElementType.TYPE_ALIAS,
      ElementType.TYPEDEF,
      ElementType.PROPERTY,
      ElementType.COMMENT_SINGLE,
      ElementType.COMMENT_MULTI,
    ]);

    for (const element of elements) {
      if (singleLineTypes.has(element.elementType) || element.lineEnd <= element.lineStart) continue;
      const bodyComments: Array<[number, number, string]> = [];
      const exitPoints: Array<[number, string]> = [];
      const bodyStart = element.lineStart;
      const bodyEnd = Math.min(element.lineEnd, allLines.length);
      let inMulti = false;
      let multiStart = 0;
      let multiLines: string[] = [];

      for (let lineIndex = bodyStart; lineIndex < bodyEnd; lineIndex += 1) {
        const raw = allLines[lineIndex] ?? "";
        const stripped = raw.trim();
        if (!stripped) continue;

        if (inMulti) {
          multiLines.push(stripped);
          if (spec.multiCommentEnd && stripped.includes(spec.multiCommentEnd)) {
            inMulti = false;
            const text = multiLines.map((line) => this.cleanCommentLine(line, spec)).join(" ").trim();
            if (text) bodyComments.push([multiStart, lineIndex + 1, text]);
            multiLines = [];
          }
          continue;
        }

        if (spec.multiCommentStart && stripped.includes(spec.multiCommentStart)) {
          const startPos = stripped.indexOf(spec.multiCommentStart);
          if (!this.inStringContext(stripped, startPos, spec)) {
            if (["\"\"\"", "'''"] .includes(spec.multiCommentStart)) {
              const after = stripped.slice(startPos + 3);
              if (after.includes(spec.multiCommentStart)) {
                const text = this.cleanCommentLine(stripped, spec);
                if (text) bodyComments.push([lineIndex + 1, lineIndex + 1, text]);
                continue;
              }
            } else if (spec.multiCommentEnd && stripped.slice(startPos + spec.multiCommentStart.length).includes(spec.multiCommentEnd)) {
              const text = this.cleanCommentLine(stripped, spec);
              if (text) bodyComments.push([lineIndex + 1, lineIndex + 1, text]);
              continue;
            }
            inMulti = true;
            multiStart = lineIndex + 1;
            multiLines = [stripped];
            continue;
          }
        }

        if (spec.singleComment) {
          const commentPos = this.findComment(stripped, spec);
          if (commentPos !== undefined) {
            const before = stripped.slice(0, commentPos).trim();
            const commentText = stripped.slice(commentPos);
            const cleaned = this.cleanCommentLine(commentText, spec);
            if (!before) {
              if (cleaned) bodyComments.push([lineIndex + 1, lineIndex + 1, cleaned]);
              continue;
            }
            if (cleaned) bodyComments.push([lineIndex + 1, lineIndex + 1, cleaned]);
          }
        }

        if (SourceAnalyzer.EXIT_PATTERNS_RETURN.test(stripped) || SourceAnalyzer.EXIT_PATTERNS_IMPLICIT.test(stripped)) {
          exitPoints.push([lineIndex + 1, stripped]);
        }
      }

      element.bodyComments = bodyComments;
      element.exitPoints = exitPoints;
    }
  }

  /**
   * @brief Associates parsed Doxygen comments with analyzed elements.
   * @details Searches inline postfix comments, nearby preceding comments, and selected following postfix comments while excluding file-level comments, then stores the parsed Doxygen field map on each element. Runtime is O(n^2) in the worst case due to proximity scans across comments and elements. Side effect: mutates `element.doxygenFields`.
   * @param[in,out] elements {SourceElement[]} Elements to enrich.
   * @return {void} No return value.
   */
  private extractDoxygenFields(elements: SourceElement[]): void {
    const commentElements = elements.filter((element) => [ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType));
    const nonCommentElements = elements.filter((element) => ![ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType));

    const isFileLevelComment = (comment: SourceElement): boolean => {
      const commentText = comment.commentSource || comment.extract;
      return !!commentText && /(?<!\w)(?:@|\\)file\b/.test(commentText);
    };

    for (const element of elements) {
      if ([ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType)) continue;
      let associatedComment: SourceElement | undefined;

      const sameLinePostfixCandidates = commentElements.filter(
        (comment) =>
          comment.lineStart === element.lineEnd &&
          comment.name === "inline" &&
          this.isPostfixDoxygenComment(comment.extract) &&
          !isFileLevelComment(comment),
      );
      if (sameLinePostfixCandidates.length > 0) {
        associatedComment = sameLinePostfixCandidates.sort((a, b) => a.lineStart - b.lineStart)[0];
      }

      if (!associatedComment) {
        const precedingCandidates = commentElements.filter(
          (comment) => comment.name !== "inline" && comment.lineEnd < element.lineStart && !isFileLevelComment(comment),
        );
        const hasBlockingElement = (comment: SourceElement): boolean =>
          nonCommentElements.some(
            (other) =>
              other !== element &&
              (((other.lineStart > comment.lineEnd && other.lineStart < element.lineStart) ||
                (other.lineStart <= comment.lineEnd && comment.lineEnd < other.lineEnd && other.lineEnd < element.lineStart))),
          );

        const nearCandidates = precedingCandidates.filter((comment) => element.lineStart - comment.lineEnd <= 2);
        const searchPool = nearCandidates.length > 0
          ? nearCandidates.sort((a, b) => (b.lineEnd - a.lineEnd) || (b.lineStart - a.lineStart))
          : precedingCandidates.sort((a, b) => (b.lineEnd - a.lineEnd) || (b.lineStart - a.lineStart));

        for (const comment of searchPool) {
          const commentText = comment.commentSource || comment.extract;
          if (nearCandidates.length === 0 && Object.keys(parseDoxygenComment(commentText)).length === 0) continue;
          if (!hasBlockingElement(comment)) {
            associatedComment = comment;
            break;
          }
        }
      }

      if (!associatedComment) {
        const followingPostfixCandidates = commentElements.filter(
          (comment) =>
            comment.name !== "inline" &&
            comment.lineStart > element.lineEnd &&
            comment.lineStart - element.lineEnd <= 2 &&
            this.isPostfixDoxygenComment(comment.extract) &&
            !isFileLevelComment(comment),
        );
        if (followingPostfixCandidates.length > 0) {
          associatedComment = followingPostfixCandidates.sort((a, b) => (a.lineStart - b.lineStart) || (a.lineEnd - b.lineEnd))[0];
        }
      }

      if (associatedComment) {
        let commentText = associatedComment.commentSource || associatedComment.extract;
        if (
          associatedComment.name !== "inline" &&
          associatedComment.lineEnd < element.lineStart &&
          Object.keys(parseDoxygenComment(commentText)).length > 0
        ) {
          const mergedComments: SourceElement[] = [associatedComment];
          let currentStart = associatedComment.lineStart;
          while (true) {
            const contiguousCandidates = commentElements.filter(
              (comment) => comment.name !== "inline" && comment.lineEnd === currentStart - 1,
            );
            if (contiguousCandidates.length === 0) break;
            const previousComment = contiguousCandidates.sort((a, b) => (b.lineEnd - a.lineEnd) || (b.lineStart - a.lineStart))[0];
            mergedComments.unshift(previousComment);
            currentStart = previousComment.lineStart;
          }
          commentText = mergedComments.map((comment) => comment.commentSource || comment.extract).join("\n");
        }
        element.doxygenFields = parseDoxygenComment(commentText);
      }
    }
  }

  /**
   * @brief Tests whether a comment uses postfix-Doxygen marker syntax.
   * @details Matches comment prefixes such as `//!`, `/*!`, `#!`, and similar forms used for same-line documentation attachment. Runtime is O(n) in comment length. No side effects occur.
   * @param[in] commentText {string} Raw comment text.
   * @return {boolean} `true` when the comment looks like postfix Doxygen.
   */
  private isPostfixDoxygenComment(commentText: string): boolean {
    return !!commentText && /^\s*(?:#|\/\/+|--|\/\*+|;+)!?</.test(commentText);
  }

  /**
   * @brief Removes language comment markers from one comment line.
   * @details Strips known single-line prefixes and leading/trailing delimiter characters so body-annotation rendering receives semantic text only. Runtime is O(n). No side effects occur.
   * @param[in] text {string} Raw comment line.
   * @param[in] spec {LanguageSpec} Active language specification.
   * @return {string} Cleaned comment payload.
   */
  private cleanCommentLine(text: string, spec: LanguageSpec): string {
    let value = text.trim();
    for (const prefix of ["///", "//!", "//", "#!", "##", "#", "--", ";;"]) {
      if (value.startsWith(prefix)) {
        value = value.slice(prefix.length).trim();
        break;
      }
    }
    value = value.replace(/^[/*"']+|[/*"']+$/g, "").trim();
    return value;
  }

  /**
   * @brief Tests whether a character position falls inside a string literal for the active language.
   * @details Scans the line left-to-right while tracking escaped characters and active delimiters defined by the language spec. Runtime is O(n) in inspected prefix length. No side effects occur.
   * @param[in] line {string} Source line to inspect.
   * @param[in] pos {number} Zero-based character position.
   * @param[in] spec {LanguageSpec} Active language specification.
   * @return {boolean} `true` when the position is inside a string literal.
   */
  private inStringContext(line: string, pos: number, spec: LanguageSpec): boolean {
    let inString = false;
    let currentDelimiter: string | undefined;
    let i = 0;
    const delimiters = [...spec.stringDelimiters].sort((a, b) => b.length - a.length);
    while (i < pos) {
      if (inString) {
        if (line[i] === "\\" && i + 1 < line.length) {
          i += 2;
          continue;
        }
        if (currentDelimiter && line.slice(i).startsWith(currentDelimiter)) {
          inString = false;
          i += currentDelimiter.length;
          continue;
        }
      } else {
        if (delimiters.some((delimiter) => {
          if (!line.slice(i).startsWith(delimiter)) return false;
          inString = true;
          currentDelimiter = delimiter;
          i += delimiter.length;
          return true;
        })) {
          continue;
        }
      }
      i += 1;
    }
    return inString;
  }

  /**
   * @brief Locates the first real single-line comment marker in a line.
   * @details Scans the line while respecting active string delimiters so comment markers inside strings are ignored. Runtime is O(n) in line length. No side effects occur.
   * @param[in] line {string} Source line to inspect.
   * @param[in] spec {LanguageSpec} Active language specification.
   * @return {number | undefined} Zero-based comment index, or `undefined` when absent.
   */
  private findComment(line: string, spec: LanguageSpec): number | undefined {
    if (!spec.singleComment) return undefined;
    let inString = false;
    let currentDelimiter: string | undefined;
    const delimiters = [...spec.stringDelimiters].sort((a, b) => b.length - a.length);
    for (let i = 0; i < line.length; i += 1) {
      if (inString) {
        if (line[i] === "\\" && i + 1 < line.length) {
          i += 1;
          continue;
        }
        if (currentDelimiter && line.slice(i).startsWith(currentDelimiter)) {
          inString = false;
          i += currentDelimiter.length - 1;
        }
        continue;
      }
      if (line.slice(i).startsWith(spec.singleComment)) {
        return i;
      }
      const matched = delimiters.find((delimiter) => line.slice(i).startsWith(delimiter));
      if (matched) {
        inString = true;
        currentDelimiter = matched;
        i += matched.length - 1;
      }
    }
    return undefined;
  }

  /**
   * @brief Estimates the inclusive end line for a block-like construct.
   * @details Uses language-specific indentation, brace, or `end` heuristics to bound multi-line definitions without a full parser. Runtime is O(k) where k is the scanned lookahead window. No side effects occur.
   * @param[in] lines {string[]} Full file lines.
   * @param[in] startIndex {number} Zero-based starting line index.
   * @param[in] language {string} Canonical language identifier.
   * @param[in] firstLine {string} First source line of the construct.
   * @return {number} One-based inclusive end line.
   */
  private findBlockEnd(lines: string[], startIndex: number, language: string, firstLine: string): number {
    if (["python", "py"].includes(language)) {
      const indent = firstLine.length - firstLine.trimStart().length;
      let end = startIndex + 1;
      while (end < Math.min(lines.length, startIndex + 200)) {
        const line = (lines[end] ?? "").replace(/[\r\n]+$/, "");
        if (!line.trim()) {
          end += 1;
          continue;
        }
        const lineIndent = line.length - line.trimStart().length;
        if (lineIndent <= indent && line.trim()) break;
        end += 1;
      }
      return end;
    }

    if (["c", "cpp", "cc", "cxx", "h", "hpp", "rust", "rs", "javascript", "js", "typescript", "ts", "java", "go", "csharp", "cs", "swift", "kotlin", "kt", "php", "scala", "zig"].includes(language)) {
      let braceCount = 0;
      let foundOpen = false;
      let end = startIndex;
      while (end < Math.min(lines.length, startIndex + 300)) {
        const line = (lines[end] ?? "").replace(/[\r\n]+$/, "");
        for (const char of line) {
          if (char === "{") {
            braceCount += 1;
            foundOpen = true;
          } else if (char === "}") {
            braceCount -= 1;
          }
        }
        if (foundOpen && braceCount <= 0) return end + 1;
        end += 1;
      }
      return foundOpen ? end : startIndex + 1;
    }

    if (["ruby", "rb", "elixir", "ex", "exs", "lua"].includes(language)) {
      const indent = firstLine.length - firstLine.trimStart().length;
      let end = startIndex + 1;
      while (end < Math.min(lines.length, startIndex + 200)) {
        const line = (lines[end] ?? "").replace(/[\r\n]+$/, "");
        if ((line.trim() === "end" || line.trim().startsWith("end ")) && (line.length - line.trimStart().length) <= indent) {
          return end + 1;
        }
        end += 1;
      }
      return startIndex + 1;
    }

    if (["haskell", "hs"].includes(language)) {
      const indent = firstLine.length - firstLine.trimStart().length;
      let end = startIndex + 1;
      while (end < Math.min(lines.length, startIndex + 100)) {
        const line = (lines[end] ?? "").replace(/[\r\n]+$/, "");
        if (!line.trim()) {
          end += 1;
          continue;
        }
        const lineIndent = line.length - line.trimStart().length;
        if (lineIndent <= indent) break;
        end += 1;
      }
      return end;
    }

    return startIndex + 1;
  }
}

/**
 * @brief Formats one element location for markdown output.
 * @details Returns either a single-line `Lx` token or an inclusive line-range token `Lx-y`. Runtime is O(1). No side effects occur.
 * @param[in] element {SourceElement} Source element.
 * @return {string} Markdown location token.
 */
function mdLoc(element: SourceElement): string {
  return element.lineStart === element.lineEnd ? `L${element.lineStart}` : `L${element.lineStart}-${element.lineEnd}`;
}

/**
 * @brief Maps an element type to its compact markdown kind code.
 * @details Converts `ElementType` values into the abbreviated tokens used by reference markdown and symbol indexes. Runtime is O(1). No side effects occur.
 * @param[in] element {SourceElement} Source element.
 * @return {string} Compact kind code.
 */
function mdKind(element: SourceElement): string {
  const mapping: Record<ElementType, string> = {
    [ElementType.FUNCTION]: "fn",
    [ElementType.METHOD]: "method",
    [ElementType.CLASS]: "class",
    [ElementType.STRUCT]: "struct",
    [ElementType.ENUM]: "enum",
    [ElementType.TRAIT]: "trait",
    [ElementType.INTERFACE]: "iface",
    [ElementType.MODULE]: "mod",
    [ElementType.IMPL]: "impl",
    [ElementType.MACRO]: "macro",
    [ElementType.CONSTANT]: "const",
    [ElementType.VARIABLE]: "var",
    [ElementType.TYPE_ALIAS]: "type",
    [ElementType.IMPORT]: "unk",
    [ElementType.DECORATOR]: "dec",
    [ElementType.COMMENT_SINGLE]: "unk",
    [ElementType.COMMENT_MULTI]: "unk",
    [ElementType.COMPONENT]: "comp",
    [ElementType.PROTOCOL]: "proto",
    [ElementType.EXTENSION]: "ext",
    [ElementType.UNION]: "unk",
    [ElementType.NAMESPACE]: "ns",
    [ElementType.PROPERTY]: "prop",
    [ElementType.SIGNAL]: "signal",
    [ElementType.TYPEDEF]: "typedef",
  };
  return mapping[element.elementType] ?? "unk";
}

/**
 * @brief Extracts normalized plain text from a comment element.
 * @details Removes comment markers, drops language-specific block delimiters, joins lines with spaces, and optionally truncates the result. Runtime is O(n) in comment length. No side effects occur.
 * @param[in] commentElement {SourceElement} Comment element.
 * @param[in] maxLength {number} Optional maximum output length, where `0` disables truncation.
 * @return {string} Cleaned comment text.
 */
function extractCommentText(commentElement: SourceElement, maxLength = 0): string {
  const lines = commentElement.extract.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    let value = line.trim();
    for (const prefix of ["///", "//!", "//", "#!", "##", "#", "--", ";;"]) {
      if (value.startsWith(prefix)) {
        value = value.slice(prefix.length).trim();
        break;
      }
    }
    value = value.replace(/^[/*"']+|[/*"']+$/g, "").trim();
    if (value && !value.startsWith("=begin") && !value.startsWith("=end")) {
      cleaned.push(value);
    }
  }
  let text = cleaned.join(" ");
  if (maxLength > 0 && text.length > maxLength) {
    text = `${text.slice(0, maxLength - 3)}...`;
  }
  return text;
}

/**
 * @brief Extracts cleaned individual lines from a comment element.
 * @details Removes comment markers and delimiter-only lines while preserving line granularity for markdown rendering. Runtime is O(n) in comment length. No side effects occur.
 * @param[in] commentElement {SourceElement} Comment element.
 * @return {string[]} Cleaned comment lines.
 */
function extractCommentLines(commentElement: SourceElement): string[] {
  return commentElement.extract
    .split("\n")
    .map((line) => {
      let value = line.trim();
      for (const prefix of ["///", "//!", "//", "#!", "##", "#", "--", ";;"]) {
        if (value.startsWith(prefix)) {
          value = value.slice(prefix.length).trim();
          break;
        }
      }
      value = value.replace(/^[/*"']+|[/*"']+$/g, "").trim();
      return value;
    })
    .filter((line) => !!line && !line.startsWith("=begin") && !line.startsWith("=end"));
}

/**
 * @brief Builds lookup structures linking comments to definitions and file descriptions.
 * @details Sorts elements, associates nearby non-inline comments with following definitions, collects standalone comments, and derives a compact file description from early comment text. Runtime is O(n log n). No side effects occur.
 * @param[in] elements {SourceElement[]} Analyzed source elements.
 * @return {[Record<number, SourceElement[]>, SourceElement[], string]} Attached-comment map, standalone comments, and file description.
 */
function buildCommentMaps(elements: SourceElement[]): [Record<number, SourceElement[]>, SourceElement[], string] {
  const sorted = [...elements].sort((a, b) => a.lineStart - b.lineStart);
  const definitionTypes = new Set(Object.values(ElementType).filter((value) => ![ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR].includes(value as ElementType)) as ElementType[]);
  const definitionStarts = new Set(elements.filter((element) => definitionTypes.has(element.elementType)).map((element) => element.lineStart));
  const importStarts = new Set(elements.filter((element) => element.elementType === ElementType.IMPORT).map((element) => element.lineStart));
  const comments = sorted.filter((element) => [ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType));
  const docForDef: Record<number, SourceElement[]> = {};
  const standaloneComments: SourceElement[] = [];
  let fileDescription = "";

  for (const firstComment of comments) {
    if (firstComment.lineStart > 10) break;
    const text = extractCommentText(firstComment);
    if (text && !text.startsWith("/usr/") && !text.startsWith("usr/")) {
      fileDescription = text.length > 200 ? `${text.slice(0, 197)}...` : text;
      break;
    }
  }

  comments.forEach((comment) => {
    if (comment.name === "inline") return;
    let attached = false;
    for (let gap = 1; gap < 4; gap += 1) {
      const targetLine = comment.lineEnd + gap;
      if (definitionStarts.has(targetLine)) {
        docForDef[targetLine] ??= [];
        docForDef[targetLine].push(comment);
        attached = true;
        break;
      }
      if (importStarts.has(targetLine)) break;
    }
    if (!attached && comment !== comments[0]) {
      standaloneComments.push(comment);
    } else if (!attached && comment === comments[0] && !fileDescription) {
      standaloneComments.push(comment);
    }
  });

  return [docForDef, standaloneComments, fileDescription];
}

/**
 * @brief Merges Doxygen field values into one accumulator map.
 * @details Appends values for matching tags without deduplication so relative source order is preserved. Runtime is O(v) in appended value count. Side effect: mutates `baseFields`.
 * @param[in,out] baseFields {Record<string, string[]>} Mutable destination field map.
 * @param[in] extraFields {Record<string, string[]>} Source field map.
 * @return {Record<string, string[]>} The mutated destination map.
 */
function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]> {
  Object.entries(extraFields).forEach(([tag, values]) => {
    baseFields[tag] ??= [];
    baseFields[tag].push(...values);
  });
  return baseFields;
}

/**
 * @brief Aggregates all Doxygen fields associated with one element.
 * @details Starts with directly attached fields and then merges early body comments from the first three body lines when they parse as Doxygen. Runtime is O(c) in considered comment count. No external state is mutated.
 * @param[in] element {SourceElement} Source element.
 * @return {Record<string, string[]>} Aggregated Doxygen field map.
 */
export function collectElementDoxygenFields(element: SourceElement): Record<string, string[]> {
  const aggregate: Record<string, string[]> = {};
  if (element.doxygenFields) {
    mergeDoxygenFields(aggregate, element.doxygenFields);
  }
  for (const bodyComment of element.bodyComments) {
    const [commentLineStart, , commentText] = bodyComment;
    if (commentLineStart > element.lineStart + 3) continue;
    const parsed = parseDoxygenComment(commentText);
    if (Object.keys(parsed).length > 0) {
      mergeDoxygenFields(aggregate, parsed);
    }
  }
  return aggregate;
}

/**
 * @brief Collects the first file-level Doxygen field map from analyzed elements.
 * @details Scans non-inline comment elements in source order for an `@file` tag and returns the parsed Doxygen map from the first matching comment. Runtime is O(n). No side effects occur.
 * @param[in] elements {SourceElement[]} Analyzed source elements.
 * @return {Record<string, string[]>} Parsed file-level Doxygen field map, or an empty map when absent.
 */
export function collectFileLevelDoxygenFields(elements: SourceElement[]): Record<string, string[]> {
  const fileTagPattern = /(?<!\w)(?:@|\\)file\b/;
  const commentElements = elements
    .filter((element) => [ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType) && element.name !== "inline")
    .sort((a, b) => (a.lineStart - b.lineStart) || (a.lineEnd - b.lineEnd));
  for (const comment of commentElements) {
    const text = comment.commentSource || comment.extract;
    if (!text || !fileTagPattern.test(text)) continue;
    return parseDoxygenComment(text);
  }
  return {};
}

/**
 * @brief Normalizes one source-derived line for markdown extraction output.
 * @details Preserves the full leading whitespace prefix when the line indentation contains at least one tab and otherwise trims leading whitespace while always trimming trailing whitespace. Runtime is O(n) in line length. No external state is mutated.
 * @param[in] line {string} Source-derived line candidate.
 * @return {string} Normalized line for markdown output.
 */
function normalizeSourceLineForExtraction(line: string): string {
  const content = line.trim();
  if (!content) {
    return "";
  }

  const leading = line.slice(0, line.length - line.trimStart().length);
  if (leading.includes("\t")) {
    return `${leading}${content}`;
  }

  return content;
}

/**
 * @brief Renders analyzed source elements as the repository reference-markdown format.
 * @details Builds file metadata, imports, top-level definitions, child elements, comments, and a symbol index while incorporating Doxygen fields, optional legacy annotations, and preserved leading tabs in source-derived lines. Runtime is O(n log n) in element count. No side effects occur.
 * @param[in] elements {SourceElement[]} Enriched source elements.
 * @param[in] filePath {string} Display file path.
 * @param[in] language {string} Canonical analyzer language identifier.
 * @param[in] specName {string} Human-readable language name.
 * @param[in] totalLines {number} Total source-line count.
 * @param[in] includeLegacyAnnotations {boolean} When `true`, include non-Doxygen comment annotations.
 * @return {string} Rendered markdown document for the file.
 */
export function formatMarkdown(
  elements: SourceElement[],
  filePath: string,
  language: string,
  specName: string,
  totalLines: number,
  includeLegacyAnnotations = true,
): string {
  const out: string[] = [];
  const fileName = path.basename(filePath);
  const skipTypes = new Set([ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR]);
  const definitionCount = elements.filter((element) => !skipTypes.has(element.elementType)).length;
  const importCount = elements.filter((element) => element.elementType === ElementType.IMPORT).length;
  const [docForDef, standaloneCommentsRaw, fileDescRaw] = buildCommentMaps(elements);
  const standaloneComments = includeLegacyAnnotations ? standaloneCommentsRaw : [];
  const fileDesc = includeLegacyAnnotations ? fileDescRaw : "";
  const fileLevelDoxygenFields = collectFileLevelDoxygenFields(elements);

  const commentCount = elements.filter(
    (element) => [ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType) && element.name !== "inline",
  ).length;

  out.push(`# ${fileName} | ${specName} | ${totalLines}L | ${definitionCount} symbols | ${importCount} imports | ${commentCount} comments`);
  out.push(`> Path: \`${filePath}\``);
  if (fileDesc) out.push(`> ${fileDesc}`);
  if (Object.keys(fileLevelDoxygenFields).length > 0) {
    out.push(...formatDoxygenFieldsAsMarkdown(fileLevelDoxygenFields));
  }
  out.push("");

  const imports = elements.filter((element) => element.elementType === ElementType.IMPORT).sort((a, b) => a.lineStart - b.lineStart);
  if (imports.length > 0) {
    out.push("## Imports");
    out.push("```");
    imports.forEach((imp) => out.push(normalizeSourceLineForExtraction(imp.extract.split("\n")[0] ?? "")));
    out.push("```");
    out.push("");
  }

  const decoratorMap: Record<number, string> = {};
  elements.filter((element) => element.elementType === ElementType.DECORATOR).forEach((element) => {
    decoratorMap[element.lineStart] = normalizeSourceLineForExtraction(element.extract.split("\n")[0] ?? "");
  });

  const definitions = elements.filter((element) => !skipTypes.has(element.elementType)).sort((a, b) => a.lineStart - b.lineStart);
  const topLevel = definitions.filter((element) => element.depth === 0);
  const childrenMap = new Map<number, SourceElement[]>();
  definitions.forEach((element) => {
    if (element.depth <= 0 || !element.parentName) return;
    for (const top of topLevel) {
      if (top.name === element.parentName && top.lineStart <= element.lineStart && top.lineEnd >= element.lineEnd) {
        const children = childrenMap.get(top.lineStart) ?? [];
        children.push(element);
        childrenMap.set(top.lineStart, children);
        break;
      }
    }
  });

  const inlineTypes = new Set([ElementType.CONSTANT, ElementType.VARIABLE, ElementType.TYPE_ALIAS, ElementType.TYPEDEF, ElementType.MACRO, ElementType.PROPERTY]);

  if (topLevel.length > 0) {
    out.push("## Definitions");
    out.push("");
    for (const element of topLevel) {
      const kind = mdKind(element);
      let signature = element.signature || element.name || "";
      const location = mdLoc(element);
      const inherit = element.inherits ? ` : ${element.inherits}` : "";
      const visibility = element.visibility && !["pub", "public"].includes(element.visibility) ? ` \`${element.visibility}\`` : "";
      const decorator = decoratorMap[element.lineStart - 1] ? ` \`${decoratorMap[element.lineStart - 1]}\`` : "";
      const aggregateDoxygenFields = collectElementDoxygenFields(element);
      const doxygenMarkdown = Object.keys(aggregateDoxygenFields).length > 0 ? formatDoxygenFieldsAsMarkdown(aggregateDoxygenFields) : [];
      let docText = "";
      let docLinesList: string[] = [];
      let docLineNum = 0;
      if (doxygenMarkdown.length > 0 && aggregateDoxygenFields.brief?.length) {
        docText = aggregateDoxygenFields.brief[0]!;
        if (docText.length > 150) docText = `${docText.slice(0, 147)}...`;
      } else if (includeLegacyAnnotations && docForDef[element.lineStart]?.length) {
        docLinesList = extractCommentLines(docForDef[element.lineStart]![0]!);
        docText = docLinesList.join(" ");
        docLineNum = docForDef[element.lineStart]![0]!.lineStart;
        if (docText.length > 150) docText = `${docText.slice(0, 147)}...`;
      }

      const isInline = inlineTypes.has(element.elementType) || element.lineStart === element.lineEnd;
      if (isInline) {
        const firstLine = normalizeSourceLineForExtraction(element.extract.split("\n")[0] ?? "");
        let line = `- ${kind} \`${firstLine}\`${visibility} (L${element.lineStart})`;
        if (includeLegacyAnnotations && docText) line += ` — ${docText}`;
        out.push(line);
        if (doxygenMarkdown.length > 0) out.push(...doxygenMarkdown);
        continue;
      }

      if (element.elementType === ElementType.IMPL) {
        signature = normalizeSourceLineForExtraction(element.extract.split("\n")[0] ?? "").replace(/\s*\{$/, "");
      }
      out.push(`### ${kind} \`${signature}\`${inherit}${visibility}${decorator} (${location})`);
      if (doxygenMarkdown.length > 0) {
        out.push(...doxygenMarkdown);
      } else if (includeLegacyAnnotations && docLinesList.length > 1) {
        docLinesList.slice(0, 5).forEach((line, index) => out.push(`L${docLineNum + index}> ${line}`));
        if (docLinesList.length > 5) out.push(`L${docLineNum + 5}> ...`);
      } else if (includeLegacyAnnotations && docText && docLineNum) {
        out.push(`L${docLineNum}> ${docText}`);
      }

      const children = (childrenMap.get(element.lineStart) ?? []).sort((a, b) => a.lineStart - b.lineStart);
      if (includeLegacyAnnotations) {
        const childRanges = children.map((child) => {
          const childDocs = docForDef[child.lineStart] ?? [];
          const rangeStart = childDocs.length > 0 ? Math.min(child.lineStart, childDocs[0]!.lineStart) : child.lineStart;
          return [rangeStart, child.lineEnd] as const;
        });
        renderBodyAnnotations(out, element, "", childRanges);
      }
      if (children.length > 0) {
        children.forEach((child) => {
          const childSignature = child.signature || child.name || "";
          const childLocation = mdLoc(child);
          const childKind = mdKind(child);
          const childVisibility = child.visibility && !["pub", "public"].includes(child.visibility) ? ` \`${child.visibility}\`` : "";
          let childDoc = "";
          let childDocLine = "";
          const childAggregate = collectElementDoxygenFields(child);
          const childDoxygen = Object.keys(childAggregate).length > 0 ? formatDoxygenFieldsAsMarkdown(childAggregate) : [];
          if (childDoxygen.length === 0 && includeLegacyAnnotations) {
            const childDocs = docForDef[child.lineStart] ?? [];
            if (childDocs.length > 0) {
              const childDocText = extractCommentText(childDocs[0]!, 100);
              if (childDocText) {
                childDocLine = ` L${childDocs[0]!.lineStart}>`;
                childDoc = ` ${childDocText}`;
              }
            }
          }
          out.push(`- ${childKind} \`${childSignature}\`${childVisibility} (${childLocation})${childDocLine}${childDoc}`);
          if (childDoxygen.length > 0) {
            out.push(...childDoxygen.map((line) => `  ${line}`));
          }
          if (includeLegacyAnnotations) {
            renderBodyAnnotations(out, child, "  ");
          }
        });
      }
      out.push("");
    }
  }

  if (includeLegacyAnnotations && standaloneComments.length > 0) {
    out.push("## Comments");
    const groups: SourceElement[][] = [];
    let currentGroup: SourceElement[] = [standaloneComments[0]!];
    standaloneComments.slice(1).forEach((comment) => {
      const previous = currentGroup[currentGroup.length - 1]!;
      if (comment.lineStart <= previous.lineEnd + 2) {
        currentGroup.push(comment);
      } else {
        groups.push(currentGroup);
        currentGroup = [comment];
      }
    });
    groups.push(currentGroup);
    groups.forEach((group) => {
      if (group.length === 1) {
        const comment = group[0]!;
        const text = extractCommentText(comment, 150);
        if (text) out.push(`- L${comment.lineStart}: ${text}`);
      } else {
        const startLine = group[0]!.lineStart;
        const endLine = group[group.length - 1]!.lineEnd;
        const texts = group.map((comment) => extractCommentText(comment, 100)).filter(Boolean);
        if (texts.length > 0) out.push(`- L${startLine}-${endLine}: ${texts.join(" | ")}`);
      }
    });
    out.push("");
  }

  const indexable = elements
    .filter((element) => ![ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR].includes(element.elementType))
    .sort((a, b) => a.lineStart - b.lineStart);
  if (indexable.length > 0) {
    out.push("## Symbol Index");
    out.push("|Symbol|Kind|Vis|Lines|Sig|");
    out.push("|---|---|---|---|---|");
    indexable.forEach((element) => {
      const name = element.parentName ? `${element.parentName}.${element.name ?? "?"}` : (element.name ?? "?");
      const kind = mdKind(element);
      const visibility = element.visibility ?? "";
      const lines = element.lineStart === element.lineEnd ? `${element.lineStart}` : `${element.lineStart}-${element.lineEnd}`;
      let signature = "";
      if (
        [
          ElementType.FUNCTION,
          ElementType.METHOD,
          ElementType.CLASS,
          ElementType.STRUCT,
          ElementType.TRAIT,
          ElementType.INTERFACE,
          ElementType.IMPL,
          ElementType.ENUM,
        ].includes(element.elementType) &&
        element.signature &&
        element.signature !== element.name
      ) {
        signature = element.signature.length > 60 ? `${element.signature.slice(0, 57)}...` : element.signature;
      }
      out.push(`|\`${name}\`|${kind}|${visibility}|${lines}|${signature}|`);
    });
    out.push("");
  }

  return out.join(os.EOL);
}

/**
 * @brief Renders body comments and exit-point annotations for one element.
 * @details Merges comment and exit maps, skips excluded line ranges, and emits normalized markdown lines that summarize body-level annotations. Runtime is O(a log a) in annotation count. No side effects occur.
 * @param[in,out] out {string[]} Markdown output buffer.
 * @param[in] element {SourceElement} Source element whose body annotations should be rendered.
 * @param[in] indent {string} Prefix applied to each rendered annotation line.
 * @param[in] excludeRanges {ReadonlyArray<readonly [number, number]> | undefined} Optional line ranges to suppress.
 * @return {void} No return value.
 */
function renderBodyAnnotations(
  out: string[],
  element: SourceElement,
  indent = "",
  excludeRanges?: ReadonlyArray<readonly [number, number]>,
): void {
  const commentMap = new Map<number, [number, number, string]>();
  element.bodyComments.forEach((comment) => commentMap.set(comment[0], comment));
  const exitMap = new Map<number, string>();
  element.exitPoints.forEach(([lineNum, text]) => exitMap.set(lineNum, text));
  const allLines = [...new Set([...commentMap.keys(), ...exitMap.keys()])].sort((a, b) => a - b);
  allLines.forEach((lineNum) => {
    if (excludeRanges?.some(([start, end]) => start <= lineNum && lineNum <= end)) {
      return;
    }
    const comment = commentMap.get(lineNum);
    const exit = exitMap.get(lineNum);
    if (comment && exit) {
      const cleanedExit = exit.includes("#") ? exit.slice(0, exit.indexOf("#")).trim() : exit.includes("//") ? exit.slice(0, exit.indexOf("//")).trim() : exit;
      out.push(`${indent}L${lineNum}> \`${cleanedExit}\` — ${comment[2]}`);
    } else if (exit) {
      out.push(`${indent}L${lineNum}> \`${exit}\``);
    } else if (comment) {
      out.push(comment[0] === comment[1] ? `${indent}L${comment[0]}> ${comment[2]}` : `${indent}L${comment[0]}-${comment[1]}> ${comment[2]}`);
    }
  });
}
