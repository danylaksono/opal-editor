import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TUTORIAL_STEP_COUNT } from "@/lib/tutorial-steps";

export const TUTORIAL_VERSION = 2;

interface OnboardingState {
  version: number;
  /** Whether the first-launch "New to LaTeX?" offer has been shown/answered. */
  hasSeenOffer: boolean;
  /**
   * Path of the project that holds the Learn LaTeX guide. Persisted so the
   * guide reappears whenever this project is reopened — the learner can always
   * come back to it. Cleared only by an explicit reset.
   */
  tutorialProject: string | null;
  /** Current step index into TUTORIAL_STEPS. */
  currentStep: number;
  /** Furthest step the learner has unlocked (earlier steps stay revisitable). */
  maxStepReached: number;
  markOfferSeen: () => void;
  /** Begin (or restart) the guide for a project at step 0. */
  startTutorial: (projectPath: string) => void;
  goToStep: (index: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  /** Forget the tutorial entirely and re-arm the first-launch offer. */
  resetTutorial: () => void;
}

const lastIndex = () => Math.max(0, TUTORIAL_STEP_COUNT - 1);
const clampStep = (index: number) => Math.min(Math.max(index, 0), lastIndex());

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      version: TUTORIAL_VERSION,
      hasSeenOffer: false,
      tutorialProject: null,
      currentStep: 0,
      maxStepReached: 0,
      markOfferSeen: () => set({ hasSeenOffer: true }),
      startTutorial: (projectPath) =>
        set({
          version: TUTORIAL_VERSION,
          hasSeenOffer: true,
          tutorialProject: projectPath,
          currentStep: 0,
          maxStepReached: 0,
        }),
      goToStep: (index) =>
        set((state) => ({
          currentStep: Math.min(clampStep(index), state.maxStepReached),
        })),
      nextStep: () =>
        set((state) => {
          const next = clampStep(state.currentStep + 1);
          return {
            currentStep: next,
            maxStepReached: Math.max(state.maxStepReached, next),
          };
        }),
      prevStep: () =>
        set((state) => ({ currentStep: clampStep(state.currentStep - 1) })),
      resetTutorial: () =>
        set({
          version: TUTORIAL_VERSION,
          hasSeenOffer: false,
          tutorialProject: null,
          currentStep: 0,
          maxStepReached: 0,
        }),
    }),
    {
      name: "tectonic-editor-onboarding",
      version: TUTORIAL_VERSION,
      migrate: (persisted) => {
        const prev = (persisted ?? {}) as Partial<{
          hasSeenOffer: boolean;
          activeTutorialProject: string | null;
          tutorialProject: string | null;
        }>;
        return {
          version: TUTORIAL_VERSION,
          hasSeenOffer: prev.hasSeenOffer ?? true,
          tutorialProject:
            prev.tutorialProject ?? prev.activeTutorialProject ?? null,
          currentStep: 0,
          maxStepReached: 0,
        } as OnboardingState;
      },
    },
  ),
);
