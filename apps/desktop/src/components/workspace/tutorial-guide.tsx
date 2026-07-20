import { useMemo } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  GraduationCapIcon,
  PackageIcon,
  PlayIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import {
  TUTORIAL_STEPS,
  type TutorialAction,
  type TutorialDetectContext,
  type TutorialStep,
} from "@/lib/tutorial-steps";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function runAction(action: TutorialAction) {
  switch (action.kind) {
    case "compile":
      window.dispatchEvent(new CustomEvent("trigger-compile"));
      return;
    case "action":
      window.dispatchEvent(
        new CustomEvent("editor-action", { detail: { id: action.id } }),
      );
      return;
    case "snippet":
      window.dispatchEvent(
        new CustomEvent("editor-action", {
          detail: { id: "insert.snippet", text: action.text },
        }),
      );
      return;
    case "package":
      window.dispatchEvent(
        new CustomEvent("editor-action", {
          detail: { id: "insert.package", pkg: action.pkg, text: action.text },
        }),
      );
      return;
    case "read":
      return;
  }
}

function actionIcon(action: TutorialAction) {
  if (action.kind === "compile") return PlayIcon;
  if (action.kind === "package") return PackageIcon;
  return WandSparklesIcon;
}

export function TutorialGuide() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const pdfRevision = useDocumentStore((s) => s.pdfRevision);
  const files = useDocumentStore((s) => s.files);
  const snapshots = useSemanticIndexStore((s) => s.snapshots);
  const setSidePanelOpen = useWorkspaceLayoutStore((s) => s.setSidePanelOpen);

  const tutorialProject = useOnboardingStore((s) => s.tutorialProject);
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const maxStepReached = useOnboardingStore((s) => s.maxStepReached);
  const goToStep = useOnboardingStore((s) => s.goToStep);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);

  const detectCtx = useMemo<TutorialDetectContext>(() => {
    const content = files
      .filter((file) => file.name.endsWith(".tex"))
      .map((file) => file.content ?? "")
      .join("\n");
    const objects = Object.values(snapshots).flatMap(
      (snapshot) => snapshot.objects,
    );
    return {
      content,
      pdfRevision,
      hasKind: (kind) => objects.some((object) => object.kind === kind),
    };
  }, [files, pdfRevision, snapshots]);

  if (!projectRoot || projectRoot !== tutorialProject) return null;

  const total = TUTORIAL_STEPS.length;
  const active = Math.min(currentStep, total - 1);
  const isLast = active === total - 1;
  const progress = ((active + 1) / total) * 100;

  const isDetected = (s: TutorialStep) => Boolean(s.detect?.(detectCtx));

  return (
    <aside
      aria-label="Learn LaTeX guide"
      className="flex h-full flex-col bg-sidebar"
    >
      <div className="border-sidebar-border border-b px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCapIcon className="size-4.5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold font-serif text-base tracking-tight">
                Learn LaTeX
              </div>
              <div className="text-muted-foreground text-xs">
                Step {active + 1} of {total}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Hide guide"
            title="Hide guide (reopen it from the graduation-cap icon)"
            onClick={() => setSidePanelOpen(false)}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary/10"
          role="progressbar"
          aria-label="Tutorial progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={active + 1}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ol className="space-y-0.5">
          {TUTORIAL_STEPS.map((s, index) => {
            const isCurrent = index === active;
            const reached = index <= maxStepReached;
            const done = index < active || (reached && isDetected(s));
            const showGroup =
              index === 0 || TUTORIAL_STEPS[index - 1].group !== s.group;
            return (
              <li key={s.id}>
                {showGroup && (
                  <div className="px-2.5 pt-3 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
                    {s.group}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!reached}
                  onClick={() => goToStep(index)}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    isCurrent
                      ? "bg-primary/8"
                      : reached
                        ? "hover:bg-sidebar-accent"
                        : "cursor-default opacity-55",
                  )}
                >
                  <span className="shrink-0">
                    {done ? (
                      <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full border font-medium text-[9px]",
                          isCurrent
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40 text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      isCurrent
                        ? "font-medium"
                        : done
                          ? "text-muted-foreground"
                          : "",
                    )}
                  >
                    {s.title}
                  </span>
                </button>

                {isCurrent && (
                  <StepDetail
                    step={s}
                    detected={isDetected(s)}
                    isLast={isLast}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-center gap-2 border-sidebar-border border-t px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={active === 0}
          onClick={prevStep}
        >
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <div className="flex-1" />
        {isLast ? (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setSidePanelOpen(false)}
          >
            <CheckIcon className="size-3.5" />
            Finish
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={nextStep}>
            Next
            <ArrowRightIcon className="size-3.5" />
          </Button>
        )}
      </div>
    </aside>
  );
}

/** A tiny schematic of the workspace so "left" and "right" have a picture. */
function WorkspaceMap() {
  return (
    <div
      aria-hidden="true"
      className="flex h-20 gap-1 rounded-md border bg-muted/40 p-1"
    >
      <div className="w-4 rounded-sm border border-border/70 bg-sidebar" />
      <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-sm border border-primary/40 bg-background">
        <span className="font-medium text-[9px] text-primary">Editor</span>
        <span className="text-[8px] text-muted-foreground">you write here</span>
        <div className="w-3/4 space-y-0.5">
          <div className="h-0.5 rounded bg-muted-foreground/30" />
          <div className="h-0.5 w-2/3 rounded bg-muted-foreground/30" />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-sm border border-primary/40 bg-background">
        <span className="font-medium text-[9px] text-primary">PDF</span>
        <span className="text-[8px] text-muted-foreground">
          the result appears
        </span>
        <div className="flex h-6 w-5 items-center justify-center rounded-[2px] border border-muted-foreground/40 bg-card">
          <div className="w-2/3 space-y-0.5">
            <div className="h-px rounded bg-muted-foreground/40" />
            <div className="h-px rounded bg-muted-foreground/40" />
            <div className="h-px w-2/3 rounded bg-muted-foreground/40" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDetail({
  step,
  detected,
  isLast,
}: {
  step: TutorialStep;
  detected: boolean;
  isLast: boolean;
}) {
  const ActionIcon = actionIcon(step.action);
  return (
    <div className="mt-1 mb-2 ml-2.5 space-y-3 rounded-lg border border-primary/15 bg-background/60 p-3">
      <p className="text-muted-foreground text-xs leading-relaxed">
        {step.concept}
      </p>

      {step.showWorkspaceMap && <WorkspaceMap />}

      {step.syntax && (
        <pre className="overflow-x-auto rounded-md border bg-muted/60 px-2.5 py-2 font-mono text-[11px] text-foreground leading-relaxed">
          {step.syntax}
        </pre>
      )}

      {step.action.kind !== "read" && (
        <Button
          size="sm"
          variant={detected ? "outline" : "default"}
          className="w-full gap-1.5"
          onClick={() => runAction(step.action)}
        >
          <ActionIcon className="size-3.5" />
          {step.actionLabel ?? "Insert it for me"}
        </Button>
      )}

      {detected ? (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2Icon className="size-3.5" />
          It's in your document — press Next when you're ready.
        </div>
      ) : (
        step.hint && (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {step.hint}
          </p>
        )
      )}

      {isLast && (
        <div className="flex items-center gap-1.5 text-[11px] text-primary">
          <SparklesIcon className="size-3.5" />
          You built a complete LaTeX paper.
        </div>
      )}
    </div>
  );
}
