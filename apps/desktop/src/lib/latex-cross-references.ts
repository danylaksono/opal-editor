export const REFERENCE_COMMANDS = [
  "ref",
  "pageref",
  "autoref",
  "cref",
  "Cref",
  "eqref",
] as const;

export type ReferenceCommand = (typeof REFERENCE_COMMANDS)[number];
export type ReferencePackage = "cleveref" | "hyperref" | "standard";
export type LabelKind = "section" | "figure" | "table" | "equation" | "other";

export interface ReferenceDraft {
  command: ReferenceCommand;
  key: string;
  starred?: boolean;
}

export interface ReferenceMatch extends ReferenceDraft {
  from: number;
  to: number;
  source: string;
}

export interface LabelDefinition {
  key: string;
  filePath: string;
  line: number;
  context: string;
  kind: LabelKind;
}

export interface ReferenceStyleOption {
  command: ReferenceCommand;
  label: string;
  description: string;
}

const COMMAND_SET = new Set<string>(REFERENCE_COMMANDS);

const STYLE_OPTIONS: Record<ReferenceCommand, ReferenceStyleOption> = {
  ref: { command: "ref", label: "Number only", description: "e.g. 3.2" },
  pageref: {
    command: "pageref",
    label: "Page number",
    description: "e.g. 12",
  },
  autoref: {
    command: "autoref",
    label: "Automatic name",
    description: "e.g. Figure 3",
  },
  cref: {
    command: "cref",
    label: "Automatic name",
    description: "e.g. figure 3",
  },
  Cref: {
    command: "Cref",
    label: "Automatic name, capitalized",
    description: "e.g. Figure 3",
  },
  eqref: {
    command: "eqref",
    label: "Equation number",
    description: "e.g. (4)",
  },
};

function isEscaped(content: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && content[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function stripComment(line: string): string {
  for (let index = 0; index < line.length; index++) {
    if (line[index] === "%" && !isEscaped(line, index)) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseReferenceAtStart(
  content: string,
  start: number,
): ReferenceMatch | null {
  if (content[start] !== "\\" || isEscaped(content, start)) return null;
  const commandMatch = content.slice(start + 1).match(/^([a-zA-Z]+)/);
  if (!commandMatch || !COMMAND_SET.has(commandMatch[1])) return null;
  const command = commandMatch[1] as ReferenceCommand;
  let index = start + command.length + 1;
  let starred = false;
  if (content[index] === "*") {
    starred = true;
    index++;
  }
  while (index < content.length && /\s/.test(content[index])) index++;
  if (content[index] !== "{") return null;
  const close = content.indexOf("}", index + 1);
  if (close === -1) return null;
  const key = content.slice(index + 1, close).trim();
  if (!key || key.includes("{")) return null;
  const to = close + 1;
  return {
    command,
    key,
    starred,
    from: start,
    to,
    source: content.slice(start, to),
  };
}

export function findReferences(content: string): ReferenceMatch[] {
  const references: ReferenceMatch[] = [];
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === "%" && !isEscaped(content, index)) {
      const newline = content.indexOf("\n", index + 1);
      if (newline === -1) break;
      index = newline;
      continue;
    }
    if (char !== "\\" || isEscaped(content, index)) continue;
    const reference = parseReferenceAtStart(content, index);
    if (!reference) continue;
    references.push(reference);
    index = reference.to - 1;
  }
  return references;
}

export function findReferenceAt(
  content: string,
  position: number,
): ReferenceMatch | null {
  return (
    findReferences(content).find(
      (reference) => position >= reference.from && position <= reference.to,
    ) ?? null
  );
}

function inferKind(key: string, nearbySource: string): LabelKind {
  const prefix = key.split(":", 1)[0].toLowerCase();
  if (["sec", "chap", "part", "subsec"].includes(prefix)) return "section";
  if (["fig", "figure"].includes(prefix)) return "figure";
  if (["tab", "table"].includes(prefix)) return "table";
  if (["eq", "equation"].includes(prefix)) return "equation";
  if (/\\begin\{(?:equation|align|gather|multline)/.test(nearbySource)) {
    return "equation";
  }
  if (/\\begin\{figure/.test(nearbySource)) return "figure";
  if (/\\begin\{table/.test(nearbySource)) return "table";
  if (
    /\\(?:part|chapter|section|subsection|subsubsection)\b/.test(nearbySource)
  ) {
    return "section";
  }
  return "other";
}

function findContext(lines: string[], lineIndex: number, key: string): string {
  for (let index = lineIndex; index >= Math.max(0, lineIndex - 8); index--) {
    const line = stripComment(lines[index]);
    const match = line.match(
      /\\(?:part|chapter|section|subsection|subsubsection|caption)\*?(?:\[[^\]]*\])?\{([^}]*)\}/,
    );
    if (match?.[1]) {
      return match[1]
        .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, "$1")
        .replace(/[{}]/g, "")
        .trim();
    }
  }
  return key;
}

export function findLabelDefinitions(
  files: Array<{ content: string; filePath: string }>,
): LabelDefinition[] {
  const labels: LabelDefinition[] = [];
  for (const file of files) {
    const lines = file.content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = stripComment(lines[lineIndex]);
      const labelPattern = /\\label\s*\{([^}]+)\}/g;
      for (const match of line.matchAll(labelPattern)) {
        const key = match[1].trim();
        if (!key) continue;
        const nearbySource = lines
          .slice(Math.max(0, lineIndex - 8), lineIndex + 1)
          .join("\n");
        labels.push({
          key,
          filePath: file.filePath,
          line: lineIndex + 1,
          context: findContext(lines, lineIndex, key),
          kind: inferKind(key, nearbySource),
        });
      }
    }
  }
  return labels;
}

export function serializeReference(draft: ReferenceDraft): string {
  return `\\${draft.command}${draft.starred ? "*" : ""}{${draft.key.trim()}}`;
}

export function detectReferencePackage(contents: string[]): ReferencePackage {
  const source = contents.join("\n");
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bcleveref\b[^}]*\}/i.test(source)) {
    return "cleveref";
  }
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bhyperref\b[^}]*\}/i.test(source)) {
    return "hyperref";
  }
  return "standard";
}

export function getReferenceStyleOptions(
  referencePackage: ReferencePackage,
  current?: ReferenceCommand,
): ReferenceStyleOption[] {
  const commands: ReferenceCommand[] =
    referencePackage === "cleveref"
      ? ["cref", "Cref", "ref", "pageref", "eqref"]
      : referencePackage === "hyperref"
        ? ["autoref", "ref", "pageref", "eqref"]
        : ["ref", "pageref", "eqref"];
  if (current && !commands.includes(current)) commands.unshift(current);
  return commands.map((command) => STYLE_OPTIONS[command]);
}

export function getDefaultReferenceCommand(
  referencePackage: ReferencePackage,
): ReferenceCommand {
  if (referencePackage === "cleveref") return "cref";
  if (referencePackage === "hyperref") return "autoref";
  return "ref";
}
