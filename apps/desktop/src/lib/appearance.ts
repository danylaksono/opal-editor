export type WorkspacePalette = "paper" | "sage" | "ocean" | "plum";
export type EditorHighlightTheme =
  | "match"
  | "ink"
  | "sage"
  | "dusk"
  | "midnight"
  | "high-contrast";

export const workspacePaletteOptions: Array<{
  id: WorkspacePalette;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  {
    id: "paper",
    label: "Paper",
    description: "Warm ivory and academic blue",
    swatches: ["#fbfaf6", "#ece8df", "#315fa8"],
  },
  {
    id: "sage",
    label: "Sage",
    description: "Quiet greens for long writing sessions",
    swatches: ["#f7faf5", "#e4ece2", "#4f755b"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Cool slate with a teal accent",
    swatches: ["#f6fafb", "#dfecef", "#287887"],
  },
  {
    id: "plum",
    label: "Plum",
    description: "Soft neutral surfaces and violet ink",
    swatches: ["#faf8fb", "#ebe4ee", "#78548a"],
  },
];

export const editorHighlightOptions: Array<{
  id: EditorHighlightTheme;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  {
    id: "match",
    label: "Match workspace",
    description: "Follow the current light or dark mode",
    swatches: ["#f8f7f2", "#20242d", "#5679b7"],
  },
  {
    id: "ink",
    label: "Ink",
    description: "Warm paper with restrained syntax",
    swatches: ["#fbfaf6", "#253047", "#9a5d38"],
  },
  {
    id: "sage",
    label: "Sage",
    description: "Low-saturation botanical highlights",
    swatches: ["#f5f8f2", "#3f6850", "#76649a"],
  },
  {
    id: "dusk",
    label: "Dusk",
    description: "Soft navy with readable contrast",
    swatches: ["#222938", "#84a8d8", "#d6a86b"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep charcoal for focused writing",
    swatches: ["#11151d", "#8eb7ef", "#d7a4dc"],
  },
  {
    id: "high-contrast",
    label: "High contrast",
    description: "Maximum separation and accessibility",
    swatches: ["#050505", "#ffffff", "#44d7ff"],
  },
];
