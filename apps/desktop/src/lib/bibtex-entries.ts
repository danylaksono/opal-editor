import { tidy, type Options as BibtexTidyOptions } from "bibtex-tidy";

const TIDY_OPTIONS: BibtexTidyOptions = {
  curly: true,
  numeric: true,
  stripEnclosingBraces: true,
  escape: true,
  removeEmptyFields: true,
  removeDuplicateFields: true,
  sortFields: true,
  lowercase: true,
  space: 2,
  align: false,
};

/** Reformat a single BibTeX entry's source (field order, casing, braces, indentation). */
export function tidyBibEntrySource(source: string): string {
  try {
    const { bibtex, warnings } = tidy(source, TIDY_OPTIONS);
    if (warnings.some((warning) => warning.code === "MISSING_KEY")) {
      return source;
    }
    const tidied = bibtex.trim();
    return tidied || source;
  } catch {
    return source;
  }
}

export const EDITABLE_BIB_FIELDS = [
  "title",
  "author",
  "year",
  "journal",
  "booktitle",
  "publisher",
  "doi",
  "url",
] as const;

export type EditableBibField = (typeof EDITABLE_BIB_FIELDS)[number];

export interface BibEntryDraft {
  type: string;
  key: string;
  fields: Record<EditableBibField, string>;
}

interface BibFieldRange {
  name: string;
  valueFrom: number;
  valueTo: number;
}

export interface BibEntryMatch extends BibEntryDraft {
  from: number;
  to: number;
  keyFrom: number;
  keyTo: number;
  source: string;
  fieldRanges: BibFieldRange[];
}

function findEntryEnd(
  content: string,
  start: number,
  opener: "{" | "(",
): number {
  const closer = opener === "{" ? "}" : ")";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < content.length; index++) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === opener) depth++;
    if (char === closer && --depth === 0) return index;
  }
  return -1;
}

function cleanValue(value: string): string {
  let cleaned = value.trim();
  while (
    (cleaned.startsWith("{") && cleaned.endsWith("}")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function fieldSegments(body: string, bodyOffset: number): BibFieldRange[] {
  const ranges: BibFieldRange[] = [];
  let start = 0;
  let braceDepth = 0;
  let quoted = false;
  let escaped = false;
  const push = (end: number) => {
    const segment = body.slice(start, end);
    const match = segment.match(/^\s*([a-zA-Z][\w-]*)\s*=\s*/);
    if (match) {
      const rawValue = segment.slice(match[0].length).trim();
      const leading = segment.indexOf(rawValue, match[0].length);
      ranges.push({
        name: match[1].toLowerCase(),
        valueFrom: bodyOffset + start + leading,
        valueTo: bodyOffset + start + leading + rawValue.length,
      });
    }
    start = end + 1;
  };
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted) {
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
    }
    if (char === "," && !quoted && braceDepth === 0) push(index);
  }
  push(body.length);
  return ranges;
}

export function findBibEntries(content: string): BibEntryMatch[] {
  const entries: BibEntryMatch[] = [];
  const header = /@([a-zA-Z]+)\s*([{(])/g;
  for (const match of content.matchAll(header)) {
    if (match.index === undefined) continue;
    const type = match[1].toLowerCase();
    if (["comment", "preamble", "string"].includes(type)) continue;
    const opener = match[2] as "{" | "(";
    const openAt = match.index + match[0].length - 1;
    const end = findEntryEnd(content, openAt, opener);
    if (end === -1) continue;
    const innerFrom = openAt + 1;
    const inner = content.slice(innerFrom, end);
    const comma = inner.indexOf(",");
    if (comma === -1) continue;
    const rawKey = inner.slice(0, comma);
    const key = rawKey.trim();
    if (!key) continue;
    const keyLeading = rawKey.indexOf(key);
    const bodyFrom = innerFrom + comma + 1;
    const body = content.slice(bodyFrom, end);
    const fieldRanges = fieldSegments(body, bodyFrom - match.index);
    const fields = Object.fromEntries(
      EDITABLE_BIB_FIELDS.map((name) => {
        const range = fieldRanges.find((field) => field.name === name);
        return [
          name,
          range
            ? cleanValue(
                content.slice(
                  match.index + range.valueFrom,
                  match.index + range.valueTo,
                ),
              )
            : "",
        ];
      }),
    ) as Record<EditableBibField, string>;
    entries.push({
      type,
      key,
      fields,
      from: match.index,
      to: end + 1,
      keyFrom: innerFrom + keyLeading,
      keyTo: innerFrom + keyLeading + key.length,
      source: content.slice(match.index, end + 1),
      fieldRanges,
    });
  }
  return entries;
}

export function findBibEntryAt(
  content: string,
  position: number,
): BibEntryMatch | null {
  return (
    findBibEntries(content).find(
      (entry) => position >= entry.keyFrom && position <= entry.keyTo,
    ) ?? null
  );
}

export function updateBibEntrySource(
  target: BibEntryMatch,
  draft: BibEntryDraft,
): string {
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  const header = /^@[a-zA-Z]+\s*([{(])\s*[^,]+/i.exec(target.source);
  if (header) {
    changes.push({
      from: 0,
      to: header[0].length,
      insert: `@${draft.type.trim() || target.type}${header[1]}${draft.key.trim() || target.key}`,
    });
  }

  const newFields: Array<[EditableBibField, string]> = [];
  for (const name of EDITABLE_BIB_FIELDS) {
    const value = draft.fields[name].trim();
    if (!value) continue;
    const range = target.fieldRanges.find((field) => field.name === name);
    if (range) {
      changes.push({
        from: range.valueFrom,
        to: range.valueTo,
        insert: `{${value}}`,
      });
    } else {
      newFields.push([name, value]);
    }
  }

  let source = target.source;
  for (const change of changes.sort((a, b) => b.from - a.from)) {
    source = `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`;
  }
  if (newFields.length > 0) {
    const closeAt = source.length - 1;
    const before = source.slice(0, closeAt).trimEnd();
    const separator = before.endsWith(",") ? "\n" : ",\n";
    const additions = newFields
      .map(([name, value]) => `  ${name} = {${value}}`)
      .join(",\n");
    source = `${before}${separator}${additions}\n${source[closeAt]}`;
  }
  return source;
}
