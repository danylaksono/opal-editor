import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { getEditorActions } from "@/lib/editor-actions";
import { EDITABLE_ENVIRONMENTS } from "@/lib/latex-environments";
import { useDocumentStore } from "@/stores/document-store";
import { useSemanticIndexStore } from "@/stores/semantic-index-store";
import { FEATURE_PACKAGE_REGISTRY } from "@/lib/feature-packages";

const ENVIRONMENT_DETAILS: Partial<Record<string, string>> = {
  itemize: "Bulleted list",
  enumerate: "Numbered list",
  equation: "Numbered displayed equation",
  "equation*": "Unnumbered displayed equation",
  align: "Aligned equations",
  "align*": "Unnumbered aligned equations",
  gather: "Multiple centred equations",
  quote: "Short quotation",
  quotation: "Long quotation",
  abstract: "Document abstract",
  theorem: "Theorem statement",
  lemma: "Lemma statement",
  proposition: "Proposition statement",
  definition: "Definition statement",
};

function indexedOptions(
  kind: "bibliography-entry" | "label" | "asset",
): Completion[] {
  const seen = new Set<string>();
  return useSemanticIndexStore
    .getState()
    .objects(kind)
    .filter((object) => {
      const key =
        kind === "bibliography-entry"
          ? object.detail || object.label
          : object.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((object) => ({
      label:
        kind === "bibliography-entry"
          ? object.detail || object.label
          : object.label,
      detail: kind === "label" ? object.detail : object.label,
      type: kind === "asset" ? "file" : "variable",
    }));
}

export function semanticCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const slash = before.match(/^\s*\/([\w-]*)$/);
  if (slash) {
    const state = useDocumentStore.getState();
    const file = state.files.find(
      (candidate) => candidate.id === state.activeFileId,
    );
    const actions = getEditorActions({
      projectOpen: Boolean(state.projectRoot),
      activeFileType: file?.type,
    }).filter((action) => action.category === "insert");
    return {
      from: context.pos - slash[1].length - 1,
      options: actions.map((action) => ({
        label: action.label,
        detail: action.description,
        type: "keyword",
        apply: (view, _completion, from, to) => {
          view.dispatch({ changes: { from, to, insert: "" } });
          setTimeout(() => void action.run(), 0);
        },
      })),
      validFor: /^\/?[\w-]*$/,
    };
  }

  const citation = before.match(
    /\\(?:cite|citep|citet|parencite|textcite)\*?(?:\[[^\]]*\]){0,2}\{([^}]*)$/,
  );
  if (citation) {
    const fragment = citation[1].split(",").pop() ?? "";
    return {
      from: context.pos - fragment.length,
      options: indexedOptions("bibliography-entry"),
      validFor: /^[\w:.-]*$/,
    };
  }

  const reference = before.match(
    /\\(?:ref|pageref|autoref|cref|Cref|eqref)\*?\{([^}]*)$/,
  );
  if (reference) {
    return {
      from: context.pos - reference[1].length,
      options: indexedOptions("label"),
      validFor: /^[\w:.-]*$/,
    };
  }

  const graphic = before.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)$/);
  if (graphic) {
    return {
      from: context.pos - graphic[1].length,
      options: indexedOptions("asset"),
      validFor: /^[\w./\\-]*$/,
    };
  }

  const environment = before.match(/\\begin\{([^}]*)$/);
  if (environment) {
    return {
      from: context.pos - environment[1].length,
      options: EDITABLE_ENVIRONMENTS.map((name) => ({
        label: name,
        detail: ENVIRONMENT_DETAILS[name],
        type: "keyword",
      })),
      validFor: /^[\w*]*$/,
    };
  }

  const packageName = before.match(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)$/);
  if (packageName) {
    const known = new Map<string, string>();
    for (const [feature, requirements] of Object.entries(
      FEATURE_PACKAGE_REGISTRY,
    )) {
      for (const requirement of requirements)
        known.set(requirement.name, `${requirement.reason} (${feature})`);
    }
    for (const object of useSemanticIndexStore.getState().objects("package")) {
      if (!known.has(object.label))
        known.set(object.label, `Used in ${object.fileId}`);
    }
    return {
      from: context.pos - packageName[1].split(",").pop()!.length,
      options: Array.from(known, ([label, detail]) => ({
        label,
        detail,
        type: "namespace",
      })),
      validFor: /^[\w.-]*$/,
    };
  }

  const customCommand = before.match(/\\([a-zA-Z@]*)$/);
  if (customCommand && (context.explicit || customCommand[1].length > 0)) {
    return {
      from: context.pos - customCommand[1].length,
      options: useSemanticIndexStore
        .getState()
        .objects("command")
        .map((object) => ({
          label: object.label.replace(/^\\/, ""),
          detail: `Project command from ${object.fileId}`,
          type: "function",
        })),
      validFor: /^[a-zA-Z@]*$/,
    };
  }
  return null;
}
