import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bulkRenameDuplicateBibliographyEntries,
  buildSmartDuplicateCleanupPrompt,
  duplicateCitationKeyError,
  filterDuplicateBibliographyGroups,
  groupDuplicateBibliographyEntries,
  keepDuplicateBibliographyEntry,
  renameDuplicateBibliographyEntry,
  suggestDuplicateCitationKey,
} from "@/lib/duplicate-bibliography";
import { buildProjectReferenceIndex } from "@/lib/project-references";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function file(
  name: string,
  type: ProjectFile["type"],
  content: string,
): ProjectFile {
  return {
    id: name,
    name,
    relativePath: name,
    absolutePath: `C:/project/${name}`,
    type,
    content,
    isDirty: false,
  };
}

function duplicateProject() {
  return [
    file("main.tex", "tex", String.raw`See \cite{same}.`),
    file("one.bib", "bib", "@article{same, title={First record}, year={2024}}"),
    file("two.bib", "bib", "@book{same, title={Second record}, year={2025}}"),
  ];
}

describe("duplicate bibliography repair", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      projectRoot: null,
      activeFileId: "main.tex",
      files: duplicateProject(),
    });
  });

  it("groups duplicate keys and suggests an available replacement", () => {
    const groups = groupDuplicateBibliographyEntries(
      buildProjectReferenceIndex(duplicateProject()).entries,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("same");
    expect(groups[0].entries).toHaveLength(2);
    expect(suggestDuplicateCitationKey("same", ["same", "same-2"])).toBe(
      "same-3",
    );
  });

  it("searches duplicate groups across citation metadata", () => {
    const groups = groupDuplicateBibliographyEntries(
      buildProjectReferenceIndex(duplicateProject()).entries,
    );
    expect(filterDuplicateBibliographyGroups(groups, "second record")).toEqual(
      groups,
    );
    expect(filterDuplicateBibliographyGroups(groups, "two.bib")).toEqual(
      groups,
    );
    expect(filterDuplicateBibliographyGroups(groups, "not present")).toEqual(
      [],
    );
  });

  it("builds a review-first AI cleanup prompt", () => {
    const groups = groupDuplicateBibliographyEntries(
      buildProjectReferenceIndex(duplicateProject()).entries,
    );
    const prompt = buildSmartDuplicateCleanupPrompt(groups);
    expect(prompt).toContain("Key: same");
    expect(prompt).toContain("one.bib");
    expect(prompt).toContain("Never invent bibliographic metadata");
    expect(prompt).toContain("Do not edit project files yet");
  });

  it("validates replacement citation keys", () => {
    expect(duplicateCitationKeyError("", "same", ["same"])).toBeTruthy();
    expect(duplicateCitationKeyError("same", "same", ["same"])).toBeTruthy();
    expect(
      duplicateCitationKeyError("already", "same", ["same", "already"]),
    ).toBeTruthy();
    expect(duplicateCitationKeyError("new key", "same", ["same"])).toBeTruthy();
    expect(duplicateCitationKeyError("same-2", "same", ["same"])).toBeNull();
  });

  it("renames only the selected bibliography entry", async () => {
    const group = groupDuplicateBibliographyEntries(
      buildProjectReferenceIndex(useDocumentStore.getState().files).entries,
    )[0];

    expect(
      await renameDuplicateBibliographyEntry(group.entries[1], "same-2", [
        "same",
      ]),
    ).toBe(true);

    const contents = Object.fromEntries(
      useDocumentStore
        .getState()
        .files.map((projectFile) => [projectFile.id, projectFile.content]),
    );
    expect(contents["one.bib"]).toContain("@article{same,");
    expect(contents["two.bib"]).toContain("@book{same-2,");
    expect(contents["main.tex"]).toBe(String.raw`See \cite{same}.`);
  });

  it("keeps the selected entry and removes the other copies", async () => {
    const group = groupDuplicateBibliographyEntries(
      buildProjectReferenceIndex(useDocumentStore.getState().files).entries,
    )[0];

    expect(await keepDuplicateBibliographyEntry(group, group.entries[0])).toBe(
      true,
    );

    const contents = Object.fromEntries(
      useDocumentStore
        .getState()
        .files.map((projectFile) => [projectFile.id, projectFile.content]),
    );
    expect(contents["one.bib"]).toContain("@article{same,");
    expect(contents["two.bib"]).toBe("");
    expect(contents["main.tex"]).toBe(String.raw`See \cite{same}.`);
  });

  it("bulk fixes conflicts by retaining first keys and renaming later copies", async () => {
    const group = groupDuplicateBibliographyEntries(
      buildProjectReferenceIndex(useDocumentStore.getState().files).entries,
    );

    expect(
      await bulkRenameDuplicateBibliographyEntries(group, ["same", "same-2"]),
    ).toBe(true);

    const contents = Object.fromEntries(
      useDocumentStore
        .getState()
        .files.map((projectFile) => [projectFile.id, projectFile.content]),
    );
    expect(contents["one.bib"]).toContain("@article{same,");
    expect(contents["two.bib"]).toContain("@book{same-3,");
    expect(contents["main.tex"]).toBe(String.raw`See \cite{same}.`);
  });
});
