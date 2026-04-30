# Changelog

## 0.0.2 (2026-04-30)

### Fixed

- Convert duration-only tasks to start-and-duration schedules when setting a start date.
- Preserve task duration when replacing an absolute start date with dependency metadata.

## 0.0.1

- First release of Mermaid Gantt Editor, a VS Code extension for editing Mermaid Gantt charts directly from Markdown and `.mmd` files.
- Initial VS Code Task Grid editor for Mermaid Gantt diagrams
- Lossless AST parser, semantic projection, resolved model, and diagnostics
- Safe quick fixes for date format, duplicate IDs, keyword-like labels, and undefined dependencies
- Standalone and Markdown fenced block-local write-back
- Mermaid preview with runtime JSONL telemetry
- Headless harness, VS Code host integration tests, and opt-in nightly visual artifacts
