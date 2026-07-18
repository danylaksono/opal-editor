import { describe, it, expect } from "vitest";
import {
  useSettingsStore,
  clampEditorFontSize,
  DEFAULT_EDITOR_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  MAX_EDITOR_FONT_SIZE,
} from "@/stores/settings-store";

describe("editor font size", () => {
  it("defaults to DEFAULT_EDITOR_FONT_SIZE", () => {
    expect(useSettingsStore.getState().editorFontSize).toBe(
      DEFAULT_EDITOR_FONT_SIZE,
    );
  });

  it("clampEditorFontSize clamps out-of-range and non-finite values", () => {
    expect(clampEditorFontSize(1)).toBe(MIN_EDITOR_FONT_SIZE);
    expect(clampEditorFontSize(100)).toBe(MAX_EDITOR_FONT_SIZE);
    expect(clampEditorFontSize(Number.NaN)).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(clampEditorFontSize(15.6)).toBe(16);
  });

  it("setEditorFontSize stores a clamped value", () => {
    useSettingsStore.getState().setEditorFontSize(MAX_EDITOR_FONT_SIZE + 10);
    expect(useSettingsStore.getState().editorFontSize).toBe(
      MAX_EDITOR_FONT_SIZE,
    );
    useSettingsStore.getState().setEditorFontSize(DEFAULT_EDITOR_FONT_SIZE);
    expect(useSettingsStore.getState().editorFontSize).toBe(
      DEFAULT_EDITOR_FONT_SIZE,
    );
  });
});
