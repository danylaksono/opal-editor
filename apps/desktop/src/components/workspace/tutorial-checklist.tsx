import { useEffect, useMemo } from "react";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  GraduationCapIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import {
  TUTORIAL_TASKS,
  useOnboardingStore,
  type TutorialTask,
} from "@/stores/onboarding-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";
import { Button } from "@/components/ui/button";

const LABELS: Record<TutorialTask, string> = {
  compile: "Compile the document",
  section: "Add a section",
  citation: "Insert a citation",
  reference: "Add and use a cross-reference",
  figure: "Insert a figure",
  equation: "Insert an equation",
  table: "Insert a table",
};

const DESCRIPTIONS: Record<TutorialTask, string> = {
  compile: "Turn your source into a PDF",
  section: "Give your document a clear heading",
  citation: "Credit a source from your bibliography",
  reference: "Link to a labelled part of your document",
  figure: "Add an image, caption, and label",
  equation: "Build maths without memorising commands",
  table: "Create rows and columns visually",
};

const TASK_ACTIONS: Partial<Record<TutorialTask, string>> = {
  section: "insert.section",
  citation: "insert.citation",
  reference: "insert.cross-reference",
  figure: "insert.figure",
  equation: "insert.equation",
  table: "insert.table",
};

function startTask(task: TutorialTask) {
  if (task === "compile") {
    window.dispatchEvent(new CustomEvent("trigger-compile"));
    return;
  }
  const id = TASK_ACTIONS[task];
  if (id) {
    window.dispatchEvent(new CustomEvent("editor-action", { detail: { id } }));
  }
}

export function TutorialChecklist() {
  const projectRoot = useDocumentStore((state) => state.projectRoot);
  const pdfRevision = useDocumentStore((state) => state.pdfRevision);
  const files = useDocumentStore((state) => state.files);
  const snapshots = useSemanticIndexStore((state) => state.snapshots);
  const activeTutorialProject = useOnboardingStore(
    (state) => state.activeTutorialProject,
  );
  const completed = useOnboardingStore((state) => state.completed);
  const updateCompleted = useOnboardingStore((state) => state.updateCompleted);
  const dismissTutorial = useOnboardingStore((state) => state.dismissTutorial);

  const detected = useMemo(() => {
    const content = files
      .filter((file) => file.name.endsWith(".tex"))
      .map((file) => file.content ?? "")
      .join("\n");
    const objects = Object.values(snapshots).flatMap(
      (snapshot) => snapshot.objects,
    );
    return {
      compile: pdfRevision > 0,
      section: /\\(?:section|chapter)\*?\{/.test(content),
      citation: objects.some((object) => object.kind === "citation"),
      reference:
        objects.some((object) => object.kind === "reference") &&
        objects.some((object) => object.kind === "label"),
      figure: objects.some((object) => object.kind === "figure"),
      equation: /\\begin\{(?:equation|align|gather)\*?\}/.test(content),
      table: /\\begin\{table\*?\}/.test(content),
    } satisfies Record<TutorialTask, boolean>;
  }, [files, pdfRevision, snapshots]);

  useEffect(() => updateCompleted(detected), [detected, updateCompleted]);

  if (!projectRoot || projectRoot !== activeTutorialProject) return null;
  const count = TUTORIAL_TASKS.filter((task) => completed[task]).length;
  const isComplete = count === TUTORIAL_TASKS.length;
  const progress = (count / TUTORIAL_TASKS.length) * 100;

  return (
    <aside
      aria-label="Learn LaTeX checklist"
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
                Your first document, step by step
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Close tutorial"
            onClick={dismissTutorial}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/10"
            role="progressbar"
            aria-label="Tutorial progress"
            aria-valuemin={0}
            aria-valuemax={TUTORIAL_TASKS.length}
            aria-valuenow={count}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 font-medium text-[10px] text-muted-foreground">
            {count}/{TUTORIAL_TASKS.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isComplete && (
          <div className="mb-2 rounded-xl border border-primary/15 bg-primary/8 p-3">
            <div className="flex items-center gap-2 font-medium text-sm">
              <SparklesIcon className="size-4 text-primary" />
              You made a complete document
            </div>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              Keep this project as a reference, or close the guide and start
              your own.
            </p>
          </div>
        )}
        <ol className="space-y-1">
          {TUTORIAL_TASKS.map((task, index) => {
            const done = completed[task];
            return (
              <li key={task}>
                <button
                  type="button"
                  className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => startTask(task)}
                  aria-label={`${done ? "Completed: " : ""}${LABELS[task]}`}
                >
                  <span className="mt-0.5">
                    {done ? (
                      <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <span className="flex size-4 items-center justify-center rounded-full border border-muted-foreground/40 font-medium text-[9px] text-muted-foreground">
                        {index + 1}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        done
                          ? "block text-muted-foreground text-xs line-through"
                          : "block font-medium text-xs"
                      }
                    >
                      {LABELS[task]}
                    </span>
                    {!done && (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground leading-relaxed">
                        {DESCRIPTIONS[task]}
                      </span>
                    )}
                  </span>
                  {!done && (
                    <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-sidebar-border border-t px-4 py-3 text-[10px] text-muted-foreground leading-relaxed">
        Tip: type <kbd className="rounded border bg-background px-1">/</kbd> at
        the start of a line to insert anything.
      </div>
    </aside>
  );
}
