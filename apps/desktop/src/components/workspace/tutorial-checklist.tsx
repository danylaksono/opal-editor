import { useEffect, useMemo } from "react";
import { CheckCircle2Icon, CircleIcon, XIcon } from "lucide-react";
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
  return (
    <aside
      aria-label="Learn LaTeX checklist"
      className="absolute top-3 left-3 z-30 w-64 rounded-lg border border-border bg-background/95 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div>
          <div className="font-medium text-sm">Learn LaTeX</div>
          <div className="text-muted-foreground text-xs">
            {count} of {TUTORIAL_TASKS.length} complete
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close tutorial"
          onClick={dismissTutorial}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-1 p-2">
        {TUTORIAL_TASKS.map((task) => (
          <div
            key={task}
            className="flex items-center gap-2 rounded px-2 py-1 text-xs"
          >
            {completed[task] ? (
              <CheckCircle2Icon className="size-3.5 text-green-500" />
            ) : (
              <CircleIcon className="size-3.5 text-muted-foreground" />
            )}
            {LABELS[task]}
          </div>
        ))}
      </div>
    </aside>
  );
}
