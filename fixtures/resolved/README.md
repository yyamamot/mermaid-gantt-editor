# Resolved Fixtures

`Semantic AST -> Resolved Model` の fixture を置く。

- `source.mmd`
  - standalone Mermaid Gantt source
- `expect.resolved.json`
  - `resolveGanttDocument(parseGanttLossless(source))` の golden

実行対象は [resolved-manifest.json](/Users/yusuke/tools/mermaid-gantt/fixtures/resolved-manifest.json) の `required` を gate とする。
