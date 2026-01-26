/**
 * 占い処 六根清浄｜FAQ アコーディオン
 */
(function () {
    'use strict';

    function init() {
        var items = document.querySelectorAll('.faq-item');
        if (!items.length) return;

        items.forEach(function (item) {
            var q = item.querySelector('.question');
            var ans = item.querySelector('.answer');
            if (!q || !ans) return;

            var wrap = document.createElement('div');
            wrap.className = 'answer-wrap';
            ans.parentNode.insertBefore(wrap, ans);
            wrap.appendChild(ans);

            q.setAttribute('role', 'button');
            q.setAttribute('aria-expanded', 'false');
            q.addEventListener('click', function () {
                var open = item.classList.toggle('faq-open');
                q.setAttribute('aria-expanded', open ? 'true' : 'false');
                items.forEach(function (other) {
                    if (other !== item) {
                        other.classList.remove('faq-open');
                        var oq = other.querySelector('.question');
                        if (oq) oq.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
