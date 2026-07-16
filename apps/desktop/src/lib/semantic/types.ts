import type { Completion } from "@codemirror/autocomplete";

export type SemanticObjectKind =
  | "citation"
  | "reference"
  | "label"
  | "figure"
  | "environment"
  | "bibliography-entry"
  | "package"
  | "command"
  | "asset";

export interface SemanticRange {
  from: number;
  to: number;
}

export interface SemanticObject<T = unknown> extends SemanticRange {
  id: string;
  kind: SemanticObjectKind;
  fileId: string;
  label: string;
  detail?: string;
  data: T;
}

export interface SemanticDiagnostic extends SemanticRange {
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
}

export interface SemanticScanContext {
  fileId: string;
  fileName: string;
  content: string;
  generation: number;
}

export interface SemanticScanResult {
  objects: SemanticObject[];
  diagnostics: SemanticDiagnostic[];
}

export interface SemanticProvider<T extends SemanticObject = SemanticObject> {
  id: string;
  supports(fileName: string): boolean;
  scan(context: SemanticScanContext): SemanticScanResult;
  findAt?(objects: T[], position: number): T | null;
  completions?(objects: T[], query: string): Completion[];
}

export interface FileSemanticSnapshot {
  fileId: string;
  generation: number;
  objects: SemanticObject[];
  diagnostics: SemanticDiagnostic[];
  indexedAt: number;
}
