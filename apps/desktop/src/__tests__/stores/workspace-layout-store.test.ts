import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";

describe("useWorkspaceLayoutStore", () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.setState({
      sidePanelOpen: true,
      activeSidePanel: "files",
      problemsDrawerOpen: false,
      focusMode: false,
      reviewMode: false,
    });
  });

  it("toggles focus mode without changing side panel state", () => {
    const store = useWorkspaceLayoutStore.getState();

    store.setActiveSidePanel("outline");
    store.toggleFocusMode();

    expect(useWorkspaceLayoutStore.getState()).toMatchObject({
      focusMode: true,
      sidePanelOpen: true,
      activeSidePanel: "outline",
    });

    useWorkspaceLayoutStore.getState().toggleFocusMode();
    expect(useWorkspaceLayoutStore.getState().focusMode).toBe(false);
  });

  it("sets focus mode explicitly", () => {
    useWorkspaceLayoutStore.getState().setFocusMode(true);
    expect(useWorkspaceLayoutStore.getState().focusMode).toBe(true);

    useWorkspaceLayoutStore.getState().setFocusMode(false);
    expect(useWorkspaceLayoutStore.getState().focusMode).toBe(false);
  });

  it("enters review mode and closes the problems drawer", () => {
    useWorkspaceLayoutStore.setState({ problemsDrawerOpen: true });

    useWorkspaceLayoutStore.getState().setReviewMode(true);

    expect(useWorkspaceLayoutStore.getState()).toMatchObject({
      reviewMode: true,
      problemsDrawerOpen: false,
    });

    useWorkspaceLayoutStore.getState().toggleReviewMode();
    expect(useWorkspaceLayoutStore.getState().reviewMode).toBe(false);
  });
});
