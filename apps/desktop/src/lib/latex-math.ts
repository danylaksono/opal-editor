export type MathKind =
  | "inline"
  | "display"
  | "equation"
  | "align"
  | "gather"
  | "matrix"
  | "cases";

export interface MathNode {
  kind: MathKind;
  source: string;
  from: number;
  to: number;
  body: string;
  unsupported: boolean;
  error?: string;
}

const ENVIRONMENTS = [
  "equation",
  "align",
  "gather",
  "matrix",
  "cases",
] as const;

export function serializeMath(kind: MathKind, body: string): string {
  if (kind === "inline") return `$${body}$`;
  if (kind === "display") return `\\[\n  ${body}\n\\]`;
  if (kind === "matrix" || kind === "cases")
    return `\\[\n  \\begin{${kind}}\n    ${body}\n  \\end{${kind}}\n\\]`;
  return `\\begin{${kind}}\n  ${body}\n\\end{${kind}}`;
}

export function findMathNodes(source: string): MathNode[] {
  const nodes: MathNode[] = [];
  const environmentPattern = new RegExp(
    `\\\\begin\\{(${ENVIRONMENTS.join("|")})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
    "g",
  );
  for (const match of source.matchAll(environmentPattern)) {
    const from = match.index ?? 0;
    nodes.push({
      kind: match[1] as MathKind,
      source: match[0],
      from,
      to: from + match[0].length,
      body: match[2].trim(),
      unsupported: false,
    });
  }
  for (const match of source.matchAll(/\\\[([\s\S]*?)\\\]/g)) {
    const from = match.index ?? 0;
    nodes.push({
      kind: "display",
      source: match[0],
      from,
      to: from + match[0].length,
      body: match[1].trim(),
      unsupported: false,
    });
  }
  for (const match of source.matchAll(/(?<!\\)\$(?!\$)([^\n$]*?)(?<!\\)\$/g)) {
    const from = match.index ?? 0;
    nodes.push({
      kind: "inline",
      source: match[0],
      from,
      to: from + match[0].length,
      body: match[1],
      unsupported: false,
    });
  }
  return nodes.sort((left, right) => left.from - right.from);
}

export function delimiterDiagnostic(body: string): string | undefined {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "\\") {
      index += 1;
      continue;
    }
    if (pairs[body[index]]) stack.push(pairs[body[index]]);
    else if (/^[)\]}]$/.test(body[index]) && stack.pop() !== body[index])
      return `Unexpected ${body[index]}`;
  }
  return stack.length ? `Missing ${stack.reverse().join(" ")}` : undefined;
}
