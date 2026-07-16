export type TableAlignment = "l" | "c" | "r" | "p" | "m" | "b" | "X";

export interface TableColumn {
  alignment: TableAlignment;
  width?: string;
}

export interface TableModel {
  from: number;
  to: number;
  originalSource: string;
  environment: "table";
  tabularEnvironment: "tabular" | "tabularx";
  placement: string;
  width: string;
  columns: TableColumn[];
  rows: string[][];
  caption: string;
  label: string;
  booktabs: boolean;
  beforeTabular: string;
  afterTabular: string;
  unsupported: boolean;
  unsupportedReason?: string;
}

function findEnvironmentEnd(
  source: string,
  name: string,
  start: number,
): number {
  const token = new RegExp(
    `\\\\(?:begin|end)\\{${name.replace("*", "\\*")}\\}`,
    "g",
  );
  token.lastIndex = start;
  let depth = 0;
  for (let match = token.exec(source); match; match = token.exec(source)) {
    if (match[0].startsWith("\\begin")) depth += 1;
    else depth -= 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return -1;
}

function splitTopLevel(source: string, delimiter: "&" | "row"): string[] {
  const parts: string[] = [];
  let start = 0;
  let braces = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      if (delimiter === "row" && source[index + 1] === "\\" && braces === 0) {
        parts.push(source.slice(start, index));
        index += 1;
        start = index + 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (character === "{") braces += 1;
    if (character === "}") braces = Math.max(0, braces - 1);
    if (delimiter === "&" && character === "&" && braces === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

export function parseColumnSpec(specification: string): TableColumn[] {
  const columns: TableColumn[] = [];
  for (let index = 0; index < specification.length; index += 1) {
    const value = specification[index] as TableAlignment;
    if (/[lcrX]/.test(value)) columns.push({ alignment: value });
    if (/[pmb]/.test(value) && specification[index + 1] === "{") {
      const end = specification.indexOf("}", index + 2);
      if (end > index) {
        columns.push({
          alignment: value,
          width: specification.slice(index + 2, end),
        });
        index = end;
      }
    }
  }
  return columns;
}

export function findTables(source: string): TableModel[] {
  const results: TableModel[] = [];
  const starts = /\\begin\{(table|longtable)\}(?:\[([^\]]*)\])?/g;
  for (let match = starts.exec(source); match; match = starts.exec(source)) {
    const outerName = match[1];
    const to = findEnvironmentEnd(source, outerName, match.index);
    if (to < 0) continue;
    const originalSource = source.slice(match.index, to);
    const innerSource = originalSource.slice(match[0].length);
    const tabularStarts = Array.from(
      innerSource.matchAll(/\\begin\{(?:tabularx|tabular)\}/g),
    );
    const nestedTable = /\\begin\{table\}/.test(innerSource);
    const unsupportedConstruct =
      /\\(?:multirow|multicolumn)\b/.test(innerSource) ||
      nestedTable ||
      tabularStarts.length !== 1;
    const tabular =
      /\\begin\{(tabularx|tabular)\}(?:\{([^}]*)\})?\{([^}]*)\}/.exec(
        originalSource,
      );
    const tabularEnd = tabular
      ? originalSource.indexOf(
          `\\end{${tabular[1]}}`,
          (tabular.index ?? 0) + tabular[0].length,
        )
      : -1;
    const unsupported =
      outerName === "longtable" ||
      !tabular ||
      tabularEnd < 0 ||
      unsupportedConstruct;
    const body =
      tabular && tabularEnd >= 0
        ? originalSource.slice(
            (tabular.index ?? 0) + tabular[0].length,
            tabularEnd,
          )
        : "";
    const cleanBody = body
      .replace(/\\(?:toprule|midrule|bottomrule|hline)\s*/g, "")
      .trim();
    const columns = parseColumnSpec(tabular?.[3] ?? "");
    const rows = cleanBody
      ? splitTopLevel(cleanBody, "row").map((row) =>
          splitTopLevel(row.trim(), "&").map((cell) => cell.trim()),
        )
      : [];
    const beforeTabular = tabular
      ? originalSource.slice(match[0].length, tabular.index)
      : "";
    const afterStart =
      tabular && tabularEnd >= 0
        ? tabularEnd + `\\end{${tabular[1]}}`.length
        : originalSource.length - `\\end{${outerName}}`.length;
    const afterTabular = originalSource.slice(
      afterStart,
      originalSource.length - `\\end{${outerName}}`.length,
    );
    results.push({
      from: match.index,
      to,
      originalSource,
      environment: "table",
      tabularEnvironment: tabular?.[1] === "tabularx" ? "tabularx" : "tabular",
      placement: match[2] ?? "htbp",
      width: tabular?.[1] === "tabularx" ? (tabular[2] ?? "\\textwidth") : "",
      columns,
      rows,
      caption:
        /\\caption(?:\[[^\]]*\])?\{([^}]*)\}/.exec(originalSource)?.[1] ?? "",
      label: /\\label\{([^}]*)\}/.exec(originalSource)?.[1] ?? "",
      booktabs: /\\(?:toprule|midrule|bottomrule)\b/.test(originalSource),
      beforeTabular,
      afterTabular,
      unsupported,
      unsupportedReason:
        outerName === "longtable"
          ? "Long tables require source editing"
          : unsupportedConstruct
            ? "Merged, nested, or multi-row tables require source editing"
            : !tabular || tabularEnd < 0
              ? "No single supported tabular structure was found"
              : undefined,
    });
    starts.lastIndex = to;
  }
  return results;
}

function columnSource(column: TableColumn): string {
  return column.width && /[pmb]/.test(column.alignment)
    ? `${column.alignment}{${column.width}}`
    : column.alignment;
}

export function serializeTable(
  model: Omit<TableModel, "from" | "to" | "originalSource">,
): string {
  if (model.unsupported)
    throw new Error("Unsupported tables cannot be serialized");
  const columns = model.columns.map(columnSource).join("");
  const begin =
    model.tabularEnvironment === "tabularx"
      ? `\\begin{tabularx}{${model.width || "\\textwidth"}}{${columns}}`
      : `\\begin{tabular}{${columns}}`;
  const rowSource = model.rows
    .map((row, index) => {
      const suffix = index < model.rows.length - 1 ? " \\\\" : "";
      const rule =
        model.booktabs && index === 0 && model.rows.length > 1
          ? "\n\\midrule"
          : "";
      return `  ${row.join(" & ")}${suffix}${rule}`;
    })
    .join("\n");
  const top = model.booktabs ? "\n\\toprule" : "";
  const bottom = model.booktabs ? "\n\\bottomrule" : "";
  const metadata = [
    model.caption ? `  \\caption{${model.caption}}` : "",
    model.label ? `  \\label{${model.label}}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `\\begin{table}[${model.placement || "htbp"}]${model.beforeTabular}\n  \\centering\n${begin}${top}\n${rowSource}${bottom}\n\\end{${model.tabularEnvironment}}${model.afterTabular}${metadata ? `\n${metadata}` : ""}\n\\end{table}`;
}

export function createTableModel(columns = 3, rows = 3): TableModel {
  return {
    from: 0,
    to: 0,
    originalSource: "",
    environment: "table",
    tabularEnvironment: "tabular",
    placement: "htbp",
    width: "\\textwidth",
    columns: Array.from({ length: columns }, () => ({
      alignment: "l" as const,
    })),
    rows: Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) =>
        row === 0 ? `Header ${column + 1}` : "",
      ),
    ),
    caption: "",
    label: "",
    booktabs: true,
    beforeTabular: "",
    afterTabular: "",
    unsupported: false,
  };
}

export function pasteTsv(model: TableModel, value: string): TableModel {
  const rows = value
    .replace(/\r/g, "")
    .split("\n")
    .filter((row, index, all) => row.length > 0 || index < all.length - 1)
    .map((row) => row.split("\t"));
  const width = Math.max(
    model.columns.length,
    ...rows.map((row) => row.length),
  );
  return {
    ...model,
    columns: Array.from(
      { length: width },
      (_, index) => model.columns[index] ?? { alignment: "l" },
    ),
    rows: rows.map((row) =>
      Array.from({ length: width }, (_, index) => row[index] ?? ""),
    ),
  };
}
