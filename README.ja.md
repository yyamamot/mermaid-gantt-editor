# Mermaid Gantt Editor

[English](https://github.com/yyamamot/mermaid-gantt-editor/blob/main/README.md) | 日本語

## Overview

`Mermaid Gantt Editor` は、Markdown や `.mmd` に書いた Mermaid Gantt を VS Code の GUI で編集するための拡張です。

Task Grid で task label、ID、日付、期間、依存関係、タグを編集し、変更は元の Mermaid source に書き戻します。Mermaid text は repository に残るため、Pull Request でレビューでき、GitHub / GitLab / Obsidian などでも引き続き表示できます。

開発計画、リリース計画、移行作業、調査タスクなどを Markdown repo で管理しているチーム向けです。PM suite を導入するほどではないが、Mermaid Gantt を手書きだけで保守するのはつらい、という場面に向いています。

<!-- screenshot: readme-task-grid -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/mermaid-gantt-editor/main/assets/readme-task-grid.png" alt="Mermaid Gantt Editor Task Grid" width="960">
</p>

## この拡張でできること

- standalone `.mmd` Mermaid Gantt file を Gantt Editor で開く
- Markdown document 内の fenced `mermaid` Gantt block を CodeLens から開く
- task label、ID、start date、end date、duration、dependencies、tags を編集する
- section label と document settings を編集する
- section と task を追加、複製、移動、削除する
- 検索、sort、filter で大きな Gantt を確認する
- Mermaid preview を見ながら編集する
- duplicate ID や missing dependency などの diagnostics を確認する
- 安全に直せる diagnostics に quick fix を適用する
- structured editing が安全でない source は raw source fallback で編集する
- Markdown 内の対象 Mermaid block だけに変更を書き戻す

## Installation

Marketplace からインストールする場合:

1. VS Code の Extensions ビューを開く
2. `Mermaid Gantt Editor` または `mermaid-gantt-editor` を検索する
3. `Install` を押して有効化する
4. Mermaid Gantt を含む `.mmd` または Markdown file を開く

検証用には VSIX からのインストールもできます。

```sh
pnpm run package:vsix
pnpm run install:vsix
```

## Quick Start

### 1. Mermaid Gantt を用意する

`.mmd` file または Markdown fenced code block に Mermaid Gantt を書きます。

````markdown
```mermaid
gantt
title Product Plan
dateFormat YYYY-MM-DD
section Planning
API design : done, a1, 2026-05-01, 3d
設計レビュー : review, after a1, 2d
```
````

### 2. Gantt Editor を開く

Markdown では Mermaid Gantt block の上に表示される CodeLens から `Gantt Editor を開く` を選びます。

Command Palette から開く場合は次を実行します。

- `Mermaid Gantt Editor: Gantt Editor を開く`

<!-- screenshot: readme-markdown-codelens -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/mermaid-gantt-editor/main/assets/readme-markdown-codelens.png" alt="Markdown の Mermaid Gantt block 上に表示される Gantt Editor CodeLens" width="751">
</p>

### 3. Task Grid で編集する

Task Grid で label、ID、schedule、dependencies、tags を編集します。Preview は Mermaid chart を表示し、Details では選択 task や document settings を確認できます。

<!-- screenshot: readme-details -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/mermaid-gantt-editor/main/assets/readme-details.png" alt="Task details and Mermaid preview" width="960">
</p>

### 4. Diagnostics を確認する

問題がある場合は Diagnostics に表示されます。安全に直せるものは quick fix から修正できます。

<!-- screenshot: readme-diagnostics -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/mermaid-gantt-editor/main/assets/readme-diagnostics.png" alt="Diagnostics and quick fixes" width="960">
</p>

### 5. 必要なら raw source fallback を使う

未対応構文や危険な metadata がある場合、拡張は source を壊さないために structured editing を止め、raw source fallback を表示します。

<!-- screenshot: readme-fallback -->
<p align="center">
  <img src="https://raw.githubusercontent.com/yyamamot/mermaid-gantt-editor/main/assets/readme-fallback.png" alt="Raw source fallback mode" width="960">
</p>

## Features

| 機能 | できること | 補足 |
| --- | --- | --- |
| Task Grid | Gantt task を表形式で編集 | label、ID、date、duration、dependency、tag に対応 |
| Markdown block editing | fenced `mermaid` Gantt block を直接開く | 複数 block がある Markdown でも対象 block だけを書き戻す |
| Mermaid preview | 編集中の chart を確認 | bundled Mermaid runtime を使用 |
| Details | 選択 task と document settings を編集 | Inspector / Diagnostics / Source などを切り替え |
| Diagnostics | 手書き source の問題を検出 | duplicate ID、undefined dependency、date format mismatch など |
| Quick fix | 安全な修正を適用 | source range が明確なものだけを対象にする |
| Source-safe write-back | 変更範囲を絞って書き戻す | comment、directive、unknown syntax は保持する |
| Raw source fallback | 構造化編集が危険な source を保護 | 元 source を保持したまま手動編集できる |
| Host compatibility | GitHub / GitLab / Obsidian 向け注意点を表示 | host 側 Mermaid runtime との差分確認を補助 |

## 主な使い方

### Markdown から開く

Markdown の fenced `mermaid` Gantt block の上に CodeLens が表示されます。`Gantt Editor を開く` を押すと、その block だけを対象に Gantt Editor が開きます。

### `.mmd` file から開く

standalone Mermaid Gantt file を開いた状態で Command Palette から `Mermaid Gantt Editor: Gantt Editor を開く` を実行します。

### Task を編集する

Task Grid の cell を直接編集します。`after` dependency は既存 task ID から選びやすく、date / duration は Mermaid Gantt の source に戻せる形で保持されます。

### Source order を壊さず確認する

検索、sort、filter は view-only です。表示順を変えても Mermaid source の task order は変わりません。

### 安全でない source を扱う

未対応 directive、保持対象の `click` / `call`、raw metadata などがある場合は diagnostics や fallback で知らせます。拡張が安全に書き戻せない source を勝手に正規化することは避けます。

## Source-safe editing

この拡張は Mermaid source を正本として扱います。GUI の都合で無関係な text を書き換えないことを重視しています。

- 変更していない source 領域を保持する
- comments、frontmatter、directives、raw text、unknown syntax を保持する
- Markdown document では対象 Mermaid block だけを書き戻す
- view-only sort / filter では source order を変えない
- Mermaid text は Pull Request や Codex / LLM による review に使える形で残す

## Limitations

| 事項 | 補足 |
| --- | --- |
| Gantt 専用 | flowchart、sequence diagram など Mermaid 全体の GUI editor ではありません |
| PM suite ではない | resource planning、cost tracking、baseline、formal critical path management は対象外です |
| Host rendering は host 依存 | GitHub / GitLab / Obsidian はそれぞれの Mermaid runtime と security policy を使います |
| すべての Mermaid Gantt 構文を GUI 編集するわけではない | 未対応構文は保持し、必要に応じて fallback します |
| Preview は補助 | 公開先での最終表示は target host でも確認してください |

## Requirements / Compatibility

| 項目 | 内容 |
| --- | --- |
| VS Code | Desktop 版 `1.105+` |
| Mermaid runtime | Extension bundled Mermaid `11.14.0` |
| 対象 file | `.mmd` Mermaid Gantt、Markdown fenced `mermaid` Gantt block |
| Marketplace package | `README.md` / `README.ja.md` と screenshot assets を同梱 |

## Source から build する

必要なもの:

- Node.js `22+`
- pnpm `10.30.3+`
- VS Code Desktop `1.105+`

依存関係を install して extension を build します。

```sh
pnpm install
pnpm run build
```

local VSIX を作成します。

```sh
pnpm run package:vsix
```

生成した VSIX を VS Code に install します。

```sh
pnpm run install:vsix
```

主な verification gate を実行します。

```sh
pnpm run verify
```

UI 変更時の確認:

```sh
pnpm run verify:ui-change -- --scenario task-grid --id <feature-id>
```

## License

- License: [MIT](./LICENSE)
