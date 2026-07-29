# CLAUDE.md — 特定技能1号 学習アプリ

このリポジトリで作業するときの前提と、踏んではいけない地雷。

## このプロジェクトは何か

飲食料品製造業 特定技能1号評価試験の学習アプリ。ネパール出身のスタッフが
スマホで毎日学習し、その記録が Google スプレッドシートに集まる。

出典は OTAFF『学習用テキスト 第5.1版』（2026年4月）。
**問題文・解説はこのテキストに書かれている事実のみから作ること。**
数値（温度・時間・高さ・品目数）を推測で書かない。テキストに無い論点を足さない。

## アーキテクチャ

```
src/data_*.json（問題・用語）┐
src/template.html            ┴→ src/build.py → index.html（単一ファイル）
                                                  ↓ fetch POST
                                       gas/Code.gs → スプレッドシート
```

- **`index.html` はビルド成果物。直接編集しない。**
  `src/template.html`（UI・ロジック）と `src/data_*.json`（問題）を直し、`npm run build` を実行する
- データ・CSS・JS はすべて `index.html` に内包。外部依存ゼロ（CDNも使わない）

## ファイル構成

```
index.html               ← ビルド成果物（編集しない）
sw.js                    Service Worker（VERSION は build.py が自動で更新）
manifest.webmanifest / icon-*.png / apple-touch-icon.png
.nojekyll
gas/Code.gs              スプレッドシート側（ここは直接編集してよい）
src/template.html        UI・ロジックの編集元
src/data_A〜E.json       問題・用語・標識データ
src/build.py             ビルド（データ検証つき）
src/icons.py             アイコン生成
test/test-app.mjs        Playwright の動作確認
```

## コマンド

```bash
npm run build   # index.html を作り直す（データ検証 → sw.js の VERSION 更新まで自動）
npm test        # アプリ27項目 + GAS33項目を検証
npm run test:app  # アプリだけ（Playwright）
npm run test:gas  # GASだけ（SpreadsheetApp のスタブ上で Code.gs を実行）
npm run icons   # アイコンを作り直す（普段は不要）
npm run serve   # ローカルで確認（http://localhost:8898）
```

`npm run build` はデータの検証も行い、選択肢が3つでない・answer が範囲外・
ルビ記法の括弧が閉じていない、などがあれば**ビルドを止める**。

## 守るべき規約

### 日時
- **Date オブジェクトを保存しない。文字列だけ。** 形式は `YYYY-MM-DD HH:mm:ss`
- タイムスタンプは**アプリ側（JS）で Asia/Tokyo として生成**し、GAS はそれをそのまま書くだけ
- GAS 側で `new Date()` を使ってセルに入れない（スプレッドシートのロケール差でズレる）

### スプレッドシート
- **列はヘッダー名で引く。** 列番号を直書きしない（`appendRows` が実際のヘッダー行を読んで並べ替えている）
- **集計値を保存しない。** サマリーは毎回 `回答ログ` から作り直す（`refreshSummary`）

### 通信
- 送信は `Content-Type: text/plain` の POST。**JSON にすると CORS プリフライトが発生して GAS が 405 を返す**
- GAS 側は `LockService` で排他。複数端末からの同時送信がある
- **オフライン優先**：記録はまず localStorage、そのあと送信。送信失敗時はキューに残して再送する。送信できないことを理由に学習を止めない

### ストレージ
- `localStorage` は必ず try/catch で包む。プライベートモードや埋め込み環境で例外が出る。落ちたらメモリ上のフォールバックに切り替える（`load` / `save` 参照）
- 保存キーは `tk1_v1`。構造を変えるならキーもバージョンを上げる

### Service Worker
- `sw.js` の `VERSION` は `index.html` の内容ハッシュから **build.py が自動で書きかえる**。手で直さない。
  **逆に、`index.html` を手編集すると VERSION がズレて古いキャッシュが残る**（＝直接編集してはいけない理由のひとつ）
- SW は**同一オリジンの GET だけ**を処理する。GAS へのリクエストに触らせない（触ると送信が壊れる）
- ページはネットワーク優先（更新を早く反映）、その他はキャッシュ優先

### ルビ記法
- 日本語フィールドは `{漢字|よみがな}` 形式。表示時に `<ruby>` へ変換している
- `{` `}` `|` の対応が崩れると表示が壊れる。データを編集したら必ず件数と括弧の対応を検証する

## 問題データの形

```json
{
  "id": "E01", "chapter": "第2章 食品衛生", "topic": "危害要因",
  "type": "gakka",              // gakka（学科） / jitsugi（実技）
  "q": "...", "q_en": "...",
  "choices": ["...","...","..."],   // 必ず3つ（本番が3択）
  "choices_en": ["...","...","..."],
  "answer": 0,                   // 0-2
  "explain": "...", "explain_en": "...",
  "page": 7                      // テキストのページ番号
}
```

模擬試験の配点：学科 `100/学科問題数`、実技 `50/実技問題数`、合格は98点。

## 変更するときの確認

**`npm test` を必ず通してからコミットする。**

- `test/test-app.mjs`（27項目）… 描画・採点・永続化・送信レコードの形・
  オフライン起動・再接続時の再送
- `test/test-gas.mjs`（33項目）… `gas/Code.gs` を SpreadsheetApp のスタブ上で
  実際に実行する。追記・列入れかえ耐性・集計値・べき等性・異常系。
  **Apps Script 側を直したらこちらも通す**

- Chromium は既に入っているものを `executablePath` に指定して使う。
  **`playwright install` は実行しない**。`/opt/pw-browsers/chromium` →
  macOS の Google Chrome → Chromium の順に自動で探す。
  見つからない環境なら `CHROME_PATH` 環境変数で差しかえる
- 機能を足したら、その機能のテストも `test/test-app.mjs` に足す
- 問題データを増やしたら、`npm run build` の出力で件数が想定どおりか確認する

## やりがちな間違い

| やりがち | 正しくは |
|---|---|
| `index.html` を直接編集する | `src/template.html` を編集して `npm run build` |
| `sw.js` の VERSION を手で直す | build.py が自動でやる。触らない |
| GAS 送信を `application/json` にする | `text/plain` のまま（プリフライト回避） |
| GAS 側で `new Date()` してセルに入れる | アプリが作った日時文字列をそのまま書く |
| サマリーの数値をシートに保存する | 毎回 `回答ログ` から作り直す |
| テキストに無い数値を問題に書く | 出典テキストに書かれている事実のみ |
