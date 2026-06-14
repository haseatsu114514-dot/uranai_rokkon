/**
 * 占い処 六根清浄｜予約フォーム受付 GAS
 *
 * サイトの reserve.html（js/reserve.js）から POST を受け取り、
 *   1. スプレッドシートに記録
 *   2. Google カレンダーに仮予約イベントを作成
 *   3. 鑑定師に LINE（Messaging API）+ メールで通知
 *   4. お客様に受付確認メールを自動返信
 * を行う。
 *
 * さらに【承認フロー】: シートの「対応状況」列に「確定」と入力すると、
 *   - オンライン予約 → 確定案内メール（Meet URL・支払い先入り）を自動送信
 *   - 対面予約 → Gmailに下書きを自動作成（場所を記入して手動送信する）
 *   第二希望で確定したい場合は「確定2」と入力する。
 *
 * 【自動運用】（setup() がトリガーを登録する）
 *   - 前日リマインド: 毎日夕方、翌日の確定済み予約のお客様にリマインドメールを自動送信
 *   - 月次レポート: 毎月1日の朝、先月の予約件数まとめをLINEに送信
 *   - リピーター表示: 同じメールアドレスで過去に予約があれば、新規予約のLINE通知に「🔁」を付ける
 *
 * ■ 使い方（詳しくは docs/reservation-form-setup.md）
 *   1. このファイルを丸ごと GAS に貼り付ける
 *   2. setup() を一度実行する（シート作成・トリガー設定まで全部自動）
 *   3. ウェブアプリとしてデプロイし、URL を js/reserve.js に貼る
 */

// ==========================================================
// ★★★ 設定 ★★★
// LINE通知・Meet URL・支払い情報の4か所だけ記入する（リポジトリにはコミットしない）
// ==========================================================
var CONFIG = {
  // 通知・自動返信に使うメールアドレス（複数の場合はカンマ区切り。先頭が主アドレス）
  NOTIFY_EMAIL: 'uranai.rokkon@gmail.com,haseatsu114514@gmail.com',
  SHOP_NAME: '占い処 六根清浄',

  // 【任意】LINE通知（通知用Botのチャネルアクセストークン・自分のユーザーID）
  // 空のままならLINE通知はスキップされ、メール通知のみ行う
  LINE_CHANNEL_ACCESS_TOKEN: '',
  LINE_OWNER_USER_ID: '',

  // オンライン鑑定の Google Meet URL（確定案内メールに記載される）
  MEET_URL: '',

  // 支払い案内（確定案内メールに記載される）
  PAY_PAYPAY_ID: '',   // 例: 'rokkon9119'
  PAY_BANK_TEXT: '',   // 例: '〇〇銀行（0000）\n〇〇支店（000）\n普通 0000000\n名義'

  // 予約記録用スプレッドシート（空のままでOK: setup() 実行時に自動作成される）
  // 既存のシートを使いたい場合だけIDを記入する
  SPREADSHEET_ID: '',
  SHEET_NAME: '予約受付',

  // 予約カレンダーのID（LINE予約ボットと同じカレンダーを指定する）
  // 空ならメインのカレンダーを使う
  CALENDAR_ID: 'dafc8b598911cfc9b10f56e92993836fe3c9c11b90f0d270046ccc1943692e40@group.calendar.google.com',

  // この時間（h）対応されていない予約があればLINEに再通知する
  REMIND_AFTER_HOURS: 3
};

// ===== 空き状況の計算ルール =====
// 前日予約制: 当日は表示せず、翌日以降のみ受け付ける（当日・緊急はメール問い合わせ）
var LEAD_DAYS = 1;              // 何日先から予約可にするか（1 = 翌日から）
var AVAIL_DAYS = 10;            // 予約可の初日から何日分を候補に出すか
var SLOT_STEP_MIN = 30;         // 30分刻みで枠を探す
var BUFFER_MIN = 30;            // 既存予定の前後30分は空ける

var SHEET_HEADERS = [
  '受付日時', 'お名前', '性別', '生年月日', '出生時間・出生地', 'メール', 'コース',
  '第一希望', '第二希望', 'テーマ', 'ご相談内容', '支払い希望',
  '対応状況', 'リマインド', '確定日時', '前日リマインド'
];

// 列番号（1始まり）
var COL_TIMESTAMP = 1;
var COL_NAME = 2;
var COL_EMAIL = 6;
var COL_COURSE = 7;
var COL_CHOICE1 = 8;
var COL_STATUS = 13;
var COL_REMINDED = 14;
var COL_CONFIRMED = 15;   // 確定した日時（承認フローが自動記入する。手入力不要）
var COL_DAYBEFORE = 16;   // 前日リマインドの送信記録（自動記入）

// 承認フローで使う「対応状況」の値（プルダウンで選ぶ）
var STATUS_CONFIRM_1 = '確定';        // 第一希望で確定 → 確定案内を自動送信/下書き作成
var STATUS_CONFIRM_2 = '確定2';       // 第二希望で確定（あとは同じ）
var STATUS_RESCHEDULE = '別日提案';   // 希望日が取れない → 空き日時リスト入りの調整メールを自動送信
var STATUS_DECLINE = 'お断り';        // ご案内できない → お断りメールを自動送信

// プルダウンに出す選択肢（下3つは手動運用向け: 選んでも自動処理はされない）
var STATUS_DROPDOWN = [
  STATUS_CONFIRM_1, STATUS_CONFIRM_2, STATUS_RESCHEDULE, STATUS_DECLINE,
  '保留', '対応済み', '案内済み'
];

var PART_TIMES = {
  '昼の部': { startH: 14, startM: 0, endH: 16, endM: 30 },
  '夕の部': { startH: 16, startM: 30, endH: 19, endM: 0 },
  '夜の部': { startH: 19, startM: 0, endH: 22, endM: 0 }
};

// ==========================================================
// 受付（ウェブアプリ）
// ==========================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // honeypot: ボットが入力した場合は成功を装って捨てる
    if (data.website) {
      return jsonResponse({ status: 'ok' });
    }

    var error = validateReservation(data);
    if (error) {
      return jsonResponse({ status: 'error', message: error });
    }

    // リピーター判定（新しい行を追加する前に過去の予約を探す）
    var repeat = null;
    try { repeat = findRepeaterInfo(data.email); } catch (err) { console.error(err); }

    var row = recordToSheet(data);

    // 通知・カレンダーは失敗しても受付自体は成功扱いにする
    safely(function () { createTentativeEvent(data); });
    safely(function () { notifyOwnerLine(buildOwnerMessage(data, repeat)); });
    safely(function () { notifyOwnerEmail(data, row, repeat); });
    safely(function () { sendAutoReply(data); });

    return jsonResponse({ status: 'ok' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

// 空き状況API（?action=availability）／死活確認
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'availability') {
    try {
      return jsonResponse({ status: 'ok', days: getAvailability() });
    } catch (err) {
      return jsonResponse({ status: 'error', message: String(err) });
    }
  }
  return jsonResponse({ status: 'ok', service: 'reservation' });
}

// ==========================================================
// 空き状況の計算（カレンダーの予定から「出せる日時」だけを返す）
// ==========================================================
function getAvailability() {
  var cal = getCalendar();
  var now = new Date();
  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  var days = [];

  for (var i = LEAD_DAYS; i < LEAD_DAYS + AVAIL_DAYS; i++) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    var parts = {};
    Object.keys(PART_TIMES).forEach(function (partName) {
      parts[partName] = {
        ok30: hasFreeSlot(cal, d, partName, 30),
        ok60: hasFreeSlot(cal, d, partName, 60)
      };
    });
    days.push({
      date: Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd'),
      label: (d.getMonth() + 1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')',
      parts: parts
    });
  }
  return days;
}

/** その日のその部に、指定分数の鑑定を入れられる枠が1つでもあるか */
function hasFreeSlot(cal, day, partName, minutes) {
  var t = PART_TIMES[partName];
  var partStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.startH, t.startM);
  var partEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.endH, t.endM);

  // 既存予定（前後のバッファ込みで衝突判定する）
  var events = cal.getEvents(
    new Date(partStart.getTime() - BUFFER_MIN * 60000),
    new Date(partEnd.getTime() + BUFFER_MIN * 60000)
  );
  var busy = events
    .filter(function (ev) { return !ev.isAllDayEvent(); })
    .map(function (ev) {
      return {
        s: ev.getStartTime().getTime() - BUFFER_MIN * 60000,
        e: ev.getEndTime().getTime() + BUFFER_MIN * 60000
      };
    });

  for (var s = partStart.getTime(); s + minutes * 60000 <= partEnd.getTime(); s += SLOT_STEP_MIN * 60000) {
    var slotEnd = s + minutes * 60000;
    var conflict = busy.some(function (b) { return s < b.e && slotEnd > b.s; });
    if (!conflict) return true;
  }
  return false;
}

function getCalendar() {
  return CONFIG.CALENDAR_ID
    ? CalendarApp.getCalendarById(CONFIG.CALENDAR_ID)
    : CalendarApp.getDefaultCalendar();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safely(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

function validateReservation(data) {
  if (!data.name || String(data.name).length > 50) return 'お名前をご確認ください';
  if (!data.sex) return '性別を選択してください';
  if (!data.birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(data.birthdate)) return '生年月日をご確認ください';
  var email = String(data.email || '');
  if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'メールアドレスをご確認ください';
  }
  if (!data.course) return 'コースを選択してください';
  if (!data.date1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date1)) return '第一希望日をご確認ください';
  if (!data.part1) return '第一希望の時間帯を選択してください';
  if (data.message && String(data.message).length > 1000) return 'ご相談内容が長すぎます';
  return null;
}

// ==========================================================
// スプレッドシート
// ==========================================================

/**
 * 記録用スプレッドシートを取得する。
 * CONFIG.SPREADSHEET_ID が空なら自動で新規作成し、IDを保存して使い回す。
 */
function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (err) {
      // 保存済みのシートが削除されていたら作り直す
    }
  }
  var ss = SpreadsheetApp.create('予約受付台帳（' + CONFIG.SHOP_NAME + '）');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function getSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(SHEET_HEADERS);
    sheet.setFrozenRows(1);
  }
  ensureHeaders(sheet);
  return sheet;
}

/** 項目を増やした際にヘッダー行を最新化する（古い形式のままなら書き換える） */
function ensureHeaders(sheet) {
  var range = sheet.getRange(1, 1, 1, SHEET_HEADERS.length);
  var current = range.getValues()[0];
  var differs = SHEET_HEADERS.some(function (h, i) { return current[i] !== h; });
  if (differs) {
    range.setValues([SHEET_HEADERS]);
    sheet.setFrozenRows(1);
  }
}

/**
 * ★ 最初に一度だけ手動実行する関数 ★
 * 記録用シートの作成・リマインド通知の定期実行・テストメール送信まで全部やる。
 * 2回実行しても二重登録はされない。
 */
function setup() {
  // 1. 記録用スプレッドシートを準備
  var sheet = getSheet();
  var url = sheet.getParent().getUrl();

  // 1-2. 「対応状況」列にプルダウンを設定（スクリプトが書く値も許可する緩い検証）
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_DROPDOWN, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, COL_STATUS, sheet.getMaxRows() - 1, 1).setDataValidation(rule);

  // トリガー登録（すでにあれば登録しない）
  function hasTriggerFor(fnName) {
    return ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === fnName;
    });
  }

  // 2. 見逃し防止リマインド（1時間ごと）
  if (!hasTriggerFor('checkUnhandledReservations')) {
    ScriptApp.newTrigger('checkUnhandledReservations')
      .timeBased()
      .everyHours(1)
      .create();
  }

  // 3. 承認フロー: 「対応状況」に「確定」と入力されたら動くトリガー
  if (!hasTriggerFor('onEditApproval')) {
    ScriptApp.newTrigger('onEditApproval')
      .forSpreadsheet(sheet.getParent())
      .onEdit()
      .create();
  }

  // 4. 前日リマインド: 毎日17時ごろ、翌日の確定済み予約のお客様にメール
  if (!hasTriggerFor('sendDayBeforeReminders')) {
    ScriptApp.newTrigger('sendDayBeforeReminders')
      .timeBased()
      .everyDays(1)
      .atHour(17)
      .create();
  }

  // 5. 月次レポート: 毎月1日の朝9時ごろ、先月のまとめをLINEに送信
  if (!hasTriggerFor('sendMonthlySummary')) {
    ScriptApp.newTrigger('sendMonthlySummary')
      .timeBased()
      .onMonthDay(1)
      .atHour(9)
      .create();
  }

  // 4. テストメールを送って動作確認
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: '【設定完了】予約フォームの準備ができました',
    body: 'このメールが届いていれば、通知メールの設定はOKです。\n\n' +
      '予約はこのスプレッドシートに記録されます:\n' + url + '\n\n' +
      'あとは GAS を「ウェブアプリ」としてデプロイして、\n' +
      '表示されたURLを js/reserve.js の RESERVE_ENDPOINT に貼れば完成です。',
    name: CONFIG.SHOP_NAME + ' 予約システム'
  });

  console.log('✅ 設定完了！ 予約シート: ' + url);
  console.log('次は「デプロイ」→「新しいデプロイ」→ ウェブアプリ（アクセス: 全員）です');
}

function recordToSheet(data) {
  var sheet = getSheet();
  sheet.appendRow([
    new Date(),
    data.name,
    data.sex || '',
    data.birthdate || '',
    data.birthtime || '',
    data.email,
    data.course,
    formatChoice(data.date1, data.part1),
    data.date2 ? formatChoice(data.date2, data.part2) : '',
    data.genre || '',
    data.message || '',
    data.payMethod || '',
    '', // 対応状況（確定したら「対応済み」と記入する）
    '', // リマインド
    '', // 確定日時（承認フローが自動記入）
    ''  // 前日リマインド（自動記入）
  ]);
  return sheet.getLastRow();
}

/**
 * 同じメールアドレスの過去予約を探す（リピーター判定）。
 * 見つかれば { count: 過去の予約回数, last: 前回の受付日 } を返す。なければ null。
 */
function findRepeaterInfo(email) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, 1, lastRow - 1, COL_EMAIL).getValues();
  var count = 0;
  var last = null;
  values.forEach(function (row) {
    if (String(row[COL_EMAIL - 1] || '').trim().toLowerCase() !== target) return;
    count++;
    var ts = row[COL_TIMESTAMP - 1];
    if (ts instanceof Date && (!last || ts > last)) last = ts;
  });
  return count > 0 ? { count: count, last: last } : null;
}

function formatChoice(dateStr, part) {
  var d = parseYmd(dateStr);
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  return (d.getMonth() + 1) + '/' + d.getDate() + '(' + days[d.getDay()] + ') ' + (part || '');
}

function parseYmd(dateStr) {
  var p = dateStr.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

// ==========================================================
// カレンダー仮予約
// ==========================================================
function createTentativeEvent(data) {
  var cal = getCalendar();
  if (!cal) return;

  var partName = String(data.part1).replace(/（.*$/, ''); // 「昼の部（14:00〜16:30）」→「昼の部」
  var slot = PART_TIMES[partName];
  if (!slot) return;

  var d = parseYmd(data.date1);
  var minutes = data.course.indexOf('30分') >= 0 ? 30 : 60;
  var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), slot.startH, slot.startM);
  var end = new Date(start.getTime() + minutes * 60000);

  cal.createEvent(
    '【仮】' + data.name + '様 ' + data.course,
    start, end,
    {
      description:
        'フォーム予約（未確定）。時間帯内で要調整。\n' +
        'メール: ' + data.email + '\n' +
        '性別: ' + (data.sex || '未入力') + '\n' +
        '生年月日: ' + (data.birthdate || '未入力') + '\n' +
        '出生時間・出生地: ' + (data.birthtime || '未入力') + '\n' +
        '第二希望: ' + (data.date2 ? formatChoice(data.date2, data.part2) : 'なし') + '\n' +
        'テーマ: ' + (data.genre || '未選択') + '\n' +
        '相談内容: ' + (data.message || 'なし') + '\n' +
        '支払い希望: ' + (data.payMethod || '未選択')
    }
  );
}

// ==========================================================
// 通知（鑑定師向け）
// ==========================================================
function buildOwnerMessage(data, repeat) {
  var repeatLine = '';
  if (repeat) {
    repeatLine = '🔁 リピーター（' + (repeat.count + 1) + '回目';
    if (repeat.last instanceof Date) {
      repeatLine += '・前回 ' + Utilities.formatDate(repeat.last, 'Asia/Tokyo', 'yyyy年M月');
    }
    repeatLine += '）\n';
  }
  return '【新規予約】フォームから予約が入りました\n' +
    repeatLine +
    '────────────\n' +
    'お名前: ' + data.name + '\n' +
    '性別: ' + (data.sex || '未入力') + '\n' +
    '生年月日: ' + (data.birthdate || '未入力') + '\n' +
    '出生時間・出生地: ' + (data.birthtime || '未入力') + '\n' +
    'コース: ' + data.course + '\n' +
    '第一希望: ' + formatChoice(data.date1, data.part1) + '\n' +
    '第二希望: ' + (data.date2 ? formatChoice(data.date2, data.part2) : 'なし') + '\n' +
    'テーマ: ' + (data.genre || '未選択') + '\n' +
    '支払い希望: ' + (data.payMethod || '未選択') + '\n' +
    'メール: ' + data.email + '\n' +
    '────────────\n' +
    '確定メールの返信をお願いします。';
}

function notifyOwnerLine(text) {
  if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN || !CONFIG.LINE_OWNER_USER_ID) return;

  // すべてのLINE通知の末尾に予約シートへのリンクを付ける（タップで開けるように）
  var link = '';
  try {
    link = '\n\n📋 予約シートを開く\n' + getSheet().getParent().getUrl();
  } catch (err) {
    // シートが取れなくても通知自体は送る
  }

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({
      to: CONFIG.LINE_OWNER_USER_ID,
      messages: [{ type: 'text', text: text + link }]
    }),
    muteHttpExceptions: true
  });
}

function notifyOwnerEmail(data, row, repeat) {
  var sheetUrl = getSheet().getParent().getUrl();
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: '【予約】' + formatChoice(data.date1, data.part1) + ' ' + data.course + '（' + data.name + '様）' +
      (repeat ? '🔁' : ''),
    body: buildOwnerMessage(data, repeat) +
      '\n\n予約シート（' + row + '行目）:\n' + sheetUrl +
      '\n\n対応が終わったら「対応状況」列に「対応済み」と記入してください。' +
      '\n（未記入のままだと ' + CONFIG.REMIND_AFTER_HOURS + ' 時間後にLINEへ再通知されます）',
    name: CONFIG.SHOP_NAME + ' 予約システム'
  });
}

// ==========================================================
// 自動返信（お客様向け）
// ==========================================================
function sendAutoReply(data) {
  var body =
    data.name + ' 様\n\n' +
    'この度は「' + CONFIG.SHOP_NAME + '」にご予約のお申し込みをいただき、\n' +
    'ありがとうございます。以下の内容で受け付けました。\n\n' +
    '────────────────\n' +
    'コース: ' + data.course + '\n' +
    '第一希望: ' + formatChoice(data.date1, data.part1) + '\n' +
    '第二希望: ' + (data.date2 ? formatChoice(data.date2, data.part2) : 'なし') + '\n' +
    'お支払い: ' + (data.payMethod || '未選択') + '\n' +
    '────────────────\n\n' +
    '空き状況を確認のうえ、通常24時間以内に、このメールアドレス宛に\n' +
    '予約確定のご連絡をお送りします。いましばらくお待ちください。\n\n' +
    '※ このメールの時点では予約は確定していません\n' +
    '※ お支払い方法・当日のご案内は、確定のご連絡の際にお伝えします\n' +
    '※ お心当たりのない場合は、このメールは破棄してください\n\n' +
    '────────────────\n' +
    CONFIG.SHOP_NAME + '\n' +
    'https://uranai-rokkon.com/\n' +
    'お問い合わせ: ' + CONFIG.NOTIFY_EMAIL + '\n';

  MailApp.sendEmail({
    to: data.email,
    replyTo: primaryEmail(),
    subject: '【' + CONFIG.SHOP_NAME + '】ご予約を受け付けました（確定前）',
    body: body,
    name: CONFIG.SHOP_NAME
  });
}

/** 返信先に使う主メールアドレス（NOTIFY_EMAILの先頭） */
function primaryEmail() {
  return String(CONFIG.NOTIFY_EMAIL).split(',')[0].trim();
}

// ==========================================================
// 承認フロー
// 「対応状況」列に「確定」（第一希望）または「確定2」（第二希望）と入力すると、
//   - オンライン予約: 確定案内メールを自動送信 → 成功時のみ「案内済み」に更新
//   - 対面予約: Gmailに下書きを作成（場所を記入して手動送信）→「下書き作成済」に更新
// 失敗したときは「送信エラー（要手動対応）」に変えて、LINE+メールで知らせる。
// ==========================================================

/** 自動処理の対象になる「対応状況」の値か */
function isActionStatus(value) {
  return value === STATUS_CONFIRM_1 || value === STATUS_CONFIRM_2 ||
    value === STATUS_RESCHEDULE || value === STATUS_DECLINE;
}

/** インストーラブル onEdit トリガー（setup() が自動登録する） */
function onEditApproval(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEET_NAME) return;
    if (e.range.getColumn() !== COL_STATUS) return;
    if (e.range.getRow() < 2) return;
    var value = String(e.range.getValue() || '').trim();
    if (!isActionStatus(value)) return;
    processApproval(sheet, e.range.getRow());
  } catch (err) {
    console.error('onEditApproval error:', err);
  }
}

/** 未処理のまま残っている行をまとめて処理する（時間トリガーからの保険） */
function processConfirmedRows() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var statuses = sheet.getRange(2, COL_STATUS, lastRow - 1, 1).getValues();
  statuses.forEach(function (r, i) {
    if (isActionStatus(String(r[0] || '').trim())) {
      processApproval(sheet, i + 2);
    }
  });
}

function processApproval(sheet, rowIndex) {
  var row = sheet.getRange(rowIndex, 1, 1, SHEET_HEADERS.length).getValues()[0];
  var status = String(row[COL_STATUS - 1] || '').trim();
  var r = {
    name: String(row[1] || ''),
    email: String(row[5] || ''),
    course: String(row[6] || ''),
    choice1: String(row[7] || ''),
    choice2: String(row[8] || ''),
    payMethod: String(row[11] || '')
  };
  var useSecond = (status === STATUS_CONFIRM_2);
  var when = useSecond ? r.choice2 : r.choice1;
  var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d HH:mm');

  function fail(reason) {
    sheet.getRange(rowIndex, COL_STATUS).setValue('送信エラー（要手動対応）');
    var msg = '【エラー】確定案内を送れませんでした\n' +
      r.name + '様（シート' + rowIndex + '行目）\n' +
      '理由: ' + reason + '\n\n' +
      'お手数ですが手動でご案内をお願いします。';
    safely(function () { notifyOwnerLine(msg); });
    safely(function () {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL,
        subject: '【エラー】確定案内の自動送信に失敗しました',
        body: msg + '\n\nシート:\n' + sheet.getParent().getUrl(),
        name: CONFIG.SHOP_NAME + ' 予約システム'
      });
    });
  }

  if (!r.email || r.email.indexOf('@') < 0) { fail('メールアドレスが不正です'); return; }

  // ----- お断り: お断りメールを自動送信 -----
  if (status === STATUS_DECLINE) {
    try {
      MailApp.sendEmail({
        to: r.email,
        replyTo: primaryEmail(),
        subject: '【' + CONFIG.SHOP_NAME + '】ご予約について',
        body: buildDeclineBody(r),
        name: CONFIG.SHOP_NAME
      });
      sheet.getRange(rowIndex, COL_STATUS).setValue('お断り済 ' + stamp);
      safely(function () { deleteTentativeEvent(r.name); });
      safely(function () {
        notifyOwnerLine('【お断りメール 送信完了】\n' + r.name + '様（' + r.choice1 + '）');
      });
    } catch (err) {
      fail(String(err));
    }
    return;
  }

  // ----- 別日提案: 空き日時リスト入りの調整メールを自動送信 -----
  if (status === STATUS_RESCHEDULE) {
    var listText = buildOpenSlotsText(r.course);
    if (!listText) { fail('直近に空きがないため、別日提案を自動で送れませんでした。手動でご案内ください'); return; }
    try {
      MailApp.sendEmail({
        to: r.email,
        replyTo: primaryEmail(),
        subject: '【' + CONFIG.SHOP_NAME + '】ご希望日時の調整のお願い',
        body: buildRescheduleBody(r, listText),
        name: CONFIG.SHOP_NAME
      });
      sheet.getRange(rowIndex, COL_STATUS).setValue('別日提案済 ' + stamp);
      safely(function () { deleteTentativeEvent(r.name); });
      safely(function () {
        notifyOwnerLine(
          '【別日提案メール 送信完了】\n' + r.name + '様\n\n' +
          'お客様から返信が来たら、シートの「第一希望」をその日時に書き換えてから「確定」を選んでください。いつもの確定案内が自動で送られます。'
        );
      });
    } catch (err) {
      fail(String(err));
    }
    return;
  }

  if (!when) { fail(useSecond ? '第二希望が空欄です（「確定」で第一希望、「確定2」で第二希望が使われます）' : '第一希望が空欄です'); return; }

  var isInPerson = r.course.indexOf('対面') >= 0;

  // ----- 対面: Gmailに下書きを作成（自動送信しない） -----
  if (isInPerson) {
    try {
      GmailApp.createDraft(
        r.email,
        '【' + CONFIG.SHOP_NAME + '】ご予約が確定しました（' + when + '）',
        buildInPersonBody(r, when)
      );
      sheet.getRange(rowIndex, COL_STATUS).setValue('下書き作成済 ' + stamp);
      sheet.getRange(rowIndex, COL_CONFIRMED).setValue(when);
      safely(function () {
        notifyOwnerLine(
          '【対面予約の確定】下書きを作成しました\n' +
          r.name + '様（' + when + '）\n\n' +
          '下書きを開いて、待ち合わせ場所の【★】の部分を記入してから送信してください。\n' +
          '送信したらシートの「対応状況」を「案内済み」に変えてください。\n\n' +
          '✉️ Gmailの下書きを開く\n' +
          'https://mail.google.com/mail/u/0/#drafts'
        );
      });
    } catch (err) {
      fail(String(err));
    }
    return;
  }

  // ----- オンライン: 確定案内メールを自動送信 -----
  if (!CONFIG.MEET_URL) { fail('CONFIG.MEET_URL（Google MeetのURL）が未設定です'); return; }
  var payText = buildPayText(r.payMethod);
  if (!payText) { fail('支払い情報（CONFIG.PAY_PAYPAY_ID / PAY_BANK_TEXT）が未設定です'); return; }

  try {
    MailApp.sendEmail({
      to: r.email,
      replyTo: primaryEmail(),
      subject: '【' + CONFIG.SHOP_NAME + '】ご予約が確定しました（' + when + '）',
      body: buildOnlineBody(r, when, payText),
      name: CONFIG.SHOP_NAME
    });
    sheet.getRange(rowIndex, COL_STATUS).setValue('案内済み ' + stamp);
    sheet.getRange(rowIndex, COL_CONFIRMED).setValue(when);
    safely(function () { renameTentativeEvent(r.name); });
    safely(function () {
      notifyOwnerLine(
        '【確定案内 送信完了】\n' +
        r.name + '様（' + when + '・' + r.course + '）\n' +
        '支払い希望: ' + (r.payMethod || '未選択') + '\n\n' +
        '念のため、当日までにMeet URLが開けるか確認しておいてください。'
      );
    });
  } catch (err) {
    fail(String(err));
  }
}

/** コース文字列から料金部分を取り出す（例: 「オンライン30分（5,000円）」→「5,000円」） */
function coursePrice(course) {
  var m = String(course).match(/（([\d,]+円)）/);
  return m ? m[1] + '（税込）' : '';
}

/** 支払い希望に応じた案内文。設定が足りなければ null を返す */
function buildPayText(payMethod) {
  var m = String(payMethod || '');
  var paypay = CONFIG.PAY_PAYPAY_ID
    ? 'PayPay ID「' + CONFIG.PAY_PAYPAY_ID + '」宛に料金をお送りください。'
    : '';
  var bank = CONFIG.PAY_BANK_TEXT
    ? '下記の口座に料金をお振り込みください。\n\n' + CONFIG.PAY_BANK_TEXT
    : '';

  var text;
  if (m.indexOf('PayPay') >= 0) text = paypay;
  else if (m.indexOf('振込') >= 0) text = bank;
  else text = [paypay, bank].filter(function (t) { return t; }).join('\n\nまたは\n\n');

  if (!text) return null;
  return text + '\n\nお手続きが済みましたら、このメールに「お支払いしました」と一言ご返信ください。';
}

function buildOnlineBody(r, when, payText) {
  var price = coursePrice(r.course);
  return r.name + ' 様\n\n' +
    'お待たせいたしました。以下の内容でご予約が確定しました。\n\n' +
    '────────────────\n' +
    '日時: ' + when + '\n' +
    'コース: ' + r.course + '\n' +
    (price ? '料金: ' + price + '\n' : '') +
    '────────────────\n\n' +
    buildMeetGuide() + '\n' +
    '【お支払いのご案内】\n' +
    payText + '\n\n' +
    '※日時のご都合が悪くなった場合は、このメールへの返信でご連絡ください。\n\n' +
    '当日お話しできるのを楽しみにしております。\n\n' +
    '────────────────\n' +
    CONFIG.SHOP_NAME + '\n' +
    'https://uranai-rokkon.com/\n' +
    'お問い合わせ: ' + primaryEmail() + '\n';
}

function buildInPersonBody(r, when) {
  var price = coursePrice(r.course);
  return r.name + ' 様\n\n' +
    'お待たせいたしました。以下の内容でご予約が確定しました。\n\n' +
    '────────────────\n' +
    '日時: ' + when + '\n' +
    'コース: ' + r.course + '\n' +
    (price ? '料金: ' + price + '（当日、現地でお支払いください）\n' : '') +
    '────────────────\n\n' +
    '【待ち合わせ場所】\n' +
    '【★待ち合わせ場所をここに記入★】\n\n' +
    '当日はどうぞお気をつけてお越しください。\n' +
    '※日時のご都合が悪くなった場合は、このメールへの返信でご連絡ください。\n\n' +
    '────────────────\n' +
    CONFIG.SHOP_NAME + '\n' +
    'https://uranai-rokkon.com/\n' +
    'お問い合わせ: ' + primaryEmail() + '\n';
}

/** 時間帯の表示名（例: 昼の部（14:00〜16:30）） */
function partLabel(partName) {
  var t = PART_TIMES[partName];
  function hm(h, m) { return h + ':' + (m < 10 ? '0' : '') + m; }
  return partName + '（' + hm(t.startH, t.startM) + '〜' + hm(t.endH, t.endM) + '）';
}

/** 現在ご案内できる日時の一覧テキスト。空きがなければ null */
function buildOpenSlotsText(course) {
  var minutes = String(course).indexOf('30分') >= 0 ? 30 : 60;
  var lines = [];
  getAvailability().forEach(function (day) {
    var open = Object.keys(PART_TIMES).filter(function (p) {
      return day.parts[p] && day.parts[p]['ok' + minutes];
    });
    if (open.length) {
      lines.push('・' + day.label + '　' + open.map(partLabel).join(' ／ '));
    }
  });
  return lines.length ? lines.join('\n') : null;
}

function buildRescheduleBody(r, listText) {
  var wished = r.choice1 + (r.choice2 ? '、' + r.choice2 : '');
  return r.name + ' 様\n\n' +
    'この度は「' + CONFIG.SHOP_NAME + '」にご予約のお申し込みをいただき、\n' +
    'ありがとうございます。\n\n' +
    '大変申し訳ありませんが、ご希望いただいた日時（' + wished + '）は\n' +
    'あいにくご案内が難しい状況です。\n\n' +
    '現在、以下の日時でしたらご案内できます。\n\n' +
    listText + '\n\n' +
    'ご都合の合う日時がございましたら、【このメールへの返信】で\n' +
    'お知らせください。フォームをもう一度入力していただく必要はありません。\n\n' +
    'どの日時も難しい場合も、ご都合をご返信いただければ調整いたします。\n\n' +
    '────────────────\n' +
    CONFIG.SHOP_NAME + '\n' +
    'https://uranai-rokkon.com/\n' +
    'お問い合わせ: ' + primaryEmail() + '\n';
}

function buildDeclineBody(r) {
  return r.name + ' 様\n\n' +
    'この度は「' + CONFIG.SHOP_NAME + '」にご予約のお申し込みをいただき、\n' +
    'ありがとうございます。\n\n' +
    '大変申し訳ありませんが、あいにく日程の確保が難しく、\n' +
    '今回はご案内ができかねる状況です。\n\n' +
    'せっかくお申し込みいただいたのに申し訳ありません。\n' +
    'またの機会にご利用いただけますと幸いです。\n\n' +
    '────────────────\n' +
    CONFIG.SHOP_NAME + '\n' +
    'https://uranai-rokkon.com/\n' +
    'お問い合わせ: ' + primaryEmail() + '\n';
}

/** カレンダーの【仮】イベントを削除する（別日提案・お断り用。見つからなければ何もしない） */
function deleteTentativeEvent(name) {
  var cal = getCalendar();
  if (!cal) return;
  var now = new Date();
  var until = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
  cal.getEvents(now, until).forEach(function (ev) {
    if (ev.getTitle().indexOf('【仮】' + name + '様') === 0) {
      ev.deleteEvent();
    }
  });
}

/** カレンダーの【仮】イベントを【確定】に改名する（見つからなくても何もしない） */
function renameTentativeEvent(name) {
  var cal = getCalendar();
  if (!cal) return;
  var now = new Date();
  var until = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
  cal.getEvents(now, until).forEach(function (ev) {
    var title = ev.getTitle();
    if (title.indexOf('【仮】' + name + '様') === 0) {
      ev.setTitle(title.replace('【仮】', '【確定】'));
    }
  });
}

// ==========================================================
// 未対応リマインド（時間主導トリガーで1時間ごとに実行する）
// ==========================================================
function checkUnhandledReservations() {
  // onEditトリガーが効かなかった場合の保険として、「確定」のままの行を先に処理する
  safely(processConfirmedRows);

  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var values = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS.length).getValues();
  var threshold = new Date(Date.now() - CONFIG.REMIND_AFTER_HOURS * 3600 * 1000);
  var pending = [];

  values.forEach(function (row, i) {
    var timestamp = row[COL_TIMESTAMP - 1];
    var status = row[COL_STATUS - 1];
    var reminded = row[COL_REMINDED - 1];
    if (timestamp instanceof Date && timestamp < threshold && !status && !reminded) {
      pending.push({ rowIndex: i + 2, name: row[COL_NAME - 1], choice: row[COL_CHOICE1 - 1] });
    }
  });

  if (!pending.length) return;

  var text = '【リマインド】未対応の予約が ' + pending.length + ' 件あります\n' +
    pending.map(function (p) {
      return '・' + p.name + '様（' + p.choice + '）';
    }).join('\n') +
    '\n\n確定メールの返信をお願いします。';

  notifyOwnerLine(text);

  pending.forEach(function (p) {
    sheet.getRange(p.rowIndex, COL_REMINDED).setValue('通知済 ' +
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d HH:mm'));
  });
}

// ==========================================================
// 前日リマインド（毎日17時ごろの時間トリガーで実行する）
// 翌日の確定済み予約（対応状況が「案内済み」）のお客様にリマインドメールを送る。
// 対面で「下書き作成済」のまま（=確定メール未送信）の予約があれば、オーナーにLINEで警告する。
// ==========================================================
function sendDayBeforeReminders() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var tomorrowMd = Utilities.formatDate(
    new Date(Date.now() + 24 * 3600 * 1000), 'Asia/Tokyo', 'M/d');
  var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d HH:mm');
  var values = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS.length).getValues();
  var sent = [];
  var unsent = [];

  values.forEach(function (row, i) {
    var rowIndex = i + 2;
    if (String(row[COL_DAYBEFORE - 1] || '')) return; // 通知済み
    var status = String(row[COL_STATUS - 1] || '');
    var confirmed = status.indexOf('案内済み') === 0;
    var draftOnly = status.indexOf('下書き作成済') === 0;
    if (!confirmed && !draftOnly) return;

    // 確定日時（無ければ第一希望）の「M/d」が明日かどうか
    var when = String(row[COL_CONFIRMED - 1] || '') || String(row[COL_CHOICE1 - 1] || '');
    var m = when.match(/(\d{1,2})\/(\d{1,2})/);
    if (!m || (m[1] + '/' + m[2]) !== tomorrowMd) return;

    var r = {
      name: String(row[COL_NAME - 1] || ''),
      email: String(row[COL_EMAIL - 1] || ''),
      course: String(row[COL_COURSE - 1] || '')
    };

    // 確定メールがまだのもの（対面の下書き送信忘れ）はお客様に送らず、オーナーに知らせる
    if (draftOnly) {
      unsent.push(r.name + '様（' + when + '）');
      sheet.getRange(rowIndex, COL_DAYBEFORE).setValue('未案内のため送らず ' + stamp);
      return;
    }

    if (!r.email || r.email.indexOf('@') < 0) return;
    try {
      MailApp.sendEmail({
        to: r.email,
        replyTo: primaryEmail(),
        subject: '【' + CONFIG.SHOP_NAME + '】明日のご予約のご案内（' + when + '）',
        body: buildDayBeforeBody(r, when),
        name: CONFIG.SHOP_NAME
      });
      sheet.getRange(rowIndex, COL_DAYBEFORE).setValue('送信済 ' + stamp);
      sent.push(r.name + '様（' + when + '）');
    } catch (err) {
      console.error('前日リマインド送信失敗:', err);
    }
  });

  if (sent.length) {
    notifyOwnerLine('【前日リマインド】明日のご予約 ' + sent.length + ' 件にリマインドメールを送りました\n' +
      sent.map(function (s) { return '・' + s; }).join('\n'));
  }
  if (unsent.length) {
    notifyOwnerLine('【⚠️ 確認してください】明日の対面予約で、確定メールがまだ送られていないものがあります\n' +
      unsent.map(function (s) { return '・' + s; }).join('\n') +
      '\n\nGmailの下書きを確認して送信し、シートの「対応状況」を「案内済み」に変えてください。');
  }
}

function buildDayBeforeBody(r, when) {
  var isInPerson = r.course.indexOf('対面') >= 0;
  var body = r.name + ' 様\n\n' +
    'いよいよ明日、ご予約の日となりましたのでご案内いたします。\n\n' +
    '────────────────\n' +
    '日時: ' + when + '\n' +
    'コース: ' + r.course + '\n' +
    '────────────────\n\n';
  if (isInPerson) {
    body += '待ち合わせ場所は、予約確定のご連絡メールをご確認ください。\n' +
      '当日はどうぞお気をつけてお越しください。\n\n';
  } else if (CONFIG.MEET_URL) {
    body += buildMeetGuide() + '\n';
  }
  body += '※ご都合が悪くなった場合は、このメールへの返信でお早めにご連絡ください。\n\n' +
    'お話しできるのを楽しみにしております。\n\n' +
    '────────────────\n' +
    CONFIG.SHOP_NAME + '\n' +
    'https://uranai-rokkon.com/\n' +
    'お問い合わせ: ' + primaryEmail() + '\n';
  return body;
}

/**
 * オンライン鑑定（Google Meet）の参加方法ガイド。
 * 確定案内メール・前日リマインドメールの両方で使う（毎回リンクと入り方を載せる）。
 */
function buildMeetGuide() {
  return '【当日の参加方法（Google Meet）】\n' +
    'お時間になりましたら、下記のURLをタップ（クリック）するだけでご参加いただけます。\n\n' +
    '▼ 鑑定ルームのURL\n' +
    CONFIG.MEET_URL + '\n\n' +
    '＜入り方＞\n' +
    '① 上のURLをタップ／クリックします\n' +
    '② スマホの場合は「Google Meet」アプリ（無料）が開きます。パソコンの場合はそのままブラウザで開きます\n' +
    '③ お名前の確認画面が出たら、ご予約のお名前を入れて「参加をリクエスト」を押してください\n' +
    '④ こちらで参加を許可すると、鑑定が始まります\n\n' +
    '※アプリやアカウントの登録は不要です（スマホはアプリが入っていると安定します）\n' +
    '※カメラはオフのままでも大丈夫です。お顔を出さずにご相談いただけます\n' +
    '※電波の良い、静かな場所からのご参加をおすすめします\n' +
    '※もし入れない・音が聞こえない等ありましたら、このメールへの返信か ' + primaryEmail() + ' までお知らせください\n';
}

// ==========================================================
// 月次レポート（毎月1日 朝の時間トリガーで実行する）
// 先月の予約件数のまとめをLINEに送る。
// ==========================================================
function sendMonthlySummary() {
  var now = new Date();
  var y = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'));
  var m = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'M'));
  var prevY = m === 1 ? y - 1 : y;
  var prevM = m === 1 ? 12 : m - 1;
  var prevKey = prevY + '-' + prevM;

  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  var total = 0, online = 0, inPerson = 0;
  var confirmed = 0, declined = 0, others = 0;

  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS.length).getValues();
    values.forEach(function (row) {
      var ts = row[COL_TIMESTAMP - 1];
      if (!(ts instanceof Date)) return;
      if (Utilities.formatDate(ts, 'Asia/Tokyo', 'yyyy-M') !== prevKey) return;
      total++;
      var course = String(row[COL_COURSE - 1] || '');
      if (course.indexOf('対面') >= 0) inPerson++; else online++;
      var status = String(row[COL_STATUS - 1] || '');
      if (status.indexOf('案内済み') === 0 || status.indexOf('下書き作成済') === 0) confirmed++;
      else if (status.indexOf('お断り済') === 0) declined++;
      else others++;
    });
  }

  var text = '【月次レポート】' + prevY + '年' + prevM + '月の予約まとめ\n' +
    '────────────\n' +
    '受付: ' + total + ' 件（オンライン ' + online + '・対面 ' + inPerson + '）\n' +
    '確定: ' + confirmed + ' 件\n' +
    'お断り: ' + declined + ' 件\n' +
    'その他（調整中など）: ' + others + ' 件';
  if (total === 0) {
    text = '【月次レポート】' + prevY + '年' + prevM + '月の予約受付は 0 件でした。';
  }
  notifyOwnerLine(text);
}

// ==========================================================
// 動作テスト（手動実行用）
// ==========================================================
function testNotify() {
  notifyOwnerLine('【テスト】予約システムからのLINE通知テストです。届いていれば設定OK。');
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: '【テスト】予約システムのメール通知テスト',
    body: '届いていれば設定OKです。',
    name: CONFIG.SHOP_NAME + ' 予約システム'
  });
  console.log('テスト通知を送信しました');
}
