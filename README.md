# 本地文本工具箱 / Local Text Toolbox / ローカルテキストツールボックス

[中文](#中文) | [English](#english) | [日本語](#日本語)

A small, privacy-first browser toolbox for everyday text work — diffing, formatting, Base64 encoding, and QR code generation. Everything runs client-side; nothing you paste is ever sent to a server.

---

## 中文

### 项目简介

本地文本工具箱是一套跑在浏览器里的日常文本小工具集合——文本对照、格式化、Base64、二维码。没有后端服务，粘贴的内容不会离开你的浏览器。

### 功能

**文本对照**
- 两种视图：并排（Side by side）和内联（Inline）。
- 两种粒度："文本模式"下按单词高亮差异，"代码模式"下按字符高亮，方便发现代码里细微的改动。

**格式化（Formatter）**
- 粘贴 JSON / XML / YAML，会自动识别格式并整齐输出。
- 采用容错解析：即使输入有问题（比如少了个逗号、标签没闭合），也会尽量给出格式化结果，并在出问题的具体行、具体字符范围打上标记提示。
- 缩进可选 2 空格 / 4 空格 / 压缩（minify，支持 JSON 和 XML）。
- 结果支持一键复制，长数组/对象还可以折叠查看（Fold）。

**Base64**
- 编码/解码一键切换。
- 支持 URL 安全（使用 `-`/`_` 字符集）编码。
- 解码结果如果不是合法的 UTF-8，会给出警告提示，非法字节会显示为 `�`。

**二维码**
- 把 URL 或文本生成二维码，手机扫一扫即可打开。
- 支持下载 PNG，生成过程同样全部在浏览器内完成。

**多语言界面**
- 支持中文 / English / 日本語 共3种语言。
- 首次打开时会根据浏览器语言自动选择，之后可随时手动切换（选择会保存在本地）。
- 每个工具的标签页都会同步到 URL 路径（`/diff`、`/format`、`/base64`、`/qr`），方便加书签或分享链接。

**隐私**
- 所有处理（对照、格式化、编码、二维码生成）都在浏览器端的 JavaScript 里完成，内容不会上传到任何服务器。

### 快速开始

```bash
npm install
npm run dev       # 启动开发服务器（http://localhost:5173）
npm run build     # 先做类型检查（vue-tsc），再构建生产版本
npm run preview   # 本地预览生产构建
```

### 技术栈

- [Vue 3](https://vuejs.org/)（`<script setup>` + Composition API）+ TypeScript
- [Vite](https://vitejs.dev/) 负责开发服务器与构建
- [`diff`](https://www.npmjs.com/package/diff) 用于计算文本差异
- [`yaml`](https://www.npmjs.com/package/yaml) 用于 YAML 的解析与序列化
- [`qrcode`](https://www.npmjs.com/package/qrcode) 用于生成二维码
- JSON / XML 使用自研的容错解析器（`src/lib/jsonTolerant.ts`、`src/lib/xmlTolerant.ts`）

### 目录结构（节选）

```
src/
├── App.vue                 # 布局、标签切换、URL 路由
├── i18n.ts                 # 3种语言的文案与切换逻辑
├── components/
│   ├── TextInputs.vue      # 用于对照的两个文本输入框
│   ├── DiffView.vue        # 差异展示（并排/内联、单词/字符级）
│   ├── FormatTool.vue      # JSON/XML/YAML 格式化界面
│   ├── FoldView.vue        # 格式化结果的折叠展示
│   ├── Base64Tool.vue      # Base64 编码/解码界面
│   └── QrTool.vue          # 二维码生成界面
└── lib/
    ├── diffEngine.ts       # 差异计算逻辑
    ├── formatters.ts       # 格式识别、格式化、压缩
    ├── jsonTolerant.ts     # 容错 JSON 解析器
    ├── xmlTolerant.ts      # 容错 XML 解析器
    └── base64.ts           # Base64 编码/解码
```

---

## English

### Overview

Local Text Toolbox is a small collection of everyday text utilities — diff, format, Base64, QR code — that run entirely in the browser. Nothing you paste is ever sent to a server; there is no backend at all.

### Features

**Text diff**
- Two view modes: side-by-side and inline.
- Two granularities: word-level highlighting in "text mode", character-level highlighting in "code mode" for spotting subtle source-code changes.

**Formatter**
- Paste JSON / XML / YAML and it auto-detects the format and pretty-prints it.
- Uses a tolerant parser: even with malformed input (a missing comma, an unclosed tag, etc.) it still renders a best-effort result, with inline markers pointing at the exact line/character range of each problem.
- Indentation options: 2 spaces, 4 spaces, or minified (JSON and XML).
- One-click copy of the result, plus a collapsible fold view for long arrays/objects.

**Base64**
- Switch between encode and decode.
- URL-safe encoding (`-`/`_` alphabet) is supported.
- On decode, invalid UTF-8 output is flagged with a warning and bad bytes are rendered as `�`.

**QR code**
- Generate a QR code from a URL or text and scan it with your phone to open the link instantly.
- Downloadable as PNG. Generation happens entirely in the browser.

**Multilingual UI**
- Three languages: 中文 / English / 日本語.
- Auto-detected from the browser on first visit, switchable any time afterward (the choice is remembered locally).
- Each tool's tab is kept in sync with the URL path (`/diff`, `/format`, `/base64`, `/qr`), so links are bookmarkable and shareable.

**Privacy**
- All processing (diffing, formatting, encoding, QR generation) happens client-side in JavaScript. Nothing is uploaded anywhere.

### Getting Started

```bash
npm install
npm run dev       # start the dev server (http://localhost:5173)
npm run build     # type-check (vue-tsc) then build for production
npm run preview   # preview the production build locally
```

### Tech Stack

- [Vue 3](https://vuejs.org/) (`<script setup>` + Composition API) + TypeScript
- [Vite](https://vitejs.dev/) for dev server / build
- [`diff`](https://www.npmjs.com/package/diff) for computing text differences
- [`yaml`](https://www.npmjs.com/package/yaml) for YAML parsing/serialization
- [`qrcode`](https://www.npmjs.com/package/qrcode) for QR code generation
- Custom tolerant parsers for JSON/XML (`src/lib/jsonTolerant.ts`, `src/lib/xmlTolerant.ts`)

### Project Structure (excerpt)

```
src/
├── App.vue                 # layout, tab switching, URL routing
├── i18n.ts                 # copy for 3 languages + language-switch logic
├── components/
│   ├── TextInputs.vue      # the two text inputs being compared
│   ├── DiffView.vue        # diff rendering (side/inline, word/char)
│   ├── FormatTool.vue      # JSON/XML/YAML formatter UI
│   ├── FoldView.vue        # collapsible view of formatted output
│   ├── Base64Tool.vue      # Base64 encode/decode UI
│   └── QrTool.vue          # QR code generator UI
└── lib/
    ├── diffEngine.ts       # diff computation
    ├── formatters.ts       # format detection, formatting, minify
    ├── jsonTolerant.ts     # tolerant JSON parser
    ├── xmlTolerant.ts      # tolerant XML parser
    └── base64.ts           # Base64 encode/decode
```

---

## 日本語

### 概要

コピペしたテキストの比較・整形・エンコード・QRコード生成など、日常的なテキスト作業をブラウザだけで完結させるための小さなツール集です。サーバーへの通信は一切行わず、入力した内容は常に手元のブラウザ内にとどまります。

### 機能

**テキスト比較**
- 左右並び表示（Side by side）とインライン表示（Inline）の2種類のビューを切り替え可能。
- 「テキストモード」では単語単位、「コードモード」では文字単位で差分をハイライト。ソースコードの微妙な差分も見逃しません。

**コード整形（Formatter）**
- JSON / XML / YAML を貼り付けると自動でフォーマットを判別し、整形して表示。
- 多少壊れた入力（カンマ抜け、閉じタグ漏れなど）でも解析を諦めない寛容なパーサーを採用。エラー箇所は該当行・該当文字範囲にインラインで表示され、それ以外の部分は可能な限り整形して表示します。
- インデントは 2 スペース / 4 スペース / 圧縮（minify、JSON・XML 対応）から選択可能。
- 整形結果はワンクリックでコピー、長い配列やオブジェクトは折りたたみ表示（Fold）にも対応。

**Base64**
- テキストのエンコード / デコードを切り替えて実行。
- URL セーフ（`-`/`_` を使う形式）でのエンコードにも対応。
- デコード時、結果が UTF-8 として不正な場合は警告を表示し、不正なバイトは `�` として可視化します。

**QRコード**
- URL やテキストから QRコードを生成。スマホのカメラでスキャンすればすぐ開けます。
- PNG としてダウンロード可能。生成もブラウザ内で完結します。

**多言語 UI**
- 中文 / English / 日本語 の3言語に対応。
- 初回アクセス時はブラウザの言語設定から自動判定し、以降はいつでも手動で切り替え可能（選択内容はローカルに保存されます）。
- 各ツールのタブは URL パス（`/diff`, `/format`, `/base64`, `/qr`）と同期しているため、ブックマークや共有リンクとしても機能します。

**プライバシー**
- すべての処理（比較・整形・エンコード・QRコード生成）はブラウザ内の JavaScript で完結します。入力内容が外部サーバーに送信されることはありません。

### はじめかた

```bash
npm install
npm run dev       # 開発サーバーを起動（http://localhost:5173）
npm run build     # 型チェック（vue-tsc）の上で本番用にビルド
npm run preview   # ビルド結果をローカルでプレビュー
```

### 技術スタック

- [Vue 3](https://vuejs.org/)（`<script setup>` + Composition API）+ TypeScript
- [Vite](https://vitejs.dev/) — 開発サーバー / ビルド
- [`diff`](https://www.npmjs.com/package/diff) — テキスト差分計算
- [`yaml`](https://www.npmjs.com/package/yaml) — YAML パース／出力
- [`qrcode`](https://www.npmjs.com/package/qrcode) — QRコード生成
- JSON / XML は独自の寛容パーサー（`src/lib/jsonTolerant.ts`, `src/lib/xmlTolerant.ts`）を実装

### ディレクトリ構成（抜粋）

```
src/
├── App.vue                 # レイアウト・タブ切り替え・URLルーティング
├── i18n.ts                 # 3言語分の文言と言語切り替えロジック
├── components/
│   ├── TextInputs.vue      # 比較対象の2つのテキスト入力
│   ├── DiffView.vue        # 差分表示（Side/Inline、Word/Char）
│   ├── FormatTool.vue      # JSON/XML/YAML 整形UI
│   ├── FoldView.vue        # 整形結果の折りたたみ表示
│   ├── Base64Tool.vue      # Base64 エンコード/デコードUI
│   └── QrTool.vue          # QRコード生成UI
└── lib/
    ├── diffEngine.ts       # 差分計算ロジック
    ├── formatters.ts       # フォーマット判別・整形・minify
    ├── jsonTolerant.ts     # 寛容なJSONパーサー
    ├── xmlTolerant.ts      # 寛容なXMLパーサー
    └── base64.ts           # Base64 エンコード/デコード
```

---

## License

[MIT](./LICENSE)
