/**
 * 占い処 六根清浄｜予約フォーム
 * 送信先: Google Apps Script (google-apps-script/reservation.gs) のウェブアプリURL
 */

// ==========================================================
// ★★★ 設定: 予約受付GASのウェブアプリURL（デプロイ後ここに貼る） ★★★
// 未設定（空文字）の間はフォームを閉じて、メールでの予約案内を表示します
// ==========================================================
const RESERVE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxKDhJg8_LhjfDkZutgiLapz_VzJL8TlBZFtlgRp-7YrMODBvwV6E_qVJsznORW9Eo_/exec';

(function () {
  'use strict';

  var form = document.getElementById('reservationForm');
  if (!form) return;

  var submitBtn = document.getElementById('submitBtn');
  var errorBox = document.getElementById('formError');
  var successBox = document.getElementById('formSuccess');

  /* ----- 生年月日入力の範囲 ----- */
  function initBirthdateRange() {
    var birth = document.getElementById('birthdate');
    if (!birth) return;
    var today = new Date();
    birth.min = '1920-01-01';
    birth.max = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
  }

  /* ==========================================================
     空き状況（カレンダー連動）
     GASから「予約可能な日時」を取得し、空きのある日時だけを選択肢に出す。
     取得に失敗した場合は全日時を出すフォールバックで、フォームは止めない。
     ========================================================== */
  var PART_LABELS = {
    '昼の部': '昼の部（14:00〜16:30）',
    '夕の部': '夕の部（16:30〜19:00）',
    '夜の部': '夜の部（19:00〜22:00）'
  };
  var availability = null; // null=読込中 / false=取得失敗 / 配列=取得成功

  function fetchAvailability() {
    fetch(RESERVE_ENDPOINT + '?action=availability', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        availability = (json && json.status === 'ok' && json.days) ? json.days : false;
        renderDateOptions();
      })
      .catch(function () {
        availability = false;
        renderDateOptions();
      });
  }

  // フォールバック: API障害時は安全のため当日を出さず、翌日から10日分だけ表示する。
  function fallbackDays() {
    var names = ['日', '月', '火', '水', '木', '金', '土'];
    var today = new Date();
    var days = [];
    for (var i = 1; i <= 10; i++) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      days.push({
        date: d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0'),
        label: (d.getMonth() + 1) + '/' + d.getDate() + '(' + names[d.getDay()] + ')',
        parts: {
          '昼の部': { ok30: true, ok60: true },
          '夕の部': { ok30: true, ok60: true },
          '夜の部': { ok30: true, ok60: true }
        }
      });
    }
    return days;
  }

  function getDays() {
    if (availability === false) return fallbackDays();
    return availability || [];
  }

  function minutesForCourse() {
    var courseEl = form.querySelector('input[name="course"]:checked');
    return (courseEl && courseEl.value.indexOf('30分') >= 0) ? 30 : 60;
  }

  function dayHasSlot(day, minutes) {
    return Object.keys(PART_LABELS).some(function (p) {
      return day.parts[p] && day.parts[p]['ok' + minutes];
    });
  }

  function setOptions(select, options, placeholder) {
    var prev = select.value;
    select.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    select.appendChild(ph);
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
    // 選択中の値がまだ有効なら維持する
    if (prev && options.some(function (o) { return o.value === prev; })) {
      select.value = prev;
    }
  }

  function renderDateOptions() {
    var date1 = document.getElementById('date1');
    var date2 = document.getElementById('date2');
    var noSlot = document.getElementById('noSlotNotice');
    if (!date1 || !date2) return;

    if (availability === null) return; // まだ読込中

    var minutes = minutesForCourse();
    var openDays = getDays().filter(function (d) { return dayHasSlot(d, minutes); });
    var opts = openDays.map(function (d) { return { value: d.date, label: d.label }; });

    setOptions(date1, opts, opts.length ? '日付を選択' : '空きがありません');
    setOptions(date2, opts, '指定しない');
    renderPartOptions(1);
    renderPartOptions(2);
    updateSameDayNotice();

    if (noSlot) noSlot.hidden = opts.length > 0;
    if (submitBtn) submitBtn.disabled = opts.length === 0;
  }

  function renderPartOptions(n) {
    var dateEl = document.getElementById('date' + n);
    var partEl = document.getElementById('part' + n);
    if (!dateEl || !partEl) return;

    var minutes = minutesForCourse();
    var day = getDays().find(function (d) { return d.date === dateEl.value; });
    var opts = [];
    if (day) {
      Object.keys(PART_LABELS).forEach(function (p) {
        if (day.parts[p] && day.parts[p]['ok' + minutes]) {
          opts.push({ value: PART_LABELS[p], label: PART_LABELS[p] });
        }
      });
    }
    setOptions(partEl, opts, '時間帯を選択');
    if (n === 1) updateSameDayNotice();
  }

  function updateSameDayNotice() {
    var notice = document.getElementById('sameDayNotice');
    var dateEl = document.getElementById('date1');
    if (!notice || !dateEl) return;
    var day = getDays().find(function (d) { return d.date === dateEl.value; });
    notice.hidden = !(day && day.sameDay);
  }

  function initDateTimePickers() {
    ['date1', 'date2'].forEach(function (id, i) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () {
        renderPartOptions(i + 1);
        if (i === 0) updateSameDayNotice();
      });
    });
    fetchAvailability();
  }

  /* ----- コース変更時: 支払い欄の出し分け＋空き日時の再計算 ----- */
  function initCourseChange() {
    var payBlock = document.getElementById('payBlock');
    function update() {
      if (payBlock) {
        var courseEl = form.querySelector('input[name="course"]:checked');
        payBlock.hidden = !!(courseEl && courseEl.value.indexOf('対面') === 0);
      }
      renderDateOptions();
    }
    form.querySelectorAll('input[name="course"]').forEach(function (el) {
      el.addEventListener('change', update);
    });
    update();
  }

  /* ----- エンドポイント未設定時はフォームを準備中表示にする ----- */
  function checkEndpoint() {
    if (RESERVE_ENDPOINT) return true;
    form.innerHTML =
      '<p style="text-align:center; line-height:2; color:#666; font-size:0.9rem;">' +
      'フォーム予約は現在準備中です。<br>' +
      'お手数ですが、<a href="mailto:uranai.rokkon@gmail.com">メール</a>にてご予約ください。</p>';
    return false;
  }

  function showError(message) {
    errorBox.innerHTML = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function validate(data) {
    var errors = [];
    if (!data.name) errors.push('お名前を入力してください');
    if (!data.sex) errors.push('性別を選択してください');
    if (!data.birthdate) errors.push('生年月日を入力してください');
    if (!data.email) {
      errors.push('メールアドレスを入力してください');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('メールアドレスの形式をご確認ください');
    }
    if (!data.date1) errors.push('第一希望日を選択してください');
    if (!data.part1) errors.push('第一希望の時間帯を選択してください');
    if (data.date2 && !data.part2) errors.push('第二希望の時間帯を選択してください');
    var privacy = document.getElementById('privacyConsent');
    if (privacy && !privacy.checked) errors.push('プライバシーポリシーをご確認のうえ、同意してください');
    return errors;
  }

  function collect() {
    var courseEl = form.querySelector('input[name="course"]:checked');
    var course = courseEl ? courseEl.value : '';
    var payMethod;
    if (course.indexOf('対面') === 0) {
      payMethod = '現地払い（対面）';
    } else {
      var payEl = form.querySelector('input[name="payMethod"]:checked');
      payMethod = payEl ? payEl.value : '';
    }
    return {
      name: (form.name.value || '').trim(),
      sex: form.sex.value || '',
      birthdate: form.birthdate.value || '',
      birthtime: (form.birthtime.value || '').trim(),
      email: (form.email.value || '').trim(),
      course: course,
      date1: form.date1.value || '',
      part1: form.part1.value || '',
      date2: form.date2.value || '',
      part2: form.part2.value || '',
      genre: form.genre.value || '',
      message: (form.message.value || '').trim(),
      payMethod: payMethod,
      website: form.website.value || '' // honeypot
    };
  }

  /* ----- 送信完了画面の「カレンダーに追加」リンク（第一希望の時間帯をメモとして登録） ----- */
  function buildGcalUrl(data) {
    var m = String(data.part1).match(/(\d{1,2}):(\d{2})〜(\d{1,2}):(\d{2})/);
    if (!m || !data.date1) return '';
    var ymd = data.date1.replace(/-/g, '');
    function hm(h, mi) { return ('0' + h).slice(-2) + mi + '00'; }
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent('【希望日時】占い処 六根清浄 ご予約') +
      '&dates=' + ymd + 'T' + hm(m[1], m[2]) + '/' + ymd + 'T' + hm(m[3], m[4]) +
      '&ctz=Asia/Tokyo' +
      '&details=' + encodeURIComponent(
        '予約フォームで申し込んだ第一希望の時間帯です（確定前）。\n' +
        '正式な日時は確定のご連絡メールをご確認ください。\n' +
        'コース: ' + data.course);
  }

  function showGcalLink(data) {
    var link = document.getElementById('gcalLink');
    var note = document.getElementById('gcalNote');
    var url = buildGcalUrl(data);
    if (!link || !url) return;
    link.href = url;
    link.hidden = false;
    if (note) note.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    var data = collect();
    var errors = validate(data);
    if (errors.length) {
      showError(errors.join('<br>'));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '送信しています…';

    // 文字列ボディ（text/plain）にすることでCORSプリフライトを回避する
    fetch(RESERVE_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(data)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json && json.status === 'ok') {
          form.hidden = true;
          var lead = document.querySelector('.reserve-form-lead');
          if (lead) lead.hidden = true;
          showGcalLink(data);
          var successText = document.getElementById('formSuccessText');
          if (successText && json.sameDayRequest) {
            successText.innerHTML =
              '<strong>当日希望として受け付け、担当者へ至急通知しました。</strong><br>' +
              'この時点ではまだ確定していません。対応できる場合は確定メールをお送りします。<br>' +
              '確定メールが届くまでは、ご来店・お支払い・Meetへの参加はお待ちください。';
          }
          if (json.confirmationEmailSent === false && successText) {
            if (json.sameDayRequest) {
              successText.innerHTML += '<br><br>';
            }
            successText.innerHTML =
              (json.sameDayRequest ? successText.innerHTML : '') +
              'ご予約内容は記録されましたが、受付確認メールを送信できませんでした。<br>' +
              '迷惑メールフォルダをご確認のうえ、届かない場合は<br>' +
              '<a href="mailto:uranai.rokkon@gmail.com" class="text-link">uranai.rokkon@gmail.com</a> までお問い合わせください。';
          }
          successBox.hidden = false;
          successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof gtag === 'function') {
            gtag('event', 'reservation_form_submit', { course: data.course });
          }
        } else {
          var responseError = new Error((json && json.message) || 'invalid response');
          responseError.userMessage = json && json.message;
          throw responseError;
        }
      })
      .catch(function (err) {
        console.error('予約フォーム送信エラー:', err);
        if (err && err.userMessage) {
          showError(escapeHtml(err.userMessage));
        } else {
          showError(
            '送信に失敗しました。お手数ですが、時間をおいて再度お試しいただくか、' +
            '<a href="mailto:uranai.rokkon@gmail.com">メール</a> でご予約ください。'
          );
        }
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'この内容で予約を申し込む';
      });
  });

  initBirthdateRange();
  if (checkEndpoint()) {
    initCourseChange();
    initDateTimePickers();
  }
})();
