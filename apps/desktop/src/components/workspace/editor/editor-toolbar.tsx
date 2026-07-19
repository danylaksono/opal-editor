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
  ChevronDownIcon,
  MoreHorizontalIcon,
  MousePointerClickIcon,
  RadicalIcon,
  SigmaIcon,
  Table2Icon,
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
  DropdownMenuSeparator,
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
  const inlineEditorsOnClick = useSettingsStore((s) => s.inlineEditorsOnClick);
  const setInlineEditorsOnClick = useSettingsStore(
    (s) => s.setInlineEditorsOnClick,
  );
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
      const detail = (event as CustomEvent<{ id: string; text?: string }>)
        .detail;
      const id = detail?.id;
      if (id === "insert.snippet" && detail?.text) insertText(detail.text);
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
      <div className="calm-toolbar @container flex h-[calc(44px+var(--titlebar-height))] items-center gap-1.5 border-border border-b px-2.5 pt-[var(--titlebar-height)]">
        <div className="flex min-w-0 items-center gap-2 pr-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileTextIcon className="size-3.5" />
          </div>
          <div className="@[42rem]:flex hidden min-w-0 flex-col leading-none">
            <span className="max-w-32 truncate font-medium text-xs">
              {fileName}
            </span>
            <span className="mt-1 text-[9px] text-muted-foreground">
              LaTeX source
            </span>
          </div>
        </div>
        {lensAvailable && projectRoot && (
          <div
            className="mr-1 flex rounded-lg border bg-background/60 p-0.5 shadow-xs"
            role="group"
            aria-label="Editor mode"
          >
            <Button
              variant={editorMode === "source" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 rounded-md px-2 text-[10px]"
              onClick={() => setWorkspaceMode(projectRoot, "source")}
            >
              Source
            </Button>
            <Button
              variant={editorMode === "lens" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 rounded-md px-2 text-[10px]"
              onClick={() => setWorkspaceMode(projectRoot, "lens")}
            >
              Lens
            </Button>
          </div>
        )}

        <div className="mx-0.5 h-5 w-px bg-border/80" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="calm-toolbar-action"
              aria-label="Insert document structure"
            >
              <BoxesIcon className="size-3.5" />
              <span className="@[34rem]:inline hidden">Structure</span>
              <ChevronDownIcon className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => insertText("\\section{", "}")}>
              <Heading1Icon className="size-4" />
              Section
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertText("\\subsection{", "}")}>
              <Heading2Icon className="size-4" />
              Subsection
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertText("\\item ")}>
              <ListIcon className="size-4" />
              List item
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEnvironmentPickerOpen(true)}>
              <BoxesIcon className="size-4" />
              More structures…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          className="calm-toolbar-action"
          onClick={() => setCitationPickerOpen(true)}
        >
          <BookMarkedIcon className="size-3.5" />
          <span className="@[34rem]:inline hidden">Cite</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="calm-toolbar-action"
          onClick={() => setFigurePickerOpen(true)}
        >
          <ImagePlusIcon className="size-3.5" />
          <span className="@[34rem]:inline hidden">Figure</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="calm-toolbar-action"
          onClick={() => setTableEditorOpen(true)}
        >
          <Table2Icon className="size-3.5" />
          <span className="@[34rem]:inline hidden">Table</span>
        </Button>

        <div className="mx-0.5 h-5 w-px bg-border/80" />
        <Button
          variant={inlineEditorsOnClick ? "secondary" : "ghost"}
          size="sm"
          className="calm-toolbar-action"
          onClick={() => setInlineEditorsOnClick(!inlineEditorsOnClick)}
          aria-pressed={inlineEditorsOnClick}
          title={
            inlineEditorsOnClick
              ? "Interactive editing is on: clicking a table, citation, figure, or equation opens its editor. Click to switch to source-only editing (Alt+Enter still opens editors)."
              : "Source-only editing: clicks just place the cursor. Press Alt+Enter to open the editor for the element at the cursor. Click to re-enable interactive editing."
          }
        >
          <MousePointerClickIcon
            className={
              inlineEditorsOnClick ? "size-3.5" : "size-3.5 opacity-45"
            }
          />
          <span className="@[42rem]:inline hidden">
            {inlineEditorsOnClick ? "Interactive" : "Source only"}
          </span>
        </Button>

        <Button
          variant={vimMode ? "default" : "ghost"}
          size="sm"
          className="hidden h-6 px-2 font-mono text-xs"
          onClick={() => setVimMode(!vimMode)}
          title="Toggle Vim mode"
        >
          VIM
        </Button>
        <div data-tauri-drag-region className="flex-1 self-stretch" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="calm-toolbar-action"
              aria-label="More editor actions"
            >
              <MoreHorizontalIcon className="size-4" />
              <span className="@[48rem]:inline hidden">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => insertText("\\textbf{", "}")}>
              <BoldIcon className="size-4" />
              Bold
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                \textbf
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertText("\\textit{", "}")}>
              <ItalicIcon className="size-4" />
              Italic
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                \textit
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertText("\\texttt{", "}")}>
              <CodeIcon className="size-4" />
              Code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setMathEditorOpen(true)}>
              <SigmaIcon className="size-4" />
              Equation…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => wrapSelection("$")}>
              <FunctionSquareIcon className="size-4" />
              Inline math
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertText("\\[\n  ", "\n\\]")}>
              <RadicalIcon className="size-4" />
              Display math
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCrossReferencePickerOpen(true)}>
              <Link2Icon className="size-4" />
              Cross-reference
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setVimMode(!vimMode)}>
              <CodeIcon className="size-4" />
              Vim mode
              <span className="ml-auto text-[10px] text-muted-foreground">
                {vimMode ? "On" : "Off"}
              </span>
            </DropdownMenuItem>
            {editors.length > 0 && <DropdownMenuSeparator />}
            {editors.map((editor) => (
              <DropdownMenuItem
                key={editor.id}
                onClick={() => openInEditor(editor.id)}
              >
                <ExternalLinkIcon className="size-4" />
                Open in {editor.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
