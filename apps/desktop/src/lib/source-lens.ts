import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { findCitations } from "@/lib/latex-citations";
import { findReferences } from "@/lib/latex-cross-references";
import { findFigures } from "@/lib/latex-figures";
import { findEditableEnvironments } from "@/lib/latex-environments";
import { findTables } from "@/lib/latex-tables";
import { findPackageDeclarations } from "@/lib/feature-packages";

class LensWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly from: number,
  ) {
    super();
  }
  eq(other: LensWidget) {
    return other.label === this.label && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-lens-widget";
    button.textContent = this.label;
    button.setAttribute(
      "aria-label",
      `${this.label}. Activate to reveal source.`,
    );
    button.addEventListener("click", () => {
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    });
    return button;
  }
  ignoreEvent() {
    return false;
  }
}

interface LensRange {
  from: number;
  to: number;
  label: string;
}
function inactive(state: EditorState, from: number, to: number) {
  return !state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from,
  );
}

function lensDecorations(state: EditorState): DecorationSet {
  const source = state.doc.toString();
  const ranges: LensRange[] = [];
  const documentStart = source.indexOf("\\begin{document}");
  if (documentStart > 0) {
    const packages = findPackageDeclarations(
      source.slice(0, documentStart),
    ).map((item) => item.name);
    ranges.push({
      from: 0,
      to: documentStart,
      label: `Document setup · ${packages.length ? packages.join(", ") : "no packages"}`,
    });
  }
  for (const citation of findCitations(source))
    ranges.push({
      from: citation.from,
      to: citation.to,
      label: `Citation · ${citation.keys.join(", ")}`,
    });
  for (const reference of findReferences(source))
    ranges.push({
      from: reference.from,
      to: reference.to,
      label: `Reference · ${reference.key}`,
    });
  for (const figure of findFigures(source))
    ranges.push({
      from: figure.from,
      to: figure.to,
      label: `Figure · ${figure.caption || figure.path}`,
    });
  for (const table of findTables(source))
    if (!table.unsupported)
      ranges.push({
        from: table.from,
        to: table.to,
        label: `Table · ${table.caption || `${table.rows.length} rows`}`,
      });
  const occupied = ranges.filter((range) =>
    /^(Figure|Table)/.test(range.label),
  );
  for (const environment of findEditableEnvironments(source))
    if (
      !occupied.some(
        (range) => environment.from >= range.from && environment.to <= range.to,
      )
    )
      ranges.push({
        from: environment.from,
        to: environment.to,
        label: `${environment.name} · ${environment.body.trim().slice(0, 60) || "empty"}`,
      });
  ranges.sort((left, right) => left.from - right.from || right.to - left.to);
  const entries: Array<{ from: number; to: number; decoration: Decoration }> =
    [];
  let lastTo = -1;
  for (const range of ranges) {
    if (
      range.from < lastTo ||
      range.to <= range.from ||
      !inactive(state, range.from, range.to)
    )
      continue;
    entries.push({
      from: range.from,
      to: range.to,
      decoration: Decoration.replace({
        widget: new LensWidget(range.label, range.from),
      }),
    });
    lastTo = range.to;
  }
  for (const match of source.matchAll(
    /\\(?:part|chapter|section|subsection|subsubsection)\*?\{[^}]*\}/g,
  )) {
    if (match.index === undefined) continue;
    const to = match.index + match[0].length;
    if (!entries.some((entry) => match.index! < entry.to && to > entry.from))
      entries.push({
        from: match.index,
        to,
        decoration: Decoration.mark({ class: "cm-lens-heading" }),
      });
  }
  entries.sort((left, right) => left.from - right.from || left.to - right.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries)
    builder.add(entry.from, entry.to, entry.decoration);
  return builder.finish();
}

export const sourceLensExtension = [
  StateField.define<DecorationSet>({
    create: (state) => lensDecorations(state),
    update: (decorations, transaction) =>
      transaction.docChanged || transaction.selection
        ? lensDecorations(transaction.state)
        : decorations,
    provide: (field) => EditorView.decorations.from(field),
  }),
  EditorView.baseTheme({
    ".cm-lens-widget": {
      border: "1px solid var(--border)",
      borderRadius: "5px",
      background: "var(--muted)",
      color: "var(--muted-foreground)",
      padding: "2px 7px",
      font: "inherit",
      cursor: "pointer",
    },
    ".cm-lens-heading": {
      fontWeight: "700",
      fontSize: "1.08em",
      color: "var(--foreground)",
    },
  }),
];
