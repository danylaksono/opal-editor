import { create } from "zustand";

interface PreviewState {
  visible: boolean;
  pageCount: number;
  currentPage: number;
  toggle: () => void;
  setVisible: (v: boolean) => void;
  setPageCount: (count: number) => void;
  setCurrentPage: (page: number) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  visible: true,
  pageCount: 0,
  currentPage: 1,
  toggle: () => set((s) => ({ visible: !s.visible })),
  setVisible: (v) => set({ visible: v }),
  setPageCount: (pageCount) => set({ pageCount }),
  setCurrentPage: (currentPage) => set({ currentPage }),
}));
