import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function extractReleaseNotes(changelog, tag) {
  const version = tag.replace(/^v/, "");
  const sections = new Map();
  const headingPattern = /^## \[([^\]]+)\](?:\s.*)?$/gm;
  const headings = [...changelog.matchAll(headingPattern)];

  for (const [index, heading] of headings.entries()) {
    const nextHeading = headings[index + 1];
    const bodyStart = heading.index + heading[0].length;
    const bodyEnd = nextHeading?.index ?? changelog.length;
    sections.set(heading[1], changelog.slice(bodyStart, bodyEnd).trim());
  }

  const notes = sections.get(version) || sections.get("Unreleased");

  if (!notes) {
    const available = [...sections.keys()].join(", ") || "none";
    throw new Error(
      `No non-empty changelog section found for [${version}] or [Unreleased]. ` +
        `Available sections: ${available}.`,
    );
  }

  return notes;
}

async function main() {
  const [tag, changelogPath = "CHANGELOG.md"] = process.argv.slice(2);

  if (!tag) {
    throw new Error(
      "Usage: node scripts/release-notes.mjs <tag> [changelog-path]",
    );
  }

  const changelog = await readFile(changelogPath, "utf8");
  process.stdout.write(`${extractReleaseNotes(changelog, tag)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
