import { describe, expect, it } from "vitest";
import {
  citeDriveTargetName,
  getExternalRefreshDecision,
  hashBibliographyContent,
  type ExternalBibliographySource,
} from "@/stores/reference-sources-store";

const original = "@article{one, title = {Original}}";
const changed = "@article{one, title = {Changed externally}}";

function source(): ExternalBibliographySource {
  const hash = hashBibliographyContent(original);
  return {
    id: "jabref:one",
    kind: "jabref",
    name: "Library",
    sourcePath: "C:\\library.bib",
    targetRelativePath: "library.bib",
    lastSourceHash: hash,
    lastTargetHash: hash,
    lastSyncedAt: 1,
    sourceModifiedMs: 1,
  };
}

describe("external bibliography refresh decisions", () => {
  it("does nothing when the external source has not changed", () => {
    expect(getExternalRefreshDecision(source(), original, original)).toBe(
      "unchanged",
    );
  });

  it("updates when only the external source changed", () => {
    expect(getExternalRefreshDecision(source(), original, changed)).toBe(
      "update",
    );
  });

  it("reports a conflict when both copies changed", () => {
    expect(
      getExternalRefreshDecision(
        source(),
        "@article{one, title = {Changed locally}}",
        changed,
      ),
    ).toBe("conflict");
  });

  it("accepts matching changes made independently in both copies", () => {
    expect(getExternalRefreshDecision(source(), changed, changed)).toBe(
      "update",
    );
  });
});

describe("CiteDrive target names", () => {
  it("uses the filename from a dynamic bibliography URL", () => {
    expect(
      citeDriveTargetName(
        "https://api.citedrive.com/bib/project/references.bib?x=token",
      ),
    ).toBe("references.bib");
  });

  it("falls back to a safe bibliography filename", () => {
    expect(citeDriveTargetName("https://app.citedrive.com/project/123")).toBe(
      "citedrive.bib",
    );
    expect(citeDriveTargetName("not a url")).toBe("citedrive.bib");
  });
});
