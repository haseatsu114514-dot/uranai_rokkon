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
// 秘密の値（LINEトークン・Meet URL・支払い情報）は Script Properties に保存し、
// コードからは自動で読み込む。こうしておくと【コードを貼り替えても消えない】ので、
// 更新のたびに入れ直す必要がない。
//   → 最初の1回だけ saveSecrets() で保存する（手順はファイル末尾の saveSecrets を参照）
// ==========================================================
var SECRETS = (function () {
  try { return PropertiesService.getScriptProperties().getProperties(); }
  catch (e) { return {}; }
})();

var CONFIG = {
  // 通知・自動返信に使うメールアドレス（複数の場合はカンマ区切り。先頭が主アドレス）
  NOTIFY_EMAIL: 'uranai.rokkon@gmail.com,haseatsu114514@gmail.com',
  SHOP_NAME: '占い処 六根清浄',

  // 【以下4種はScript Propertiesから自動読み込み】saveSecrets() で一度だけ保存する
  // LINE通知（通知用Botのチャネルアクセストークン・自分のユーザーID）。未設定ならLINE通知はスキップ
  LINE_CHANNEL_ACCESS_TOKEN: SECRETS.LINE_CHANNEL_ACCESS_TOKEN || '',
  LINE_OWNER_USER_ID: SECRETS.LINE_OWNER_USER_ID || '',
  // オンライン鑑定の Google Meet URL（確定案内メールに記載される）
  MEET_URL: SECRETS.MEET_URL || '',
  // 支払い案内（確定案内メールに記載される）
  PAY_PAYPAY_ID: SECRETS.PAY_PAYPAY_ID || '',
  PAY_BANK_TEXT: SECRETS.PAY_BANK_TEXT || '',

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

// 本番反映状況を ?action=health で確認するための識別子（秘密情報は返さない）
var SYSTEM_VERSION = '2026-07-25-same-day-fast-availability';

// ===== 空き状況の計算ルール =====
// 通常予約は翌日以降。当日は「開始3時間前までの要確認リクエスト」として受け付け、
// LINE・管理者メールで至急通知し、鑑定師が確定／お断りを判断する。
var LEAD_DAYS = 0;              // 0 = 当日リクエストも候補に含める
var AVAIL_DAYS = 11;            // 今日＋10日先まで
var SAME_DAY_MIN_LEAD_HOURS = 3;
var AVAILABILITY_CACHE_SECONDS = 90;
var SLOT_STEP_MIN = 30;         // 30分刻みで枠を探す
var BUFFER_MIN = 30;            // 既存予定の前後30分は空ける

var SHEET_HEADERS = [
  '受付日時', 'お名前', '性別', '生年月日', '出生時間・出生地', 'メール', 'コース',
  '第一希望', '第二希望', 'テーマ', 'ご相談内容', '支払い希望',
  '対応状況', 'リマインド', '確定日時', '前日リマインド',
  'カレンダーイベントID', '仮予約日時', 'システム処理結果'
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
var COL_EVENT_ID = 17;    // 仮予約イベントを名前ではなく一意に特定する
var COL_TENTATIVE = 18;   // カレンダーに確保した実際の開始・終了時刻
var COL_SYSTEM_RESULT = 19; // LINE・管理者メール・自動返信などの成否

// 承認フローで使う「対応状況」の値（プルダウンで選ぶ）
var STATUS_CONFIRM_1 = '確定';        // 第一希望で確定 → 確定案内を自動送信/下書き作成
var STATUS_CONFIRM_2 = '確定2';       // 第二希望で確定（あとは同じ）
var STATUS_RESCHEDULE = '別日提案';   // 希望日が取れない → 空き日時リスト入りの調整メールを自動送信
var STATUS_DECLINE = 'お断り';        // ご案内できない → お断りメールを自動送信

// プルダウンに出す選択肢（下3つは手動運用向け。「案内済み」ではカレンダー名だけ整える）
var STATUS_DROPDOWN = [
  STATUS_CONFIRM_1, STATUS_CONFIRM_2, STATUS_RESCHEDULE, STATUS_DECLINE,
  '保留', '対応済み', '案内済み'
];

var PART_TIMES = {
  '昼の部': { startH: 14, startM: 0, endH: 16, endM: 30 },
  '夕の部': { startH: 16, startM: 30, endH: 19, endM: 0 },
  '夜の部': { startH: 19, startM: 0, endH: 22, endM: 0 }
};

var ALLOWED_COURSES = [
  'オンライン30分（5,000円）',
  'オンライン60分（10,000円）',
  '対面・栄 60分（10,000円）'
];
var ALLOWED_SEXES = ['女性', '男性', 'その他・回答しない'];
var ALLOWED_GENRES = ['', '恋愛・復縁', '出会い・婚活', '仕事', '人生・家族', 'その他'];
var ALLOWED_PAY_METHODS = ['PayPay', '銀行振込', '現地払い（対面）'];

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

    // 同時送信で同じ空き枠を二重に確保しないよう、記録と仮予約だけ直列化する
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return jsonResponse({
        status: 'error',
        message: 'ただいま予約が集中しています。少し時間をおいて再度お試しください。'
      });
    }

    var repeat = null;
    var row;
    var sheet;
    var calendarResult;
    try {
      // リピーター判定（新しい行を追加する前に過去の予約を探す）
      try { repeat = findRepeaterInfo(data.email); } catch (repeatErr) { console.error(repeatErr); }
      sheet = getSheet();
      row = recordToSheet(data, sheet);
      calendarResult = attemptTask('カレンダー仮予約', function () {
        return createTentativeEvent(data, sheet, row);
      });
      if (calendarResult.ok) clearAvailabilityCache();
    } finally {
      lock.releaseLock();
    }

    // お客様への受付確認を先に送り、その結果も管理者通知に載せる
    var customerEmailResult = attemptTask('お客様への受付確認メール', function () {
      sendAutoReply(data);
      return '送信済み';
    });
    var lineResult = attemptTask('LINE通知', function () {
      notifyOwnerLine(buildOwnerMessage(data, repeat, {
        row: row,
        tentativeWhen: calendarResult.ok && calendarResult.value ? calendarResult.value.when : ''
      }));
      return '送信済み';
    });

    var results = {
      calendar: calendarResult,
      customerEmail: customerEmailResult,
      line: lineResult
    };
    var ownerEmailResult = attemptTask('管理者メール', function () {
      notifyOwnerEmail(data, row, repeat, results);
      return '送信済み';
    });
    results.ownerEmail = ownerEmailResult;
    writeSystemResult(sheet, row, results);

    return jsonResponse({
      status: 'ok',
      confirmationEmailSent: customerEmailResult.ok,
      sameDayRequest: isSameDayValue(data.date1)
    });
  } catch (err) {
    console.error('doPost error:', err);
    return jsonResponse({
      status: 'error',
      message: '予約の受付処理でエラーが発生しました。お手数ですが時間をおいて再度お試しください。'
    });
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
  if (action === 'health') {
    return jsonResponse({
      status: 'ok',
      service: 'reservation',
      version: SYSTEM_VERSION,
      configured: {
        line: !!(CONFIG.LINE_CHANNEL_ACCESS_TOKEN && CONFIG.LINE_OWNER_USER_ID),
        meet: !!CONFIG.MEET_URL,
        payPay: !!CONFIG.PAY_PAYPAY_ID,
        bank: !!CONFIG.PAY_BANK_TEXT
      }
    });
  }
  return jsonResponse({ status: 'ok', service: 'reservation' });
}

// ==========================================================
// 空き状況の計算（カレンダーの予定から「出せる日時」だけを返す）
// ==========================================================
function getAvailability() {
  var cached = readAvailabilityCache();
  if (cached) return cached;

  var cal = getCalendar();
  var now = new Date();
  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  var days = [];
  var firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + LEAD_DAYS);
  var lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + AVAIL_DAYS - 1);

  // 日×部ごとにCalendar APIを呼ぶと30回以上の通信になるため、対象期間を1回で取得して使い回す。
  var allEvents = cal.getEvents(
    new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate()),
    new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1)
  );

  for (var i = LEAD_DAYS; i < LEAD_DAYS + AVAIL_DAYS; i++) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    var sameDay = isSameLocalDate(d, now);
    var notBefore = sameDay
      ? new Date(now.getTime() + SAME_DAY_MIN_LEAD_HOURS * 60 * 60 * 1000)
      : null;
    var parts = {};
    Object.keys(PART_TIMES).forEach(function (partName) {
      parts[partName] = {
        ok30: hasFreeSlot(cal, d, partName, 30, allEvents, notBefore),
        ok60: hasFreeSlot(cal, d, partName, 60, allEvents, notBefore)
      };
    });
    days.push({
      date: Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd'),
      label: (d.getMonth() + 1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')' +
        (sameDay ? ' 当日・要確認' : ''),
      sameDay: sameDay,
      parts: parts
    });
  }
  writeAvailabilityCache(days);
  return days;
}

function availabilityCache() {
  if (typeof CacheService === 'undefined') return null;
  try { return CacheService.getScriptCache(); } catch (err) { return null; }
}

function readAvailabilityCache() {
  var cache = availabilityCache();
  if (!cache) return null;
  try {
    var text = cache.get('availability_v3');
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error('空き状況キャッシュの読込失敗:', err);
    return null;
  }
}

function writeAvailabilityCache(days) {
  var cache = availabilityCache();
  if (!cache) return;
  try {
    cache.put('availability_v3', JSON.stringify(days), AVAILABILITY_CACHE_SECONDS);
  } catch (err) {
    console.error('空き状況キャッシュの保存失敗:', err);
  }
}

function clearAvailabilityCache() {
  var cache = availabilityCache();
  if (!cache) return;
  try { cache.remove('availability_v3'); } catch (err) { console.error(err); }
}

/** その日のその部に、指定分数の鑑定を入れられる枠が1つでもあるか */
function hasFreeSlot(cal, day, partName, minutes, prefetchedEvents, notBefore) {
  return findFreeSlotStart(cal, day, partName, minutes, null, prefetchedEvents, notBefore) !== null;
}

/**
 * その日のその部で、既存予約とバッティングしない「最初の空き開始時刻」を返す。
 * 空きがなければ null。Meet室の重複を防ぐため、仮予約の配置にも使う。
 */
function findFreeSlotStart(cal, day, partName, minutes, ignoredEventId, prefetchedEvents, notBefore) {
  var t = PART_TIMES[partName];
  if (!t) return null;
  var partStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.startH, t.startM);
  var partEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.endH, t.endM);

  // 既存予定（前後のバッファ込みで衝突判定する）
  var events = prefetchedEvents || cal.getEvents(
      new Date(partStart.getTime() - BUFFER_MIN * 60000),
      new Date(partEnd.getTime() + BUFFER_MIN * 60000)
    );
  var busy = events
    .filter(function (ev) {
      return !ev.isAllDayEvent() && (!ignoredEventId || ev.getId() !== ignoredEventId);
    })
    .map(function (ev) {
      return {
        s: ev.getStartTime().getTime() - BUFFER_MIN * 60000,
        e: ev.getEndTime().getTime() + BUFFER_MIN * 60000
      };
    });

  for (var s = partStart.getTime(); s + minutes * 60000 <= partEnd.getTime(); s += SLOT_STEP_MIN * 60000) {
    if (notBefore && s < notBefore.getTime()) continue;
    var slotEnd = s + minutes * 60000;
    var conflict = busy.some(function (b) { return s < b.e && slotEnd > b.s; });
    if (!conflict) return new Date(s);
  }
  return null;
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

function attemptTask(label, fn) {
  try {
    return { ok: true, label: label, value: fn() };
  } catch (err) {
    console.error(label + ' error:', err);
    return { ok: false, label: label, error: String(err) };
  }
}

function taskResultText(result) {
  if (!result) return '未実行';
  return result.ok ? '成功' : '失敗（' + safeErrorText(result.error) + '）';
}

function safeErrorText(value) {
  return String(value || '原因不明').replace(/[\r\n]+/g, ' ').slice(0, 180);
}

function writeSystemResult(sheet, row, results) {
  if (!sheet || !row) return;
  var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d HH:mm');
  var text = [
    'カレンダー:' + taskResultText(results.calendar),
    'LINE:' + taskResultText(results.line),
    '管理者メール:' + taskResultText(results.ownerEmail),
    '受付確認メール:' + taskResultText(results.customerEmail)
  ].join(' / ');
  try {
    sheet.getRange(row, COL_SYSTEM_RESULT).setValue(stamp + ' ' + text);
  } catch (err) {
    console.error('システム処理結果の記録に失敗:', err);
  }
}

function validateReservation(data) {
  var name = String(data.name || '').trim();
  if (!name || name.length > 50 || /[\r\n]/.test(name)) return 'お名前をご確認ください';
  if (ALLOWED_SEXES.indexOf(String(data.sex || '')) < 0) return '性別を選択してください';
  if (!isValidYmd(data.birthdate)) return '生年月日をご確認ください';
  var birth = parseYmd(data.birthdate);
  var now = new Date();
  if (birth.getFullYear() < 1920 || birth > now) return '生年月日をご確認ください';
  var email = String(data.email || '');
  if (!email || email.length > 100 || /[\r\n]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'メールアドレスをご確認ください';
  }
  if (ALLOWED_COURSES.indexOf(String(data.course || '')) < 0) return 'コースを選択してください';
  if (!isValidYmd(data.date1) || !isReservationDateAllowed(data.date1)) return '第一希望日をご確認ください';
  if (!isAllowedPartLabel(data.part1)) return '第一希望の時間帯を選択してください';
  if (!isRequestedPartWithinLead(data.date1, data.part1, data.course)) {
    return '当日のご予約は開始3時間前まで受け付けています。別の時間帯または日付をお選びください';
  }
  if (data.date2 || data.part2) {
    if (!isValidYmd(data.date2) || !isReservationDateAllowed(data.date2)) return '第二希望日をご確認ください';
    if (!isAllowedPartLabel(data.part2)) return '第二希望の時間帯を選択してください';
    if (!isRequestedPartWithinLead(data.date2, data.part2, data.course)) {
      return '第二希望の当日予約は開始3時間前までです。別の時間帯または日付をお選びください';
    }
  }
  if (ALLOWED_GENRES.indexOf(String(data.genre || '')) < 0) return 'ご相談テーマをご確認ください';
  if (data.birthtime && String(data.birthtime).length > 100) return '出生時間・出生地が長すぎます';
  if (data.message && String(data.message).length > 1000) return 'ご相談内容が長すぎます';
  var isInPerson = String(data.course).indexOf('対面') >= 0;
  var payMethod = String(data.payMethod || '');
  if (isInPerson) {
    if (payMethod !== '現地払い（対面）') return 'お支払い方法をご確認ください';
  } else if (ALLOWED_PAY_METHODS.indexOf(payMethod) < 0 || payMethod === '現地払い（対面）') {
    return 'お支払い方法を選択してください';
  }
  return null;
}

function isValidYmd(value) {
  var s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = parseYmd(s);
  return !isNaN(d.getTime()) && Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') === s;
}

function isReservationDateAllowed(value) {
  var target = parseYmd(String(value));
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var first = new Date(today.getFullYear(), today.getMonth(), today.getDate() + LEAD_DAYS);
  var last = new Date(first.getFullYear(), first.getMonth(), first.getDate() + AVAIL_DAYS - 1);
  return target >= first && target <= last;
}

function isSameLocalDate(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isSameDayValue(value, now) {
  if (!isValidYmd(value)) return false;
  return isSameLocalDate(parseYmd(String(value)), now || new Date());
}

function courseMinutes(course) {
  return String(course || '').indexOf('30分') >= 0 ? 30 : 60;
}

function sameDayNotBefore(now) {
  var base = now || new Date();
  return new Date(base.getTime() + SAME_DAY_MIN_LEAD_HOURS * 60 * 60 * 1000);
}

function isRequestedPartWithinLead(dateValue, partValue, course, now) {
  var current = now || new Date();
  if (!isSameDayValue(dateValue, current)) return true;
  var partName = extractPartName(partValue);
  var t = PART_TIMES[partName];
  if (!t) return false;
  var day = parseYmd(String(dateValue));
  var latestStart = new Date(
    day.getFullYear(), day.getMonth(), day.getDate(), t.endH, t.endM
  ).getTime() - courseMinutes(course) * 60000;
  return latestStart >= sameDayNotBefore(current).getTime();
}

function isAllowedPartLabel(value) {
  var partName = extractPartName(value);
  return !!PART_TIMES[partName] && String(value) === partLabel(partName);
}

function extractPartName(value) {
  return String(value || '').replace(/（.*$/, '');
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

function recordToSheet(data, sheet) {
  sheet = sheet || getSheet();
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
    '', // 前日リマインド（自動記入）
    '', // カレンダーイベントID
    '', // 仮予約日時
    ''  // システム処理結果
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
function createTentativeEvent(data, sheet, rowIndex) {
  var cal = getCalendar();
  if (!cal) throw new Error('予約カレンダーを取得できませんでした');

  var partName = extractPartName(data.part1); // 「昼の部（14:00〜16:30）」→「昼の部」
  var slot = PART_TIMES[partName];
  if (!slot) throw new Error('時間帯を判定できませんでした');

  var d = parseYmd(data.date1);
  var minutes = courseMinutes(data.course);
  var notBefore = isSameDayValue(data.date1) ? sameDayNotBefore() : null;

  // 同じ部に既に予約があっても重ならないよう、空いている最初の時刻に置く。
  // 固定Meet URLでも、予約どうしが同じ時間に重ならないのでバッティングを避けられる。
  var start = findFreeSlotStart(cal, d, partName, minutes, null, null, notBefore);
  if (!start) {
    throw new Error('送信直前に第一希望の枠が埋まりました。日程調整が必要です');
  }
  var end = new Date(start.getTime() + minutes * 60000);

  var event = cal.createEvent(
    '【仮#' + rowIndex + '】' + data.name + '様 ' + data.course,
    start, end,
    {
      description:
        'フォーム予約（未確定）。空き時刻に自動配置しました（調整可）。\n' +
        '予約シート: ' + rowIndex + '行目\n' +
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
  var when = formatExactWhen(start, end);
  if (sheet) {
    sheet.getRange(rowIndex, COL_EVENT_ID).setValue(event.getId());
    sheet.getRange(rowIndex, COL_TENTATIVE).setValue(when);
  }
  return { eventId: event.getId(), when: when };
}

// ==========================================================
// 通知（鑑定師向け）
// ==========================================================
function buildOwnerMessage(data, repeat, context) {
  context = context || {};
  var sameDay = isSameDayValue(data.date1);
  var repeatLine = '';
  if (repeat) {
    repeatLine = '🔁 リピーター（' + (repeat.count + 1) + '回目';
    if (repeat.last instanceof Date) {
      repeatLine += '・前回 ' + Utilities.formatDate(repeat.last, 'Asia/Tokyo', 'yyyy年M月');
    }
    repeatLine += '）\n';
  }
  return (sameDay
      ? '🔥【当日希望・至急確認】本日の予約リクエストです\n今すぐ対応可否を判断してください\n'
      : '【新規予約】フォームから予約が入りました\n') +
    repeatLine +
    '────────────\n' +
    'お名前: ' + data.name + '\n' +
    'コース: ' + data.course + '\n' +
    '第一希望: ' + formatChoice(data.date1, data.part1) + '\n' +
    '第二希望: ' + (data.date2 ? formatChoice(data.date2, data.part2) : 'なし') + '\n' +
    'テーマ: ' + (data.genre || '未選択') + '\n' +
    (context.tentativeWhen ? '仮押さえ時刻: ' + context.tentativeWhen + '\n' : '') +
    '────────────\n' +
    '＜やること＞\n' +
    (sameDay ? '① 仮押さえ時刻と現在時刻をすぐ確認する\n' : '① 下の予約シートを開く\n') +
    '② ' + (context.row ? context.row + '行目の' : '') + '相談内容と日時を確認する\n' +
    '③ 「対応状況」を選ぶ\n' +
    '　確定＝第一希望／確定2＝第二希望\n' +
    '　別日提案＝空き日時を案内／お断り＝お断りメール\n' +
    '※オンラインの確定案内は自動送信、対面はGmail下書きを確認して送信';
}

function notifyOwnerLine(text) {
  if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN || !CONFIG.LINE_OWNER_USER_ID) {
    throw new Error('LINE通知のScript Propertiesが未設定です');
  }

  // すべてのLINE通知の末尾に予約シートへのリンクを付ける（タップで開けるように）
  var link = '';
  try {
    link = '\n\n📋 予約シートを開く\n' + getSheet().getParent().getUrl();
  } catch (err) {
    // シートが取れなくても通知自体は送る
  }

  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({
      to: CONFIG.LINE_OWNER_USER_ID,
      messages: [{ type: 'text', text: text + link }]
    }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('LINE API HTTP ' + code + ': ' + safeErrorText(response.getContentText()));
  }
  return true;
}

function notifyOwnerEmail(data, row, repeat, results) {
  var sheetUrl = getSheet().getParent().getUrl();
  var context = {
    row: row,
    tentativeWhen: results.calendar && results.calendar.ok && results.calendar.value
      ? results.calendar.value.when : ''
  };
  var body = buildOwnerEmailBody(data, row, repeat, sheetUrl, results, context);
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: (isSameDayValue(data.date1) ? '【至急・当日予約】' : '【要対応・予約】') +
      formatChoice(data.date1, data.part1) + ' ' + data.course + '（' + data.name + '様）' +
      (repeat ? '🔁' : ''),
    body: body,
    htmlBody: buildOwnerEmailHtml(data, row, repeat, sheetUrl, results, context),
    name: CONFIG.SHOP_NAME + ' 予約システム'
  });
}

function buildOwnerEmailBody(data, row, repeat, sheetUrl, results, context) {
  var repeatText = repeat ? 'はい（今回が' + (repeat.count + 1) + '回目）' : 'いいえ';
  var sameDay = isSameDayValue(data.date1);
  return (sameDay
      ? '【至急】本日の予約希望です。今すぐ対応可否を確認してください。\n\n'
      : '新しい予約が入りました。内容を確認して対応してください。\n\n') +
    '【予約内容】\n' +
    'お名前: ' + data.name + '\n' +
    'メール: ' + data.email + '\n' +
    'リピーター: ' + repeatText + '\n' +
    '性別: ' + data.sex + '\n' +
    '生年月日: ' + data.birthdate + '\n' +
    '出生時間・出生地: ' + (data.birthtime || '記載なし') + '\n' +
    'コース: ' + data.course + '\n' +
    '第一希望: ' + formatChoice(data.date1, data.part1) + '\n' +
    '第二希望: ' + (data.date2 ? formatChoice(data.date2, data.part2) : 'なし') + '\n' +
    '仮押さえ時刻: ' + (context.tentativeWhen || '未確保（要確認）') + '\n' +
    'テーマ: ' + (data.genre || '未選択') + '\n' +
    'ご相談内容:\n' + (data.message || '記載なし') + '\n' +
    '支払い希望: ' + (data.payMethod || '未選択') + '\n\n' +
    '【システム処理結果】\n' +
    'カレンダー仮予約: ' + taskResultText(results.calendar) + '\n' +
    'LINE通知: ' + taskResultText(results.line) + '\n' +
    'お客様への受付確認メール: ' + taskResultText(results.customerEmail) + '\n\n' +
    '【次にすること】\n' +
    '1. 予約シートの' + row + '行目を開く\n' +
    '2. ' + (sameDay ? '当日対応できるか、' : '') + '相談内容・カレンダー・希望日時を確認する\n' +
    '3. 「対応状況」で次のどれかを選ぶ\n' +
    '   ・確定: 第一希望で案内\n' +
    '   ・確定2: 第二希望で案内\n' +
    '   ・別日提案: 現在の空き日時を自動メール\n' +
    '   ・お断り: お断りメール\n' +
    '4. 対面予約の場合だけ、作成されたGmail下書きに待ち合わせ場所を記入して送信する\n\n' +
    '予約シート:\n' + sheetUrl + '\n\n' +
    '未対応のまま ' + CONFIG.REMIND_AFTER_HOURS + ' 時間経つとLINEへ再通知します。';
}

function buildOwnerEmailHtml(data, row, repeat, sheetUrl, results, context) {
  function e(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nl(value) { return e(value).replace(/\n/g, '<br>'); }
  var repeatText = repeat ? 'はい（今回が' + (repeat.count + 1) + '回目）' : 'いいえ';
  var isInPerson = String(data.course).indexOf('対面') >= 0;
  var sameDay = isSameDayValue(data.date1);
  var action4 = isInPerson
    ? '<li><strong>Gmail下書き</strong>に待ち合わせ場所を記入して送信し、シートを「案内済み」にする</li>'
    : '<li>「確定」または「確定2」で、お客様への確定案内メールが自動送信されます</li>';
  return '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#2f2f2f;line-height:1.7;max-width:720px">' +
    (sameDay
      ? '<div style="background:#fff0ed;border:2px solid #c44735;color:#8b2116;padding:12px 14px;margin-bottom:16px"><strong>至急: 本日の予約希望です。今すぐ対応可否を確認してください。</strong></div>'
      : '') +
    '<h2 style="font-size:20px;margin:0 0 16px">新しい予約が入りました</h2>' +
    '<p><a href="' + e(sheetUrl) + '" style="display:inline-block;background:#6f7758;color:#fff;padding:12px 18px;text-decoration:none">予約シートの' + row + '行目を開く</a></p>' +
    '<h3 style="border-bottom:1px solid #bbb;padding-bottom:6px">予約内容</h3>' +
    '<table style="border-collapse:collapse;width:100%">' +
    ownerEmailRow('お名前', data.name, e) +
    ownerEmailRow('メール', data.email, e) +
    ownerEmailRow('リピーター', repeatText, e) +
    ownerEmailRow('性別', data.sex, e) +
    ownerEmailRow('生年月日', data.birthdate, e) +
    ownerEmailRow('出生時間・出生地', data.birthtime || '記載なし', e) +
    ownerEmailRow('コース', data.course, e) +
    ownerEmailRow('第一希望', formatChoice(data.date1, data.part1), e) +
    ownerEmailRow('第二希望', data.date2 ? formatChoice(data.date2, data.part2) : 'なし', e) +
    ownerEmailRow('仮押さえ時刻', context.tentativeWhen || '未確保（要確認）', e) +
    ownerEmailRow('テーマ', data.genre || '未選択', e) +
    ownerEmailRow('支払い希望', data.payMethod || '未選択', e) +
    '</table>' +
    '<h3 style="border-bottom:1px solid #bbb;padding-bottom:6px">ご相談内容</h3>' +
    '<div style="background:#f5f3ed;padding:14px;white-space:normal">' + nl(data.message || '記載なし') + '</div>' +
    '<h3 style="border-bottom:1px solid #bbb;padding-bottom:6px">システム処理結果</h3>' +
    '<ul><li>カレンダー仮予約: ' + e(taskResultText(results.calendar)) + '</li>' +
    '<li>LINE通知: ' + e(taskResultText(results.line)) + '</li>' +
    '<li>お客様への受付確認メール: ' + e(taskResultText(results.customerEmail)) + '</li></ul>' +
    '<h3 style="border-bottom:1px solid #bbb;padding-bottom:6px">次にすること</h3>' +
    '<ol><li>' + (sameDay ? '<strong>当日対応できるか、</strong>' : '') + '相談内容・カレンダー・希望日時を確認</li>' +
    '<li>シートの「対応状況」で <strong>確定／確定2／別日提案／お断り</strong> のいずれかを選ぶ</li>' +
    action4 + '</ol>' +
    '<p style="color:#666;font-size:13px">未対応のまま ' + CONFIG.REMIND_AFTER_HOURS + ' 時間経つとLINEへ再通知します。</p>' +
    '</div>';
}

function ownerEmailRow(label, value, esc) {
  return '<tr><th style="text-align:left;vertical-align:top;background:#f5f3ed;border:1px solid #ddd;padding:8px;width:150px">' +
    esc(label) + '</th><td style="border:1px solid #ddd;padding:8px">' + esc(value) + '</td></tr>';
}

// ==========================================================
// 自動返信（お客様向け）
// ==========================================================
function sendAutoReply(data) {
  var sameDay = isSameDayValue(data.date1);
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
    (sameDay
      ? '本日のご希望のため、対応できるか至急確認しています。\nご案内できる場合は、予約確定のメールをお送りします。\n\n'
      : '空き状況を確認のうえ、通常24時間以内に、このメールアドレス宛に\n予約確定のご連絡をお送りします。いましばらくお待ちください。\n\n') +
    '※ このメールの時点では予約は確定していません\n' +
    (sameDay ? '※ 確定メールが届くまでは、ご来店・お支払い・Meetへの参加はお待ちください\n' : '') +
    '※ お支払い方法・当日のご案内は、確定のご連絡の際にお伝えします\n' +
    '※ お心当たりのない場合は、このメールは破棄してください\n\n' +
    '────────────────\n' +
    CONFIG.SHOP_NAME + '\n' +
    'https://uranai-rokkon.com/\n' +
    'お問い合わせ: ' + primaryEmail() + '\n';

  MailApp.sendEmail({
    to: data.email,
    replyTo: primaryEmail(),
    subject: '【' + CONFIG.SHOP_NAME + '】' +
      (sameDay ? '当日予約のご希望を受け付けました（確定前）' : 'ご予約を受け付けました（確定前）'),
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
    if (value === '案内済み') {
      var manualRow = e.range.getRow();
      safely(function () { renameTentativeEvent(sheet, manualRow, ''); });
      return;
    }
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
      safely(function () { deleteTentativeEvent(sheet, rowIndex, r.name); });
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
      safely(function () { deleteTentativeEvent(sheet, rowIndex, r.name); });
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

  // 希望の「時間帯」から、カレンダー上の実際の開始・終了時刻を確保する。
  // 第二希望で確定する場合は、第一希望に置いた仮予約イベントを移動する。
  try {
    var exactSlot = prepareExactSlot(sheet, rowIndex, r, useSecond);
    when = exactSlot.when;
  } catch (slotErr) {
    fail('確定時刻を確保できませんでした: ' + String(slotErr));
    return;
  }

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
          '＜やること＞\n' +
          '① 下のGmail下書きを開く\n' +
          '② 待ち合わせ場所の【★】を埋めて送信する\n' +
          '③ シートの「対応状況」を「案内済み」に変える\n\n' +
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
    safely(function () { renameTentativeEvent(sheet, rowIndex, r.name); });
    safely(function () {
      notifyOwnerLine(
        '【確定案内 送信完了】オンライン\n' +
        r.name + '様（' + when + '）\n' +
        '支払い希望: ' + (r.payMethod || '未選択') + '\n\n' +
        '▼ 当日の鑑定ルーム（Meet）\n' +
        CONFIG.MEET_URL + '\n\n' +
        '＜やること＞\n' +
        '① 当日、開始時刻にこの↑URLを開く\n' +
        '② お客様の「参加リクエスト」を許可する\n' +
        '（前日にもこのMeetリンク入りのリマインドが届きます）'
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

function formatExactWhen(start, end) {
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  return Utilities.formatDate(start, 'Asia/Tokyo', 'M/d') +
    '(' + days[start.getDay()] + ') ' +
    Utilities.formatDate(start, 'Asia/Tokyo', 'HH:mm') + '〜' +
    Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm');
}

/** シートの「M/d(曜) 時間帯」から、直近の該当日を復元する */
function parseChoiceDate(choice) {
  var m = String(choice || '').match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) throw new Error('希望日の形式を読み取れません: ' + choice);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  // 年末に翌年1月を選んだケース
  if (d < new Date(today.getTime() - 24 * 3600 * 1000)) {
    d = new Date(now.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
  }
  return d;
}

function extractPartNameFromChoice(choice) {
  var names = Object.keys(PART_TIMES);
  for (var i = 0; i < names.length; i++) {
    if (String(choice).indexOf(names[i]) >= 0) return names[i];
  }
  throw new Error('希望時間帯を読み取れません: ' + choice);
}

function findStoredTentativeEvent(sheet, rowIndex, name) {
  var cal = getCalendar();
  if (!cal) return null;
  var eventId = String(sheet.getRange(rowIndex, COL_EVENT_ID).getValue() || '');
  if (eventId) {
    try {
      var stored = cal.getEventById(eventId);
      if (stored) return stored;
    } catch (err) {
      console.error('保存済みイベントIDの取得に失敗:', err);
    }
  }

  // 旧バージョンで作られた行はIDがないため、タイトルから1件だけ探す
  var now = new Date();
  var until = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
  var exactPrefix = '【仮#' + rowIndex + '】';
  var legacyPrefix = name ? '【仮】' + name + '様' : '';
  var events = cal.getEvents(new Date(now.getTime() - 24 * 3600 * 1000), until);
  for (var i = 0; i < events.length; i++) {
    var title = events[i].getTitle();
    if (title.indexOf(exactPrefix) === 0 || (legacyPrefix && title.indexOf(legacyPrefix) === 0)) {
      sheet.getRange(rowIndex, COL_EVENT_ID).setValue(events[i].getId());
      return events[i];
    }
  }
  return null;
}

/**
 * 第一/第二希望の時間帯に、重複しない実時刻を確保する。
 * 既存の仮予約イベントがあれば同じイベントを移動する。
 */
function prepareExactSlot(sheet, rowIndex, r, useSecond) {
  var cal = getCalendar();
  if (!cal) throw new Error('予約カレンダーを取得できません');
  var choice = useSecond ? r.choice2 : r.choice1;
  var day = parseChoiceDate(choice);
  var partName = extractPartNameFromChoice(choice);
  var minutes = String(r.course).indexOf('30分') >= 0 ? 30 : 60;
  var current = findStoredTentativeEvent(sheet, rowIndex, r.name);
  var ignoredId = current ? current.getId() : '';
  var start = findFreeSlotStart(cal, day, partName, minutes, ignoredId);
  if (!start) throw new Error('選択した時間帯に空きがありません');
  var end = new Date(start.getTime() + minutes * 60000);

  if (current) {
    current.setTime(start, end);
    current.setTitle('【仮#' + rowIndex + '】' + r.name + '様 ' + r.course);
  } else {
    current = cal.createEvent(
      '【仮#' + rowIndex + '】' + r.name + '様 ' + r.course,
      start,
      end,
      { description: '予約シート ' + rowIndex + '行目。確定処理時に仮予約イベントを再作成しました。' }
    );
  }

  var when = formatExactWhen(start, end);
  sheet.getRange(rowIndex, COL_EVENT_ID).setValue(current.getId());
  sheet.getRange(rowIndex, COL_TENTATIVE).setValue(when);
  return { event: current, when: when };
}

/** カレンダーの【仮】イベントを削除する（別日提案・お断り用） */
function deleteTentativeEvent(sheet, rowIndex, name) {
  var event = findStoredTentativeEvent(sheet, rowIndex, name);
  if (!event) return;
  event.deleteEvent();
  sheet.getRange(rowIndex, COL_EVENT_ID).setValue('');
  sheet.getRange(rowIndex, COL_TENTATIVE).setValue('');
}

/** カレンダーの【仮】イベントを【確定】に改名する */
function renameTentativeEvent(sheet, rowIndex, name) {
  var event = findStoredTentativeEvent(sheet, rowIndex, name);
  if (!event) return;
  var title = event.getTitle();
  event.setTitle(title.replace(/^【仮(?:#\d+)?】/, '【確定】'));
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
    '\n\n＜やること＞\n' +
    '① 下の予約シートを開く\n' +
    '② 「対応状況」を選ぶ（確定／別日提案／お断り など）';

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
  var hasOnline = false;

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
      var isOnline = r.course.indexOf('対面') < 0;
      sent.push(r.name + '様（' + when + (isOnline ? '・オンライン' : '・対面') + '）');
      if (isOnline) hasOnline = true;
    } catch (err) {
      console.error('前日リマインド送信失敗:', err);
    }
  });

  if (sent.length) {
    var msg = '【前日リマインド】明日のご予約 ' + sent.length + ' 件にリマインドメールを送りました\n' +
      sent.map(function (s) { return '・' + s; }).join('\n');
    if (hasOnline && CONFIG.MEET_URL) {
      msg += '\n\n▼ オンラインの鑑定ルーム（Meet）\n' + CONFIG.MEET_URL +
        '\n\n＜やること＞\n① 明日、開始時刻にこの↑URLを開く\n② お客様の「参加リクエスト」を許可する';
    }
    notifyOwnerLine(msg);
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
      if (status.indexOf('案内済み') === 0) confirmed++;
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
// 秘密の値の保存（最初に1回だけ実行する）
// ==========================================================
/**
 * LINEトークン・Meet URL・支払い情報を Script Properties に保存する。
 * ここに値を書いて一度だけ実行すれば、以降はコードを貼り替えても消えない。
 * 【セキュリティ】保存できたら、下の値はまた空 '' に戻して保存しておくと安心
 *   （コードに本物の値を残さないため。Propertiesには保存済みなので動作には影響しない）。
 */
function saveSecrets() {
  var values = {
    LINE_CHANNEL_ACCESS_TOKEN: '',  // LINE通知Botのチャネルアクセストークン
    LINE_OWNER_USER_ID: '',         // 自分のユーザーID（Uで始まる）
    MEET_URL: '',                   // Google MeetのURL
    PAY_PAYPAY_ID: '',              // PayPay ID
    PAY_BANK_TEXT: ''               // 振込先口座（複数行は \n で改行）
  };

  var props = PropertiesService.getScriptProperties();
  var saved = [];
  Object.keys(values).forEach(function (k) {
    if (values[k] !== '') { props.setProperty(k, values[k]); saved.push(k); }
  });

  if (!saved.length) {
    console.log('⚠️ 値が空でした。saveSecrets() の中に値を書いてから実行してください。\n' +
      '現在の保存状況: ' + JSON.stringify(maskSecrets(props.getProperties())));
    return;
  }
  console.log('✅ 保存しました: ' + saved.join(', ') +
    '\n現在の保存状況: ' + JSON.stringify(maskSecrets(props.getProperties())));
}

/** 確認表示用に値を伏せ字にする（ログに本物を出さない） */
function maskSecrets(obj) {
  var masked = {};
  Object.keys(obj).forEach(function (k) {
    var v = String(obj[k] || '');
    masked[k] = v ? (v.slice(0, 2) + '****（設定済み）') : '（未設定）';
  });
  return masked;
}

// ==========================================================
// 動作テスト（手動実行用）
// ==========================================================
function testNotify() {
  var line = attemptTask('LINE通知テスト', function () {
    notifyOwnerLine('【テスト】予約システムからのLINE通知テストです。届いていれば設定OK。');
    return '送信済み';
  });
  var mail = attemptTask('メール通知テスト', function () {
    MailApp.sendEmail({
      to: CONFIG.NOTIFY_EMAIL,
      subject: '【テスト】予約システムのメール通知テスト',
      body: '届いていれば設定OKです。\n\nLINE通知テスト: ' + taskResultText(line),
      name: CONFIG.SHOP_NAME + ' 予約システム'
    });
    return '送信済み';
  });
  console.log('LINE: ' + taskResultText(line) + ' / メール: ' + taskResultText(mail));
}

/**
 * 管理者向け詳細メールの見た目だけを確認する。
 * 予約台帳・カレンダー・お客様メールには何も作らない。
 */
function testOwnerEmailPreview() {
  var tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  var ymd = Utilities.formatDate(tomorrow, 'Asia/Tokyo', 'yyyy-MM-dd');
  var sample = {
    name: 'テスト予約',
    sex: 'その他・回答しない',
    birthdate: '1990-01-01',
    birthtime: '8時30分ごろ・名古屋市',
    email: primaryEmail(),
    course: 'オンライン30分（5,000円）',
    date1: ymd,
    part1: partLabel('昼の部'),
    date2: '',
    part2: '',
    genre: '仕事',
    message: 'これは管理者向け予約通知メールの表示確認用サンプルです。',
    payMethod: 'PayPay'
  };
  var sheetUrl = getSheet().getParent().getUrl();
  var sampleResults = {
    calendar: { ok: true, value: { when: formatChoice(ymd, '14:00〜14:30') } },
    line: { ok: true, value: 'テストでは送信しません' },
    customerEmail: { ok: true, value: 'テストでは送信しません' }
  };
  var context = { row: 2, tentativeWhen: formatChoice(ymd, '14:00〜14:30') };
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: '【表示確認】予約通知メールのプレビュー',
    body: buildOwnerEmailBody(sample, 2, null, sheetUrl, sampleResults, context),
    htmlBody: buildOwnerEmailHtml(sample, 2, null, sheetUrl, sampleResults, context),
    name: CONFIG.SHOP_NAME + ' 予約システム'
  });
  console.log('管理者メールのプレビューを送信しました');
}
