// The Learn LaTeX guide is a linear, back/next track. Each step teaches one
// construct and, where possible, can insert it for the learner — but the
// learner is always free to type it themselves and simply advance. Detection is
// only a friendly confirmation ("nice, that's in your document now"); it never
// gates progress. Edit this array to retune the track for a class.

export interface TutorialDetectContext {
  /** Concatenated content of every .tex file in the project. */
  content: string;
  /** True when the semantic index has seen an object of the given kind. */
  hasKind: (kind: string) => boolean;
  /** > 0 once the document has been compiled at least once. */
  pdfRevision: number;
}

export type TutorialAction =
  /** Read-only orientation step: advance with Next only. */
  | { kind: "read" }
  /** Ask the workspace to compile the document. */
  | { kind: "compile" }
  /** Dispatch an existing editor-action id (opens the matching visual tool). */
  | { kind: "action"; id: string }
  /** Insert raw LaTeX at the cursor. */
  | { kind: "snippet"; text: string }
  /**
   * Add \usepackage{pkg} to the preamble (if missing), then insert the
   * optional text at the cursor — so the learner sees the preamble change.
   */
  | { kind: "package"; pkg: string; text?: string };

export type TutorialGroup = "Orient" | "Structure" | "Content" | "Finish";

export interface TutorialStep {
  id: string;
  group: TutorialGroup;
  title: string;
  /** One-line "why this matters". */
  concept: string;
  /** LaTeX shown to the learner, if the step has a concrete snippet. */
  syntax?: string;
  action: TutorialAction;
  /** Verb for the primary button, e.g. "Insert it for me". */
  actionLabel?: string;
  /** Optional confirmation that the construct is now present. */
  detect?: (ctx: TutorialDetectContext) => boolean;
  /** Short reassurance shown under the action ("or type it yourself"). */
  hint?: string;
  /** While this step is active, softly spotlight a workspace pane. */
  highlight?: "editor" | "preview" | "both";
  /** Render the little workspace-map diagram in the step card. */
  showWorkspaceMap?: boolean;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  // ── Orient ──────────────────────────────────────────────────────────────
  {
    id: "welcome",
    group: "Orient",
    title: "Meet your workspace",
    concept:
      "You write LaTeX in the editor on the left. The PDF preview on the right shows the finished, typeset result. You edit the source; LaTeX handles the layout.",
    action: { kind: "read" },
    highlight: "both",
    showWorkspaceMap: true,
  },
  {
    id: "compile",
    group: "Orient",
    title: "Compile your first document",
    concept:
      "Compiling turns your source into a PDF. Press Ctrl/Cmd+Enter, or use the button below — the preview will appear on the right.",
    action: { kind: "compile" },
    actionLabel: "Compile now",
    detect: (ctx) => ctx.pdfRevision > 0,
    hint: "You can recompile any time to see your latest changes.",
    highlight: "preview",
  },
  {
    id: "skeleton",
    group: "Orient",
    title: "The document skeleton",
    concept:
      "Every document has two parts. The preamble (before \\begin{document}) sets up the class and packages. Your writing goes between \\begin{document} and \\end{document}. Click inside that body — that's where the next steps will add content.",
    syntax:
      "\\documentclass{article}\n\\begin{document}\n  % your writing here\n\\end{document}",
    action: { kind: "read" },
    highlight: "editor",
  },

  // ── Structure ───────────────────────────────────────────────────────────
  {
    id: "title",
    group: "Structure",
    title: "Add a title",
    concept:
      "\\maketitle prints a title block from the title and author you declare. Place your cursor just inside \\begin{document} first.",
    syntax: "\\title{My First Paper}\n\\author{Your Name}\n\\maketitle",
    action: {
      kind: "snippet",
      text: "\\title{My First Paper}\n\\author{Your Name}\n\\maketitle\n\n",
    },
    actionLabel: "Insert it for me",
    detect: (ctx) => /\\maketitle/.test(ctx.content),
    hint: "Then change the name in the braces to your own.",
  },
  {
    id: "section",
    group: "Structure",
    title: "Add a section",
    concept:
      "Sections give your document structure and an automatic, numbered heading. Type your heading between the braces.",
    syntax: "\\section{Introduction}",
    action: { kind: "action", id: "insert.section" },
    actionLabel: "Insert a section",
    detect: (ctx) => /\\section\*?\{/.test(ctx.content),
    hint: "Try \\subsection{...} for a smaller heading underneath.",
  },
  {
    id: "paragraph",
    group: "Structure",
    title: "Write a paragraph",
    concept:
      "In LaTeX you just write plain text and it flows automatically. A single blank line starts a new paragraph — try writing two of your own.",
    syntax:
      "This is my first paragraph. LaTeX wraps and spaces it for me.\n\nA blank line above starts a new paragraph, like this one.",
    action: {
      kind: "snippet",
      text: "This is my first paragraph. LaTeX wraps and spaces it for me.\n\nA blank line above starts a new paragraph, like this one.\n",
    },
    actionLabel: "Insert an example",
    hint: "This one is best typed yourself — get a feel for it.",
  },

  // ── Content ─────────────────────────────────────────────────────────────
  {
    id: "formatting",
    group: "Content",
    title: "Emphasise some text",
    concept:
      "Wrap words in a command to style them: \\textbf for bold, \\textit for italic, \\emph for emphasis.",
    syntax: "You can make text \\textbf{bold} or \\textit{italic}.",
    action: {
      kind: "snippet",
      text: "You can make text \\textbf{bold} or \\textit{italic}.\n",
    },
    actionLabel: "Insert an example",
    detect: (ctx) => /\\textbf\{|\\textit\{|\\emph\{/.test(ctx.content),
  },
  {
    id: "package",
    group: "Content",
    title: "Load a package",
    concept:
      "Packages give LaTeX new abilities, and you load them in the preamble with \\usepackage. Your document already loads a few — let's add xcolor, which can colour text.",
    syntax:
      "% in the preamble, before \\begin{document}:\n\\usepackage{xcolor}\n\n% then anywhere in the body:\n\\textcolor{teal}{Coloured} words!",
    action: {
      kind: "package",
      pkg: "xcolor",
      text: "\\textcolor{teal}{Coloured} words!\n",
    },
    actionLabel: "Add xcolor and try it",
    detect: (ctx) =>
      /\\usepackage(?:\[[^\]]*\])?\{[^}]*xcolor[^}]*\}/.test(ctx.content) &&
      /\\textcolor\{/.test(ctx.content),
    hint: "Look at the top of your file — \\usepackage{xcolor} joined the preamble.",
  },
  {
    id: "list",
    group: "Content",
    title: "Make a list",
    concept:
      "An itemize environment turns \\item lines into bullet points. Swap itemize for enumerate to get numbers instead.",
    syntax:
      "\\begin{itemize}\n  \\item First point\n  \\item Second point\n\\end{itemize}",
    action: {
      kind: "snippet",
      text: "\\begin{itemize}\n  \\item First point\n  \\item Second point\n\\end{itemize}\n",
    },
    actionLabel: "Insert a list",
    detect: (ctx) => /\\begin\{(?:itemize|enumerate)\}/.test(ctx.content),
  },
  {
    id: "figure",
    group: "Content",
    title: "Insert a figure",
    concept:
      "A figure floats an image with a caption and a label you can refer to. This project already includes sample-image.png to use.",
    syntax:
      "\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.6\\textwidth]{sample-image}\n  \\caption{A sample image.}\n  \\label{fig:sample}\n\\end{figure}",
    action: {
      kind: "snippet",
      text: "\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.6\\textwidth]{sample-image}\n  \\caption{A sample image.}\n  \\label{fig:sample}\n\\end{figure}\n",
    },
    actionLabel: "Insert a figure",
    detect: (ctx) =>
      ctx.hasKind("figure") || /\\includegraphics/.test(ctx.content),
    hint: "The Figure button on the toolbar can browse for your own images.",
  },
  {
    id: "table",
    group: "Content",
    title: "Insert a table",
    concept:
      "Tables use rows and columns. The visual table editor builds a tidy, captioned table for you — no need to memorise the alignment syntax.",
    action: { kind: "action", id: "insert.table" },
    actionLabel: "Open the table editor",
    detect: (ctx) => /\\begin\{(?:table|tabular)\*?\}/.test(ctx.content),
  },
  {
    id: "equation",
    group: "Content",
    title: "Insert an equation",
    concept:
      "Display maths gets its own centred line. The equation editor lets you build it visually and inserts the LaTeX for you.",
    syntax: "\\begin{equation}\n  E = mc^2\n\\end{equation}",
    action: { kind: "action", id: "insert.equation" },
    actionLabel: "Open the equation editor",
    detect: (ctx) =>
      /\\begin\{(?:equation|align|gather)\*?\}/.test(ctx.content) ||
      /\\\[/.test(ctx.content),
  },
  {
    id: "citation",
    group: "Content",
    title: "Cite a source",
    concept:
      "\\cite pulls a reference from your bibliography and numbers it automatically. This project's references.bib already has one entry to try.",
    syntax: "\\cite{lamport1994}",
    action: { kind: "action", id: "insert.citation" },
    actionLabel: "Insert a citation",
    detect: (ctx) => ctx.hasKind("citation") || /\\cite\{/.test(ctx.content),
    hint: "Compile again to see the reference list fill in.",
  },
  {
    id: "reference",
    group: "Content",
    title: "Cross-reference it",
    concept:
      "Give something a \\label, then \\ref to it — LaTeX fills in the right number, even if you reorder later. Try referring to the figure you added.",
    syntax: "As shown in Figure~\\ref{fig:sample}...",
    action: { kind: "action", id: "insert.cross-reference" },
    actionLabel: "Insert a cross-reference",
    detect: (ctx) => /\\(?:ref|autoref|cref|Cref)\{/.test(ctx.content),
  },

  // ── Finish ──────────────────────────────────────────────────────────────
  {
    id: "finish",
    group: "Finish",
    title: "Compile your finished paper",
    concept:
      "That's a real LaTeX document — title, sections, a figure, a table, maths, and a citation. Compile once more to admire it, then keep writing or start your own project.",
    action: { kind: "compile" },
    actionLabel: "Compile the final PDF",
  },
] as const;

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;
