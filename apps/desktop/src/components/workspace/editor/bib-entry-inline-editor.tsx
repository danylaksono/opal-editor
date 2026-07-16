import { useEffect, useRef, useState } from "react";
import { BookOpenIcon, XIcon } from "lucide-react";
import {
  EDITABLE_BIB_FIELDS,
  updateBibEntrySource,
  type BibEntryDraft,
  type BibEntryMatch,
  type EditableBibField,
} from "@/lib/bibtex-entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ENTRY_TYPES = [
  "article",
  "book",
  "inbook",
  "incollection",
  "inproceedings",
  "phdthesis",
  "mastersthesis",
  "techreport",
  "misc",
  "online",
];

const FIELD_LABELS: Record<EditableBibField, string> = {
  title: "Title",
  author: "Authors",
  year: "Year",
  journal: "Journal",
  booktitle: "Book or proceedings title",
  publisher: "Publisher",
  doi: "DOI",
  url: "URL",
};

interface BibEntryInlineEditorProps {
  target: BibEntryMatch;
  position: { top: number; left: number };
  onApply: (source: string) => void;
  onDismiss: () => void;
}

export function BibEntryInlineEditor({
  target,
  position,
  onApply,
  onDismiss,
}: BibEntryInlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<BibEntryDraft>({
    type: target.type,
    key: target.key,
    fields: { ...target.fields },
  });

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        editorRef.current &&
        !editorRef.current.contains(event.target as Node)
      ) {
        onDismiss();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 100);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  const setField = (name: EditableBibField, value: string) => {
    setDraft((current) => ({
      ...current,
      fields: { ...current.fields, [name]: value },
    }));
  };

  return (
    <div
      ref={editorRef}
      role="dialog"
      aria-label="Edit bibliography entry"
      className="absolute z-40 flex max-h-[calc(100%-16px)] w-[540px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={position}
    >
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <BookOpenIcon className="size-4 text-muted-foreground" />
          Edit bibliography entry
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close bibliography editor"
          onClick={onDismiss}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-3 overflow-y-auto p-3">
        <div className="grid grid-cols-[180px_1fr] gap-2">
          <div className="space-y-1 text-muted-foreground text-xs">
            <span id="bib-entry-type-label">Entry type</span>
            <Select
              value={draft.type}
              onValueChange={(type) => setDraft({ ...draft, type })}
            >
              <SelectTrigger
                aria-labelledby="bib-entry-type-label"
                className="h-8! w-full text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([draft.type, ...ENTRY_TYPES])].map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 text-muted-foreground text-xs">
            <label htmlFor="bib-entry-key">Citation key</label>
            <Input
              id="bib-entry-key"
              value={draft.key}
              onChange={(event) =>
                setDraft({ ...draft, key: event.target.value })
              }
              className="h-8 font-mono text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {EDITABLE_BIB_FIELDS.map((name) => (
            <div
              key={name}
              className={
                name === "title" || name === "author"
                  ? "col-span-2 space-y-1 text-muted-foreground text-xs"
                  : "space-y-1 text-muted-foreground text-xs"
              }
            >
              <label htmlFor={`bib-field-${name}`}>{FIELD_LABELS[name]}</label>
              <Input
                id={`bib-field-${name}`}
                value={draft.fields[name]}
                onChange={(event) => setField(name, event.target.value)}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Custom fields and formatting not shown here are preserved. Empty
          existing fields are left unchanged.
        </p>
      </div>

      <div className="flex justify-end gap-2 border-border border-t px-3 py-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!draft.key.trim()}
          onClick={() => onApply(updateBibEntrySource(target, draft))}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
