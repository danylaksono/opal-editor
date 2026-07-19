import type { CompileFailure } from "@/lib/latex-compiler";
import type { ProjectFile } from "@/stores/document-store";

const MAX_LOG_CHARS = 4000;
const SNIPPET_RADIUS = 8;

export const EXPLAIN_ERROR_SYSTEM_PROMPT = `You are a LaTeX expert helping an academic writer who is not a LaTeX expert. Explain the compile error in plain language.

Structure your answer as exactly three short markdown sections:
**What went wrong** — one or two sentences, no jargon.
**Why it happens** — the underlying cause, briefly.
**How to fix it** — the concrete change to make, with a minimal code example if useful.

Keep the whole answer under 200 words. Refer to the user's actual code where possible. Do not restate the raw log. Do not propose rewriting unrelated parts of the document.`;

/** Extract the lines around the failing line, with line numbers. */
function sourceSnippet(content: string, line: number): string {
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - SNIPPET_RADIUS);
  const end = Math.min(lines.length, line + SNIPPET_RADIUS);
  return lines
    .slice(start, end)
    .map((text, i) => {
      const n = start + i + 1;
      return `${n === line ? ">" : " "} ${n} | ${text}`;
    })
    .join("\n");
}

export function buildExplainCompileErrorPrompt(
  failure: CompileFailure,
  files: ProjectFile[],
  rootFileName: string,
): string {
  const parts: string[] = [];

  parts.push(`A LaTeX compile with ${failure.backend} failed.`);
  parts.push(`Summary: ${failure.summary}`);
  if (failure.category) parts.push(`Category: ${failure.category}`);

  const fileName = failure.sourceFile ?? rootFileName;
  const where = failure.sourceLine
    ? `${fileName}, line ${failure.sourceLine}`
    : fileName;
  parts.push(`Location: ${where}`);

  if (failure.sourceLine) {
    const file = files.find(
      (f) => f.relativePath === fileName || f.relativePath.endsWith(fileName),
    );
    if (file?.content) {
      parts.push(
        `Source around the failing line (">" marks it):\n\`\`\`latex\n${sourceSnippet(file.content, failure.sourceLine)}\n\`\`\``,
      );
    }
  }

  const raw = failure.rawEngineOutput.trim();
  if (raw) {
    const clipped =
      raw.length > MAX_LOG_CHARS ? `${raw.slice(0, MAX_LOG_CHARS)}\n…` : raw;
    parts.push(`Engine output:\n\`\`\`\n${clipped}\n\`\`\``);
  }

  parts.push("Explain this error.");
  return parts.join("\n\n");
}
