# Changelog

## [Unreleased]

### Added

- Command palette (`⌘K` / `Ctrl+K`) for compiling, toggling panels, switching files, changing theme, and opening settings.
- Editor status bar showing compile status, error/warning counts, active file, word count, and compiler backend.
- Unified Settings dialog (appearance, editor, AI provider, Python environment), reachable from the launch screen and the workspace activity rail.

### Changed

- AI is now clearly peripheral: removed the "AI-powered" framing from the launch screen and moved provider configuration into Settings.
- Renamed the internal chat surface from `claude-chat` to `ai-chat` (provider-agnostic; no behavior change).
- Migrated the project build cache from `.prism/build` to `.tectonic-editor/build` (one-time automatic migration on first compile).
- The Python (`uv`) environment is now opt-in and no longer auto-runs on project open.

### Removed

- Removed the bundled Claude Code CLI integration (install/login/session management); AI now uses the Anthropic and OpenAI API providers only.
- Removed the scientific-skills and slash-command features inherited from the `claude-prism` fork.
- Removed orphaned fork demo assets and unused platform icons.

## [1.2.0]

### Changed

- Reframed the project as TectonicEditor: an offline-first LaTeX editor with optional pluggable AI providers.
- Renamed packages and release metadata under the `@tectonic-editor` namespace.
