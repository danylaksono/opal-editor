export interface FigureDraft {
  path: string;
  caption: string;
  label: string;
  placement: string;
  widthPercent: number;
  centered: boolean;
}

export interface FigureMatch extends FigureDraft {
  from: number;
  to: number;
  graphicFrom: number;
  graphicTo: number;
  source: string;
  starred: boolean;
  otherGraphicOptions: string[];
}

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

function parseGraphicOptions(options: string | undefined): {
  widthPercent: number;
  otherGraphicOptions: string[];
} {
  const parts = (options ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let widthPercent = 100;
  const otherGraphicOptions: string[] = [];
  for (const part of parts) {
    const width = part.match(
      /^width\s*=\s*([0-9]*\.?[0-9]+)\s*\\(?:textwidth|linewidth|columnwidth)$/i,
    );
    if (width) widthPercent = Math.round(Number(width[1]) * 100);
    else otherGraphicOptions.push(part);
  }
  return { widthPercent, otherGraphicOptions };
}

export function findFigures(content: string): FigureMatch[] {
  const figures: FigureMatch[] = [];
  const beginPattern = /\\begin\s*\{(figure\*?)\}(?:\[([^\]]*)\])?/g;
  for (const begin of content.matchAll(beginPattern)) {
    if (begin.index === undefined || isCommented(content, begin.index))
      continue;
    const environment = begin[1];
    const bodyFrom = begin.index + begin[0].length;
    const endPattern = new RegExp(
      `\\\\end\\s*\\{${environment.replace("*", "\\*")}\\}`,
    );
    const remainder = content.slice(bodyFrom);
    const end = endPattern.exec(remainder);
    if (!end) continue;
    const endFrom = bodyFrom + end.index;
    const to = endFrom + end[0].length;
    const source = content.slice(begin.index, to);
    const graphic = /\\includegraphics(?:\[([^\]]*)\])?\s*\{([^}]+)\}/.exec(
      source,
    );
    if (!graphic || graphic.index === undefined) continue;
    const caption = /\\caption(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(source);
    const label = /\\label\s*\{([^}]*)\}/.exec(source);
    const options = parseGraphicOptions(graphic[1]);
    figures.push({
      from: begin.index,
      to,
      graphicFrom: begin.index + graphic.index,
      graphicTo: begin.index + graphic.index + graphic[0].length,
      source,
      starred: environment.endsWith("*"),
      path: graphic[2].trim(),
      caption: caption?.[1]?.trim() ?? "",
      label: label?.[1]?.trim() ?? "",
      placement: begin[2]?.trim() ?? "htbp",
      widthPercent: options.widthPercent,
      centered: /\\centering\b/.test(source),
      otherGraphicOptions: options.otherGraphicOptions,
    });
  }
  return figures;
}

export function findFigureAt(
  content: string,
  position: number,
): FigureMatch | null {
  return (
    findFigures(content).find(
      (figure) =>
        position >= figure.graphicFrom && position <= figure.graphicTo,
    ) ?? null
  );
}

function graphicOptions(draft: FigureDraft, otherOptions: string[]): string {
  const width = `width=${Math.max(1, Math.min(200, draft.widthPercent)) / 100}\\textwidth`;
  return [width, ...otherOptions].join(",");
}

export function serializeFigure(draft: FigureDraft, starred = false): string {
  const environment = starred ? "figure*" : "figure";
  const lines = [
    `\\begin{${environment}}[${draft.placement || "htbp"}]`,
    ...(draft.centered ? ["  \\centering"] : []),
    `  \\includegraphics[${graphicOptions(draft, [])}]{${draft.path.trim()}}`,
    ...(draft.caption.trim() ? [`  \\caption{${draft.caption.trim()}}`] : []),
    ...(draft.label.trim() ? [`  \\label{${draft.label.trim()}}`] : []),
    `\\end{${environment}}`,
  ];
  return lines.join("\n");
}

/** Update recognized fields while preserving custom commands inside the figure. */
export function updateFigureSource(
  target: FigureMatch,
  draft: FigureDraft,
): string {
  const environment = target.starred ? "figure*" : "figure";
  let source = target.source.replace(
    /\\begin\s*\{figure\*?\}(?:\[[^\]]*\])?/,
    `\\begin{${environment}}[${draft.placement || "htbp"}]`,
  );
  source = source.replace(
    /\\includegraphics(?:\[[^\]]*\])?\s*\{[^}]+\}/,
    `\\includegraphics[${graphicOptions(draft, target.otherGraphicOptions)}]{${draft.path.trim()}}`,
  );

  if (draft.centered && !/\\centering\b/.test(source)) {
    source = source.replace(
      /(\\begin\s*\{figure\*?\}(?:\[[^\]]*\])?)/,
      "$1\n  \\centering",
    );
  } else if (!draft.centered) {
    source = source.replace(/^[ \t]*\\centering\s*\r?\n?/m, "");
  }

  const captionPattern = /\\caption(?:\[[^\]]*\])?\s*\{[^}]*\}/;
  if (captionPattern.test(source)) {
    source = draft.caption.trim()
      ? source.replace(captionPattern, `\\caption{${draft.caption.trim()}}`)
      : source.replace(captionPattern, "");
  } else if (draft.caption.trim()) {
    source = source.replace(
      /(\\includegraphics(?:\[[^\]]*\])?\s*\{[^}]+\})/,
      `$1\n  \\caption{${draft.caption.trim()}}`,
    );
  }

  const labelPattern = /\\label\s*\{[^}]*\}/;
  if (labelPattern.test(source)) {
    source = draft.label.trim()
      ? source.replace(labelPattern, `\\label{${draft.label.trim()}}`)
      : source.replace(labelPattern, "");
  } else if (draft.label.trim()) {
    const insertionPoint = /\\caption(?:\[[^\]]*\])?\s*\{[^}]*\}/.test(source)
      ? /(\\caption(?:\[[^\]]*\])?\s*\{[^}]*\})/
      : /(\\includegraphics(?:\[[^\]]*\])?\s*\{[^}]+\})/;
    source = source.replace(
      insertionPoint,
      `$1\n  \\label{${draft.label.trim()}}`,
    );
  }
  return source;
}
