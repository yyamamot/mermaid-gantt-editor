# Changelog

## 0.0.4 (2026-05-10)

### Changed

- Improve Diagnostics and fallback guidance with source-safe impact, dependency summaries, related source, and clearer next steps.
- Improve Format Review with concise change summaries and compact git-style changed-line markers.
- Improve Host Compatibility guidance with profile status, warning priority, host impact, and next steps.
- Improve Format Review readability in VS Code light themes.

## 0.0.3 (2026-05-07)

### Added

- Add GUI format review actions with syntax-highlighted Mermaid Gantt source.
- Add a Task Grid format button for reviewing and applying Mermaid Gantt source formatting.
- Add Preview export actions for saving Mermaid Gantt charts as SVG or PNG.
- Add today's start date to new Task Grid tasks to avoid missing-start diagnostics.
- Remove Details source panels and expand Format Review source comparison width.

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
