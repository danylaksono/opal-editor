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
