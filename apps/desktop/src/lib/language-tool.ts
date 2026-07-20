/**
 * LanguageTool integration: converts LaTeX source into LanguageTool's
 * "annotated text" format (so markup is never grammar-checked) and maps
 * result offsets back to source positions.
 *
 * Works against any LanguageTool v2 HTTP endpoint — the free public API,
 * a self-hosted server, or the desktop app's local server.
 */
import { invoke } from "@tauri-apps/api/core";

// ─── Annotated text ───

export type LtAnnotationItem =
  | { text: string }
  | { markup: string; interpretAs?: string };

/** Source range of a plain-text (checkable) run. */
interface TextSegment {
  start: number;
  end: number;
}

export interface AnnotatedLatex {
  annotation: LtAnnotationItem[];
  /**
   * Validate and map a LanguageTool match to a source range.
   *
   * LanguageTool reports offsets in original-input coordinates (text and
   * markup both count at their literal length — verified against the public
   * API), and our annotation reproduces the source verbatim, so offsets map
   * 1:1. Matches that fall entirely inside markup are rejected.
   */
  toSource(
    offset: number,
    length: number,
  ): { start: number; end: number } | null;
}

/** Commands whose entire invocation (including brace groups) is markup.
 *  The value is what LanguageTool should pretend the invocation reads as. */
const OPAQUE_COMMANDS: Record<string, string> = {
  cite: "1",
  citep: "(Author, 2020)",
  citet: "Author (2020)",
  parencite: "(Author, 2020)",
  textcite: "Author (2020)",
  autocite: "(Author, 2020)",
  ref: "1",
  cref: "figure 1",
  Cref: "Figure 1",
  autoref: "Figure 1",
  eqref: "(1)",
  pageref: "1",
  label: "",
  url: "example.com",
  path: "",
  verb: "",
  input: "",
  include: "",
  includegraphics: "",
  usepackage: "",
  documentclass: "",
  bibliography: "",
  bibliographystyle: "",
  addbibresource: "",
  newcommand: "",
  renewcommand: "",
  providecommand: "",
  newenvironment: "",
  setlength: "",
  vspace: "",
  hspace: "",
  graphicspath: "",
};

/** Environments whose entire body is opaque to the grammar checker. */
const MATH_ENVIRONMENTS = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "math",
  "displaymath",
  "tikzpicture",
  "lstlisting",
  "verbatim",
  "minted",
]);

const COMMAND_RE = /^\\([a-zA-Z]+\*?)/;

function findBraceGroupEnd(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}

function findEnvEnd(source: string, name: string, from: number): number {
  const end = source.indexOf(`\\end{${name}}`, from);
  return end < 0 ? source.length : end + `\\end{${name}}`.length;
}

/** Convert LaTeX source to LanguageTool annotated text. */
export function annotateLatex(source: string): AnnotatedLatex {
  const annotation: LtAnnotationItem[] = [];
  const segments: TextSegment[] = [];
  // Pending plain-text run (batched so annotation stays small)
  let textStart = -1;

  const flushText = (upTo: number) => {
    if (textStart < 0 || textStart >= upTo) {
      textStart = -1;
      return;
    }
    annotation.push({ text: source.slice(textStart, upTo) });
    segments.push({ start: textStart, end: upTo });
    textStart = -1;
  };

  const pushMarkup = (from: number, to: number, interpretAs?: string) => {
    flushText(from);
    if (to <= from) return;
    const item: LtAnnotationItem = { markup: source.slice(from, to) };
    if (interpretAs) item.interpretAs = interpretAs;
    annotation.push(item);
  };

  // Only check the document body when the source has a preamble
  const bodyStart = (() => {
    const marker = "\\begin{document}";
    const at = source.indexOf(marker);
    return at < 0 ? 0 : at + marker.length;
  })();
  const bodyEnd = (() => {
    const at = source.indexOf("\\end{document}", bodyStart);
    return at < 0 ? source.length : at;
  })();
  if (bodyStart > 0) pushMarkup(0, bodyStart);

  let i = bodyStart;
  while (i < bodyEnd) {
    const ch = source[i];

    // Comments run to end of line
    if (ch === "%") {
      const eol = source.indexOf("\n", i);
      pushMarkup(i, eol < 0 ? bodyEnd : eol);
      i = eol < 0 ? bodyEnd : eol;
      continue;
    }

    // Math: $$...$$, $...$, \[...\], \(...\)
    if (ch === "$") {
      const isDisplay = source[i + 1] === "$";
      const open = isDisplay ? "$$" : "$";
      let close = i + open.length;
      while (close < bodyEnd) {
        const at = source.indexOf(open, close);
        if (at < 0) {
          close = bodyEnd;
          break;
        }
        if (source[at - 1] !== "\\") {
          close = at + open.length;
          break;
        }
        close = at + open.length;
      }
      pushMarkup(i, Math.min(close, bodyEnd), isDisplay ? undefined : "X");
      i = Math.min(close, bodyEnd);
      continue;
    }

    if (ch === "\\") {
      const next = source[i + 1];

      // Display/inline math delimiters \[ \] \( \)
      if (next === "[" || next === "(") {
        const closer = next === "[" ? "\\]" : "\\)";
        const at = source.indexOf(closer, i + 2);
        const end = at < 0 ? bodyEnd : at + 2;
        pushMarkup(i, end, next === "(" ? "X" : undefined);
        i = end;
        continue;
      }

      // Escaped character: \% \& \_ \# \$ \{ \} — reads as the literal char
      if (next && /[%&_#$~{}]/.test(next)) {
        pushMarkup(i, i + 2, next === "~" ? " " : next);
        i += 2;
        continue;
      }

      // Line break \\
      if (next === "\\") {
        const end = source[i + 2] === "*" ? i + 3 : i + 2;
        pushMarkup(i, end, "\n");
        i = end;
        continue;
      }

      const cmd = COMMAND_RE.exec(source.slice(i, i + 40));
      if (cmd) {
        const name = cmd[1];
        let end = i + 1 + name.length;

        // Environments: math/verbatim bodies are fully opaque; otherwise
        // only the \begin{...}[...]{...} token itself is markup
        if (name === "begin" || name === "end") {
          if (source[end] === "{") {
            const nameEnd = source.indexOf("}", end);
            const envName = source.slice(
              end + 1,
              nameEnd < 0 ? end + 1 : nameEnd,
            );
            if (name === "begin" && MATH_ENVIRONMENTS.has(envName)) {
              const envEnd = findEnvEnd(source, envName, i);
              pushMarkup(i, Math.min(envEnd, bodyEnd));
              i = Math.min(envEnd, bodyEnd);
              continue;
            }
            end = nameEnd < 0 ? end : nameEnd + 1;
          }
          // Consume trailing optional/required env arguments
          while (source[end] === "[" || source[end] === "{") {
            end =
              source[end] === "["
                ? (() => {
                    const close = source.indexOf("]", end);
                    return close < 0 ? end + 1 : close + 1;
                  })()
                : findBraceGroupEnd(source, end);
          }
          pushMarkup(i, end);
          i = end;
          continue;
        }

        // Opaque commands: consume optional + brace arguments as markup
        if (name in OPAQUE_COMMANDS) {
          while (source[end] === "[" || source[end] === "{") {
            end =
              source[end] === "["
                ? (() => {
                    const close = source.indexOf("]", end);
                    return close < 0 ? end + 1 : close + 1;
                  })()
                : findBraceGroupEnd(source, end);
          }
          pushMarkup(i, end, OPAQUE_COMMANDS[name] || undefined);
          i = end;
          continue;
        }

        // Generic command (\textbf, \section, \caption, \item, …): the token
        // and any optional [...] argument are markup; brace-group contents are
        // prose and keep being scanned (braces themselves become markup below)
        if (source[end] === "[") {
          const close = source.indexOf("]", end);
          end = close < 0 ? end + 1 : close + 1;
        }
        pushMarkup(i, end);
        i = end;
        continue;
      }

      // Lone backslash
      pushMarkup(i, i + 1);
      i += 1;
      continue;
    }

    // Bare braces around prose are markup
    if (ch === "{" || ch === "}") {
      pushMarkup(i, i + 1);
      i += 1;
      continue;
    }

    // Non-breaking space
    if (ch === "~") {
      pushMarkup(i, i + 1, " ");
      i += 1;
      continue;
    }

    // LaTeX quotes `` '' → typographic quotes
    if (ch === "`" && source[i + 1] === "`") {
      pushMarkup(i, i + 2, "“");
      i += 2;
      continue;
    }
    if (ch === "'" && source[i + 1] === "'") {
      pushMarkup(i, i + 2, "”");
      i += 2;
      continue;
    }

    if (textStart < 0) textStart = i;
    i += 1;
  }
  flushText(bodyEnd);
  if (bodyEnd < source.length) pushMarkup(bodyEnd, source.length);

  const toSource = (
    offset: number,
    length: number,
  ): { start: number; end: number } | null => {
    const end = offset + length;
    if (end <= offset || offset < 0 || end > source.length) return null;
    // Reject matches with no overlap with checkable text (inside markup)
    const overlapsText = segments.some(
      (seg) => offset < seg.end && end > seg.start,
    );
    return overlapsText ? { start: offset, end } : null;
  };

  return { annotation, toSource };
}

// ─── API client ───

export interface LtReplacement {
  value: string;
}

export interface LtApiMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: LtReplacement[];
  rule: {
    id: string;
    description?: string;
    issueType?: string;
    category?: { id?: string; name?: string };
  };
}

export interface GrammarIssue {
  id: string;
  message: string;
  shortMessage: string;
  ruleId: string;
  category: string;
  issueType: string;
  /** Source-text range in the checked file */
  start: number;
  end: number;
  /** The source text the issue points at (used to detect stale offsets) */
  excerpt: string;
  replacements: string[];
}

export const DEFAULT_LANGUAGETOOL_URL = "https://api.languagetool.org";

export async function checkLatex(options: {
  source: string;
  serverUrl: string;
  language: string;
  picky: boolean;
  signal?: AbortSignal;
}): Promise<GrammarIssue[]> {
  const { source, serverUrl, language, picky, signal } = options;
  const annotated = annotateLatex(source);

  // The request runs in Rust (languagetool_check): the WebView CSP cannot
  // allowlist a user-configurable server URL.
  const raw = await invoke<string>("languagetool_check", {
    serverUrl,
    data: JSON.stringify({ annotation: annotated.annotation }),
    language: language || "auto",
    level: picky ? "picky" : "default",
  });
  if (signal?.aborted) return [];
  const json = JSON.parse(raw) as { matches?: LtApiMatch[] };

  const issues: GrammarIssue[] = [];
  for (const match of json.matches ?? []) {
    const range = annotated.toSource(match.offset, match.length);
    if (!range) continue;
    issues.push({
      id: `${match.rule.id}-${range.start}-${range.end}`,
      message: match.message,
      shortMessage:
        match.shortMessage || match.rule.description || match.rule.id,
      ruleId: match.rule.id,
      category: match.rule.category?.name ?? match.rule.category?.id ?? "Other",
      issueType: match.rule.issueType ?? "uncategorized",
      start: range.start,
      end: range.end,
      excerpt: source.slice(range.start, range.end),
      replacements: match.replacements.slice(0, 5).map((r) => r.value),
    });
  }
  return issues;
}
