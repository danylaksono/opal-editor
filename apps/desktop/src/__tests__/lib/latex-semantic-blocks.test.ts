import { describe, expect, it } from "vitest";
import {
  findFigureAt,
  findFigures,
  serializeFigure,
  updateFigureSource,
} from "@/lib/latex-figures";
import {
  findEditableEnvironmentAt,
  findEditableEnvironments,
  prepareEnvironmentBody,
  updateEnvironmentSource,
} from "@/lib/latex-environments";

describe("LaTeX figures", () => {
  const source = String.raw`\begin{figure}[tb]
  \centering
  \includegraphics[width=0.75\textwidth,angle=2]{figures/map.png}
  \customcommand
  \caption{Study area}
  \label{fig:map}
\end{figure}`;

  it("parses editable fields and finds the graphic at the cursor", () => {
    const figure = findFigures(source)[0];
    expect(figure).toMatchObject({
      path: "figures/map.png",
      caption: "Study area",
      label: "fig:map",
      placement: "tb",
      widthPercent: 75,
      centered: true,
      otherGraphicOptions: ["angle=2"],
    });
    expect(findFigureAt(source, source.indexOf("map.png"))?.label).toBe(
      "fig:map",
    );
  });

  it("updates known fields without removing custom figure content", () => {
    const updated = updateFigureSource(findFigures(source)[0], {
      path: "figures/new-map.pdf",
      caption: "Updated map",
      label: "fig:updated",
      placement: "htbp",
      widthPercent: 90,
      centered: false,
    });
    expect(updated).toContain(String.raw`\customcommand`);
    expect(updated).toContain(
      String.raw`\includegraphics[width=0.9\textwidth,angle=2]{figures/new-map.pdf}`,
    );
    expect(updated).not.toContain(String.raw`\centering`);
  });

  it("serializes a new figure", () => {
    expect(
      serializeFigure({
        path: "plot.pdf",
        caption: "Results",
        label: "fig:results",
        placement: "htbp",
        widthPercent: 100,
        centered: true,
      }),
    ).toContain(String.raw`\includegraphics[width=1\textwidth]{plot.pdf}`);
  });
});

describe("LaTeX environments", () => {
  const source = String.raw`\begin{itemize}
  \item One
  \begin{quote}
    Nested
  \end{quote}
\end{itemize}`;

  it("pairs nested environments and opens them from their begin command", () => {
    expect(findEditableEnvironments(source)).toHaveLength(2);
    expect(
      findEditableEnvironmentAt(source, source.indexOf("itemize") + 2)?.name,
    ).toBe("itemize");
  });

  it("changes begin/end tokens while preserving the body", () => {
    const target = findEditableEnvironments(source)[0];
    const updated = updateEnvironmentSource(target, {
      name: "enumerate",
      option: "label=\\alph*)",
    });
    expect(updated).toContain(String.raw`\begin{enumerate}[label=\alph*)]`);
    expect(updated).toContain(String.raw`\begin{quote}`);
    expect(updated).toContain(String.raw`\end{enumerate}`);
  });

  it("turns selected lines into list items", () => {
    expect(prepareEnvironmentBody("itemize", "First\nSecond")).toBe(
      "  \\item First\n  \\item Second",
    );
  });
});
