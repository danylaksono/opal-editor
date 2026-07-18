import { beforeEach, describe, expect, it } from "vitest";
import { usePreviewStore } from "@/stores/preview-store";

describe("preview store location requests", () => {
  beforeEach(() => {
    usePreviewStore.setState({
      visible: false,
      pageCount: 0,
      currentPage: 1,
      locationRequest: null,
    });
  });

  it("opens the preview and records a SyncTeX target", () => {
    usePreviewStore.getState().requestLocation({
      page: 4,
      x: 72,
      y: 144,
      width: 120,
      height: 14,
    });

    expect(usePreviewStore.getState()).toMatchObject({
      visible: true,
      locationRequest: {
        page: 4,
        x: 72,
        y: 144,
        width: 120,
        height: 14,
        requestId: 1,
      },
    });
  });

  it("clears the consumed location request", () => {
    usePreviewStore.getState().requestLocation({
      page: 2,
      x: 10,
      y: 20,
      width: 12,
      height: 12,
    });
    usePreviewStore.getState().clearLocationRequest();

    expect(usePreviewStore.getState().locationRequest).toBeNull();
  });
});
