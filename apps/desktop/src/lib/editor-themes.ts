import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  defaultHighlightStyle,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { oneDark, oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { tags } from "@lezer/highlight";
import type { EditorHighlightTheme } from "@/lib/appearance";

interface ThemeColors {
  dark: boolean;
  background: string;
  foreground: string;
  gutter: string;
  selection: string;
  keyword: string;
  name: string;
  string: string;
  number: string;
  comment: string;
  heading: string;
  link: string;
  invalid: string;
}

const themes: Record<Exclude<EditorHighlightTheme, "match">, ThemeColors> = {
  ink: {
    dark: false,
    background: "#fbfaf6",
    foreground: "#253047",
    gutter: "#f1eee6",
    selection: "#cddcf2",
    keyword: "#315f9b",
    name: "#86513b",
    string: "#3f7655",
    number: "#8b5c92",
    comment: "#7b8179",
    heading: "#243d68",
    link: "#267080",
    invalid: "#b3261e",
  },
  sage: {
    dark: false,
    background: "#f5f8f2",
    foreground: "#26352c",
    gutter: "#e8eee3",
    selection: "#cde2d2",
    keyword: "#3f6850",
    name: "#765c3d",
    string: "#4f7164",
    number: "#76649a",
    comment: "#768177",
    heading: "#315b48",
    link: "#2e7180",
    invalid: "#a43c32",
  },
  dusk: {
    dark: true,
    background: "#222938",
    foreground: "#dce3ef",
    gutter: "#1d2330",
    selection: "#3b536f",
    keyword: "#84a8d8",
    name: "#d6a86b",
    string: "#9bc59f",
    number: "#c7a3d8",
    comment: "#8995a8",
    heading: "#b7cff0",
    link: "#7bc3cf",
    invalid: "#ff8d86",
  },
  midnight: {
    dark: true,
    background: "#11151d",
    foreground: "#e5e9f0",
    gutter: "#0d1118",
    selection: "#29476b",
    keyword: "#8eb7ef",
    name: "#d7a4dc",
    string: "#91d0ad",
    number: "#e2b87d",
    comment: "#768193",
    heading: "#b9d3fa",
    link: "#65c7d4",
    invalid: "#ff7777",
  },
  "high-contrast": {
    dark: true,
    background: "#050505",
    foreground: "#ffffff",
    gutter: "#000000",
    selection: "#144f63",
    keyword: "#44d7ff",
    name: "#ffd75f",
    string: "#7dff8a",
    number: "#ff9cee",
    comment: "#b8b8b8",
    heading: "#ffffff",
    link: "#72e5ff",
    invalid: "#ff5555",
  },
};

function customTheme(colors: ThemeColors): Extension[] {
  const surface = EditorView.theme(
    {
      "&": {
        color: colors.foreground,
        backgroundColor: colors.background,
      },
      ".cm-content": { caretColor: colors.foreground },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: colors.foreground,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: colors.selection,
        },
      ".cm-gutters": {
        color: colors.comment,
        backgroundColor: colors.gutter,
        borderRightColor: colors.gutter,
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: colors.dark ? "#ffffff08" : "#00000005",
      },
    },
    { dark: colors.dark },
  );
  const highlighting = HighlightStyle.define([
    {
      tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword],
      color: colors.keyword,
    },
    {
      tag: [tags.name, tags.variableName, tags.propertyName],
      color: colors.name,
    },
    { tag: [tags.string, tags.special(tags.string)], color: colors.string },
    { tag: [tags.number, tags.bool, tags.null], color: colors.number },
    {
      tag: [tags.comment, tags.meta],
      color: colors.comment,
      fontStyle: "italic",
    },
    {
      tag: [tags.heading, tags.strong],
      color: colors.heading,
      fontWeight: "600",
    },
    {
      tag: [tags.link, tags.url],
      color: colors.link,
      textDecoration: "underline",
    },
    {
      tag: tags.invalid,
      color: colors.invalid,
      textDecoration: "underline wavy",
    },
  ]);
  return [surface, syntaxHighlighting(highlighting)];
}

export function getEditorThemeExtensions(
  editorTheme: EditorHighlightTheme,
  resolvedWorkspaceTheme?: string,
): Extension[] {
  if (editorTheme === "match") {
    return resolvedWorkspaceTheme === "dark"
      ? [oneDark, syntaxHighlighting(oneDarkHighlightStyle)]
      : [syntaxHighlighting(defaultHighlightStyle)];
  }
  return customTheme(themes[editorTheme]);
}
