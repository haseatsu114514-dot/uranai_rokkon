// スライダーの状態を管理
const sliderStates = {};

// スライダーを初期化
function initSlider(genre) {
    const slider = document.getElementById(`slider-${genre}`);
    if (!slider) return;

    const cards = slider.querySelectorAll('.testimonial-card');
    const dotsContainer = document.getElementById(`dots-${genre}`);

    if (!dotsContainer) return;

    // ドットを作成
    dotsContainer.innerHTML = '';
    cards.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.className = 'slider-dot' + (index === 0 ? ' active' : '');
        dot.onclick = () => goToSlide(genre, index);
        dotsContainer.appendChild(dot);
    });

    // 状態を初期化
    sliderStates[genre] = 0;
}

// スライダーを変更
function changeSlide(genre, direction) {
    const slider = document.getElementById(`slider-${genre}`);
    if (!slider) return;

    const cards = slider.querySelectorAll('.testimonial-card');
    if (cards.length === 0) return;

    if (!sliderStates.hasOwnProperty(genre)) {
        sliderStates[genre] = 0;
    }

    sliderStates[genre] += direction;

    if (sliderStates[genre] < 0) {
        sliderStates[genre] = cards.length - 1;
    } else if (sliderStates[genre] >= cards.length) {
        sliderStates[genre] = 0;
    }

    goToSlide(genre, sliderStates[genre]);
    window.changeSlide = changeSlide;
}

// 特定のスライドに移動
function goToSlide(genre, index) {
    const slider = document.getElementById(`slider-${genre}`);
    if (!slider) return;

    const cards = slider.querySelectorAll('.testimonial-card');
    const dots = document.querySelectorAll(`#dots-${genre} .slider-dot`);

    if (index < 0 || index >= cards.length) return;

    // カードを更新
    cards.forEach((card, i) => {
        card.classList.toggle('active', i === index);
    });

    // ドットを更新
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });

    sliderStates[genre] = index;
}

// グローバルスコープに公開（HTMLのonclickから呼ぶため）
window.changeSlide = changeSlide;

// ジャンルタブの切り替え
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.genre-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const genre = this.getAttribute('data-genre');

            // タブのアクティブ状態を更新
            document.querySelectorAll('.genre-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // コンテンツの表示を切り替え
            document.querySelectorAll('.genre-content').forEach(c => c.classList.remove('active'));
            const content = document.getElementById(genre);
            if (content) {
                content.classList.add('active');
                // スライダーを初期化
                initSlider(genre);
                // 最初のスライドに戻す
                goToSlide(genre, 0);
            }
        });
    });

    // 全てのスライダーを初期化
    ['all', 'love', 'app', 'marriage', 'work', 'life'].forEach(genre => {
        initSlider(genre);
    });
});
