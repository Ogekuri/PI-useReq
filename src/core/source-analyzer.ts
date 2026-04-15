import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";

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

export interface LanguageSpec {
  name: string;
  singleComment?: string;
  multiCommentStart?: string;
  multiCommentEnd?: string;
  stringDelimiters: string[];
  patterns: Array<[ElementType, RegExp]>;
}

function re(pattern: string): RegExp {
  return new RegExp(pattern);
}

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

export class SourceAnalyzer {
  specs: Record<string, LanguageSpec>;
  private static readonly EXIT_PATTERNS_RETURN = /^\s*(return\b.*|yield\b.*|raise\b.*|throw\b.*|panic!\(.*)/;
  private static readonly EXIT_PATTERNS_IMPLICIT = /^\s*(sys\.exit\(.*|os\._exit\(.*|exit\(.*|process\.exit\(.*)/;

  constructor() {
    this.specs = buildLanguageSpecs();
  }

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

  private extractSignatures(elements: SourceElement[]): void {
    const skipTypes = new Set([ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR]);
    for (const element of elements) {
      if (skipTypes.has(element.elementType)) continue;
      let signature = (element.extract.split("\n")[0] ?? "").trim();
      for (const suffix of [" {", "{", ":", ";"]) {
        if (signature.endsWith(suffix) && !signature.endsWith("::")) {
          signature = signature.slice(0, -suffix.length).trimEnd();
          break;
        }
      }
      element.signature = signature;
    }
  }

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

  private isPostfixDoxygenComment(commentText: string): boolean {
    return !!commentText && /^\s*(?:#|\/\/+|--|\/\*+|;+)!?</.test(commentText);
  }

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

function mdLoc(element: SourceElement): string {
  return element.lineStart === element.lineEnd ? `L${element.lineStart}` : `L${element.lineStart}-${element.lineEnd}`;
}

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

function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]> {
  Object.entries(extraFields).forEach(([tag, values]) => {
    baseFields[tag] ??= [];
    baseFields[tag].push(...values);
  });
  return baseFields;
}

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
    imports.forEach((imp) => out.push((imp.extract.split("\n")[0] ?? "").trim()));
    out.push("```");
    out.push("");
  }

  const decoratorMap: Record<number, string> = {};
  elements.filter((element) => element.elementType === ElementType.DECORATOR).forEach((element) => {
    decoratorMap[element.lineStart] = (element.extract.split("\n")[0] ?? "").trim();
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
        const firstLine = (element.extract.split("\n")[0] ?? "").trim();
        let line = `- ${kind} \`${firstLine}\`${visibility} (L${element.lineStart})`;
        if (includeLegacyAnnotations && docText) line += ` — ${docText}`;
        out.push(line);
        if (doxygenMarkdown.length > 0) out.push(...doxygenMarkdown);
        continue;
      }

      if (element.elementType === ElementType.IMPL) {
        signature = ((element.extract.split("\n")[0] ?? "").trim()).replace(/\s*\{$/, "");
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
