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
 * セットアップ手順は docs/reservation-form-setup.md を参照。
 * デプロイ: ウェブアプリ／実行ユーザー「自分」／アクセス「全員」
 */

// ==========================================================
// ★★★ 設定（ここだけ書き換えればOK） ★★★
// ==========================================================
var CONFIG = {
  // 通知・自動返信に使うメールアドレス
  NOTIFY_EMAIL: 'uranai.rokkon@gmail.com',
  SHOP_NAME: '占い処 六根清浄',

  // LINE Messaging API（通知用Botのチャネルアクセストークン・自分のユーザーID）
  // 空のままならLINE通知はスキップされ、メール通知のみ行う
  LINE_CHANNEL_ACCESS_TOKEN: '',
  LINE_OWNER_USER_ID: '',

  // 予約記録用スプレッドシートのID（URLの /d/ と /edit の間の文字列）
  SPREADSHEET_ID: '',
  SHEET_NAME: '予約受付',

  // 仮予約を入れるカレンダーID（空ならデフォルトカレンダー）
  CALENDAR_ID: '',

  // この時間（h）対応されていない予約があればLINEに再通知する
  REMIND_AFTER_HOURS: 3
};

var SHEET_HEADERS = [
  '受付日時', 'お名前', 'メール', 'コース',
  '第一希望', '第二希望', 'ジャンル', 'ご相談内容',
  '対応状況', 'リマインド'
];

// 列番号（1始まり）
var COL_TIMESTAMP = 1;
var COL_STATUS = 9;
var COL_REMINDED = 10;

var PART_TIMES = {
  '昼の部': { startH: 14, startM: 0 },
  '夕の部': { startH: 16, startM: 30 },
  '夜の部': { startH: 19, startM: 0 }
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

    var row = recordToSheet(data);

    // 通知・カレンダーは失敗しても受付自体は成功扱いにする
    safely(function () { createTentativeEvent(data); });
    safely(function () { notifyOwnerLine(buildOwnerMessage(data)); });
    safely(function () { notifyOwnerEmail(data, row); });
    safely(function () { sendAutoReply(data); });

    return jsonResponse({ status: 'ok' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

// 死活確認用
function doGet() {
  return jsonResponse({ status: 'ok', service: 'reservation' });
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
function getSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(SHEET_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 初回に一度だけ手動実行: シートとヘッダー行を作成し、権限承認を済ませる */
function initSheet() {
  var sheet = getSheet();
  console.log('シート準備OK: ' + sheet.getParent().getUrl());
}

function recordToSheet(data) {
  var sheet = getSheet();
  sheet.appendRow([
    new Date(),
    data.name,
    data.email,
    data.course,
    formatChoice(data.date1, data.part1),
    data.date2 ? formatChoice(data.date2, data.part2) : '',
    data.genre || '',
    data.message || '',
    '', // 対応状況（確定したら「対応済み」と記入する）
    ''  // リマインド
  ]);
  return sheet.getLastRow();
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
  var cal = CONFIG.CALENDAR_ID
    ? CalendarApp.getCalendarById(CONFIG.CALENDAR_ID)
    : CalendarApp.getDefaultCalendar();
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
        '第二希望: ' + (data.date2 ? formatChoice(data.date2, data.part2) : 'なし') + '\n' +
        'ジャンル: ' + (data.genre || '未選択') + '\n' +
        '相談内容: ' + (data.message || 'なし')
    }
  );
}

// ==========================================================
// 通知（鑑定師向け）
// ==========================================================
function buildOwnerMessage(data) {
  return '【新規予約】フォームから予約が入りました\n' +
    '────────────\n' +
    'お名前: ' + data.name + '\n' +
    'コース: ' + data.course + '\n' +
    '第一希望: ' + formatChoice(data.date1, data.part1) + '\n' +
    '第二希望: ' + (data.date2 ? formatChoice(data.date2, data.part2) : 'なし') + '\n' +
    'ジャンル: ' + (data.genre || '未選択') + '\n' +
    'メール: ' + data.email + '\n' +
    '────────────\n' +
    '確定メールの返信をお願いします。';
}

function notifyOwnerLine(text) {
  if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN || !CONFIG.LINE_OWNER_USER_ID) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({
      to: CONFIG.LINE_OWNER_USER_ID,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  });
}

function notifyOwnerEmail(data, row) {
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID;
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: '【予約】' + formatChoice(data.date1, data.part1) + ' ' + data.course + '（' + data.name + '様）',
    body: buildOwnerMessage(data) +
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
    replyTo: CONFIG.NOTIFY_EMAIL,
    subject: '【' + CONFIG.SHOP_NAME + '】ご予約を受け付けました（確定前）',
    body: body,
    name: CONFIG.SHOP_NAME
  });
}

// ==========================================================
// 未対応リマインド（時間主導トリガーで1時間ごとに実行する）
// ==========================================================
function checkUnhandledReservations() {
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
      pending.push({ rowIndex: i + 2, name: row[1], choice: row[4] });
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
