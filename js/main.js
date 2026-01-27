/**
 * 占い処 六根清浄｜共通JS
 * スクロールフェードイン・ヘッダー・トップへ戻る・CTA・ハンバーガーメニュー など
 */
(function () {
    'use strict';

    window.toggleMenu = function () {
        var w = document.querySelector('.nav-wrapper');
        if (w) w.classList.toggle('active');
    };

    /* ----- 1. スクロールフェードイン（Intersection Observer） ----- */
    function initScrollAnimate() {
        var els = document.querySelectorAll('.animate-on-scroll');
        if (!els.length) return;
        var opt = { root: null, rootMargin: '0px 0px -60px 0px', threshold: 0.1 };
        var ob = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('animated');
                }
            });
        }, opt);
        els.forEach(function (el) { ob.observe(el); });
    }

    /* ----- 2. ヒーロー初回表示 ----- */
    function initHeroReveal() {
        var hero = document.querySelector('.hero');
        if (!hero) return;
        var title = hero.querySelector('.hero-reveal-title');
        var sub = hero.querySelector('.hero-reveal-subtitle');
        var btn = hero.querySelector('.hero-reveal-btn');
        var list = [title, sub, btn].filter(Boolean);
        list.forEach(function (el) { el.classList.add('hero-reveal'); });
        requestAnimationFrame(function () {
            list.forEach(function (el) { el.classList.add('hero-visible'); });
        });
    }

    /* ----- 3. ヘッダー・スクロール挙動 ----- */
    function initHeaderScroll() {
        var header = document.querySelector('.header');
        if (!header) return;
        var lastY = window.scrollY || window.pageYOffset;
        var ticking = false;
        function update() {
            var y = window.scrollY || window.pageYOffset;
            if (y > 60) header.classList.add('scrolled');
            else header.classList.remove('scrolled');
            lastY = y;
            ticking = false;
        }
        function requestTick() {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }
        window.addEventListener('scroll', requestTick, { passive: true });
        update();
    }

    /* ----- 4. トップへ戻るボタン ----- */
    function initBackToTop() {
        var btn = document.getElementById('back-to-top');
        if (!btn) return;
        var threshold = 400;
        var ticking = false;
        function update() {
            var y = window.scrollY || window.pageYOffset;
            if (y > threshold) btn.classList.add('visible');
            else btn.classList.remove('visible');
            ticking = false;
        }
        function requestTick() {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }
        window.addEventListener('scroll', requestTick, { passive: true });
        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        update();
    }

    /* ----- 5. ご予約の流れ・ステップ＆線アニメ ----- */
    function initFlowSteps() {
        var steps = document.querySelectorAll('.flow-step');
        if (!steps.length) return;
        var opt = { root: null, rootMargin: '0px 0px -80px 0px', threshold: 0.15 };
        var ob = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) e.target.classList.add('flow-visible');
            });
        }, opt);
        steps.forEach(function (el) { ob.observe(el); });
    }

    /* ----- 6. CTA に .cta-micro 付与（まとめて） ----- */
    function initCtaMicro() {
        var selectors = '.hero-btn, .hero-cta-btn, .cta-btn, .course-cta a, .flow-cta .hero-btn';
        document.querySelectorAll(selectors).forEach(function (el) {
            if (!el.classList.contains('cta-micro')) el.classList.add('cta-micro');
        });
    }

    function boot() {
        initScrollAnimate();
        initHeroReveal();
        initHeaderScroll();
        initBackToTop();
        initFlowSteps();
        initCtaMicro();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

// ========================================================== 
// 予約状況表示機能（完全版：タグ対応 + キャッシュ対応 + 読み込み注意書き + 対策1,2）
// ========================================================== 

// 日付表示を更新（タグ付き）
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
    
    displayDate = `${tomorrowMonth}月${tomorrowDate}日（${tomorrowDay}）`;
    displayTag = '<span class="availability-tag">【翌日】</span>';
  } else {
    displayDate = `${month}月${date}日（${day}）`;
    displayTag = '<span class="availability-tag">【本日】</span>';
  }
  
  const dateElement = document.getElementById('todayDate');
  if (dateElement) {
    dateElement.innerHTML = displayTag + displayDate;
  }
}

// バッジを「読み込み中」状態にする
function setBadgesLoading() {
  const badges = document.querySelectorAll('[data-part]');
  badges.forEach(badge => {
    badge.className = 'part-badge loading';
    badge.textContent = '確認中...';
    badge.style.opacity = '0.6';
  });
  
  // ★★★ 追加：読み込み中の注意書き ★★★
  const normalNote = document.querySelector('.availability-note');
  if (normalNote) {
    normalNote.innerHTML = '予約状況を確認しています...<br><span style="font-size: 0.75rem; opacity: 0.8;">（環境により10〜15秒かかる場合があります）</span>';
    normalNote.style.display = 'block';
  }
}

// 予約状況を取得して表示を更新
async function updateAvailability() {
  setBadgesLoading();
  
  // ★★★ 対策1: 深夜1:00〜13:00は静的表示（API呼ばない） ★★★
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour >= 1 && currentHour < 13) {
    // 深夜〜午前中は「本日受付終了」を静的表示
    updateBadge('day', 'full');
    updateBadge('evening', 'full');
    updateBadge('night', 'full');
    
    const normalNote = document.querySelector('.availability-note');
    if (normalNote) {
      normalNote.innerHTML = '※本日の受付は終了しました<br>※営業時間：14:00〜22:00<br>※21:30以降は翌日の予約状況を表示します';
      normalNote.style.display = 'block';
    }
    
    console.log('深夜時間帯のため静的表示');
    return;
  }
  
  try {
    // ★★★ ここにあなたの新しいWebアプリURLを貼り付け ★★★
    const API_URL = 'https://script.google.com/macros/s/AKfycbzLxrv8-xJ0q4f4YG0XGi6QPby9pAq61V-8Hq3oi7nE0fW6qraVmAHJxDzzEbLehTndJQ/exec';
    
    // ★★★ タイムアウトを15秒に設定 ★★★
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(API_URL + '?action=getTodayAvailability', {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
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
    
    // ★★★ エラー時はLINE確認を促す ★★★
    updateBadge('day', 'loading');
    updateBadge('evening', 'loading');
    updateBadge('night', 'loading');
    
    const normalNote = document.querySelector('.availability-note');
    if (normalNote) {
      normalNote.innerHTML = '※詳しい空き時刻は<strong>LINE</strong>でご確認ください<br>（予約可能な時間のみご案内します）<br>※21:30以降は翌日の予約状況を表示します';
      normalNote.style.display = 'block';
    }
  }
}

// ★★★ updateBadgeにloading状態を追加 ★★★
function updateBadge(partKey, status) {
  const badge = document.querySelector(`[data-part="${partKey}"]`);
  if (!badge) return;

  badge.className = 'part-badge';
  badge.style.opacity = '1';

  switch (status) {
    case 'available':
      badge.classList.add('available');
      badge.textContent = '受付中';
      break;
    case 'limited':
      badge.classList.add('limited');
      badge.textContent = 'わずか';
      break;
    case 'loading':
      badge.classList.add('limited');
      badge.textContent = 'LINE確認';
      break;
    case 'full':
    default:
      badge.classList.add('full');
      badge.textContent = '終了';
      break;
  }
}

function checkAllFull(day, evening, night) {
  const allFullMessage = document.getElementById('allFullMessage');
  if (!allFullMessage) return;

  if (day === 'full' && evening === 'full' && night === 'full') {
    allFullMessage.classList.add('show');
    
    const normalNote = document.querySelector('.availability-note');
    if (normalNote) {
      normalNote.style.display = 'none';
    }
  } else {
    allFullMessage.classList.remove('show');
    
    // ★★★ 読み込み完了後は元の注意書きに戻す ★★★
    const normalNote = document.querySelector('.availability-note');
    if (normalNote) {
      normalNote.innerHTML = '※詳しい空き時刻はLINEでご確認<br>（予約可能な時間のみご案内します）<br>※21:30以降は翌日の予約状況を表示します';
      normalNote.style.display = 'block';
    }
  }
}

// ページロード時に実行
document.addEventListener('DOMContentLoaded', function() {
  updateTodayDate();
  updateAvailability();
});

// ========== Service Worker登録（対策2） ==========
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker 登録成功:', registration.scope);
      })
      .catch(error => {
        console.log('Service Worker 登録失敗:', error);
      });
  });
}
