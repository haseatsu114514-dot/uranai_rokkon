// 日付表示を更新
function updateTodayDate() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const date = today.getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const day = dayNames[today.getDay()];
  
  // ★★★ 21:30以降は翌日のタグと日付を計算 ★★★
  const currentHour = today.getHours();
  const currentMinute = today.getMinutes();
  const isAfter2130 = (currentHour === 21 && currentMinute >= 30) || currentHour >= 22;
  
  let displayDate, displayTag;
  
  if (isAfter2130) {
    // 翌日の日付を計算
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowMonth = tomorrow.getMonth() + 1;
    const tomorrowDate = tomorrow.getDate();
    const tomorrowDay = dayNames[tomorrow.getDay()];
    
    displayDate = `${tomorrowMonth}月${tomorrowDate}日(${tomorrowDay})`;
    displayTag = '<span class="availability-tag">【翌日】</span>';
  } else {
    displayDate = `${month}月${date}日(${day})`;
    displayTag = '<span class="availability-tag">【本日】</span>';
  }
  
  const dateElement = document.getElementById('todayDate');
  if (dateElement) {
    dateElement.innerHTML = displayTag + displayDate;
  }
}

// 予約状況を取得して表示を更新
async function updateAvailability() {
  setBadgesLoading();
  
  try {
    const API_URL = 'https://script.google.com/macros/s/AKfycbw7D85-8i-AEN1awPLcY0ugs9qZRUVICf0s4Sa5Dbglj0V9mNgsF2ouyubyxw-xxQZPhQ/exec';
    
    const response = await fetch(API_URL + '?action=getTodayAvailability');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();

    const dayStatus = data.parts['昼の部']?.status || 'full';
    const eveningStatus = data.parts['夕の部']?.status || 'full';
    const nightStatus = data.parts['夜の部']?.status || 'full';

    updateBadge('day', dayStatus);
    updateBadge('evening', eveningStatus);
    updateBadge('night', nightStatus);

    checkAllFull(dayStatus, eveningStatus, nightStatus);

    console.log('予約状況を更新しました:', data);

  } catch (error) {
    console.error('予約状況の取得エラー:', error);
    updateBadge('day', 'full');
    updateBadge('evening', 'full');
    updateBadge('night', 'full');
  }
}
