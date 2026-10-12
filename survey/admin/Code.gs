/**
 * ミスト部屋 ふりかえりアンケート → 管理者のスプレッドシートに匿名で記録（Google Apps Script）
 *
 * 使い方：管理者が新しく作ったスプレッドシートの「拡張機能 → Apps Script」に貼り付ける。
 * 回答は「回答」シートに1件1行で溜まり、「集計」シートに件数とグラフが自動で作られる。
 * 名前・Discordアカウント・メールアドレス・正確な送信時刻は記録しない。
 */

const CONFIG = {
  TITLE: 'ミスト部屋 ふりかえりアンケート',
  SHEET_NAME: '回答',
  DASH_SHEET: '集計',
  TEXT_SHEET: '自由記述',
  DASH_HOUR: 21,           // 集計シートを毎日自動更新する時刻（日本時間）
  MAX_TEXT: 3000,          // 自由記述1問あたりの最大文字数
  MIN_ELAPSED_MS: 5000,    // これより速い送信はボットとみなして捨てる
  COLOR: '#6E50AA',
};

// 質問の一覧（アンケート画面の id と対応）。options の順番が集計表の並び順になる
const QUESTIONS = [
  { id: 'Q1', head: 'Q1 プロジェクトの進み具合の満足度（1〜5）', options: ['1', '2', '3', '4', '5'] },
  { id: 'Q2', head: 'Q2 メタカーボン側の対応', options: ['満足している', 'おおむね満足している', '変更時の説明が足りないと感じる', '発表や回答そのものに不満がある', '予定が変わったことを知らなかった'] },
  { id: 'Q3', head: 'Q3 上場の時期とルートをどれくらい知りたいか', options: ['進み具合や根拠まで詳しく知りたい', '決まったことだけ知りたい', '大まかな目安が分かれば十分', '特に気にしていない'] },
  { id: 'Q4', head: 'Q4 上場時期が未定であることへの受け止め', options: ['納得していて、気長に待てる', '仕方ないと思うが、目安は知りたい', 'いつになるのか不安を感じている', '説明に不信感を持っている', '特に気にしていない'] },
  { id: 'Q5', head: 'Q5 これからのメタカーボンとの関わり方', options: ['これまで以上に積極的に関わりたい', '今と同じくらい関わりたい', '情報だけ追っていく', '距離を置きたい'] },
  { id: 'Q6', head: 'Q6 ミスト部屋の配信を見る頻度', options: ['ほぼ毎回見る', '月に1回は見る', '気になる回だけ見る', 'ほとんど見ていない'] },
  { id: 'Q7', head: 'Q7 ミスト部屋（Discord）を見る頻度', options: ['ほぼ毎日', '週に数回', '週に1回くらい', '月に数回', 'ほとんど見ない'] },
  { id: 'Q8', head: 'Q8 配信はメタカーボンの理解に役立っているか', options: ['とても役立っている', 'まあ役立っている', 'あまり役立っていない', '役立っていない'] },
  { id: 'Q9', head: 'Q9 ミスト部屋の情報と公式発表の食い違い', options: ['何度もある', '1〜2回ある', 'ほとんどない', '気づいたことはない'] },
  { id: 'Q10', head: 'Q10 ミスト部屋運営の対応の満足度（1〜5）', options: ['1', '2', '3', '4', '5'] },
  { id: 'Q11', head: 'Q11 運営に一番力を入れてほしいこと', options: ['メタカーボンの最新情報を早く伝える', '公式に確認してから正確に伝える', '過去の流れを分かりやすくまとめる', '質問や不安に個別に答える', 'メンバー同士の交流企画'] },
  { id: 'Q12', head: 'Q12 メタカーボンへの意見・要望', text: true },
  { id: 'Q13', head: 'Q13 予定のズレや説明不足で困ったこと', text: true },
  { id: 'Q14', head: 'Q14 ミスト部屋運営の良かった点・直してほしい点', text: true },
  { id: 'Q15', head: 'Q15 ミスト部屋でやってほしい配信・企画・情報', text: true },
  { id: 'Q16', head: 'Q16 ミストンや承さん、運営へひとこと', text: true },
];
const HEADERS = ['受付日', '匿名ID'].concat(QUESTIONS.map(q => q.head));

/* ---------------- 受付 ---------------- */

/** ウェブアプリの URL を開くとアンケート画面（Form.html）を表示する */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle(CONFIG.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Apps Script から配信した画面から google.script.run で呼ばれる */
function submit(body) {
  return handleSubmission(body || {});
}

/** GitHub Pages など外部のアンケート画面から POST された場合 */
function doPost(e) {
  try {
    return out(handleSubmission(JSON.parse((e && e.postData && e.postData.contents) || '{}')));
  } catch (err) {
    console.error(err);
    return out({ ok: false, error: 'server' });
  }
}

function handleSubmission(body) {
  try {
    // ボット対策：見えない入力欄に何か入っている／速すぎる送信は成功扱いで捨てる
    if (body.hp) return { ok: true };
    if (typeof body.elapsedMs === 'number' && body.elapsedMs < CONFIG.MIN_ELAPSED_MS) return { ok: true };

    const ans = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const row = [Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd'), makeAnonId()];
    let filled = 0;
    QUESTIONS.forEach(q => {
      let v = ans[q.id] == null ? '' : String(ans[q.id]).trim();
      if (q.text) v = clip(anonymizeText(v), CONFIG.MAX_TEXT);
      else if (v && q.options.indexOf(v) === -1) v = ''; // 用意した選択肢以外は記録しない
      if (v) filled++;
      row.push(safeCell(v));
    });
    if (!filled) return { ok: false, error: 'empty' };

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      getSheet().appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'server' };
  }
}

/* ---------------- 匿名化 ---------------- */

/** 自由記述から個人を特定しうる情報を伏せ字にする */
function anonymizeText(s) {
  return String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/<@[!&]?\d+>/g, '[メンション省略]')
    .replace(/<#\d+>/g, '[チャンネル省略]')
    .replace(/https?:\/\/\S+/gi, '[URL省略]')
    .replace(/discord\.gg\/\S+/gi, '[URL省略]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[メール省略]')
    .replace(/\b0x[a-fA-F0-9]{40}\b/g, '[ウォレット省略]')
    .replace(/(?<!\d)\d{17,20}(?!\d)/g, '[ID省略]')
    .replace(/(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)/g, '[電話番号省略]')
    .replace(/(?<!\d)0[5-9]0\d{8}(?!\d)/g, '[電話番号省略]')
    .trim();
}

/** 回答ごとに使い捨ての匿名ID（誰とも紐づかない乱数） */
function makeAnonId() {
  return '匿名 #' + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
}

/* ---------------- スプレッドシート ---------------- */

/**
 * 記録先のスプレッドシート。
 * スプレッドシートの「拡張機能 → Apps Script」から作った場合はそのシート、
 * script.google.com から単独で作った場合は「ミスト部屋アンケート回答」を自動で作って使う。
 */
function getSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { console.error(err); }
  }
  const ss = SpreadsheetApp.create('ミスト部屋アンケート回答');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function getSheet() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#EDE7F8');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows() {
  const sh = getSheet();
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

/* ---------------- 管理メニュー・集計 ---------------- */

/** スプレッドシートを開くと上部に「ミスト部屋アンケート」メニューが出る */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ミスト部屋アンケート')
    .addItem('📊 集計を更新', 'buildDashboard')
    .addSeparator()
    .addItem('初期設定（最初に1回）', 'setup')
    .addItem('動作テスト用の回答を1件入れる', 'insertTestRow')
    .addToUi();
}

/** 「回答」シートを数えて「集計」「自由記述」シートを作り直す */
function buildDashboard() {
  const ss = getSpreadsheet();
  const rows = readRows();
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');

  /* --- 集計シート（選択式） --- */
  let sh = ss.getSheetByName(CONFIG.DASH_SHEET);
  if (!sh) sh = ss.insertSheet(CONFIG.DASH_SHEET, 0);
  sh.getCharts().forEach(c => sh.removeChart(c));
  sh.clear();
  sh.setColumnWidth(1, 300);
  sh.setColumnWidth(2, 60);
  sh.setColumnWidth(3, 60);

  sh.getRange(1, 1).setValue(CONFIG.TITLE + ' 集計').setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1, 1, 2).setValues([['回答数（合計）', rows.length]]).setFontWeight('bold');
  sh.getRange(3, 1).setValue('更新：' + now + '（メニュー「ミスト部屋アンケート → 集計を更新」で最新に）').setFontColor('#888888');

  let r = 5;
  QUESTIONS.forEach((q, qi) => {
    if (q.text) return;
    const col = 2 + qi;
    const counts = {};
    q.options.forEach(o => counts[o] = 0);
    let answered = 0;
    rows.forEach(v => {
      const x = String(v[col] || '');
      if (!x) return;
      answered++;
      counts[x] = (counts[x] || 0) + 1;
    });
    const pairs = q.options.map(o => [o, counts[o], answered ? counts[o] / answered : 0]);
    sh.getRange(r, 1, 1, 3).setValues([[q.head, '件数', '割合']]).setFontWeight('bold').setBackground('#EDE7F8');
    sh.getRange(r + 1, 1, pairs.length, 3).setValues(pairs);
    sh.getRange(r + 1, 3, pairs.length, 1).setNumberFormat('0%');
    const avg = /1〜5/.test(q.head) && answered
      ? rows.reduce((s, v) => s + (Number(v[col]) || 0), 0) / answered : null;
    if (avg !== null) sh.getRange(r + pairs.length + 1, 1, 1, 2).setValues([['平均点', Math.round(avg * 100) / 100]]).setFontColor('#6E50AA').setFontWeight('bold');

    const h = Math.max(200, pairs.length * 34 + 70);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(sh.getRange(r, 1, pairs.length + 1, 2))
      .setNumHeaders(1)
      .setPosition(r, 5, 0, 0)
      .setOption('title', q.head)
      .setOption('legend', { position: 'none' })
      .setOption('colors', [CONFIG.COLOR])
      .setOption('width', 620)
      .setOption('height', h)
      .build());
    r += Math.max(pairs.length + 4, Math.ceil(h / 21) + 2);
  });

  /* --- 自由記述シート --- */
  let tx = ss.getSheetByName(CONFIG.TEXT_SHEET);
  if (!tx) tx = ss.insertSheet(CONFIG.TEXT_SHEET, 1);
  tx.clear();
  tx.setColumnWidth(1, 90);
  tx.setColumnWidth(2, 640);
  tx.getRange(1, 1).setValue('自由記述（質問ごと・新しい順）　更新：' + now).setFontWeight('bold');
  let t = 3;
  QUESTIONS.forEach((q, qi) => {
    if (!q.text) return;
    const col = 2 + qi;
    const list = rows.map(v => [String(v[1]), String(v[col] || '').trim()]).filter(x => x[1]).reverse();
    tx.getRange(t, 1, 1, 2).setValues([[q.head, list.length + '件']]).setFontWeight('bold').setBackground('#EDE7F8');
    t++;
    if (list.length) {
      tx.getRange(t, 1, list.length, 2).setValues(list).setWrap(true).setVerticalAlignment('top');
      t += list.length;
    }
    t++;
  });
}

/**
 * 最初に1回だけ実行する初期設定。
 * 「回答」「集計」「自由記述」シートを作り、毎日の自動集計を設定し、記録先の URL をログに出す。
 */
function setup() {
  getSheet();
  setupDailyTrigger();
  const url = getSpreadsheet().getUrl();
  console.log('記録先のスプレッドシート：' + url);
  return url;
}

/** 毎日の自動集計（集計シート・自由記述シートの更新）のトリガーを作る。最初に1回だけ実行 */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'buildDashboard')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('buildDashboard').timeBased().everyDays(1).atHour(CONFIG.DASH_HOUR).inTimezone('Asia/Tokyo').create();
  buildDashboard();
}

/** 動作確認用：テスト回答を1件入れて集計する（確認後は「回答」シートの該当行を削除してください） */
function insertTestRow() {
  const answers = {};
  QUESTIONS.forEach(q => answers[q.id] = q.text ? 'テスト回答です' : q.options[0]);
  handleSubmission({ answers });
  buildDashboard();
}

/* ---------------- 小物 ---------------- */

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function clip(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
/** スプレッドシートで数式として解釈されないようにする */
function safeCell(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
