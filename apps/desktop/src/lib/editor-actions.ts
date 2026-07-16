export type EditorActionCategory =
  | "document"
  | "insert"
  | "navigate"
  | "appearance"
  | "help";

export interface EditorActionContext {
  projectOpen: boolean;
  activeFileType?: string;
}

export interface EditorActionDefinition {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
  category: EditorActionCategory;
  shortcut?: string;
  packageRequirements?: string[];
  available?: (context: EditorActionContext) => boolean;
  run: () => void | Promise<void>;
}

const actions = new Map<string, EditorActionDefinition>();

export function registerEditorAction(
  action: EditorActionDefinition,
): () => void {
  actions.set(action.id, action);
  return () => actions.delete(action.id);
}

export function getEditorActions(context: EditorActionContext) {
  return Array.from(actions.values()).filter(
    (action) => !action.available || action.available(context),
  );
}

export function runEditorAction(id: string): void {
  void actions.get(id)?.run();
}

export function dispatchEditorAction(id: string): void {
  window.dispatchEvent(new CustomEvent("editor-action", { detail: { id } }));
}
