/**
 * ミスト部屋のアンケート → 管理者のスプレッドシートに匿名で記録（Google Apps Script）
 *
 * 使い方：管理者が新しく作ったスプレッドシートの「拡張機能 → Apps Script」に貼り付ける。
 * 1つのウェブアプリで2つのアンケートを受け付ける。
 *   ・ふりかえりアンケート（メンバー向け）→「回答」「集計」「自由記述」シート
 *   ・運営アンケート（運営3人向け）    →「運営_回答」「運営_集計」「運営_自由記述」シート
 * 回答は1件1行で溜まり、集計シートに件数とグラフが自動で作られる。
 * 名前・Discordアカウント・メールアドレス・正確な送信時刻は記録しない。
 */

const CONFIG = {
  MAX_TEXT: 3000,          // 自由記述1問あたりの最大文字数
  MIN_ELAPSED_MS: 5000,    // これより速い送信はボットとみなして捨てる
  COLOR: '#6E50AA',
};

// アンケートごとの設定。画面から送られてくる form の値で切り替える（なければ main）
// 質問の id はアンケート画面の id と対応。options の順番が集計表の並び順になる
const SURVEYS = {
  main: {
    TITLE: 'ミスト部屋 ふりかえりアンケート',
    SHEET_NAME: '回答',
    DASH_SHEET: '集計',
    TEXT_SHEET: '自由記述',
    QUESTIONS: [
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
    ],
  },
  staff: {
    TITLE: 'ミスト 運営アンケート',
    SHEET_NAME: '運営_回答',
    DASH_SHEET: '運営_集計',
    TEXT_SHEET: '運営_自由記述',
    QUESTIONS: [
      { id: 'S1', head: 'Q1 プロジェクトの進み具合の満足度（1〜5）', options: ['1', '2', '3', '4', '5'] },
      { id: 'S1c', head: 'Q1 具体的に', text: true },
      { id: 'S2', head: 'Q2 メタカーボン側の対応', options: ['満足している', 'おおむね満足している', '変更時の説明が足りないと感じる', '発表や回答そのものに不満がある', '予定が変わったことを知らなかった'] },
      { id: 'S2c', head: 'Q2 具体的に', text: true },
      { id: 'S3', head: 'Q3 上場時期が未定であることへの受け止め', options: ['納得していて、気長に待てる', '仕方ないと思うが、目安は知りたい', 'いつになるのか不安を感じている', '説明に不信感を持っている', '特に気にしていない'] },
      { id: 'S3c', head: 'Q3 具体的に', text: true },
      { id: 'S4', head: 'Q4 これからのメタカーボンとの関わり方', options: ['これまで以上に積極的に関わりたい', '今と同じくらい関わりたい', '情報だけ追っていく', '距離を置きたい'] },
      { id: 'S4c', head: 'Q4 具体的に', text: true },
      { id: 'S5', head: 'Q5 自分のDiscord運営の自己評価（1〜5）', options: ['1', '2', '3', '4', '5'] },
      { id: 'S5c', head: 'Q5 具体的に（自己評価の理由）', text: true },
      { id: 'S6', head: 'Q6 運営3人の連携・役割分担', options: ['うまくいっている', 'おおむねうまくいっている', '少し改善が必要', '大きく見直したい'] },
      { id: 'S6c', head: 'Q6 具体的に', text: true },
      { id: 'S7', head: 'Q7 Discord運営への要望', text: true },
      { id: 'S8', head: 'Q8 Discord運営をやってみての感想', text: true },
    ],
  },
};
Object.keys(SURVEYS).forEach(k => {
  const sv = SURVEYS[k];
  sv.KEY = k;
  sv.HEADERS = ['受付日', '匿名ID'].concat(sv.QUESTIONS.map(q => q.head));
});

/* ---------------- 受付 ---------------- */

/** ウェブアプリの URL を開くとアンケート画面（Form.html）を表示する */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle(SURVEYS.main.TITLE)
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

    const sv = SURVEYS[body.form] || SURVEYS.main;
    const ans = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const row = [Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd'), makeAnonId()];
    let filled = 0;
    sv.QUESTIONS.forEach(q => {
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
      getSheet(sv).appendRow(row);
    } finally {
      lock.releaseLock();
    }
    // 最初の1件が届いたときに集計シートを自動で作る（手動の作り直しは不要）
    try {
      if (!getSpreadsheet().getSheetByName(sv.DASH_SHEET)) buildDashboardFor(sv);
    } catch (err) {
      console.error(err);
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

function getSheet(sv) {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(sv.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(sv.SHEET_NAME);
    sh.getRange(1, 1, 1, sv.HEADERS.length).setValues([sv.HEADERS]).setFontWeight('bold').setBackground('#EDE7F8');
    sh.setFrozenRows(1);
  }
  return sh;
}


/* ---------------- 管理メニュー・集計 ---------------- */

/** スプレッドシートを開くと上部に「ミスト部屋アンケート」メニューが出る */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ミスト部屋アンケート')
    .addItem('📊 集計シートを作り直す', 'buildDashboard')
    .addSeparator()
    .addItem('初期設定（最初に1回）', 'setup')
    .addItem('動作テスト用の回答を1件入れる（ふりかえり）', 'insertTestRow')
    .addItem('動作テスト用の回答を1件入れる（運営）', 'insertStaffTestRow')
    .addToUi();
}

/**
 * 「集計」「自由記述」シートを作り直す。
 * どちらも「回答」シートを参照する数式で作るので、回答が届くたびに件数・グラフ・一覧が自動で最新になる。
 * （質問を変えたときや、シートを崩してしまったときに実行し直す）
 */
function buildDashboard() {
  Object.keys(SURVEYS).forEach(k => buildDashboardFor(SURVEYS[k]));
}

function buildDashboardFor(sv) {
  const ss = getSpreadsheet();
  getSheet(sv);
  const src = "'" + sv.SHEET_NAME + "'!";
  const colOf = qi => columnLetter(3 + qi); // A=受付日, B=匿名ID, C=Q1 …

  /* --- 集計シート（選択式） --- */
  let sh = ss.getSheetByName(sv.DASH_SHEET);
  if (!sh) sh = ss.insertSheet(sv.DASH_SHEET, sv.KEY === 'main' ? 0 : ss.getSheets().length);
  sh.getCharts().forEach(c => sh.removeChart(c));
  sh.clear();
  sh.setColumnWidth(1, 300);
  sh.setColumnWidth(2, 60);
  sh.setColumnWidth(3, 60);

  sh.getRange(1, 1).setValue(sv.TITLE + ' 集計').setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue('回答数（合計）').setFontWeight('bold');
  sh.getRange(2, 2).setFormula('=COUNTA(' + src + 'B2:B)').setFontWeight('bold');
  sh.getRange(3, 1).setValue('回答が届くと自動で更新されます').setFontColor('#888888');

  let r = 5;
  sv.QUESTIONS.forEach((q, qi) => {
    if (q.text) return;
    const c = colOf(qi);
    const range = src + c + '2:' + c;
    const n = q.options.length;
    sh.getRange(r, 1, 1, 3).setValues([[q.head, '件数', '割合']]).setFontWeight('bold').setBackground('#EDE7F8');
    const formulas = q.options.map((o, k) => {
      const row = r + 1 + k;
      return [
        '=COUNTIF(' + range + ',"' + o + '")',
        '=IF(COUNTA(' + range + ')=0,0,B' + row + '/COUNTA(' + range + '))',
      ];
    });
    // 選択肢は文字列として書く（「1」などが数値にならないように）
    sh.getRange(r + 1, 1, n, 1).setNumberFormat('@').setValues(q.options.map(o => [o]));
    sh.getRange(r + 1, 2, n, 2).setFormulas(formulas);
    sh.getRange(r + 1, 3, n, 1).setNumberFormat('0%');
    if (/1〜5/.test(q.head)) {
      sh.getRange(r + n + 1, 1).setValue('平均点').setFontColor(CONFIG.COLOR).setFontWeight('bold');
      sh.getRange(r + n + 1, 2).setFormula('=IFERROR(ROUND(AVERAGE(ARRAYFORMULA(VALUE(FILTER(' + range + ',' + range + '<>"")))),2),"-")')
        .setFontColor(CONFIG.COLOR).setFontWeight('bold');
    }

    const h = Math.max(200, n * 34 + 70);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(sh.getRange(r, 1, n + 1, 2))
      .setNumHeaders(1)
      .setPosition(r, 5, 0, 0)
      .setOption('title', q.head)
      .setOption('legend', { position: 'none' })
      .setOption('colors', [CONFIG.COLOR])
      .setOption('hAxis', { viewWindow: { min: 0 }, format: '0' })
      .setOption('width', 620)
      .setOption('height', h)
      .build());
    r += Math.max(n + 4, Math.ceil(h / 21) + 2);
  });

  /* --- 自由記述シート（質問ごとに1列） --- */
  let tx = ss.getSheetByName(sv.TEXT_SHEET);
  if (!tx) tx = ss.insertSheet(sv.TEXT_SHEET, sv.KEY === 'main' ? 1 : ss.getSheets().length);
  tx.clear();
  tx.getRange(1, 1).setValue('自由記述（回答が届くと自動で追加されます）').setFontWeight('bold');
  let col = 1;
  sv.QUESTIONS.forEach((q, qi) => {
    if (!q.text) return;
    const c = colOf(qi);
    tx.setColumnWidth(col, 320);
    tx.getRange(2, col).setFormula('="' + q.head + '（"&COUNTA(' + src + c + '2:' + c + ')&"件）"')
      .setFontWeight('bold').setBackground('#EDE7F8').setWrap(true).setVerticalAlignment('top');
    tx.getRange(3, col).setFormula('=IFERROR(FILTER(' + src + c + '2:' + c + ',' + src + c + '2:' + c + '<>""),"（まだありません）")');
    tx.getRange(3, col, 500, 1).setWrap(true).setVerticalAlignment('top');
    col++;
  });
  tx.setFrozenRows(2);
}

/**
 * 最初に1回だけ実行する初期設定。
 * 「回答」「集計」「自由記述」シートを作り、記録先の URL をログに出す。
 */
function setup() {
  Object.keys(SURVEYS).forEach(k => getSheet(SURVEYS[k]));
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'buildDashboard')
    .forEach(t => ScriptApp.deleteTrigger(t)); // 集計は数式で自動更新されるので、毎日の再作成は不要
  buildDashboard();
  const url = getSpreadsheet().getUrl();
  console.log('記録先のスプレッドシート：' + url);
  return url;
}

/** 動作確認用：テスト回答を1件入れて集計する（確認後は「回答」シートの該当行を削除してください） */
function insertTestRow() {
  insertTestRowFor('main');
}
/** 運営アンケートの動作確認用（確認後は「運営_回答」シートの該当行を削除してください） */
function insertStaffTestRow() {
  insertTestRowFor('staff');
}
function insertTestRowFor(key) {
  const answers = {};
  SURVEYS[key].QUESTIONS.forEach(q => answers[q.id] = q.text ? 'テスト回答です' : q.options[0]);
  handleSubmission({ form: key, answers });
  buildDashboardFor(SURVEYS[key]);
}

/* ---------------- 小物 ---------------- */

/** 列番号（1始まり）を A, B, … AA の形にする */
function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

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
