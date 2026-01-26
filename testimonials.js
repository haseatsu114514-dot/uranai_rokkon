/**
 * 占い処 六根清浄｜お客様の声スライダー
 * タブ切替・スライド・スワイプ・自動再生・キーボード対応
 */
(function () {
    'use strict';

    var currentSlides = { all: 0, love: 0, app: 0, marriage: 0, work: 0, life: 0 };
    var autoplayTimer = null;
    var AUTOPLAY_MS = 6000;

    function showGenre(genre) {
        document.querySelectorAll('.genre-tab').forEach(function (t) { t.classList.remove('active'); });
        var tab = document.querySelector('.genre-tab[data-genre="' + genre + '"]');
        if (tab) tab.classList.add('active');
        document.querySelectorAll('.genre-content').forEach(function (c) { c.classList.remove('active'); });
        var panel = document.getElementById(genre);
        if (panel) panel.classList.add('active');
        resetAutoplay(genre);
    }

    function showSlide(genre, index) {
        var container = document.getElementById(genre);
        if (!container) return;
        var cards = container.querySelectorAll('.testimonial-card');
        var dots = container.querySelectorAll('.slider-dot');
        var n = cards.length;
        if (!n) return;
        index = (index % n + n) % n;
        currentSlides[genre] = index;
        cards.forEach(function (c, i) { c.classList.toggle('active', i === index); });
        dots.forEach(function (d, i) { d.classList.toggle('active', i === index); });
        resetAutoplay(genre);
    }

    function nextSlide(genre) {
        var container = document.getElementById(genre);
        if (!container) return;
        var cards = container.querySelectorAll('.testimonial-card');
        var n = cards.length;
        if (!n) return;
        showSlide(genre, currentSlides[genre] + 1);
    }

    function prevSlide(genre) {
        var container = document.getElementById(genre);
        if (!container) return;
        var cards = container.querySelectorAll('.testimonial-card');
        var n = cards.length;
        if (!n) return;
        showSlide(genre, currentSlides[genre] - 1);
    }

    function getActiveGenre() {
        var t = document.querySelector('.genre-tab.active');
        return t ? t.getAttribute('data-genre') : 'love';
    }

    function tick() {
        var g = getActiveGenre();
        nextSlide(g);
    }

    function stopAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    function resetAutoplay(genre) {
        stopAutoplay();
        autoplayTimer = setInterval(tick, AUTOPLAY_MS);
    }

    function bindSlider() {
        var genres = ['love', 'app', 'marriage', 'work', 'life', 'all'];
        genres.forEach(function (genre) {
            var tab = document.querySelector('.genre-tab[data-genre="' + genre + '"]');
            if (tab) tab.addEventListener('click', function () { showGenre(genre); });

            var container = document.getElementById(genre);
            if (!container) return;
            var nav = container.querySelector('.slider-nav');
            if (!nav) return;
            var arrows = nav.querySelectorAll('.slider-arrow');
            var prev = arrows[0], next = arrows[1];
            var dots = nav.querySelectorAll('.slider-dot');
            if (prev) prev.addEventListener('click', function () { prevSlide(genre); });
            if (next) next.addEventListener('click', function () { nextSlide(genre); });
            dots.forEach(function (d, i) {
                d.addEventListener('click', function () { showSlide(genre, i); });
            });

            var slider = container.querySelector('.testimonial-slider');
            if (slider) {
                var startX = 0, endX = 0;
                slider.addEventListener('touchstart', function (e) {
                    startX = e.changedTouches[0].screenX;
                });
                slider.addEventListener('touchend', function (e) {
                    endX = e.changedTouches[0].screenX;
                    var diff = startX - endX;
                    if (Math.abs(diff) > 50) {
                        if (diff > 0) nextSlide(genre);
                        else prevSlide(genre);
                    }
                });
                slider.addEventListener('mouseenter', stopAutoplay);
                slider.addEventListener('mouseleave', function () { resetAutoplay(genre); });
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            var g = getActiveGenre();
            if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(g); }
            else { e.preventDefault(); nextSlide(g); }
        });
    }

    function init() {
        if (!document.querySelector('.genre-tab')) return;
        bindSlider();
        resetAutoplay('love');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
