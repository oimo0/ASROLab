# ASRO Lab

> 思いついたら、つくってみる。

ASROの実験的なWebツールや小規模サービスを置いていく静的プラットフォーム。GitHub Pages / `lab.asro.jp` を前提にしています。

## ツール追加

`tools/_template/` をコピーして `tools/<tool-id>/` を作り、最低限 `index.html` と `tool.json` を置いてpushします。

```text
tools/my-tool/
├── index.html
├── tool.json
├── thumbnail.webp   # optional
├── style.css        # optional
└── app.js           # optional
```

`main` へのpushでGitHub Actionsが `tool.json` を収集し、`data/tools.json` を生成してPagesへデプロイします。

### status

`experimental` / `beta` / `stable` / `archived`

### tool.json example

```json
{
  "name": "ASRO Image",
  "description": "画像をブラウザ上で簡単に変換・圧縮。",
  "thumbnail": "thumbnail.webp",
  "status": "beta",
  "category": "Image",
  "tags": ["画像", "変換", "圧縮"],
  "added": "2026-09-21"
}
```
