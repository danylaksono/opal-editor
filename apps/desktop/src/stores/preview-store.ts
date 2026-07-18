import { create } from "zustand";

export interface PdfLocationRequest {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  requestId: number;
}

interface PreviewState {
  visible: boolean;
  pageCount: number;
  currentPage: number;
  locationRequest: PdfLocationRequest | null;
  toggle: () => void;
  setVisible: (v: boolean) => void;
  setPageCount: (count: number) => void;
  setCurrentPage: (page: number) => void;
  requestLocation: (location: Omit<PdfLocationRequest, "requestId">) => void;
  clearLocationRequest: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  visible: true,
  pageCount: 0,
  currentPage: 1,
  locationRequest: null,
  toggle: () => set((s) => ({ visible: !s.visible })),
  setVisible: (v) => set({ visible: v }),
  setPageCount: (pageCount) => set({ pageCount }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  requestLocation: (location) =>
    set((state) => ({
      locationRequest: {
        ...location,
        requestId: (state.locationRequest?.requestId ?? 0) + 1,
      },
      visible: true,
    })),
  clearLocationRequest: () => set({ locationRequest: null }),
}));
