import { applyProjectEditTransaction } from "@/lib/project-edit-transaction";
import { useDocumentStore } from "@/stores/document-store";

export type LatexFeature =
  | "figures"
  | "tables"
  | "professional-tables"
  | "flexible-tables"
  | "mathematics"
  | "cross-references"
  | "automatic-references"
  | "author-year-citations"
  | "biblatex-citations";

export interface PackageRequirement {
  name: string;
  reason: string;
  conflicts?: string[];
}

export const FEATURE_PACKAGE_REGISTRY: Record<
  LatexFeature,
  readonly PackageRequirement[]
> = {
  figures: [{ name: "graphicx", reason: "Insert and size images" }],
  tables: [],
  "professional-tables": [
    { name: "booktabs", reason: "Use readable table rules" },
  ],
  "flexible-tables": [
    { name: "tabularx", reason: "Create width-aware table columns" },
  ],
  mathematics: [
    { name: "amsmath", reason: "Use equation structures and alignment" },
  ],
  "cross-references": [
    { name: "cleveref", reason: "Use \\cref and type-aware references" },
  ],
  "automatic-references": [
    { name: "hyperref", reason: "Use automatic reference names and links" },
  ],
  "author-year-citations": [
    { name: "natbib", reason: "Use \\citep and \\citet author-year citations" },
  ],
  "biblatex-citations": [
    { name: "biblatex", reason: "Use BibLaTeX citation commands" },
  ],
};

export function featureForPackage(
  packageName: string,
): LatexFeature | undefined {
  return (
    Object.entries(FEATURE_PACKAGE_REGISTRY) as Array<
      [LatexFeature, readonly PackageRequirement[]]
    >
  ).find(([, requirements]) =>
    requirements.some((requirement) => requirement.name === packageName),
  )?.[0];
}

export interface PackageDeclaration {
  name: string;
  options: string[];
  from: number;
  to: number;
  source: string;
}

export interface PackageChangePreview {
  requiredPackage: string;
  reason: string;
  targetRootFile: string;
  insertionAt: number;
  expectedAtInsertion: string;
  insertion: string;
  exactDiff: string;
  conflicts: string[];
}

export function findPackageDeclarations(source: string): PackageDeclaration[] {
  const declarations: PackageDeclaration[] = [];
  const pattern = /\\usepackage(?:\[([^\]]*)\])?\{([^}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    const from = match.index ?? 0;
    const options = (match[1] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    for (const name of match[2].split(",").map((value) => value.trim())) {
      if (name)
        declarations.push({
          name,
          options,
          from,
          to: from + match[0].length,
          source: match[0],
        });
    }
  }
  return declarations;
}

function rootTexFile() {
  const state = useDocumentStore.getState();
  const texFiles = state.files.filter(
    (file) => file.type === "tex" && file.content !== undefined,
  );
  return (
    texFiles.find((file) =>
      /\\documentclass(?:\[[^\]]*\])?\{/.test(file.content ?? ""),
    ) ??
    texFiles.find((file) => file.name.toLowerCase() === "main.tex") ??
    texFiles[0]
  );
}

function preambleInsertionPoint(source: string): number {
  let insertionAt = 0;
  const documentClass =
    /\\documentclass(?:\[[^\]]*\])?\{[^}]+\}[^\r\n]*(?:\r?\n)?/.exec(source);
  if (documentClass)
    insertionAt = documentClass.index + documentClass[0].length;
  for (const match of source.matchAll(
    /\\usepackage(?:\[[^\]]*\])?\{[^}]+\}[^\r\n]*(?:\r?\n)?/g,
  )) {
    insertionAt = Math.max(insertionAt, (match.index ?? 0) + match[0].length);
  }
  return insertionAt;
}

export function previewPackageRequirements(
  features: readonly LatexFeature[],
): PackageChangePreview[] {
  const file = rootTexFile();
  if (!file?.content) return [];
  const declaredNames = new Set(
    findPackageDeclarations(file.content).map((item) => item.name),
  );
  const requirements = new Map<string, PackageRequirement>();
  for (const feature of features) {
    for (const requirement of FEATURE_PACKAGE_REGISTRY[feature]) {
      if (!declaredNames.has(requirement.name))
        requirements.set(requirement.name, requirement);
    }
  }
  const insertionAt = preambleInsertionPoint(file.content);
  const expectedAtInsertion = file.content.slice(insertionAt, insertionAt + 80);
  return Array.from(requirements.values()).map((requirement) => {
    const insertion = `\\usepackage{${requirement.name}}\n`;
    return {
      requiredPackage: requirement.name,
      reason: requirement.reason,
      targetRootFile: file.id,
      insertionAt,
      expectedAtInsertion,
      insertion,
      exactDiff: `+ ${insertion.trimEnd()}`,
      conflicts: (requirement.conflicts ?? []).filter((name) =>
        declaredNames.has(name),
      ),
    };
  });
}

export async function applyPackagePreviews(
  previews: readonly PackageChangePreview[],
): Promise<boolean> {
  if (previews.length === 0) return true;
  const grouped = new Map<string, PackageChangePreview[]>();
  for (const preview of previews)
    grouped.set(preview.targetRootFile, [
      ...(grouped.get(preview.targetRootFile) ?? []),
      preview,
    ]);
  return applyProjectEditTransaction({
    id: `packages-${Date.now()}`,
    label: "Add required LaTeX packages",
    edits: Array.from(grouped.entries()).map(([fileId, values]) => ({
      fileId,
      from: values[0].insertionAt,
      to: values[0].insertionAt + values[0].expectedAtInsertion.length,
      expected: values[0].expectedAtInsertion,
      insert:
        values.map((value) => value.insertion).join("") +
        values[0].expectedAtInsertion,
    })),
  });
}

export interface PackageRequestDetail {
  previews: PackageChangePreview[];
  resolve: (confirmed: boolean) => void;
}

export function confirmPackageRequirements(
  features: readonly LatexFeature[],
): Promise<boolean> {
  const previews = previewPackageRequirements(features);
  if (previews.length === 0) return Promise.resolve(true);
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent<PackageRequestDetail>("request-package-change", {
        detail: { previews, resolve },
      }),
    ),
  );
}
