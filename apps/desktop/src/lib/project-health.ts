import type { ProjectFile } from "@/stores/document-store";
import type { SemanticObject } from "@/lib/semantic/types";
import { findFigures } from "@/lib/latex-figures";
import { findTables } from "@/lib/latex-tables";
import {
  FEATURE_PACKAGE_REGISTRY,
  findPackageDeclarations,
  type LatexFeature,
} from "@/lib/feature-packages";

export type HealthCategory =
  | "labels"
  | "citations"
  | "assets"
  | "figures-tables"
  | "packages";
export interface HealthIssue {
  id: string;
  category: HealthCategory;
  severity: "error" | "warning" | "info";
  message: string;
  fileId?: string;
  from?: number;
  fixFeature?: LatexFeature;
}

function duplicates(values: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values)
    seen.has(value) ? duplicate.add(value) : seen.add(value);
  return duplicate;
}

export function analyzeProjectHealth(
  files: ProjectFile[],
  objects: SemanticObject[],
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const labels = objects.filter((item) => item.kind === "label");
  const references = objects.filter((item) => item.kind === "reference");
  const entries = objects.filter((item) => item.kind === "bibliography-entry");
  const citations = objects.filter((item) => item.kind === "citation");
  const assets = objects.filter((item) => item.kind === "asset");
  const labelKeys = new Set(labels.map((item) => item.label));
  const citedKeys = new Set(
    citations.flatMap((item) => item.label.split(",").map((key) => key.trim())),
  );
  const entryKeys = new Set(entries.map((item) => item.detail ?? item.label));

  for (const key of duplicates(labels.map((item) => item.label)))
    issues.push({
      id: `duplicate-label-${key}`,
      category: "labels",
      severity: "error",
      message: `Duplicate label: ${key}`,
    });
  for (const reference of references)
    if (!labelKeys.has(reference.label))
      issues.push({
        id: `missing-label-${reference.id}`,
        category: "labels",
        severity: "error",
        message: `Reference has no matching label: ${reference.label}`,
        fileId: reference.fileId,
        from: reference.from,
      });
  for (const label of labels)
    if (!references.some((reference) => reference.label === label.label))
      issues.push({
        id: `unused-label-${label.id}`,
        category: "labels",
        severity: "info",
        message: `Label is not referenced: ${label.label}`,
        fileId: label.fileId,
        from: label.from,
      });
  for (const key of duplicates(
    entries.map((item) => item.detail ?? item.label),
  ))
    issues.push({
      id: `duplicate-entry-${key}`,
      category: "citations",
      severity: "error",
      message: `Duplicate bibliography key: ${key}`,
    });
  for (const key of citedKeys)
    if (!entryKeys.has(key))
      issues.push({
        id: `missing-citation-${key}`,
        category: "citations",
        severity: "error",
        message: `Citation key is missing: ${key}`,
      });
  for (const entry of entries)
    if (!citedKeys.has(entry.detail ?? entry.label))
      issues.push({
        id: `unused-entry-${entry.id}`,
        category: "citations",
        severity: "info",
        message: `Bibliography entry is not cited: ${entry.detail ?? entry.label}`,
        fileId: entry.fileId,
        from: entry.from,
      });

  const assetPaths = new Set(
    assets.map((asset) => asset.label.replace(/\\/g, "/")),
  );
  const usedAssets = new Set<string>();
  const allSource = files.map((file) => file.content ?? "").join("\n");
  for (const file of files.filter((item) => item.type === "tex")) {
    for (const figure of findFigures(file.content ?? "")) {
      usedAssets.add(figure.path);
      const matchesAsset =
        assetPaths.has(figure.path) ||
        Array.from(assetPaths).some(
          (path) => path.replace(/\.[^.]+$/, "") === figure.path,
        );
      if (!matchesAsset)
        issues.push({
          id: `missing-asset-${file.id}-${figure.from}`,
          category: "assets",
          severity: "error",
          message: `Figure file is missing: ${figure.path}`,
          fileId: file.id,
          from: figure.graphicFrom,
        });
      if (!figure.caption)
        issues.push({
          id: `figure-caption-${file.id}-${figure.from}`,
          category: "figures-tables",
          severity: "warning",
          message: "Figure has no caption",
          fileId: file.id,
          from: figure.from,
        });
      if (!figure.label)
        issues.push({
          id: `figure-label-${file.id}-${figure.from}`,
          category: "figures-tables",
          severity: "warning",
          message: "Figure has no label",
          fileId: file.id,
          from: figure.from,
        });
    }
    for (const table of findTables(file.content ?? "")) {
      if (!table.caption)
        issues.push({
          id: `table-caption-${file.id}-${table.from}`,
          category: "figures-tables",
          severity: "warning",
          message: "Table has no caption",
          fileId: file.id,
          from: table.from,
        });
      if (!table.label)
        issues.push({
          id: `table-label-${file.id}-${table.from}`,
          category: "figures-tables",
          severity: "warning",
          message: "Table has no label",
          fileId: file.id,
          from: table.from,
        });
    }
  }
  for (const asset of assets)
    if (
      !usedAssets.has(asset.label) &&
      !Array.from(usedAssets).some(
        (used) => asset.label.replace(/\.[^.]+$/, "") === used,
      )
    )
      issues.push({
        id: `unused-asset-${asset.id}`,
        category: "assets",
        severity: "info",
        message: `Asset is not used: ${asset.label}`,
        fileId: asset.fileId,
      });

  const declared = files.flatMap((file) =>
    findPackageDeclarations(file.content ?? ""),
  );
  const declaredNames = new Set(declared.map((item) => item.name));
  const usedFeatures: LatexFeature[] = [];
  if (/\\includegraphics\b/.test(allSource)) usedFeatures.push("figures");
  if (/\\(?:toprule|midrule|bottomrule)\b/.test(allSource))
    usedFeatures.push("professional-tables");
  if (/\\begin\{tabularx\}/.test(allSource))
    usedFeatures.push("flexible-tables");
  if (/\\begin\{(?:equation|align|gather|matrix|cases)\*?\}/.test(allSource))
    usedFeatures.push("mathematics");
  if (/\\(?:c|C)ref\{/.test(allSource)) usedFeatures.push("cross-references");
  for (const feature of usedFeatures)
    for (const requirement of FEATURE_PACKAGE_REGISTRY[feature])
      if (!declaredNames.has(requirement.name))
        issues.push({
          id: `missing-package-${requirement.name}`,
          category: "packages",
          severity: "error",
          message: `Missing package ${requirement.name}: ${requirement.reason}`,
          fixFeature: feature,
        });
  for (const name of duplicates(declared.map((item) => item.name)))
    issues.push({
      id: `duplicate-package-${name}`,
      category: "packages",
      severity: "warning",
      message: `Package is declared more than once: ${name}`,
    });
  const knownPackages = new Set(
    Object.values(FEATURE_PACKAGE_REGISTRY)
      .flat()
      .map((item) => item.name),
  );
  const requiredPackages = new Set(
    usedFeatures.flatMap((feature) =>
      FEATURE_PACKAGE_REGISTRY[feature].map((item) => item.name),
    ),
  );
  for (const declaration of declared)
    if (
      knownPackages.has(declaration.name) &&
      !requiredPackages.has(declaration.name)
    )
      issues.push({
        id: `unused-package-${declaration.name}`,
        category: "packages",
        severity: "info",
        message: `Possibly unused package: ${declaration.name}`,
        fileId: files.find((file) =>
          (file.content ?? "").includes(declaration.source),
        )?.id,
        from: declaration.from,
      });
  return issues;
}
