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
// 予約状況表示機能（新規追加）
// js/main.js の末尾に以下を追加してください
// ========================================================== 

// 日付表示を更新
function updateTodayDate() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const date = today.getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const day = dayNames[today.getDay()];
  
  const dateElement = document.getElementById('todayDate');
  if (dateElement) {
    dateElement.textContent = `${month}月${date}日（${day}）`;
  }
}

// 予約状況を取得して表示を更新
async function updateAvailability() {
  try {
    // ★★★ WebアプリURL（設定済み） ★★★
    const API_URL = 'https://script.google.com/macros/s/AKfycbzStDbZcSMNaz2S_MjkvmuIg9kWZAeNtu73Ts4_CizunkU1-chr6480fc_HKWnnwwrFsg/exec';
    
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

    // 全部終了の場合はメッセージを表示
    checkAllFull(dayStatus, eveningStatus, nightStatus);

    console.log('予約状況を更新しました:', data);

  } catch (error) {
    console.error('予約状況の取得エラー:', error);
  }
}

function updateBadge(partKey, status) {
  const badge = document.querySelector(`[data-part="${partKey}"]`);
  if (!badge) return;

  badge.className = 'part-badge';

  switch (status) {
    case 'available':
      badge.classList.add('available');
      badge.textContent = '受付中';
      break;
    case 'limited':
      badge.classList.add('limited');
      badge.textContent = 'わずか';
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
    
    const normalNote = document.querySelector('.availability-note');
    if (normalNote) {
      normalNote.style.display = 'block';
    }
  }
}

// ページロード時に実行
document.addEventListener('DOMContentLoaded', function() {
  updateTodayDate();
  updateAvailability();
});
