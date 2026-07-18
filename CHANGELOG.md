# Changelog

## [Unreleased]

## [1.3.0] - 2026-07-18

### Added

- PDF review mode with a focused proofing layout, persistent text and point
  comments, highlights, comment resolution, and source navigation.
- Context-aware right-click menus for the editor and PDF preview, including
  bidirectional SyncTeX navigation.
- Semantic LaTeX editing tools for tables, figures, mathematics, citations,
  cross-references, environments, and bibliography entries.
- Bibliography import, document health checks, and inline citation and
  cross-reference editing.
- Project-wide search and import from LaTeX ZIP archives or public GitHub
  repositories.
- Overleaf-style Tab completion for common LaTeX commands, with automatic argument braces and navigable fields for multi-argument commands.
- Command palette (`⌘K` / `Ctrl+K`) for compiling, toggling panels, switching files, changing theme, and opening settings.
- Editor status bar showing compile status, error/warning counts, active file, word count, and compiler backend.
- Unified Settings dialog (appearance, editor, AI provider, Python environment), reachable from the launch screen and the workspace activity rail.
- Additional editor themes, resizable dialogs, structured figure and table
  forms, and a guided beginner workspace.
- Bring-your-own-key AI provider configuration, connection testing, and a
  more reliable multi-step tool-calling loop.

### Changed

- Refined the workspace around a calmer editor, activity rail, document
  outline, and optional focused PDF review surface.
- AI is now clearly peripheral: removed the "AI-powered" framing from the launch screen and moved provider configuration into Settings.
- Renamed the internal chat surface from `claude-chat` to `ai-chat` (provider-agnostic; no behavior change).
- Migrated the project build cache from `.prism/build` to `.tectonic-editor/build` (one-time automatic migration on first compile).
- The Python (`uv`) environment is now opt-in and no longer auto-runs on project open.

### Fixed

- Repaired interrupted tool-call history before sending it to OpenAI-compatible APIs such as DeepSeek, preventing 400 errors about missing `tool_call_id` results.
- Improved compile error handling, DeepSeek compatibility, and LaTeX comment
  escaping.

### Removed

- Removed the bundled Claude Code CLI integration (install/login/session management); AI now uses the Anthropic and OpenAI API providers only.
- Removed the scientific-skills and slash-command features inherited from the `claude-prism` fork.
- Removed orphaned fork demo assets and unused platform icons.

## [1.2.0]

### Changed

- Reframed the project as TectonicEditor: an offline-first LaTeX editor with optional pluggable AI providers.
- Renamed packages and release metadata under the `@tectonic-editor` namespace.
