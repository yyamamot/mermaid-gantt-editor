# Semantic Fixtures

`Lossless AST -> Semantic AST` 投影の fixture を置く。

- `source.mmd`
  - standalone Mermaid Gantt source
- `expect.semantic.json`
  - `projectGanttSemantic(parseGanttLossless(source))` の golden

実行対象は [semantic-manifest.json](/Users/yusuke/tools/mermaid-gantt/fixtures/semantic-manifest.json) の `required` を gate とする。
