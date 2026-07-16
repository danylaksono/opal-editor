import { parseBibEntries, parseBibItems } from "@/lib/bibtex";
import { findBibEntries } from "@/lib/bibtex-entries";
import { findCitations } from "@/lib/latex-citations";
import {
  findLabelDefinitions,
  findReferences,
} from "@/lib/latex-cross-references";
import { findEditableEnvironments } from "@/lib/latex-environments";
import { findFigures } from "@/lib/latex-figures";
import { findDeclaredPackages } from "@/lib/latex-guidance";
import type {
  SemanticObject,
  SemanticObjectKind,
  SemanticProvider,
  SemanticScanContext,
  SemanticScanResult,
} from "./types";

function objectId(fileId: string, kind: string, key: string, from: number) {
  return `${fileId}:${kind}:${key}:${from}`;
}

function scanTex(context: SemanticScanContext): SemanticScanResult {
  const { fileId, content } = context;
  const objects: SemanticObject[] = [];

  for (const citation of findCitations(content)) {
    objects.push({
      id: objectId(fileId, "citation", citation.keys.join(","), citation.from),
      kind: "citation",
      fileId,
      from: citation.from,
      to: citation.to,
      label: citation.keys.join(", "),
      detail: citation.command,
      data: citation,
    });
  }
  for (const reference of findReferences(content)) {
    objects.push({
      id: objectId(fileId, "reference", reference.key, reference.from),
      kind: "reference",
      fileId,
      from: reference.from,
      to: reference.to,
      label: reference.key,
      detail: reference.command,
      data: reference,
    });
  }
  const labelDefinitions = findLabelDefinitions([
    { filePath: fileId, content },
  ]);
  for (const match of content.matchAll(/\\label\s*\{([^}]+)\}/g)) {
    const from = match.index ?? 0;
    const label = labelDefinitions.find(
      (definition) => definition.key === match[1].trim(),
    ) ?? {
      key: match[1].trim(),
      context: "label",
      filePath: fileId,
      line: 1,
    };
    objects.push({
      id: objectId(fileId, "label", label.key, from),
      kind: "label",
      fileId,
      from,
      to: from + match[0].length,
      label: label.key,
      detail: label.context,
      data: label,
    });
  }
  for (const figure of findFigures(content)) {
    objects.push({
      id: objectId(fileId, "figure", figure.label || figure.path, figure.from),
      kind: "figure",
      fileId,
      from: figure.from,
      to: figure.to,
      label: figure.caption || figure.path,
      detail: figure.label,
      data: figure,
    });
  }
  for (const environment of findEditableEnvironments(content)) {
    objects.push({
      id: objectId(fileId, "environment", environment.name, environment.from),
      kind: "environment",
      fileId,
      from: environment.from,
      to: environment.to,
      label: environment.name,
      data: environment,
    });
  }
  const bibItems = new Map(
    parseBibItems(content, fileId).map((entry) => [entry.key, entry]),
  );
  for (const match of content.matchAll(
    /\\bibitem(?:\[[^\]]*\])?\s*\{([^}]+)\}/g,
  )) {
    const from = match.index ?? 0;
    const entry = bibItems.get(match[1].trim());
    if (!entry) continue;
    objects.push({
      id: objectId(fileId, "bibliography-entry", entry.key, from),
      kind: "bibliography-entry",
      fileId,
      from,
      to: from + match[0].length,
      label: entry.title || entry.key,
      detail: entry.key,
      data: entry,
    });
  }
  const declaredPackages = new Set(findDeclaredPackages([content]));
  for (const match of content.matchAll(
    /\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g,
  ))
    for (const packageName of match[1].split(",").map((name) => name.trim()))
      if (packageName && declaredPackages.has(packageName)) {
        const from = match.index ?? 0;
        objects.push({
          id: objectId(fileId, "package", packageName, from),
          kind: "package",
          fileId,
          from,
          to: from + match[0].length,
          label: packageName,
          data: { name: packageName },
        });
      }

  const commandPattern = /\\newcommand\s*\{\\([a-zA-Z@]+)\}/g;
  for (const match of content.matchAll(commandPattern)) {
    if (match.index === undefined) continue;
    objects.push({
      id: objectId(fileId, "command", match[1], match.index),
      kind: "command",
      fileId,
      from: match.index,
      to: match.index + match[0].length,
      label: `\\${match[1]}`,
      data: { name: match[1] },
    });
  }
  return { objects, diagnostics: [] };
}

function scanBib(context: SemanticScanContext): SemanticScanResult {
  const detailed = findBibEntries(context.content);
  const metadata = new Map(
    parseBibEntries(context.content, context.fileId).map((entry) => [
      entry.key,
      entry,
    ]),
  );
  return {
    objects: detailed.map((entry) => ({
      id: objectId(context.fileId, "bibliography-entry", entry.key, entry.from),
      kind: "bibliography-entry" as const,
      fileId: context.fileId,
      from: entry.from,
      to: entry.to,
      label: metadata.get(entry.key)?.title || entry.key,
      detail: entry.key,
      data: { entry, citation: metadata.get(entry.key) },
    })),
    diagnostics: [],
  };
}

export const coreSemanticProvider: SemanticProvider = {
  id: "core-latex",
  supports: (fileName) => /\.(?:tex|ltx|bib)$/i.test(fileName),
  scan: (context) =>
    context.fileName.toLowerCase().endsWith(".bib")
      ? scanBib(context)
      : scanTex(context),
  findAt: (objects, position) =>
    objects.find(
      (object) => position >= object.from && position <= object.to,
    ) ?? null,
};

const scanCache = new WeakMap<object, SemanticScanResult>();
function cachedScan(context: SemanticScanContext): SemanticScanResult {
  const cached = scanCache.get(context);
  if (cached) return cached;
  const result = context.fileName.toLowerCase().endsWith(".bib")
    ? scanBib(context)
    : scanTex(context);
  scanCache.set(context, result);
  return result;
}

function semanticProvider(
  id: string,
  kinds: readonly SemanticObjectKind[],
): SemanticProvider {
  return {
    id,
    supports: coreSemanticProvider.supports,
    scan: (context) => {
      const result = cachedScan(context);
      return {
        objects: result.objects.filter((object) => kinds.includes(object.kind)),
        diagnostics: [],
      };
    },
    findAt: coreSemanticProvider.findAt,
  };
}

export const coreSemanticProviders: SemanticProvider[] = [
  semanticProvider("citations-and-bibliography", [
    "citation",
    "bibliography-entry",
  ]),
  semanticProvider("cross-references", ["reference", "label"]),
  semanticProvider("figures", ["figure"]),
  semanticProvider("environments", ["environment"]),
  semanticProvider("preamble-and-commands", ["package", "command"]),
  {
    id: "diagnostics",
    supports: coreSemanticProvider.supports,
    scan: (context) => ({
      objects: [],
      diagnostics: cachedScan(context).diagnostics,
    }),
  },
];
