/**
 * 占い処 六根清浄｜予約フォーム
 * 送信先: Google Apps Script (google-apps-script/reservation.gs) のウェブアプリURL
 */

// ==========================================================
// ★★★ 設定: 予約受付GASのウェブアプリURL（デプロイ後ここに貼る） ★★★
// 未設定（空文字）の間はフォームを閉じて、LINE予約への案内を表示します
// ==========================================================
const RESERVE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxKDhJg8_LhjfDkZutgiLapz_VzJL8TlBZFtlgRp-7YrMODBvwV6E_qVJsznORW9Eo_/exec';

(function () {
  'use strict';

  var form = document.getElementById('reservationForm');
  if (!form) return;

  var submitBtn = document.getElementById('submitBtn');
  var errorBox = document.getElementById('formError');
  var successBox = document.getElementById('formSuccess');

  /* ----- 日付入力の範囲（今日〜90日先） ----- */
  function initDateRange() {
    var today = new Date();
    var max = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    function fmt(d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }
    ['date1', 'date2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.min = fmt(today); el.max = fmt(max); }
    });
    var birth = document.getElementById('birthdate');
    if (birth) { birth.min = '1920-01-01'; birth.max = fmt(today); }
  }

  /* ----- 対面コースでは支払い方法の選択欄を隠す（当日現地払いのため） ----- */
  function initPayToggle() {
    var payBlock = document.getElementById('payBlock');
    if (!payBlock) return;
    function update() {
      var courseEl = form.querySelector('input[name="course"]:checked');
      var isInPerson = courseEl && courseEl.value.indexOf('対面') === 0;
      payBlock.hidden = isInPerson;
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
      'お手数ですが、上の<strong>LINEで予約</strong>からご予約ください。</p>';
    return false;
  }

  function showError(message) {
    errorBox.innerHTML = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          successBox.hidden = false;
          successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof gtag === 'function') {
            gtag('event', 'reservation_form_submit', { course: data.course });
          }
        } else {
          throw new Error((json && json.message) || 'invalid response');
        }
      })
      .catch(function (err) {
        console.error('予約フォーム送信エラー:', err);
        showError(
          '送信に失敗しました。お手数ですが、時間をおいて再度お試しいただくか、' +
          '<a href="https://lin.ee/SvZ69l0" target="_blank">LINE</a> または ' +
          '<a href="mailto:uranai.rokkon@gmail.com">メール</a> でご予約ください。'
        );
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'この内容で予約を申し込む';
      });
  });

  initDateRange();
  initPayToggle();
  checkEndpoint();
})();
