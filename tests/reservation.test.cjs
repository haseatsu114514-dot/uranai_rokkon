const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('google-apps-script/reservation.gs', 'utf8');
const sentMail = [];
const lineRequests = [];
const calendarEvents = [];
const propertyStore = { SPREADSHEET_ID: 'test-sheet' };
const cacheStore = new Map();
let calendarGetEventsCount = 0;

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date, timeZoneOrPattern, maybePattern) {
  const d = new Date(date);
  const pattern = maybePattern || timeZoneOrPattern;
  const values = {
    yyyy: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    dd: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    M: String(d.getMonth() + 1),
    d: String(d.getDate())
  };
  return pattern
    .replace(/yyyy/g, values.yyyy)
    .replace(/MM/g, values.MM)
    .replace(/dd/g, values.dd)
    .replace(/HH/g, values.HH)
    .replace(/mm/g, values.mm)
    .replace(/M/g, values.M)
    .replace(/d/g, values.d);
}

function createRange(sheet, row, col, numRows = 1, numCols = 1) {
  return {
    getValues() {
      return Array.from({ length: numRows }, (_, r) =>
        Array.from({ length: numCols }, (_, c) => {
          const sourceRow = sheet.rows[row - 1 + r] || [];
          return sourceRow[col - 1 + c] == null ? '' : sourceRow[col - 1 + c];
        })
      );
    },
    setValues(values) {
      values.forEach((sourceRow, r) => {
        sheet.rows[row - 1 + r] ||= [];
        sourceRow.forEach((value, c) => {
          sheet.rows[row - 1 + r][col - 1 + c] = value;
        });
      });
      return this;
    },
    getValue() {
      return this.getValues()[0][0];
    },
    setValue(value) {
      sheet.rows[row - 1] ||= [];
      sheet.rows[row - 1][col - 1] = value;
      return this;
    },
    setDataValidation() {
      return this;
    },
    getSheet() {
      return sheet;
    },
    getColumn() {
      return col;
    },
    getRow() {
      return row;
    }
  };
}

const sheet = {
  rows: [],
  getName: () => '予約受付',
  getLastRow() {
    return this.rows.length;
  },
  appendRow(row) {
    this.rows.push(row.slice());
  },
  getRange(row, col, numRows, numCols) {
    return createRange(this, row, col, numRows, numCols);
  },
  getMaxRows: () => 1000,
  setFrozenRows() {},
  getParent() {
    return spreadsheet;
  }
};

const spreadsheet = {
  getSheetByName: () => sheet,
  getUrl: () => 'https://docs.google.com/spreadsheets/d/test-sheet',
  insertSheet: () => sheet
};

const calendar = {
  getEvents: () => {
    calendarGetEventsCount += 1;
    return [];
  },
  getEventById(id) {
    return calendarEvents.find((event) => event.getId() === id) || null;
  },
  createEvent(title, start, end, options) {
    const event = {
      title,
      start: new Date(start),
      end: new Date(end),
      options,
      id: `event-${calendarEvents.length + 1}`,
      getId() { return this.id; },
      getTitle() { return this.title; },
      setTitle(value) { this.title = value; },
      getStartTime() { return this.start; },
      getEndTime() { return this.end; },
      setTime(nextStart, nextEnd) {
        this.start = new Date(nextStart);
        this.end = new Date(nextEnd);
      },
      isAllDayEvent: () => false,
      deleteEvent() { this.deleted = true; }
    };
    calendarEvents.push(event);
    return event;
  }
};

let lineStatus = 200;
const context = {
  console,
  Date,
  JSON,
  Math,
  Object,
  String,
  Number,
  Array,
  RegExp,
  Error,
  isNaN,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperties: () => ({
          LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
          LINE_OWNER_USER_ID: 'U-test',
          MEET_URL: 'https://meet.google.com/test-room',
          PAY_PAYPAY_ID: 'test-paypay',
          PAY_BANK_TEXT: 'テスト銀行'
        }),
        getProperty: (key) => propertyStore[key] || '',
        setProperty: (key, value) => { propertyStore[key] = value; },
        setProperties: (values) => Object.assign(propertyStore, values)
      };
    }
  },
  SpreadsheetApp: {
    openById: () => spreadsheet,
    create: () => spreadsheet,
    newDataValidation: () => ({
      requireValueInList() { return this; },
      setAllowInvalid() { return this; },
      build() { return {}; }
    })
  },
  CalendarApp: {
    getCalendarById: () => calendar,
    getDefaultCalendar: () => calendar
  },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock() {}
    })
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cacheStore.get(key) || null,
      put: (key, value) => cacheStore.set(key, value),
      remove: (key) => cacheStore.delete(key)
    })
  },
  MailApp: {
    sendEmail(options) {
      sentMail.push(options);
    }
  },
  GmailApp: {
    createDraft() {}
  },
  UrlFetchApp: {
    fetch(url, options) {
      lineRequests.push({ url, options });
      return {
        getResponseCode: () => lineStatus,
        getContentText: () => lineStatus === 200 ? '{}' : '{"message":"invalid token"}'
      };
    }
  },
  Utilities: {
    formatDate
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      return {
        text,
        setMimeType() { return this; }
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'reservation.gs' });
sheet.rows[0] = Array.from(context.SHEET_HEADERS);

const tomorrow = new Date();
tomorrow.setHours(12, 0, 0, 0);
tomorrow.setDate(tomorrow.getDate() + 1);
const ymd = formatDate(tomorrow, 'yyyy-MM-dd');
const request = {
  name: '予約テスト',
  sex: '女性',
  birthdate: '1990-01-01',
  birthtime: '8時30分ごろ・名古屋市',
  email: 'customer@example.com',
  course: 'オンライン30分（5,000円）',
  date1: ymd,
  part1: '昼の部（14:00〜16:30）',
  date2: '',
  part2: '',
  genre: '仕事',
  message: '転職先AとBのどちらを選ぶか相談したいです。',
  payMethod: 'PayPay',
  website: ''
};

const response = context.doPost({
  postData: { contents: JSON.stringify(request) }
});
const responseBody = JSON.parse(response.text);

assert.equal(responseBody.status, 'ok', responseBody.message);
assert.equal(responseBody.confirmationEmailSent, true);
assert.equal(responseBody.sameDayRequest, false);
assert.equal(calendarEvents.length, 1);
assert.match(calendarEvents[0].getTitle(), /^【仮#2】予約テスト様/);
assert.equal(lineRequests.length, 1);
assert.equal(sentMail.length, 2);

const customerMail = sentMail.find((mail) => mail.to === request.email);
const ownerMail = sentMail.find((mail) => mail.to === context.CONFIG.NOTIFY_EMAIL);
assert.ok(customerMail, 'お客様への受付確認メールが送られる');
assert.ok(ownerMail, '管理者メールが送られる');
assert.match(ownerMail.subject, /【要対応・予約】/);
assert.match(ownerMail.body, /ご相談内容:/);
assert.match(ownerMail.body, /転職先AとB/);
assert.match(ownerMail.body, /【次にすること】/);
assert.match(ownerMail.htmlBody, /予約シートの2行目を開く/);

const linePayload = JSON.parse(lineRequests[0].options.payload).messages[0].text;
assert.match(linePayload, /＜やること＞/);
assert.doesNotMatch(linePayload, /1990-01-01/);
assert.doesNotMatch(linePayload, /転職先AとB/);
assert.match(String(sheet.rows[1][context.COL_SYSTEM_RESULT - 1]), /LINE:成功/);

assert.equal(context.validateReservation({ ...request, course: '無料鑑定' }), 'コースを選択してください');
assert.equal(context.validateReservation({ ...request, part1: '深夜の部（0:00〜2:00）' }), '第一希望の時間帯を選択してください');
assert.equal(context.validateReservation({ ...request, date1: '2020-01-01' }), '第一希望日をご確認ください');
assert.equal(context.primaryEmail(), 'uranai.rokkon@gmail.com');

context.clearAvailabilityCache();
const countBeforeAvailability = calendarGetEventsCount;
const availability = context.getAvailability();
assert.equal(availability.length, 11);
assert.equal(availability[0].sameDay, true);
assert.equal(calendarGetEventsCount, countBeforeAvailability + 1, '対象期間の予定を1回だけ取得する');
context.getAvailability();
assert.equal(calendarGetEventsCount, countBeforeAvailability + 1, '2回目はキャッシュを利用する');

const today = new Date();
today.setHours(10, 0, 0, 0);
const todayYmd = formatDate(today, 'yyyy-MM-dd');
assert.equal(
  context.isRequestedPartWithinLead(todayYmd, '昼の部（14:00〜16:30）', request.course, today),
  true
);
today.setHours(13, 30, 0, 0);
assert.equal(
  context.isRequestedPartWithinLead(todayYmd, '昼の部（14:00〜16:30）', request.course, today),
  false
);

const urgentLine = context.buildOwnerMessage({ ...request, date1: formatDate(new Date(), 'yyyy-MM-dd') });
assert.match(urgentLine, /当日希望・至急確認/);
const mailCountBeforeUrgent = sentMail.length;
context.sendAutoReply({ ...request, date1: formatDate(new Date(), 'yyyy-MM-dd') });
assert.equal(sentMail.length, mailCountBeforeUrgent + 1);
assert.match(sentMail.at(-1).subject, /当日予約のご希望/);
assert.match(sentMail.at(-1).body, /確定メールが届くまでは/);

lineStatus = 401;
assert.throws(
  () => context.notifyOwnerLine('テスト'),
  /LINE API HTTP 401/
);

console.log('reservation tests: ok');
