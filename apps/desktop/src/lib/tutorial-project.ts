// The Learn LaTeX project starts almost empty on purpose: the guide builds it
// up one construct at a time so the learner watches their document grow. The
// preamble loads the packages the later steps rely on (graphics, maths,
// booktabs tables, hyperlinks) and a bibliography is wired up ready for the
// citation step. A sample image is copied in beside this file when the project
// is created.
export const TUTORIAL_MAIN_TEX = String.raw`\documentclass{article}
\usepackage{graphicx}
\usepackage{amsmath}
\usepackage{booktabs}
\usepackage{hyperref}

\begin{document}

% Your document starts here.
% Follow the Learn LaTeX guide on the left — it adds one piece at a time,
% and you can always type things yourself. Compile with Ctrl/Cmd+Enter.

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

/** Public asset fetched and copied into the tutorial project for the figure step. */
export const TUTORIAL_SAMPLE_IMAGE_URL = "/tutorial/sample-image.png";
export const TUTORIAL_SAMPLE_IMAGE_NAME = "sample-image.png";
