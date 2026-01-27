// GAS WebアプリURL設定
// config.js から読み込む（設定ファイルが存在しない場合はデフォルト値を使用）
let GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxnwFUaqOEqNxcoxkLS9MEyIDxAUyldnctXZ1uVJVZ5QBd4QlTcXoD1gO51HwAxEeX_Ew/exec';

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
 * GAS APIから本日の予約状況を取得
 */
async function fetchTodayAvailability() {
  if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL === 'YOUR_GAS_WEBAPP_URL_HERE') {
    console.error('GAS_WEBAPP_URLが設定されていません');
    return null;
  }
  
  try {
    const url = `${GAS_WEBAPP_URL}?action=getTodayAvailability`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('予約状況取得エラー:', error);
    return null;
  }
}

/**
 * 予約済みの時間枠を判定
 */
function isSlotBooked(slot, events) {
  const today = new Date();
  const slotStart = new Date(createISODateTime(today, slot.hour, slot.minute));
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
    
    // 日付を表示（例：1月27日（火））
    const today = new Date();
    const dateStr = formatDateJP(today);
    const bookingTitle = document.querySelector('.booking-title');
    if (bookingTitle) {
      bookingTitle.textContent = `本日の予約状況 ${dateStr}`;
    }
    
    // 時間枠を生成
    generateTimeSlots();
    
    let hasAvailableSlot = false;
    
    // 昼の部を表示
    const dayPart = availability.parts['昼の部'] || { status: 'full', count: 0 };
    daySlotsElement.innerHTML = '';
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    TIME_SLOTS.day.slots.forEach(slot => {
      // スロットの開始時刻を計算（日本時間）
      const slotDate = new Date(today);
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
      const slotDate = new Date(today);
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
      const slotDate = new Date(today);
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
      statusElement.textContent = '本日鑑定可能';
      statusElement.className = 'booking-status available';
    } else {
      statusElement.textContent = '本日は受付終了です';
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
