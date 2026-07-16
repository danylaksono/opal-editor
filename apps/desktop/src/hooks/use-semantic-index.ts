import { useEffect, useRef } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";

export function useSemanticIndex(): void {
  const files = useDocumentStore((state) => state.files);
  const projectRoot = useDocumentStore((state) => state.projectRoot);
  const generation = useDocumentStore((state) => state.contentGeneration);
  const previousRoot = useRef<string | null>(null);
  const previousSignatures = useRef(new Map<string, string>());

  useEffect(() => {
    const index = useSemanticIndexStore.getState();
    if (!projectRoot) {
      index.clear();
      previousRoot.current = null;
      previousSignatures.current.clear();
      return;
    }
    if (previousRoot.current !== projectRoot) {
      index.clear();
      index.reindexProject(files, generation);
      previousRoot.current = projectRoot;
      previousSignatures.current = new Map(
        files.map((file) => [
          file.id,
          `${file.type}:${file.content ?? file.fileSize ?? ""}`,
        ]),
      );
      return;
    }
    const liveIds = new Set(files.map((file) => file.id));
    useSemanticIndexStore.setState((state) => ({
      snapshots: Object.fromEntries(
        Object.entries(state.snapshots).filter(([fileId]) =>
          liveIds.has(fileId),
        ),
      ),
    }));
    const nextSignatures = new Map<string, string>();
    for (const file of files) {
      const signature = `${file.type}:${file.content ?? file.fileSize ?? ""}`;
      nextSignatures.set(file.id, signature);
      if (previousSignatures.current.get(file.id) !== signature)
        index.reindexFile(file, generation);
    }
    previousSignatures.current = nextSignatures;
  }, [files, generation, projectRoot]);
}
