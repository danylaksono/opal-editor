import { create } from "zustand";
import { persist } from "zustand/middleware";

export const TUTORIAL_VERSION = 1;
export const TUTORIAL_TASKS = [
  "compile",
  "section",
  "citation",
  "reference",
  "figure",
  "equation",
  "table",
] as const;
export type TutorialTask = (typeof TUTORIAL_TASKS)[number];

interface OnboardingState {
  version: number;
  hasSeenOffer: boolean;
  activeTutorialProject: string | null;
  completed: Partial<Record<TutorialTask, boolean>>;
  markOfferSeen: () => void;
  startTutorial: (projectPath: string) => void;
  updateCompleted: (completed: Partial<Record<TutorialTask, boolean>>) => void;
  dismissTutorial: () => void;
  resetTutorial: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      version: TUTORIAL_VERSION,
      hasSeenOffer: false,
      activeTutorialProject: null,
      completed: {},
      markOfferSeen: () => set({ hasSeenOffer: true }),
      startTutorial: (projectPath) =>
        set({
          version: TUTORIAL_VERSION,
          hasSeenOffer: true,
          activeTutorialProject: projectPath,
          completed: {},
        }),
      updateCompleted: (completed) =>
        set((state) => ({
          completed: {
            ...state.completed,
            ...Object.fromEntries(
              Object.entries(completed).filter(([, done]) => done),
            ),
          },
        })),
      dismissTutorial: () => set({ activeTutorialProject: null }),
      resetTutorial: () =>
        set({
          version: TUTORIAL_VERSION,
          hasSeenOffer: false,
          activeTutorialProject: null,
          completed: {},
        }),
    }),
    {
      name: "tectonic-editor-onboarding",
      version: TUTORIAL_VERSION,
      migrate: () =>
        ({
          version: TUTORIAL_VERSION,
          hasSeenOffer: true,
          activeTutorialProject: null,
          completed: {},
        }) as OnboardingState,
    },
  ),
);
