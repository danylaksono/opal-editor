import { replaceBibtexEntryKey } from "@/lib/bibtex";
import { applyProjectEditTransaction } from "@/lib/project-edit-transaction";
import type { ProjectReference } from "@/lib/project-references";
import { useDocumentStore } from "@/stores/document-store";

export interface DuplicateBibliographyGroup {
  key: string;
  entries: ProjectReference[];
}

export function groupDuplicateBibliographyEntries(
  entries: ProjectReference[],
): DuplicateBibliographyGroup[] {
  const grouped = new Map<string, ProjectReference[]>();
  for (const entry of entries) {
    if (!entry.isDuplicate) continue;
    grouped.set(entry.key, [...(grouped.get(entry.key) ?? []), entry]);
  }
  return Array.from(grouped, ([key, duplicates]) => ({
    key,
    entries: duplicates,
  })).sort((left, right) => left.key.localeCompare(right.key));
}

export function filterDuplicateBibliographyGroups(
  groups: DuplicateBibliographyGroup[],
  query: string,
): DuplicateBibliographyGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return groups;
  return groups.filter(
    (group) =>
      group.key.toLowerCase().includes(normalizedQuery) ||
      group.entries.some((entry) =>
        [
          entry.key,
          entry.title,
          entry.author,
          entry.year,
          entry.journal,
          entry.booktitle,
          entry.publisher,
          entry.filePath,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
  );
}

export function buildSmartDuplicateCleanupPrompt(
  groups: DuplicateBibliographyGroup[],
): string {
  const included = groups.slice(0, 200);
  const manifest = included
    .map(
      (group) =>
        `- Key: ${group.key}\n${group.entries
          .map(
            (entry, index) =>
              `  ${index + 1}. ${entry.filePath} | ${entry.type} | ${
                entry.title ?? "(no title)"
              } | ${entry.author ?? "(no author)"} | ${
                entry.year ?? "(no year)"
              }`,
          )
          .join("\n")}`,
    )
    .join("\n");
  const omitted = groups.length - included.length;

  return `Review the project's duplicate BibTeX keys and propose a safe cleanup plan.

Use the bibliography tools and inspect the relevant .bib files when metadata below is insufficient. Compare stable identifiers such as DOI, ISBN, and arXiv ID first, then title, authors, and year. For each key:
- Recommend merging only when records clearly describe the same work, keeping the most complete metadata.
- Recommend unique replacement keys when records describe different works.
- Flag incomplete, conflicting, or uncertain records for manual review.
- Never invent bibliographic metadata.

Do not edit project files yet. Present a concise proposed plan and wait for my confirmation before applying changes.

Duplicate-key manifest (${groups.length} keys):
${manifest}${
  omitted > 0
    ? `\n- ${omitted} additional keys were omitted from this summary; use the citation-checking tools to inspect them.`
    : ""
}`;
}

export function suggestDuplicateCitationKey(
  key: string,
  existingKeys: Iterable<string>,
): string {
  const existing = new Set(existingKeys);
  let suffix = 2;
  while (existing.has(`${key}-${suffix}`)) suffix += 1;
  return `${key}-${suffix}`;
}

export function duplicateCitationKeyError(
  key: string,
  originalKey: string,
  existingKeys: Iterable<string>,
): string | null {
  const candidate = key.trim();
  if (!candidate) return "Enter a citation key";
  if (candidate === originalKey) return "Choose a different citation key";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:+/-]*$/.test(candidate)) {
    return "Use letters, numbers, or . _ : + / -";
  }
  if (new Set(existingKeys).has(candidate)) {
    return "That citation key already exists";
  }
  return null;
}

export async function renameDuplicateBibliographyEntry(
  entry: ProjectReference,
  newKey: string,
  existingKeys: Iterable<string>,
): Promise<boolean> {
  if (duplicateCitationKeyError(newKey, entry.key, existingKeys)) return false;
  const file = useDocumentStore
    .getState()
    .files.find((candidate) => candidate.id === entry.fileId);
  if (
    !file?.content ||
    file.content.slice(entry.from, entry.to) !== entry.source
  )
    return false;

  const trimmedKey = newKey.trim();
  return applyProjectEditTransaction({
    id: `rename-duplicate-citation-${entry.key}-${Date.now()}`,
    label: `Rename duplicate citation key to ${trimmedKey}`,
    edits: [
      {
        fileId: entry.fileId,
        from: entry.from,
        to: entry.to,
        expected: entry.source,
        insert: replaceBibtexEntryKey(entry, trimmedKey),
      },
    ],
  });
}

export async function keepDuplicateBibliographyEntry(
  group: DuplicateBibliographyGroup,
  keep: ProjectReference,
): Promise<boolean> {
  if (
    group.entries.length < 2 ||
    group.entries.some((entry) => entry.key !== group.key) ||
    !group.entries.some((entry) => sameEntry(entry, keep))
  ) {
    return false;
  }

  const edits = group.entries
    .filter((entry) => !sameEntry(entry, keep))
    .map((entry) => ({
      fileId: entry.fileId,
      from: entry.from,
      to: entry.to,
      expected: entry.source,
      insert: "",
    }));

  return applyProjectEditTransaction({
    id: `merge-duplicate-citation-${group.key}-${Date.now()}`,
    label: `Keep one bibliography entry for ${group.key}`,
    edits,
  });
}

export async function bulkRenameDuplicateBibliographyEntries(
  groups: DuplicateBibliographyGroup[],
  existingKeys: Iterable<string>,
): Promise<boolean> {
  const reservedKeys = new Set(existingKeys);
  const files = useDocumentStore.getState().files;
  const edits = groups.flatMap((group) =>
    group.entries.slice(1).map((entry) => {
      const newKey = suggestDuplicateCitationKey(group.key, reservedKeys);
      reservedKeys.add(newKey);
      const file = files.find((candidate) => candidate.id === entry.fileId);
      if (
        !file?.content ||
        file.content.slice(entry.from, entry.to) !== entry.source
      ) {
        throw new Error("The bibliography changed before it could be updated");
      }
      return {
        fileId: entry.fileId,
        from: entry.from,
        to: entry.to,
        expected: entry.source,
        insert: replaceBibtexEntryKey(entry, newKey),
      };
    }),
  );
  if (edits.length === 0) return false;

  return applyProjectEditTransaction({
    id: `bulk-fix-duplicate-citations-${Date.now()}`,
    label: `Bulk fix ${groups.length} duplicate bibliography ${
      groups.length === 1 ? "key" : "keys"
    }`,
    edits,
  });
}

function sameEntry(left: ProjectReference, right: ProjectReference) {
  return (
    left.fileId === right.fileId &&
    left.from === right.from &&
    left.to === right.to &&
    left.source === right.source
  );
}
