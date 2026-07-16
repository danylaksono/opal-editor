export const TUTORIAL_MAIN_TEX = String.raw`\documentclass{article}
\usepackage{graphicx}
\usepackage{amsmath}
\usepackage{booktabs}
\usepackage{hyperref}

\title{My First LaTeX Document}
\author{Your Name}

\begin{document}
\maketitle

% 1. Compile with Ctrl/Cmd+Enter.
% 2. Add a section using the toolbar or / menu.
% 3. Insert a citation to lamport1994.
% 4. Add a label to your section and cross-reference it.
% 5. Insert a figure after importing an image.
% 6. Insert an equation.
% 7. Insert a small table.

Welcome to LaTeX. Use the tutorial checklist to complete each task.

\bibliographystyle{plain}
\bibliography{references}
\end{document}
`;

export const TUTORIAL_BIB = `@book{lamport1994,
  author = {Leslie Lamport},
  title = {LaTeX: A Document Preparation System},
  publisher = {Addison-Wesley},
  year = {1994}
}
`;
