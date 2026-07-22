import { invoke } from "@tauri-apps/api/core";
import type { EditorView } from "@codemirror/view";

/** Format LaTeX source via tex-fmt in the Rust backend. Indentation and
 *  environment layout only — prose is never re-wrapped. Throws with a
 *  readable message when the source cannot be formatted. */
export function formatLatexSource(source: string): Promise<string> {
  return invoke<string>("format_latex", { source });
}

/** Replace the editor document with its formatted text as a minimal change:
 *  the common prefix and suffix are left untouched, so the cursor, scroll
 *  position, and undo history survive for everything outside the edited
 *  region. Returns false when the document is already formatted. */
export function applyFormattedText(
  view: EditorView,
  formatted: string,
): boolean {
  const current = view.state.doc.toString();
  if (formatted === current) return false;

  let start = 0;
  const minLength = Math.min(current.length, formatted.length);
  while (start < minLength && current[start] === formatted[start]) start++;

  let currentEnd = current.length;
  let formattedEnd = formatted.length;
  while (
    currentEnd > start &&
    formattedEnd > start &&
    current[currentEnd - 1] === formatted[formattedEnd - 1]
  ) {
    currentEnd--;
    formattedEnd--;
  }

  view.dispatch({
    changes: {
      from: start,
      to: currentEnd,
      insert: formatted.slice(start, formattedEnd),
    },
  });
  return true;
}
