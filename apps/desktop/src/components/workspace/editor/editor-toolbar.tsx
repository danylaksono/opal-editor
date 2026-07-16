import { RefObject, useCallback, useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import {
  BoldIcon,
  ItalicIcon,
  ListIcon,
  Heading1Icon,
  Heading2Icon,
  CodeIcon,
  CropIcon,
  FunctionSquareIcon,
  FileTextIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
  BookMarkedIcon,
  ExternalLinkIcon,
  Link2Icon,
  ImagePlusIcon,
  BoxesIcon,
} from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { CitationPicker } from "@/components/workspace/citation-picker";
import { CrossReferencePicker } from "@/components/workspace/cross-reference-picker";
import { FigurePicker } from "@/components/workspace/figure-picker";
import { EnvironmentPicker } from "@/components/workspace/environment-picker";
import { MathEditor } from "@/components/workspace/math-editor";
import { TableEditor } from "@/components/workspace/table-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { serializeCitation, type CitationDraft } from "@/lib/latex-citations";
import {
  serializeReference,
  type ReferenceDraft,
} from "@/lib/latex-cross-references";
import {
  prepareEnvironmentBody,
  serializeEnvironment,
  type EditableEnvironment,
} from "@/lib/latex-environments";
import { confirmPackageRequirements } from "@/lib/feature-packages";
import { defaultWorkspaceMode, useLensStore } from "@/stores/lens-store";
import type { TableModel } from "@/lib/latex-tables";
import type { MathNode } from "@/lib/latex-math";

interface EditorInfo {
  id: string;
  name: string;
}

const ZOOM_OPTIONS = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

interface EditorToolbarProps {
  editorView: RefObject<EditorView | null>;
  fileType?: "tex" | "bib" | "image";
  imageScale?: number;
  onImageScaleChange?: (scale: number) => void;
  cropMode?: boolean;
  onCropToggle?: () => void;
}

export function EditorToolbar({
  editorView,
  fileType = "tex",
  imageScale = 1,
  onImageScaleChange,
  cropMode,
  onCropToggle,
}: EditorToolbarProps) {
  const vimMode = useSettingsStore((s) => s.vimMode);
  const setVimMode = useSettingsStore((s) => s.setVimMode);

  const fileName = useDocumentStore((s) => {
    const activeFile = s.files.find((f) => f.id === s.activeFileId);
    return activeFile?.name ?? "main.tex";
  });
  const activeFilePath = useDocumentStore((s) => {
    const activeFile = s.files.find((f) => f.id === s.activeFileId);
    return activeFile?.relativePath;
  });
  const files = useDocumentStore((s) => s.files);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const lensExperimental = useSettingsStore((s) => s.lensExperimental);
  const workspaceModes = useLensStore((s) => s.workspaceModes);
  const setWorkspaceMode = useLensStore((s) => s.setWorkspaceMode);
  const editorMode = projectRoot
    ? (workspaceModes[projectRoot] ?? defaultWorkspaceMode(projectRoot))
    : "source";
  const lensAvailable =
    lensExperimental || defaultWorkspaceMode(projectRoot) === "lens";

  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [citationPickerOpen, setCitationPickerOpen] = useState(false);
  const [crossReferencePickerOpen, setCrossReferencePickerOpen] =
    useState(false);
  const [figurePickerOpen, setFigurePickerOpen] = useState(false);
  const [droppedFigurePath, setDroppedFigurePath] = useState<string>();
  const [environmentPickerOpen, setEnvironmentPickerOpen] = useState(false);
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [mathEditorOpen, setMathEditorOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<{
    model: TableModel;
    apply: (source: string) => void;
  }>();
  const [editingMath, setEditingMath] = useState<{
    node: MathNode;
    apply: (source: string) => void;
  }>();

  useEffect(() => {
    invoke<EditorInfo[]>("detect_editors")
      .then(setEditors)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const editTable = (event: Event) => {
      setEditingTable(
        (event as CustomEvent<NonNullable<typeof editingTable>>).detail,
      );
      setTableEditorOpen(true);
    };
    const editMath = (event: Event) => {
      setEditingMath(
        (event as CustomEvent<NonNullable<typeof editingMath>>).detail,
      );
      setMathEditorOpen(true);
    };
    window.addEventListener("edit-structured-table", editTable);
    window.addEventListener("edit-structured-math", editMath);
    return () => {
      window.removeEventListener("edit-structured-table", editTable);
      window.removeEventListener("edit-structured-math", editMath);
    };
  }, []);

  const openInEditor = useCallback(
    (editorId: string) => {
      if (!projectRoot) return;
      const view = editorView.current;
      const line = view
        ? view.state.doc.lineAt(view.state.selection.main.head).number
        : undefined;
      invoke("open_in_editor", {
        editorId,
        projectPath: projectRoot,
        filePath: activeFilePath,
        line,
      }).catch((err) => console.error("open_in_editor failed:", err));
    },
    [projectRoot, activeFilePath, editorView],
  );

  const insertText = (before: string, after: string = "") => {
    const view = editorView.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: {
        from,
        to,
        insert: before + selectedText + after,
      },
      selection: {
        anchor: from + before.length,
        head: from + before.length + selectedText.length,
      },
    });
    view.focus();
  };

  const wrapSelection = (wrapper: string) => {
    insertText(wrapper, wrapper);
  };

  const insertCitation = (citationDraft: CitationDraft) => {
    const view = editorView.current;
    if (!view) return;
    const citation = serializeCitation(citationDraft);
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: citation },
      selection: { anchor: from + citation.length },
    });
    view.focus();
  };

  const insertReference = (referenceDraft: ReferenceDraft) => {
    const view = editorView.current;
    if (!view) return;
    const reference = serializeReference(referenceDraft);
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: reference },
      selection: { anchor: from + reference.length },
    });
    view.focus();
  };

  const insertBlock = (source: string) => {
    const view = editorView.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: source },
      selection: { anchor: from + source.length },
    });
    view.focus();
  };

  const insertEnvironment = (name: EditableEnvironment, option: string) => {
    const view = editorView.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selection = view.state.sliceDoc(from, to);
    insertBlock(
      serializeEnvironment({
        name,
        option,
        body: prepareEnvironmentBody(name, selection),
      }),
    );
  };

  useEffect(() => {
    const handleAction = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (id === "insert.section") insertText("\\section{", "}");
      if (id === "insert.citation") setCitationPickerOpen(true);
      if (id === "insert.cross-reference") setCrossReferencePickerOpen(true);
      if (id === "insert.figure") setFigurePickerOpen(true);
      if (id === "insert.environment") setEnvironmentPickerOpen(true);
      if (id === "insert.equation") setMathEditorOpen(true);
      if (id === "insert.table") setTableEditorOpen(true);
    };
    window.addEventListener("editor-action", handleAction);
    return () => window.removeEventListener("editor-action", handleAction);
  });

  useEffect(() => {
    const handleDroppedFigure = (event: Event) => {
      setDroppedFigurePath(
        (event as CustomEvent<{ path: string }>).detail.path,
      );
      setFigurePickerOpen(true);
    };
    window.addEventListener("image-dropped-for-figure", handleDroppedFigure);
    return () =>
      window.removeEventListener(
        "image-dropped-for-figure",
        handleDroppedFigure,
      );
  }, []);

  const zoomIn = () => onImageScaleChange?.(Math.min(4, imageScale + 0.25));
  const zoomOut = () => onImageScaleChange?.(Math.max(0.25, imageScale - 0.25));

  if (fileType === "image") {
    return (
      <div className="flex h-[calc(36px+var(--titlebar-height))] items-center justify-between border-border border-b bg-muted/30 px-2 pt-[var(--titlebar-height)]">
        <div className="flex items-center gap-1">
          <ImageIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-muted-foreground text-sm">
            {fileName}
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={zoomOut}
            disabled={imageScale <= 0.25}
          >
            <MinusIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={zoomIn}
            disabled={imageScale >= 4}
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <Select
            value={imageScale.toString()}
            onValueChange={(v) => onImageScaleChange?.(Number(v))}
          >
            <SelectTrigger size="sm" className="h-6! w-auto text-xs">
              <SelectValue>{Math.round(imageScale * 100)}%</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ZOOM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onCropToggle && !fileName.toLowerCase().endsWith(".svg") && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                variant={cropMode ? "default" : "ghost"}
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={onCropToggle}
              >
                <CropIcon className="size-3.5" />
                Crop
              </Button>
            </>
          )}
          {editors.length === 1 && (
            <TooltipIconButton
              tooltip={`Open in ${editors[0].name}`}
              onClick={() => openInEditor(editors[0].id)}
            >
              <ExternalLinkIcon className="size-4" />
            </TooltipIconButton>
          )}
          {editors.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 p-1"
                  title="Open in Editor"
                >
                  <ExternalLinkIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {editors.map((editor) => (
                  <DropdownMenuItem
                    key={editor.id}
                    onClick={() => openInEditor(editor.id)}
                  >
                    {editor.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  }

  if (fileType === "bib") {
    return (
      <div className="flex h-[calc(36px+var(--titlebar-height))] items-center gap-2 border-border border-b bg-muted/30 px-2 pt-[var(--titlebar-height)]">
        <BookMarkedIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-muted-foreground text-sm">
          {fileName}
        </span>
        <span className="text-muted-foreground/70 text-xs">
          Click a citation key or press Alt+Enter to edit its fields
        </span>
        <div data-tauri-drag-region className="flex-1 self-stretch" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[calc(36px+var(--titlebar-height))] items-center gap-1 border-border border-b bg-muted/30 px-2 pt-[var(--titlebar-height)]">
        <FileTextIcon className="size-4 text-muted-foreground" />
        <span className="mr-2 font-medium text-muted-foreground text-sm">
          {fileName}
        </span>
        <div className="mx-2 h-4 w-px bg-border" />
        <TooltipIconButton
          tooltip="Bold (\\textbf)"
          onClick={() => insertText("\\textbf{", "}")}
        >
          <BoldIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Italic (\\textit)"
          onClick={() => insertText("\\textit{", "}")}
        >
          <ItalicIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Code (\\texttt)"
          onClick={() => insertText("\\texttt{", "}")}
        >
          <CodeIcon className="size-4" />
        </TooltipIconButton>
        <div className="mx-2 h-4 w-px bg-border" />
        <TooltipIconButton
          tooltip="Section"
          onClick={() => insertText("\\section{", "}")}
        >
          <Heading1Icon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Subsection"
          onClick={() => insertText("\\subsection{", "}")}
        >
          <Heading2Icon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="List item"
          onClick={() => insertText("\\item ")}
        >
          <ListIcon className="size-4" />
        </TooltipIconButton>
        <div className="mx-2 h-4 w-px bg-border" />
        <TooltipIconButton
          tooltip="Inline math ($...$)"
          onClick={() => wrapSelection("$")}
        >
          <FunctionSquareIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Display math (\\[...\\])"
          onClick={() => insertText("\\[\n  ", "\n\\]")}
        >
          <span className="font-mono text-xs">∫</span>
        </TooltipIconButton>
        <div className="mx-2 h-4 w-px bg-border" />
        <TooltipIconButton
          tooltip="Citation picker"
          onClick={() => setCitationPickerOpen(true)}
        >
          <BookMarkedIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Cross-reference picker"
          onClick={() => setCrossReferencePickerOpen(true)}
        >
          <Link2Icon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Insert figure"
          onClick={() => setFigurePickerOpen(true)}
        >
          <ImagePlusIcon className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Insert structure"
          onClick={() => setEnvironmentPickerOpen(true)}
        >
          <BoxesIcon className="size-4" />
        </TooltipIconButton>
        <div className="mx-2 h-4 w-px bg-border" />
        {lensAvailable && projectRoot && (
          <div
            className="flex rounded border p-0.5"
            role="group"
            aria-label="Editor mode"
          >
            <Button
              variant={editorMode === "source" ? "secondary" : "ghost"}
              size="sm"
              className="h-5 px-2 text-[10px]"
              onClick={() => setWorkspaceMode(projectRoot, "source")}
            >
              Source
            </Button>
            <Button
              variant={editorMode === "lens" ? "secondary" : "ghost"}
              size="sm"
              className="h-5 px-2 text-[10px]"
              onClick={() => setWorkspaceMode(projectRoot, "lens")}
            >
              Lens
            </Button>
          </div>
        )}
        <Button
          variant={vimMode ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 font-mono text-xs"
          onClick={() => setVimMode(!vimMode)}
          title="Toggle Vim mode"
        >
          VIM
        </Button>
        <div data-tauri-drag-region className="flex-1 self-stretch" />
        {editors.length === 1 && (
          <TooltipIconButton
            tooltip={`Open in ${editors[0].name}`}
            onClick={() => openInEditor(editors[0].id)}
          >
            <ExternalLinkIcon className="size-4" />
          </TooltipIconButton>
        )}
        {editors.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 p-1"
                title="Open in Editor"
              >
                <ExternalLinkIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {editors.map((editor) => (
                <DropdownMenuItem
                  key={editor.id}
                  onClick={() => openInEditor(editor.id)}
                >
                  {editor.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <CitationPicker
        open={citationPickerOpen}
        onOpenChange={setCitationPickerOpen}
        files={files}
        onInsert={insertCitation}
      />
      <CrossReferencePicker
        open={crossReferencePickerOpen}
        onOpenChange={setCrossReferencePickerOpen}
        files={files}
        onInsert={insertReference}
      />
      <FigurePicker
        open={figurePickerOpen}
        onOpenChange={setFigurePickerOpen}
        files={files}
        initialPath={droppedFigurePath}
        onInsert={(source) => {
          void confirmPackageRequirements(["figures"]).then((confirmed) => {
            if (confirmed) insertBlock(source);
          });
        }}
      />
      <EnvironmentPicker
        open={environmentPickerOpen}
        onOpenChange={setEnvironmentPickerOpen}
        onInsert={insertEnvironment}
      />
      <TableEditor
        open={tableEditorOpen}
        onOpenChange={(next) => {
          setTableEditorOpen(next);
          if (!next) setEditingTable(undefined);
        }}
        initialModel={editingTable?.model}
        onInsert={(source) =>
          editingTable ? editingTable.apply(source) : insertBlock(source)
        }
      />
      <MathEditor
        open={mathEditorOpen}
        onOpenChange={(next) => {
          setMathEditorOpen(next);
          if (!next) setEditingMath(undefined);
        }}
        initialKind={editingMath?.node.kind}
        initialBody={editingMath?.node.body}
        onInsert={(source) =>
          editingMath ? editingMath.apply(source) : insertBlock(source)
        }
      />
    </>
  );
}
