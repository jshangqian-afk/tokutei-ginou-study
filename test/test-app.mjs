/**
 * 特定技能1号 学習アプリ — 動作確認
 *
 *   $ npm install          （初回のみ / playwright を入れる）
 *   $ npm test
 *
 * 検証すること：
 *   1. 全画面が描画され、コンソールエラーが出ない
 *   2. 章別演習の採点とフィードバック
 *   3. 模擬試験を40問通して採点結果が出る（学科100点＋実技50点の配点）
 *   4. リロード後も記録が残る
 *   5. モックのGASサーバーに正しい形のレコードが届く
 *   6. オフラインでアプリが起動し、回答がキューに残り、再接続で送信される
 *
 * ※ このコンテナには Chromium が入っているので `playwright install` は実行しない。
 *    別環境で動かす場合は CHROME_PATH を指定するか、この定数を消す。
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra); }
};

/* ---------- モックの GAS 受信サーバー ---------- */
const received = [];
const api = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      const j = JSON.parse(b);
      received.push(...j.rows.map((r) => ({ user: j.user, dev: j.dev, ...r })));
      res.end(JSON.stringify({ ok: true, saved: j.rows.length }));
    } else {
      res.end(JSON.stringify({ ok: true, ping: 'ok' }));
    }
  });
});

/* ---------- リポジトリを配信 ---------- */
const web = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.statusCode = 404; res.end('not found'); return; }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});

await new Promise((r) => api.listen(8899, r));
await new Promise((r) => web.listen(8898, r));

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'allow'
});
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
page.on('dialog', async (d) => {
  if (d.type() === 'prompt') await d.accept('http://localhost:8899/exec');
  else await d.accept();
});

const shot = (n) => page.screenshot({ path: path.join(ROOT, 'test', '_' + n + '.png'), fullPage: true });

/* ============ 1. 起動と初期設定 ============ */
console.log('\n[1] 起動 / 初期設定');
await page.goto('http://localhost:8898/');
await page.waitForTimeout(500);
ok('初回はなまえ入力が出る', await page.isVisible('#nameIn'));
await page.fill('#nameIn', 'テスト太郎');
await page.click('[data-act="savename"]');
await page.waitForTimeout(300);
ok('ホームに遷移する', await page.isVisible('text=今日の10問をはじめる'));
const qCount = await page.evaluate(() => DATA.questions.length);
ok('問題データが読める（154問）', qCount === 154, '→ ' + qCount);

/* ============ 2. 送信先の設定 ============ */
console.log('\n[2] 送信先の設定');
await page.click('nav button[data-v="stats"]'); await page.waitForTimeout(200);
await page.click('[data-act="seturl"]'); await page.waitForTimeout(900);
ok('URL設定後に「送信ずみ」になる', await page.isVisible('text=送信ずみ'));

/* ============ 3. 章別演習 ============ */
console.log('\n[3] 章別演習');
await page.click('nav button[data-v="home"]'); await page.waitForTimeout(200);
await page.click('text=今日の10問をはじめる'); await page.waitForTimeout(300);
ok('選択肢が3つ出る', (await page.$$('.opt')).length === 3);
await page.click('.opt >> nth=0'); await page.waitForTimeout(250);
ok('回答するとかいせつが出る', (await page.$('.fb')) !== null);
await shot('drill');
for (let i = 0; i < 10; i++) {
  const n = await page.$('[data-act="next"]'); if (n) { await n.click(); await page.waitForTimeout(120); }
  const o = await page.$('.opt'); if (o) { await o.click(); await page.waitForTimeout(120); }
}
const n2 = await page.$('[data-act="next"]'); if (n2) { await n2.click(); await page.waitForTimeout(400); }
ok('けっか画面が出る', (await page.$('.score')) !== null);

/* ============ 4. 模擬試験 ============ */
console.log('\n[4] 模擬試験');
await page.click('nav button[data-v="mock"]'); await page.waitForTimeout(200);
await page.click('[data-act="startmock"]'); await page.waitForTimeout(900);
ok('40問構成になっている', (await page.textContent('.qbar')).includes('/ 40'));
ok('タイマーが動く', (await page.textContent('#timer')).startsWith('69:'));
ok('模試中はかいせつが出ない', (await page.$('.fb')) === null);
for (let i = 0; i < 40; i++) {
  const o = await page.$$('.opt'); if (o.length) await o[i % 3].click();
  await page.waitForTimeout(50);
  const nx = await page.$('[data-act="next"]'); if (!nx) break;
  await nx.click(); await page.waitForTimeout(50);
}
const sub = await page.$('[data-act="submit"]'); if (sub) { await sub.click(); await page.waitForTimeout(700); }
const ptTxt = await page.textContent('.score .pt');
const pt = parseInt(ptTxt, 10);
ok('得点が0〜150で出る', pt >= 0 && pt <= 150, '→ ' + ptTxt.trim());
ok('章ごとの内訳が出る', (await page.$$('.bar')).length > 0);
await shot('mock-result');

/* ============ 5. 記録の永続化 ============ */
console.log('\n[5] 記録の永続化');
await page.waitForTimeout(4500);
const before = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tk1_v1')).ans).length);
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(600);
const after = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tk1_v1')).ans).length);
ok('リロード後も記録が残る', after === before && after > 0, `${before} → ${after}`);
ok('なまえも残る', (await page.evaluate(() => JSON.parse(localStorage.getItem('tk1_v1')).user)) === 'テスト太郎');

/* ============ 6. 送信レコードの形 ============ */
console.log('\n[6] 送信レコード');
ok('レコードが届いている', received.length > 0, '→ ' + received.length + '件');
const ans = received.find((r) => r.kind === 'ans');
const mock = received.find((r) => r.kind === 'mock');
ok('回答レコードの項目がそろっている',
  ans && ans.user && ans.dev && ans.qid && ans.ch && ans.topic && ans.type &&
  (ans.ok === 0 || ans.ok === 1) && ans.mode && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(ans.t),
  JSON.stringify(ans));
ok('日時が文字列（Asia/Tokyo形式）', ans && typeof ans.t === 'string');
ok('模試レコードが届いている', !!mock, JSON.stringify(mock));

/* ============ 7. PWA / オフライン ============ */
console.log('\n[7] PWA / オフライン');
const swOK = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length > 0);
ok('Service Worker が登録される', swOK);
const mf = await page.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()));
ok('manifest が読める', mf && mf.icons.length === 3);

await ctx.setOffline(true);
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => errs.push('OFFLINE RELOAD: ' + e.message));
await page.waitForTimeout(900);
const offQ = await page.evaluate(() => (typeof DATA !== 'undefined' ? DATA.questions.length : -1));
ok('オフラインでも起動して問題が読める', offQ === 154, '→ ' + offQ);
await shot('offline');

await page.click('nav button[data-v="home"]'); await page.waitForTimeout(200);
await page.click('text=今日の10問をはじめる'); await page.waitForTimeout(300);
for (let i = 0; i < 3; i++) {
  const o = await page.$$('.opt'); if (o.length) await o[i % 3].click(); await page.waitForTimeout(100);
  const n = await page.$('[data-act="next"]'); if (n) await n.click(); await page.waitForTimeout(100);
}
await page.waitForTimeout(4500);
const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('tk1_v1')).queue.length);
ok('オフライン中の回答がキューに残る', queued === 3, '→ ' + queued);

await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.waitForTimeout(2500);
const drained = await page.evaluate(() => JSON.parse(localStorage.getItem('tk1_v1')).queue.length);
ok('再接続でキューが送信される', drained === 0, '→ ' + drained);

/* ============ 8. その他の画面 ============ */
console.log('\n[8] その他の画面');
for (const [v, needle] of [['drill', '章から'], ['terms', '用語カード'], ['stats', '学習の記録']]) {
  await page.click(`nav button[data-v="${v}"]`); await page.waitForTimeout(300);
  ok(`${v} 画面が描画される`, (await page.content()).includes(needle));
}
await page.click('.fcard').catch(() => {});
await page.click('nav button[data-v="terms"]'); await page.waitForTimeout(200);
await page.click('.fcard'); await page.waitForTimeout(200);
ok('用語カードがめくれる', (await page.$('.fcard .def')) !== null);

/* ---------- 結果 ---------- */
// オフライン検証中に出る GAS への接続失敗は想定内なので除外する
const real = errs.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED') && !e.includes('Failed to fetch'));
console.log('\n' + '='.repeat(46));
console.log(`  合格 ${pass} / 失敗 ${fail}`);
console.log(`  コンソールエラー: ${real.length ? '\n    ' + real.join('\n    ') : 'なし'}`);
console.log('='.repeat(46) + '\n');

await browser.close(); api.close(); web.close();
process.exit(fail === 0 && real.length === 0 ? 0 : 1);
