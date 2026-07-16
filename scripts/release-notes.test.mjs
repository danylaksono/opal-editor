import assert from "node:assert/strict";
import test from "node:test";

import { extractReleaseNotes } from "./release-notes.mjs";

const changelog = `# Changelog

## [Unreleased]

### Added

- A future feature.

## [1.3.0]

### Changed

- The tagged change.

## [1.2.0]

- The older change.
`;

test("extracts the section matching the release tag", () => {
  assert.equal(
    extractReleaseNotes(changelog, "v1.3.0"),
    "### Changed\n\n- The tagged change.",
  );
});

test("falls back to Unreleased when the tag has no version section", () => {
  assert.equal(
    extractReleaseNotes(changelog, "v1.4.0-beta.1"),
    "### Added\n\n- A future feature.",
  );
});

test("falls back to Unreleased when the tagged section is empty", () => {
  assert.equal(
    extractReleaseNotes(
      "# Changelog\n\n## [Unreleased]\n\n- Ready.\n\n## [1.4.0]\n",
      "v1.4.0",
    ),
    "- Ready.",
  );
});

test("rejects a changelog without usable release notes", () => {
  assert.throws(
    () => extractReleaseNotes("# Changelog\n\n## [Unreleased]\n", "v2.0.0"),
    /No non-empty changelog section found/,
  );
});
