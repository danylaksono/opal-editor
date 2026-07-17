import { nextSnippetField } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { latexTabCompletion } from "@/lib/latex-inline-completion";

const views: EditorView[] = [];

function editor(source: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor: source.length },
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

describe("LaTeX inline Tab completion", () => {
  it("adds braces to a citation and places the cursor inside", () => {
    const view = editor(String.raw`See \cite`);

    expect(latexTabCompletion(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(String.raw`See \cite{}`);
    expect(view.state.selection.main.head).toBe(String.raw`See \cite{`.length);
  });

  it("supports common formatting, reference, and starred commands", () => {
    for (const [source, expected] of [
      [String.raw`\textbf`, String.raw`\textbf{}`],
      [String.raw`\ref`, String.raw`\ref{}`],
      [String.raw`\section*`, String.raw`\section*{}`],
    ]) {
      const view = editor(source);
      expect(latexTabCompletion(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(expected);
    }
  });

  it("creates navigable fields for commands with multiple arguments", () => {
    const view = editor(String.raw`\frac`);

    expect(latexTabCompletion(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(String.raw`\frac{}{}`);
    expect(view.state.selection.main.head).toBe(String.raw`\frac{`.length);

    expect(nextSnippetField(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(String.raw`\frac{}{`.length);
  });

  it("leaves no-argument and unknown commands to normal Tab handling", () => {
    expect(latexTabCompletion(editor(String.raw`\alpha`))).toBe(false);
    expect(latexTabCompletion(editor(String.raw`\item`))).toBe(false);
    expect(latexTabCompletion(editor(String.raw`\projectmacro`))).toBe(false);
  });

  it("does not expand commands inside comments or escaped command text", () => {
    expect(latexTabCompletion(editor(String.raw`% \cite`))).toBe(false);
    expect(latexTabCompletion(editor(String.raw`\\cite`))).toBe(false);
  });
});
