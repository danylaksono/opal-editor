export const EDITABLE_ENVIRONMENTS = [
  "itemize",
  "enumerate",
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "quote",
  "quotation",
  "abstract",
  "theorem",
  "lemma",
  "proposition",
  "definition",
] as const;

export type EditableEnvironment = (typeof EDITABLE_ENVIRONMENTS)[number];

export interface EnvironmentDraft {
  name: EditableEnvironment;
  option: string;
  body: string;
}

export interface EnvironmentMatch extends EnvironmentDraft {
  from: number;
  to: number;
  beginFrom: number;
  beginTo: number;
  source: string;
}

const ENVIRONMENT_SET = new Set<string>(EDITABLE_ENVIRONMENTS);

function isEscaped(content: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && content[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function isCommented(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf("\n", index - 1) + 1;
  for (let cursor = lineStart; cursor < index; cursor++) {
    if (content[cursor] === "%" && !isEscaped(content, cursor)) return true;
  }
  return false;
}

interface EnvironmentToken {
  kind: "begin" | "end";
  name: string;
  option: string;
  from: number;
  to: number;
  source: string;
}

function environmentTokens(content: string): EnvironmentToken[] {
  const pattern = /\\(begin|end)\s*\{([^}]+)\}(?:\[([^\]]*)\])?/g;
  return Array.from(content.matchAll(pattern))
    .filter(
      (match) =>
        match.index !== undefined && !isCommented(content, match.index),
    )
    .map((match) => ({
      kind: match[1] as "begin" | "end",
      name: match[2],
      option: match[3]?.trim() ?? "",
      from: match.index!,
      to: match.index! + match[0].length,
      source: match[0],
    }));
}

export function findEditableEnvironments(content: string): EnvironmentMatch[] {
  const matches: EnvironmentMatch[] = [];
  const stack: EnvironmentToken[] = [];
  for (const token of environmentTokens(content)) {
    if (token.kind === "begin") {
      stack.push(token);
      continue;
    }
    let startIndex = -1;
    for (let index = stack.length - 1; index >= 0; index--) {
      if (stack[index].name === token.name) {
        startIndex = index;
        break;
      }
    }
    if (startIndex === -1) continue;
    const [start] = stack.splice(startIndex, 1);
    if (!ENVIRONMENT_SET.has(start.name)) continue;
    matches.push({
      name: start.name as EditableEnvironment,
      option: start.option,
      body: content.slice(start.to, token.from),
      from: start.from,
      to: token.to,
      beginFrom: start.from,
      beginTo: start.to,
      source: content.slice(start.from, token.to),
    });
  }
  return matches.sort((a, b) => a.from - b.from);
}

export function findEditableEnvironmentAt(
  content: string,
  position: number,
): EnvironmentMatch | null {
  return (
    findEditableEnvironments(content).find(
      (environment) =>
        position >= environment.beginFrom && position <= environment.beginTo,
    ) ?? null
  );
}

export function serializeEnvironment(draft: EnvironmentDraft): string {
  const option = draft.option.trim() ? `[${draft.option.trim()}]` : "";
  const body = draft.body.replace(/^\s*\n?/, "").replace(/\s*$/, "");
  return `\\begin{${draft.name}}${option}\n${body}\n\\end{${draft.name}}`;
}

export function updateEnvironmentSource(
  target: EnvironmentMatch,
  draft: Pick<EnvironmentDraft, "name" | "option">,
): string {
  const option = draft.option.trim() ? `[${draft.option.trim()}]` : "";
  let source = target.source.replace(
    /^\\begin\s*\{[^}]+\}(?:\[[^\]]*\])?/,
    `\\begin{${draft.name}}${option}`,
  );
  const endPattern = new RegExp(
    `\\\\end\\s*\\{${target.name.replace("*", "\\*")}\\}\\s*$`,
  );
  source = source.replace(endPattern, `\\end{${draft.name}}`);
  return source;
}

export function prepareEnvironmentBody(
  name: EditableEnvironment,
  selection: string,
): string {
  const trimmed = selection.trim();
  if (name === "itemize" || name === "enumerate") {
    const lines = (trimmed || "First item")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line.startsWith("\\item") ? line : `\\item ${line}`));
    return lines.map((line) => `  ${line}`).join("\n");
  }
  if (["equation", "equation*", "align", "align*", "gather"].includes(name)) {
    return `  ${trimmed || (name.startsWith("align") ? "a &= b" : "E = mc^2")}`;
  }
  return `  ${trimmed || "Your text here."}`;
}

export function environmentGroup(
  name: EditableEnvironment,
): EditableEnvironment[] {
  if (["itemize", "enumerate"].includes(name)) return ["itemize", "enumerate"];
  if (["equation", "equation*", "align", "align*", "gather"].includes(name)) {
    return ["equation", "equation*", "align", "align*", "gather"];
  }
  if (["quote", "quotation", "abstract"].includes(name)) {
    return ["quote", "quotation", "abstract"];
  }
  return ["theorem", "lemma", "proposition", "definition"];
}
