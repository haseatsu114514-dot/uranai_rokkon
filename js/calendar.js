// GAS WebアプリURL設定
// config.js から読み込む（設定ファイルが存在しない場合はデフォルト値を使用）
let GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyEiCN0bstTUfk1wuew6r9jW3PvYX6e8lzfMwbOq3K8TWGkcMEqq-rQCvE6JbYPLLTgPg/exec';

// config.js が存在する場合は読み込む（HTML側で先に読み込む必要があります）
// <script src="js/config.js"></script> を index.html に追加してください

// 営業時間設定
const CALENDAR_CONFIG = {
  // 営業時間設定
  businessHours: {
    start: 14, // 14:00
    end: 22    // 22:00
  },
  
  // 予約可能時間（5時間前まで）
  bookingAdvanceHours: 5,
  
  // 時間枠の設定（30分単位）
  slotDuration: 30, // 分
  
  // 翌日表示切り替え時刻（21:30）
  nextDayDisplayTime: {
    hour: 21,
    minute: 30
  }
};

// 時間帯の定義
const TIME_SLOTS = {
  day: {
    name: '昼の部',
    start: 14,
    end: 16,
    slots: []
  },
  evening: {
    name: '夕の部',
    start: 16,
    end: 19,
    slots: []
  },
  night: {
    name: '夜の部',
    start: 19,
    end: 22,
    slots: []
  }
};

/**
 * 表示対象の日付を取得（21:30以降は翌日）
 */
function getTargetDate() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // 21:30以降（21時30分以降）は翌日を返す
  if (hour > CALENDAR_CONFIG.nextDayDisplayTime.hour || 
      (hour === CALENDAR_CONFIG.nextDayDisplayTime.hour && minute >= CALENDAR_CONFIG.nextDayDisplayTime.minute)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  return now;
}

/**
 * 時間枠を生成
 */
function generateTimeSlots() {
  const slotDuration = CALENDAR_CONFIG.slotDuration;
  
  // 昼の部: 14:00 ~ 16:00
  for (let hour = TIME_SLOTS.day.start; hour < TIME_SLOTS.day.end; hour++) {
    for (let minute = 0; minute < 60; minute += slotDuration) {
      TIME_SLOTS.day.slots.push({
        hour: hour,
        minute: minute,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      });
    }
  }
  
  // 夕の部: 16:00 ~ 19:00
  for (let hour = TIME_SLOTS.evening.start; hour < TIME_SLOTS.evening.end; hour++) {
    for (let minute = 0; minute < 60; minute += slotDuration) {
      TIME_SLOTS.evening.slots.push({
        hour: hour,
        minute: minute,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      });
    }
  }
  
  // 夜の部: 19:00 ~ 22:00
  for (let hour = TIME_SLOTS.night.start; hour < TIME_SLOTS.night.end; hour++) {
    for (let minute = 0; minute < 60; minute += slotDuration) {
      TIME_SLOTS.night.slots.push({
        hour: hour,
        minute: minute,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      });
    }
  }
}

/**
 * 日付をフォーマット（YYYY-MM-DD）
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * ISO形式の日時文字列を作成
 */
function createISODateTime(date, hour, minute) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hourStr = String(hour).padStart(2, '0');
  const minuteStr = String(minute).padStart(2, '0');
  return `${year}-${month}-${day}T${hourStr}:${minuteStr}:00+09:00`;
}

/**
 * 予約可能かどうかをチェック（5時間前まで）
 */
function isBookingAvailable(slotDateTime) {
  const now = new Date();
  const bookingDeadline = new Date(now.getTime() + CALENDAR_CONFIG.bookingAdvanceHours * 60 * 60 * 1000);
  return slotDateTime > bookingDeadline;
}

/**
 * GAS APIから本日の予約状況を取得（CORS対応版：HTMLからJSONを抽出）
 */
async function fetchTodayAvailability() {
  if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL === 'YOUR_GAS_WEBAPP_URL_HERE') {
    console.error('GAS_WEBAPP_URLが設定されていません');
    return null;
  }
  
  try {
    // 表示対象の日付を取得（21:30以降は翌日）
    const targetDate = getTargetDate();
    const dateStr = formatDate(targetDate);
    
    // 日付パラメータを追加してAPIを呼び出し
    const url = `${GAS_WEBAPP_URL}?action=getTodayAvailability&date=${dateStr}`;
    
    // CORSエラーを回避するため、HTMLとして取得してからJSONを抽出
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // HTMLテキストとして取得
    const htmlText = await response.text();
    
    // HTMLからJSONを抽出（<pre id="json-data">タグから）
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const jsonElement = doc.getElementById('json-data');
    
    if (jsonElement && jsonElement.textContent) {
      const data = JSON.parse(jsonElement.textContent);
      return data;
    }
    
    // フォールバック：正規表現でJSONを抽出
    const jsonMatch = htmlText.match(/<pre[^>]*id=["']json-data["'][^>]*>([\s\S]*?)<\/pre>/i);
    if (jsonMatch && jsonMatch[1]) {
      const jsonText = jsonMatch[1].trim();
      const data = JSON.parse(jsonText);
      return data;
    }
    
    // 最後の手段：直接JSONを探す
    const directJsonMatch = htmlText.match(/\{[\s\S]*"date"[\s\S]*"parts"[\s\S]*\}/);
    if (directJsonMatch) {
      const data = JSON.parse(directJsonMatch[0]);
      return data;
    }
    
    throw new Error('レスポンスからJSONを抽出できませんでした');
  } catch (error) {
    console.error('予約状況取得エラー:', error);
    console.error('エラー詳細:', error.message);
    return null;
  }
}

/**
 * 予約済みの時間枠を判定
 */
function isSlotBooked(slot, events) {
  const targetDate = getTargetDate();
  const slotStart = new Date(createISODateTime(targetDate, slot.hour, slot.minute));
  const slotEnd = new Date(slotStart.getTime() + CALENDAR_CONFIG.slotDuration * 60 * 1000);
  
  return events.some(event => {
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    
    // 時間枠が予約と重なっているかチェック
    return (slotStart < eventEnd && slotEnd > eventStart);
  });
}

/**
 * 日付を日本語形式で表示（例：1月27日（火））
 */
function formatDateJP(date) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];
  return `${month}月${day}日（${weekday}）`;
}

/**
 * ステータスに応じた表示テキストを取得
 */
function getStatusText(status, count) {
  if (status === 'available') {
    return `空きあり（${count}枠）`;
  } else if (status === 'limited') {
    return `残りわずか（${count}枠）`;
  } else {
    return '受付終了';
  }
}

/**
 * 予約枠を表示
 */
async function displayBookingSlots() {
  const statusElement = document.getElementById('bookingStatus');
  const daySlotsElement = document.getElementById('daySlots');
  const eveningSlotsElement = document.getElementById('eveningSlots');
  const nightSlotsElement = document.getElementById('nightSlots');
  
  try {
    statusElement.textContent = '読み込み中...';
    
    // GAS APIから予約状況を取得
    const availability = await fetchTodayAvailability();
    
    if (!availability) {
      statusElement.textContent = '予約状況の取得に失敗しました';
      statusElement.className = 'booking-status error';
      return;
    }
    
    // 表示対象の日付を取得（21:30以降は翌日）
    const targetDate = getTargetDate();
    const dateStr = formatDateJP(targetDate);
    const bookingTitle = document.querySelector('.booking-title');
    if (bookingTitle) {
      bookingTitle.textContent = `直近の予約状況 ${dateStr}`;
    }
    
    // 時間枠を生成
    generateTimeSlots();
    
    let hasAvailableSlot = false;
    
    // 昼の部を表示
    const dayPart = availability.parts['昼の部'] || { status: 'full', count: 0 };
    daySlotsElement.innerHTML = '';
    const now = new Date();
    const displayDate = new Date(targetDate);
    displayDate.setHours(0, 0, 0, 0);
    
    TIME_SLOTS.day.slots.forEach(slot => {
      // スロットの開始時刻を計算（日本時間）
      const slotDate = new Date(displayDate);
      slotDate.setHours(slot.hour, slot.minute, 0, 0);
      // 5時間前の時刻を計算
      const bookingDeadline = new Date(slotDate.getTime() - 5 * 60 * 60 * 1000);
      // 現在時刻が5時間前を過ぎているか、または部全体がfullかチェック
      const isPastDeadline = now.getTime() > bookingDeadline.getTime();
      const isAvailable = dayPart.status !== 'full' && !isPastDeadline;
      
      const slotElement = document.createElement('div');
      slotElement.className = `time-slot ${isAvailable ? 'available' : 'unavailable'}`;
      slotElement.textContent = slot.time;
      if (!isAvailable) {
        slotElement.title = isPastDeadline ? '受付終了（5時間前を過ぎました）' : '受付終了';
      }
      daySlotsElement.appendChild(slotElement);
      if (isAvailable) hasAvailableSlot = true;
    });
    
    // 夕の部を表示
    const eveningPart = availability.parts['夕の部'] || { status: 'full', count: 0 };
    eveningSlotsElement.innerHTML = '';
    TIME_SLOTS.evening.slots.forEach(slot => {
      // スロットの開始時刻を計算（日本時間）
      const slotDate = new Date(displayDate);
      slotDate.setHours(slot.hour, slot.minute, 0, 0);
      // 5時間前の時刻を計算
      const bookingDeadline = new Date(slotDate.getTime() - 5 * 60 * 60 * 1000);
      // 現在時刻が5時間前を過ぎているか、または部全体がfullかチェック
      const isPastDeadline = now.getTime() > bookingDeadline.getTime();
      const isAvailable = eveningPart.status !== 'full' && !isPastDeadline;
      
      const slotElement = document.createElement('div');
      slotElement.className = `time-slot ${isAvailable ? 'available' : 'unavailable'}`;
      slotElement.textContent = slot.time;
      if (!isAvailable) {
        slotElement.title = isPastDeadline ? '受付終了（5時間前を過ぎました）' : '受付終了';
      }
      eveningSlotsElement.appendChild(slotElement);
      if (isAvailable) hasAvailableSlot = true;
    });
    
    // 夜の部を表示
    const nightPart = availability.parts['夜の部'] || { status: 'full', count: 0 };
    nightSlotsElement.innerHTML = '';
    TIME_SLOTS.night.slots.forEach(slot => {
      // スロットの開始時刻を計算（日本時間）
      const slotDate = new Date(displayDate);
      slotDate.setHours(slot.hour, slot.minute, 0, 0);
      // 5時間前の時刻を計算
      const bookingDeadline = new Date(slotDate.getTime() - 5 * 60 * 60 * 1000);
      // 現在時刻が5時間前を過ぎているか、または部全体がfullかチェック
      const isPastDeadline = now.getTime() > bookingDeadline.getTime();
      const isAvailable = nightPart.status !== 'full' && !isPastDeadline;
      
      const slotElement = document.createElement('div');
      slotElement.className = `time-slot ${isAvailable ? 'available' : 'unavailable'}`;
      slotElement.textContent = slot.time;
      if (!isAvailable) {
        slotElement.title = isPastDeadline ? '受付終了（5時間前を過ぎました）' : '受付終了';
      }
      nightSlotsElement.appendChild(slotElement);
      if (isAvailable) hasAvailableSlot = true;
    });
    
    // ステータスを更新
    if (hasAvailableSlot) {
      statusElement.textContent = '鑑定可能';
      statusElement.className = 'booking-status available';
    } else {
      statusElement.textContent = '受付終了';
      statusElement.className = 'booking-status unavailable';
    }
    
  } catch (error) {
    console.error('予約枠表示エラー:', error);
    statusElement.textContent = '予約状況の取得に失敗しました';
    statusElement.className = 'booking-status error';
  }
}

// ページ読み込み時に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', displayBookingSlots);
} else {
  displayBookingSlots();
}

// 定期的に更新（5分ごと）
setInterval(displayBookingSlots, 5 * 60 * 1000);
