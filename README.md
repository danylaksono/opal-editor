<p align="center">
  <img src="./apps/desktop/src-tauri/icons/icon.png" width="120" height="120" alt="TectonicEditor" />
</p>

<h1 align="center">TectonicEditor</h1>

<p align="center">
  A beautiful offline-first LaTeX editor with pluggable AI.<br/>
  LaTeX + Python + 100+ scientific skills — runs on your desktop.
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.ko.md">한국어</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="./assets/demo/main.webp" alt="TectonicEditor Demo" width="800" />
</p>

<p align="center">
  <a href="https://github.com/anomalyco/tectonic-editor/releases/latest">
    <img src="https://img.shields.io/github/v/release/anomalyco/tectonic-editor?style=flat-square&label=Latest%20Release&color=green" alt="Latest Release" />
  </a>
</p>

---

TectonicEditor is a **local-first** LaTeX scientific writing workspace. It compiles documents offline
with an embedded [Tectonic](https://tectonic-typesetting.github.io/) engine (no TeX Live required),
includes a built-in Python environment via [uv](https://docs.astral.sh/uv/), and supports **optional
AI assistants** through a pluggable provider system.

AI is entirely optional — the editor works beautifully on its own. When you want AI assistance, choose
from multiple providers:

| Provider | Setup |
|---|---|
| **Anthropic API** | Set `ANTHROPIC_API_KEY` |
| **OpenAI API** | Set `OPENAI_API_KEY` (supports any OpenAI-compatible endpoint, including local models like Hermes) |
| **Claude Code CLI** | Install `claude` CLI locally |

---

## Features

### Live LaTeX Editor
CodeMirror 6 with LaTeX/BibTeX syntax highlighting, real-time error linting, find & replace (regex),
vim mode, dark/light themes, and multi-file project support with auto-save. Live PDF preview via
MuPDF with SyncTeX — click in the PDF to jump to the source line.

### Offline Compilation
Tectonic is embedded directly in the app. Packages are downloaded once on first use and cached
locally — compilation works fully offline.

### Built-in Python Environment
One-click [uv](https://docs.astral.sh/uv/) setup creates a project-level virtual environment.
Run Python scripts, generate plots, and process data without leaving the editor.

### 100+ Scientific Skills
Browse and install domain-specific skills from [K-Dense Scientific Skills](https://github.com/K-Dense-AI/claude-scientific-skills) —
curated prompts and tool configurations for bioinformatics, cheminformatics, machine learning,
clinical research, and more.

### Version History
Every save creates a snapshot in a local Git repository. Label important checkpoints, browse diffs
between any two snapshots, and restore previous versions.

### Smart AI Context
When using AI, choose your **scope** (selection, current file, chapter, preamble, bibliography,
or full project) and **action** (chat, proofread, fix, complete, explain). The AI only receives
what you want it to see.

### More
- **Zotero Integration** — OAuth-based bibliography management and citation insertion
- **Capture & Ask** — `Cmd+X` to capture PDF regions and ask AI about them
- **Slash Commands** — Built-in (`/review`, `/init`) + custom commands
- **Template Gallery** — Quick-start templates: paper, thesis, presentation, poster, letter
- **External Editors** — Open projects in Cursor, VS Code, Zed, or Sublime Text

---

## Installation

Download the latest build from [GitHub Releases](https://github.com/anomalyco/tectonic-editor/releases).

## Development

```bash
# Prerequisites: pnpm, Rust toolchain, system deps for Tectonic
# macOS:   brew install icu4c harfbuzz pkg-config
# Linux:   apt install libicu-dev libgraphite2-dev libharfbuzz-dev libfreetype-dev libfontconfig-dev

pnpm install
pnpm dev:desktop        # Start Vite + Tauri in dev mode
pnpm build:desktop      # Production build
pnpm lint               # Run Biome linter
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing,
and guidelines.

## Architecture

TectonicEditor uses a **pluggable AI provider** system. Each provider implements the `AiProvider`
trait (Rust) / `AiClient` interface (TypeScript). New providers can be added without touching
core editor code.

See `apps/desktop/src-tauri/src/ai/` for the Rust provider API and
`apps/desktop/src/lib/ai/` for the TypeScript types.

## Acknowledgments

Originally forked from [Open Prism](https://github.com/assistant-ui/open-prism) by
[assistant-ui](https://github.com/assistant-ui).

## License

[MIT](./LICENSE)
