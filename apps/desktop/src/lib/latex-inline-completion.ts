import {
  acceptCompletion,
  completionStatus,
  selectedCompletion,
  snippet,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

const ONE_ARGUMENT_COMMANDS = new Set([
  // Citations and cross-references
  "autocite",
  "cite",
  "citeauthor",
  "citep",
  "citet",
  "citeyear",
  "Cref",
  "cref",
  "eqref",
  "footcite",
  "label",
  "nocite",
  "pageref",
  "parencite",
  "ref",
  "textcite",
  // Document structure
  "author",
  "bibliography",
  "bibliographystyle",
  "caption",
  "chapter",
  "date",
  "documentclass",
  "footnote",
  "include",
  "includegraphics",
  "input",
  "marginpar",
  "paragraph",
  "part",
  "section",
  "subparagraph",
  "subsection",
  "subsubsection",
  "title",
  "url",
  "usepackage",
  // Text and maths
  "bar",
  "ddot",
  "dot",
  "emph",
  "hat",
  "hspace",
  "mathbb",
  "mathbf",
  "mathcal",
  "mathit",
  "mathrm",
  "mathsf",
  "mathtt",
  "mbox",
  "operatorname",
  "overline",
  "sqrt",
  "textbf",
  "textit",
  "textrm",
  "textsc",
  "textsf",
  "textsubscript",
  "textsuperscript",
  "texttt",
  "tilde",
  "underline",
  "vec",
  "vspace",
  // Environment names
  "begin",
  "end",
]);

const TWO_ARGUMENT_COMMANDS = new Set([
  "colorbox",
  "frac",
  "href",
  "newcommand",
  "newtheorem",
  "parbox",
  "renewcommand",
  "setlength",
  "textcolor",
]);

const THREE_ARGUMENT_COMMANDS = new Set([
  "multicolumn",
  "newenvironment",
  "renewenvironment",
]);

function argumentTemplate(count: 1 | 2 | 3): string {
  return Array.from(
    { length: count },
    (_, index) => `{${"$"}{${index + 1}:}}`,
  ).join("");
}

function argumentCount(command: string): 1 | 2 | 3 | null {
  if (ONE_ARGUMENT_COMMANDS.has(command)) return 1;
  if (TWO_ARGUMENT_COMMANDS.has(command)) return 2;
  if (THREE_ARGUMENT_COMMANDS.has(command)) return 3;
  return null;
}

function hasUnescapedCommentMarker(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "%") continue;
    let backslashes = 0;
    for (
      let previous = index - 1;
      previous >= 0 && text[previous] === "\\";
      previous -= 1
    ) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) return true;
  }
  return false;
}

interface CommandMatch {
  command: string;
  from: number;
  to: number;
}

function commandBeforeCursor(view: EditorView): CommandMatch | null {
  const { state } = view;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return null;
  }

  const to = state.selection.main.head;
  const line = state.doc.lineAt(to);
  const before = state.sliceDoc(line.from, to);
  if (hasUnescapedCommentMarker(before)) return null;

  const match = /\\([A-Za-z@]+)\*?$/.exec(before);
  if (!match) return null;

  const from = line.from + match.index;
  let consecutiveBackslashes = 1;
  for (
    let previous = from - 1;
    previous >= line.from && state.sliceDoc(previous, previous + 1) === "\\";
    previous -= 1
  ) {
    consecutiveBackslashes += 1;
  }
  if (consecutiveBackslashes % 2 === 0) return null;

  return { command: match[1], from, to };
}

function expandCommand(
  view: EditorView,
  match: CommandMatch,
  completedCommand?: string,
): boolean {
  const command = completedCommand ?? match.command;
  const count = argumentCount(command);
  if (count === null) return false;

  const starred = view.state.sliceDoc(match.from, match.to).endsWith("*");
  const commandSource = `\\${command}${starred ? "*" : ""}`;
  snippet(`${commandSource}${argumentTemplate(count)}`)(
    view,
    null,
    match.from,
    match.to,
  );
  return true;
}

/**
 * Expands common bare LaTeX commands and makes Tab accept active suggestions.
 * The inserted arguments are CodeMirror snippet fields, so subsequent Tab and
 * Shift-Tab presses move through commands with multiple arguments.
 */
export function latexTabCompletion(view: EditorView): boolean {
  const match = commandBeforeCursor(view);
  if (match && expandCommand(view, match)) return true;

  if (completionStatus(view.state) === "active") {
    const completion = selectedCompletion(view.state);
    const completedCommand =
      completion?.label.match(/^\\([A-Za-z@]+)\*?$/)?.[1];
    if (
      match &&
      completedCommand &&
      expandCommand(view, match, completedCommand)
    ) {
      return true;
    }
    return acceptCompletion(view);
  }

  return false;
}
