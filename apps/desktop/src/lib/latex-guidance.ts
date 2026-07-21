export interface PackageRequirement {
  packageName: string;
  from: number;
  to: number;
  feature: string;
}

function isEscaped(content: string, index: number): boolean {
  let slashes = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && content[cursor] === "\\";
    cursor--
  ) {
    slashes++;
  }
  return slashes % 2 === 1;
}

function isCommented(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf("\n", index - 1) + 1;
  for (let cursor = lineStart; cursor < index; cursor++) {
    if (content[cursor] === "%" && !isEscaped(content, cursor)) return true;
  }
  return false;
}

export function findDeclaredPackages(contents: string[]): Set<string> {
  const packages = new Set<string>();
  const source = contents.join("\n");
  const pattern = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;
  for (const match of source.matchAll(pattern)) {
    for (const packageName of match[1].split(",")) {
      const normalized = packageName.trim().toLowerCase();
      if (normalized) packages.add(normalized);
    }
  }
  return packages;
}

export function findMissingPackageRequirements(
  content: string,
  declaredPackages: Set<string>,
): PackageRequirement[] {
  const requirements: PackageRequirement[] = [];
  const rules: Array<{
    packageName: string;
    feature: string;
    pattern: RegExp;
    alternatives?: string[];
  }> = [
    {
      packageName: "graphicx",
      feature: "Figures and \\includegraphics",
      pattern: /\\includegraphics\b/g,
    },
    {
      packageName: "amsmath",
      feature: "Aligned and advanced equations",
      pattern: /\\begin\s*\{(?:align\*?|gather\*?|multline\*?)\}/g,
    },
    {
      packageName: "hyperref",
      feature: "Automatic cross-reference names",
      pattern: /\\autoref\b/g,
    },
    {
      packageName: "cleveref",
      feature: "Clever cross-references",
      pattern: /\\(?:cref|Cref)\b/g,
    },
    {
      packageName: "natbib",
      feature: "Author-year citation commands",
      pattern: /\\(?:citep|citet)\b/g,
    },
    {
      packageName: "biblatex",
      feature: "BibLaTeX citation commands",
      pattern: /\\(?:parencite|textcite)\b/g,
    },
    {
      packageName: "booktabs",
      feature: "Professional table rules",
      pattern: /\\(?:toprule|midrule|bottomrule)\b/g,
    },
  ];

  for (const rule of rules) {
    if (
      declaredPackages.has(rule.packageName) ||
      rule.alternatives?.some((name) => declaredPackages.has(name))
    ) {
      continue;
    }
    for (const match of content.matchAll(rule.pattern)) {
      if (match.index === undefined || isCommented(content, match.index))
        continue;
      requirements.push({
        packageName: rule.packageName,
        feature: rule.feature,
        from: match.index,
        to: match.index + match[0].length,
      });
    }
  }
  return requirements;
}

export function insertUsePackage(content: string, packageName: string): string {
  const declared = findDeclaredPackages([content]);
  if (declared.has(packageName.toLowerCase())) return content;
  const usePackages = Array.from(
    content.matchAll(/^[ \t]*\\usepackage[^\n]*(?:\n|$)/gm),
  );
  const documentClass = /^[ \t]*\\documentclass[^\n]*(?:\n|$)/m.exec(content);
  const insertion = usePackages[usePackages.length - 1] ?? documentClass;
  if (!insertion || insertion.index === undefined) {
    return `\\usepackage{${packageName}}\n${content}`;
  }
  const at = insertion.index + insertion[0].length;
  return `${content.slice(0, at)}\\usepackage{${packageName}}\n${content.slice(at)}`;
}

export function friendlyLatexDiagnostic(message: string): string {
  if (/unexpected end|end of input|unterminated/i.test(message)) {
    return "Something is not closed. Check for a missing }, ], or \\end{...}.";
  }
  if (/expected.*\}|missing.*\}/i.test(message)) {
    return "A command argument is not closed. Add the matching } brace.";
  }
  if (/unexpected.*\}|extra.*\}/i.test(message)) {
    return "There is an extra } brace here, or an earlier opening brace is missing.";
  }
  return message;
}

/**
 * A single, actionable "what to do" sentence for a failed compile, derived by
 * scanning the raw engine output for common beginner mistakes.
 *
 * This is distinct from `friendlyCompileError` (which formats a full message
 * with technical details for the legacy string path). The structured Rust
 * backend returns a `CompileFailure` whose raw first-`!` line is often cryptic
 * — e.g. a table row missing its trailing `\\` surfaces only as
 * "Misplaced \noalign" — so the UI shows this suggestion in the
 * "Suggested action" slot regardless of the coarse `category`.
 *
 * Rules are ordered most-specific first; the first match wins. `category` is a
 * fallback signal when the raw text doesn't match a known pattern.
 */
export function suggestCompileFix(rawOutput: string, category?: string): string {
  const rules: Array<[RegExp, string]> = [
    [
      /missing \$ inserted/i,
      "Some math notation is outside math mode. Wrap inline math in $…$ or use an equation environment.",
    ],
    [
      /misplaced \\noalign|extra alignment tab|misplaced alignment tab character/i,
      "A row in a table/array is missing its trailing \\\\ line break, or has an extra & column separator. Check the row just above the reported line too — LaTeX often flags this a line or two late.",
    ],
    [
      /there's no line here to end|no line here to end/i,
      "A line break (\\\\) appears where LaTeX isn't building a line — e.g. an extra \\\\ after the last table row, or a \\\\ on a blank line. Remove it.",
    ],
    [
      /(\\begin\{[^}]*\}) ended by (\\end\{[^}]*\})|\\begin\{.*\} on input line .* ended by/i,
      "An environment isn't closed properly. Make sure every \\begin{…} has a matching \\end{…} with the same name, correctly nested.",
    ],
    [
      /environment .* undefined/i,
      "LaTeX doesn't recognize an environment. Check its spelling, or add the package that defines it.",
    ],
    [
      /undefined control sequence/i,
      "LaTeX doesn't recognize a command. Check its spelling, or add the package that provides it.",
    ],
    [
      /file [`']?([^`'\n]+)[`']? not found|cannot find|no file /i,
      "LaTeX can't find a referenced file (an image or an \\input/\\include). Check its name and path in the project.",
    ],
    [
      /runaway argument|paragraph ended before/i,
      "A command's argument runs on further than expected — usually a missing closing brace }. Look for an unbalanced { near the reported line.",
    ],
    [
      /missing (\{|\}|\\right|\\endgroup)/i,
      "A brace or delimiter isn't balanced. Add the matching } (or \\right for a \\left).",
    ],
    [
      /double superscript|double subscript/i,
      "Two ^ or two _ in a row in math. Group exponents/indices with braces, e.g. x^{a+b}.",
    ],
  ];

  const match = rules.find(([pattern]) => pattern.test(rawOutput));
  if (match) return match[1];

  // Category-based fallbacks when the raw text doesn't match a known pattern.
  switch (category) {
    case "missing-file":
      return "Check the file path and spelling.";
    case "undefined-command":
      return "Check the command spelling or required package.";
    case "busy":
      return "The compiler was busy. Wait a moment and retry.";
    default:
      return "Open the first reported location and correct the source, then retry.";
  }
}

export function friendlyCompileError(error: string): string {
  const normalized = error.trim();
  const rules: Array<[RegExp, string]> = [
    [
      /undefined control sequence/i,
      "LaTeX does not recognize a command. Check its spelling or add the package that provides it.",
    ],
    [
      /missing \$ inserted/i,
      "Some math notation is outside math mode. Wrap inline math in $...$ or use an equation environment.",
    ],
    [
      /file [`']?([^`'\n]+)[`']? not found/i,
      "LaTeX cannot find a referenced file. Check its name and path in the project.",
    ],
    [
      /runaway argument/i,
      "A command argument continues farther than expected. Look for a missing closing brace } nearby.",
    ],
    [
      /there's no line here to end|no line here to end/i,
      "A line break command (\\\\) appears where LaTeX is not currently building a line.",
    ],
    [
      /environment .* undefined/i,
      "LaTeX does not recognize an environment. Check its spelling or add the package that defines it.",
    ],
  ];
  const guidance = rules.find(([pattern]) => pattern.test(normalized))?.[1];
  return guidance
    ? `${guidance}\n\nTechnical details:\n${normalized}`
    : normalized;
}
