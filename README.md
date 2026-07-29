# 特定技能1号 飲食料品製造業 学習アプリ

飲食料品製造業分野 特定技能1号評価試験の学習アプリ。
出典テキスト：OTAFF『飲食料品製造業 特定技能1号評価試験 学習用テキスト 第5.1版』（2026年4月）

- 問題 **154問**（学科105 / 実技49）・用語カード **110語**・安全標識 **17種**
- 全漢字にルビ、英訳の表示切替
- 本番形式の模擬試験（70分・40問・3択・150点満点・98点で合格）
- 学習記録を GAS 経由で Google スプレッドシートに集約
- PWA：ホーム画面に追加でき、**オフラインでも動く**

## 試験の形式（2026年度）

| 項目 | 内容 |
|---|---|
| 方式 | CBT（国内はマークシートの回もあり） |
| 時間 | 70分 |
| 問題数 | 40問（学科30＋実技10） |
| 形式 | 3択 |
| 配点 | 150点（学科100＋実技50） |
| 合格 | 98点以上（65%） |
| 再受験 | 前回受験日の翌日から45日 |

## 構成

```
index.html               アプリ本体（ビルド成果物・単一ファイル）
manifest.webmanifest     PWA設定
sw.js                    Service Worker（オフライン対応）
icon-*.png               アイコン
.nojekyll                GitHub Pages の Jekyll 処理を止める
gas/Code.gs              スプレッドシート側のスクリプト
src/                     編集元（template.html / data_*.json / build.py）
test/                    Playwright の動作確認
```

**`index.html` は直接編集しません。** `src/` を直して `npm run build` します。

## コマンド

```bash
npm install     # 初回のみ（Playwright）
npm run build   # src/ から index.html を作り直す
npm test        # 27項目の動作確認
npm run serve   # ローカル確認 http://localhost:8898
```

`npm run build` はデータ検証（選択肢が3つか、answer が範囲内か、ルビ記法が
壊れていないか）を行い、問題があればビルドを止めます。
`sw.js` の `VERSION` も内容ハッシュから自動更新されるので、
更新時にキャッシュが残る事故は起きません。

## 公開先（設定ずみ）

https://jshangqian-afk.github.io/tokutei-ginou-study/

リポジトリ `jshangqian-afk/tokutei-ginou-study` の `main` / `/ (root)` を
GitHub Pages で配信しています。push すればそのまま反映されます。

### 更新するとき

```bash
# src/data_*.json や src/template.html を編集して
npm run build && npm test
git add -A && git commit -m "..." && git push
```

スタッフ側はアプリを開き直すと新しい版になります。

## 記録の集約（GAS）

`gas/Code.gs` をスプレッドシートの Apps Script に貼り、`setup` を実行してから
ウェブアプリとしてデプロイし、発行された URL を `src/template.html` の

```js
const GAS_URL = "";
```

（205行目あたり）に貼って `npm run build` します。
**`index.html` を直接書きかえてはいけません**（Service Worker の VERSION がズレて
古いキャッシュが残ります）。詳細は `セットアップ手順.md` を参照。

### スプレッドシート側

| シート | 内容 |
|---|---|
| `学習者サマリー` | 人ごとの のべ回答数・正答率・学習日数・最終学習日・最新模試 |
| `分野別サマリー` | 人 × 分野の正答率（苦手な順・65%未満は赤） |
| `回答ログ` | 1問ずつの生ログ |
| `模試結果` | 模擬試験の履歴 |

メニュー「学習記録 → サマリーを更新」で再集計。

## 動作確認済み

Chromium（Playwright）で以下を検証：

- 全画面の描画・章別演習・模擬試験の採点（学科100点＋実技50点の配点計算）
- 記録の永続化（リロード後も保持）
- GAS へのモック送信（送信・キュー保持・再送）
- オフライン時にアプリが起動すること
