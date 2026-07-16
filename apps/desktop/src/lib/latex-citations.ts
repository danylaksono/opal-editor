export const CITATION_COMMANDS = [
  "cite",
  "parencite",
  "textcite",
  "citep",
  "citet",
] as const;

export type CitationCommand = (typeof CITATION_COMMANDS)[number];
export type CitationPackage = "natbib" | "biblatex" | "unknown";

export interface CitationDraft {
  command: CitationCommand;
  keys: string[];
  prefix: string;
  locator: string;
  starred?: boolean;
}

export interface CitationMatch extends CitationDraft {
  from: number;
  to: number;
  source: string;
}

export interface CitationStyleOption {
  command: CitationCommand;
  label: string;
  description: string;
}

const COMMAND_SET = new Set<string>(CITATION_COMMANDS);

const STYLE_OPTIONS: Record<CitationCommand, CitationStyleOption> = {
  cite: {
    command: "cite",
    label: "Standard citation",
    description: "Use the document's default citation form",
  },
  parencite: {
    command: "parencite",
    label: "In parentheses",
    description: "(Author, Year)",
  },
  textcite: {
    command: "textcite",
    label: "In the sentence",
    description: "Author (Year)",
  },
  citep: {
    command: "citep",
    label: "In parentheses",
    description: "(Author, Year)",
  },
  citet: {
    command: "citet",
    label: "In the sentence",
    description: "Author (Year)",
  },
};

function isEscaped(content: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && content[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function skipWhitespace(content: string, start: number): number {
  let index = start;
  while (index < content.length && /\s/.test(content[index])) index++;
  return index;
}

function readBalanced(
  content: string,
  start: number,
  opener: "[" | "{",
): { value: string; end: number } | null {
  if (content[start] !== opener) return null;
  const closer = opener === "[" ? "]" : "}";
  let depth = 0;

  for (let index = start; index < content.length; index++) {
    const char = content[index];
    if (isEscaped(content, index)) continue;
    if (char === opener) depth++;
    if (char === closer) {
      depth--;
      if (depth === 0) {
        return {
          value: content.slice(start + 1, index),
          end: index + 1,
        };
      }
    }
  }

  return null;
}

function parseCitationAtStart(
  content: string,
  start: number,
): CitationMatch | null {
  if (content[start] !== "\\") return null;

  const commandMatch = content.slice(start + 1).match(/^([a-zA-Z]+)/);
  if (!commandMatch || !COMMAND_SET.has(commandMatch[1])) return null;

  const command = commandMatch[1] as CitationCommand;
  let index = start + 1 + command.length;
  let starred = false;
  if (content[index] === "*") {
    starred = true;
    index++;
  }

  const optionalArguments: string[] = [];
  index = skipWhitespace(content, index);
  while (content[index] === "[" && optionalArguments.length < 2) {
    const argument = readBalanced(content, index, "[");
    if (!argument) return null;
    optionalArguments.push(argument.value);
    index = skipWhitespace(content, argument.end);
  }

  const keysArgument = readBalanced(content, index, "{");
  if (!keysArgument) return null;

  const keys = keysArgument.value
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const [first = "", second = ""] = optionalArguments;
  const prefix = optionalArguments.length === 2 ? first.trim() : "";
  const locator = (optionalArguments.length === 2 ? second : first).trim();
  const to = keysArgument.end;

  return {
    command,
    keys,
    prefix,
    locator,
    starred,
    from: start,
    to,
    source: content.slice(start, to),
  };
}

/**
 * Find supported citation commands while conservatively skipping LaTeX comments.
 * The parser intentionally leaves unknown/custom citation macros untouched.
 */
export function findCitations(content: string): CitationMatch[] {
  const citations: CitationMatch[] = [];

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === "%" && !isEscaped(content, index)) {
      const newline = content.indexOf("\n", index + 1);
      if (newline === -1) break;
      index = newline;
      continue;
    }
    if (char !== "\\" || isEscaped(content, index)) continue;

    const citation = parseCitationAtStart(content, index);
    if (!citation) continue;
    citations.push(citation);
    index = citation.to - 1;
  }

  return citations;
}

export function findCitationAt(
  content: string,
  position: number,
): CitationMatch | null {
  return (
    findCitations(content).find(
      (citation) => position >= citation.from && position <= citation.to,
    ) ?? null
  );
}

export function serializeCitation(draft: CitationDraft): string {
  const prefix = draft.prefix.trim();
  const locator = draft.locator.trim();
  const keys = draft.keys
    .map((key) => key.trim())
    .filter(Boolean)
    .join(",");
  const star = draft.starred ? "*" : "";
  const optionalArguments = prefix
    ? `[${prefix}][${locator}]`
    : locator
      ? `[${locator}]`
      : "";

  return `\\${draft.command}${star}${optionalArguments}{${keys}}`;
}

export function detectCitationPackage(contents: string[]): CitationPackage {
  const source = contents.join("\n");
  if (
    /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b[^}]*\}/i.test(source) ||
    /\\addbibresource(?:\[[^\]]*\])?\{/i.test(source)
  ) {
    return "biblatex";
  }
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bnatbib\b[^}]*\}/i.test(source)) {
    return "natbib";
  }
  return "unknown";
}

export function getCitationStyleOptions(
  citationPackage: CitationPackage,
  current?: CitationCommand,
): CitationStyleOption[] {
  const commands: CitationCommand[] =
    citationPackage === "natbib"
      ? ["citep", "citet", "cite"]
      : citationPackage === "biblatex"
        ? ["parencite", "textcite", "cite"]
        : ["cite", "parencite", "textcite", "citep", "citet"];

  if (current && !commands.includes(current)) commands.unshift(current);
  return commands.map((command) => STYLE_OPTIONS[command]);
}

export function getDefaultCitationCommand(
  citationPackage: CitationPackage,
): CitationCommand {
  if (citationPackage === "natbib") return "citep";
  if (citationPackage === "biblatex") return "parencite";
  return "cite";
}
