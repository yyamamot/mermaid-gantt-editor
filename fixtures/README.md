# Fixtures

このディレクトリは lossless / semantic / diagnostics / malformed fixture の正本を置く。

- `lossless/`
  - Lossless AST contract と no-op write-back 用 fixture
- `semantic/`
  - `Lossless AST -> Semantic AST` 投影用 fixture
- `diagnostics/`
  - v1 初期 diagnostics / guidance 用 fixture seed
- `resolved/`
  - `Semantic AST -> Resolved Model` 用 fixture
- `emit/`
  - normalized emit / lossless write-back 用 fixture
- `malformed/`
  - recovery policy 用 fixture

## Manifests

- `lossless-manifest.json`
  - lossless integration gate の required / planned fixture
- `diagnostics-manifest.json`
  - resolver / diagnostics 実装前に固定する required diagnostics fixture
- `semantic-manifest.json`
  - semantic projection integration gate の required / planned fixture
- `resolved-manifest.json`
  - resolved model integration gate の required / planned fixture
- `emit-manifest.json`
  - normalized emit integration gate の required / planned fixture
