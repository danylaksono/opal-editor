export const TUTORIAL_MAIN_TEX = String.raw`\documentclass{article}
\usepackage{graphicx}
\usepackage{amsmath}
\usepackage{booktabs}
\usepackage{hyperref}

\title{My First LaTeX Document}
\author{Your Name}

\begin{document}
\maketitle

% Follow the Learn LaTeX checklist in the sidebar:
% 1. Compile with Ctrl/Cmd+Enter.
% 2. Add a numbered section using the toolbar or / menu.
% 3. Insert a citation to lamport1994.
% 4. Add a label to your section and cross-reference it.
% 5. Insert a figure after importing an image.
% 6. Insert an equation.
% 7. Insert a small table.

Welcome to \LaTeX! This starter document already shows a few everyday
building blocks. Compile it to see the result, then work through the
checklist in the sidebar to add the rest yourself.

\subsection*{Text formatting}

You can make text \textbf{bold}, \textit{italic}, or \emph{emphasised},
and typeset code-like words in \texttt{teletype}. A blank line in the
source starts a new paragraph.

\subsection*{Lists}

Bullet points use the \texttt{itemize} environment:
\begin{itemize}
  \item Write your content in plain text.
  \item Let \LaTeX{} take care of the layout.
\end{itemize}

Numbered steps use \texttt{enumerate}:
\begin{enumerate}
  \item Write.
  \item Compile.
  \item Repeat.
\end{enumerate}

\subsection*{Mathematics}

Inline maths sits inside a sentence, like $E = mc^2$. Display maths gets
its own line:
\[
  \int_0^1 x^2 \, dx = \frac{1}{3}
\]
For a numbered equation you can reference later, use the equation task
in the checklist.

\subsection*{A simple table}

Rows and columns use the \texttt{tabular} environment, here with tidy
\texttt{booktabs} rules:

\begin{center}
  \begin{tabular}{lrr}
    \toprule
    Item    & Quantity & Price \\
    \midrule
    Apples  & 3        & 1.20  \\
    Oranges & 5        & 2.50  \\
    \bottomrule
  \end{tabular}
\end{center}

The table task in the checklist builds a floating table with a caption
using the visual table editor.

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
