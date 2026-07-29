/**
 * gas/Code.gs — ロジックの動作確認
 *
 *   $ npm run test:gas
 *
 * Apps Script はローカルで動かせないので、SpreadsheetApp / LockService /
 * ContentService を配列で作ったスタブに差しかえて Code.gs を評価する。
 * 検証すること：
 *   1. doPost が 回答ログ / 模試結果 に正しい形で追記する
 *   2. 列を入れかえても壊れない（ヘッダー名で引いているか）
 *   3. refreshSummary の集計値（のべ回答数・正答率・学習日数・最新模試）
 *   4. サマリーを何度更新しても条件付き書式が積み上がらない
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra); }
};

/* ============================ スタブ ============================ */

class Range {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) {
        const src = this.sheet.data[this.row - 1 + r];
        line.push(src === undefined || src[this.col - 1 + c] === undefined ? '' : src[this.col - 1 + c]);
      }
      out.push(line);
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((line, r) => {
      const y = this.row - 1 + r;
      while (this.sheet.data.length <= y) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[y][this.col - 1 + c] = v; });
    });
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat(fmt) { this.sheet.formats.push({ col: this.col, fmt }); return this; }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.formats = [];
    this.rules = [];
    this.frozen = 0;
  }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  clear() { this.data = []; this.formats = []; return this; }   // ← 条件付き書式は消えない（本物と同じ）
  setFrozenRows(n) { this.frozen = n; return this; }
  autoResizeColumns() { return this; }
  getConditionalFormatRules() { return this.rules; }
  setConditionalFormatRules(rules) { this.rules = rules; return this; }
}

class Spreadsheet {
  constructor(name) { this.name = name; this.sheets = []; }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  toast() {}
}

const ss = new Spreadsheet('特定技能1号 学習記録');
const alerts = [];
// Apps Script エディタから実行すると getUi() は
// 「Cannot call SpreadsheetApp.getUi() from this context.」で落ちる。
// 実際にそうなったので、既定ではエディタ実行を再現する
let uiAvailable = false;

const sandbox = {
  Logger: { log: () => {} },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss,
    getUi: () => {
      if (!uiAvailable) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.');
      return {
        alert: (m) => alerts.push(m),
        createMenu: () => { const m = { addItem: () => m, addToUi: () => {} }; return m; }
      };
    },
    newConditionalFormatRule: () => {
      const rule = {};
      const api = {
        whenNumberLessThan(v) { rule.lt = v; return api; },
        setBackground(b) { rule.bg = b; return api; },
        setRanges(r) { rule.ranges = r; return api; },
        build() { return rule; }
      };
      return api;
    }
  },
  LockService: {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return t; } })
  },
  JSON, String, Number, Object, Array, Math, console
};
sandbox.ContentService.createTextOutput = (t) => {
  const o = { setMimeType() { return o; }, getContent: () => t };
  return o;
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas', 'Code.gs'), 'utf8'), sandbox);

const call = (fn, ...args) => vm.runInContext(`(${fn})`, sandbox)(...args);
const post = (body) => JSON.parse(
  sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()
);
const rowsOf = (name) => {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};

/* ============================ テスト ============================ */

console.log('\n[1] 初期設定（Apps Script エディタから実行＝getUi() が使えない状況）');
let setupErr = null;
try { sandbox.setup(); } catch (e) { setupErr = e; }
ok('setup が例外を投げずに終わる', setupErr === null, String(setupErr));
ok('4つのシートができる',
  ['回答ログ', '模試結果', '学習者サマリー', '分野別サマリー'].every(n => ss.getSheetByName(n)),
  ss.sheets.map(s => s.name).join(','));
ok('回答ログにヘッダーが入る',
  ss.getSheetByName('回答ログ').getRange(1, 1, 1, 10).getValues()[0][0] === '日時');

console.log('\n[1b] 初期設定（スプレッドシートのメニューから実行＝getUi() が使える）');
{
  uiAvailable = true;
  sandbox.setup();
  ok('完了の案内がダイアログで出る', alerts.length === 1, `${alerts.length}件`);
  ok('作り直しても4シートのまま',
    ss.sheets.filter(s => ['回答ログ', '模試結果', '学習者サマリー', '分野別サマリー'].includes(s.name)).length === 4);
  uiAvailable = false;
}

console.log('\n[2] 回答の受信');
let res = post({
  user: 'ラム', dev: 'D1',
  rows: [
    { t: '2026-07-01 09:00:00', qid: 'E01', ch: '第2章 食品衛生', topic: '危害要因', type: 'gakka', ok: 1, pick: 0, mode: 'drill' },
    { t: '2026-07-01 09:01:00', qid: 'E02', ch: '第2章 食品衛生', topic: '危害要因', type: 'gakka', ok: 0, pick: 2, mode: 'drill' },
    { t: '2026-07-02 09:02:00', qid: 'J01', ch: '第4章 製造工程', topic: '計量', type: 'jitsugi', ok: 1, pick: 1, mode: 'drill' }
  ]
});
ok('ok:true / saved が件数と一致', res.ok === true && res.saved === 3, JSON.stringify(res));
let log = rowsOf('回答ログ');
ok('回答ログが3行', log.length === 3, `${log.length}行`);
ok('学習者・端末が入る', log[0]['学習者'] === 'ラム' && log[0]['端末'] === 'D1');
ok('gakka → 学科 に変換される', log[0]['種別'] === '学科');
ok('jitsugi → 実技 に変換される', log[2]['種別'] === '実技');
ok('日時が文字列のまま', typeof log[0]['日時'] === 'string' && log[0]['日時'] === '2026-07-01 09:00:00');
ok('Dateオブジェクトを保存していない',
  ss.getSheetByName('回答ログ').data.flat().every(v => !(v instanceof Date)));

console.log('\n[3] 模試の受信');
res = post({
  user: 'ラム', dev: 'D1',
  rows: [{ kind: 'mock', t: '2026-07-03 10:00:00', pt: 105, pass: '合格', g: 22, gn: 30, j: 7, jn: 10 }]
});
let mock = rowsOf('模試結果');
ok('模試結果が1行', mock.length === 1 && res.saved === 1);
ok('得点・判定が入る', mock[0]['得点'] === 105 && mock[0]['判定'] === '合格');
ok('学科/実技の内訳が入る',
  mock[0]['学科正解'] === 22 && mock[0]['学科問題数'] === 30 &&
  mock[0]['実技正解'] === 7 && mock[0]['実技問題数'] === 10);
ok('模試は回答ログに入らない', rowsOf('回答ログ').length === 3);

console.log('\n[4] 列を入れかえても壊れない');
{
  const sh = ss.getSheetByName('回答ログ');
  // 「日時」と「学習者」を入れかえる（利用者がシートを触った状況）
  sh.data.forEach(r => { const t = r[0]; r[0] = r[1]; r[1] = t; });
  post({
    user: 'ビカス', dev: 'D2',
    rows: [{ t: '2026-07-04 08:00:00', qid: 'E03', ch: '第2章 食品衛生', topic: '洗浄', type: 'gakka', ok: 1, pick: 1, mode: 'drill' }]
  });
  const after = rowsOf('回答ログ');
  const added = after[after.length - 1];
  ok('入れかえ後も 日時 が日時列に入る', added['日時'] === '2026-07-04 08:00:00', JSON.stringify(added));
  ok('入れかえ後も 学習者 が学習者列に入る', added['学習者'] === 'ビカス');
}

console.log('\n[5] サマリーの集計');
sandbox.refreshSummary();
const sum = rowsOf('学習者サマリー');
const ram = sum.find(r => r['学習者'] === 'ラム');
const bikas = sum.find(r => r['学習者'] === 'ビカス');
ok('学習者が2人ぶん出る', sum.length === 2, JSON.stringify(sum.map(r => r['学習者'])));
ok('のべ回答数が正しい（ラム3問）', ram['のべ回答数'] === 3, String(ram['のべ回答数']));
ok('正解数が正しい（ラム2問）', ram['正解数'] === 2, String(ram['正解数']));
ok('正答率が正しい（2/3）', Math.abs(ram['正答率'] - 2 / 3) < 1e-9, String(ram['正答率']));
ok('学習日数が正しい（7/1・7/2の2日）', ram['学習日数'] === 2, String(ram['学習日数']));
ok('最終学習が最新の日時', ram['最終学習'] === '2026-07-02 09:02:00', String(ram['最終学習']));
ok('最新模試の点数が出る', ram['最新模試'] === 105 && ram['模試判定'] === '合格');
ok('模試未受験の人は空欄', bikas['最新模試'] === '' && bikas['模試判定'] === '');

const topic = rowsOf('分野別サマリー');
const ramTopics = topic.filter(r => r['学習者'] === 'ラム');
ok('分野別が人×分野で出る', topic.length === 3, `${topic.length}件`);
ok('苦手な分野が先に来る', ramTopics[0]['分野'] === '危害要因' && ramTopics[0]['正答率'] === 0.5,
  JSON.stringify(ramTopics.map(r => [r['分野'], r['正答率']])));
ok('章も一緒に出る', ramTopics[0]['章'] === '第2章 食品衛生');

console.log('\n[6] 何度更新しても壊れない');
{
  const before = JSON.stringify(rowsOf('学習者サマリー'));
  sandbox.refreshSummary();
  sandbox.refreshSummary();
  ok('集計結果が変わらない（べき等）', JSON.stringify(rowsOf('学習者サマリー')) === before);
  ok('条件付き書式が積み上がらない',
    ss.getSheetByName('学習者サマリー').getConditionalFormatRules().length === 1,
    `${ss.getSheetByName('学習者サマリー').getConditionalFormatRules().length}件`);
  ok('分野別サマリーも同じ',
    ss.getSheetByName('分野別サマリー').getConditionalFormatRules().length === 1);
}

console.log('\n[7] 異常系');
{
  const res2 = JSON.parse(sandbox.doPost({ postData: { contents: 'これはJSONではない' } }).getContent());
  ok('壊れた本文は ok:false で返す（例外を投げない）', res2.ok === false, JSON.stringify(res2));
  const res3 = post({ user: '', dev: 'D9', rows: [] });
  ok('空の rows でも落ちない', res3.ok === true && res3.saved === 0);
  const ping = JSON.parse(sandbox.doGet({}).getContent());
  ok('doGet が疎通確認を返す', ping.ok === true && ping.ping === 'ok');
}

console.log('\n==============================================');
console.log(`  合格 ${pass} / 失敗 ${fail}`);
console.log('==============================================\n');
process.exit(fail ? 1 : 0);
