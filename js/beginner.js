(function () {
    var track = document.querySelector('.slide-track');
    var slides = document.querySelectorAll('.slide');
    var prevBtn = document.querySelector('.slide-arrow-prev');
    var nextBtn = document.querySelector('.slide-arrow-next');
    var dotsContainer = document.getElementById('slideDots');
    var counter = document.getElementById('slideCounter');
    var progressFill = document.getElementById('slideProgress');
    var startBtn = document.querySelector('.slide-cover-start');

    if (!track || !slides.length || !prevBtn || !nextBtn || !dotsContainer || !counter || !progressFill) {
        return;
    }

    var current = 0;
    var total = slides.length;

    for (var i = 0; i < total; i += 1) {
        var dot = document.createElement('button');
        dot.className = 'slide-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('data-target', i);
        dot.setAttribute('aria-label', 'スライド' + (i + 1));
        dotsContainer.appendChild(dot);
    }

    var dots = dotsContainer.querySelectorAll('.slide-dot');

    function formatCounter(index) {
        return String(index + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    }

    function goTo(index) {
        if (index < 0) {
            index = total - 1;
        }
        if (index >= total) {
            index = 0;
        }

        current = index;
        track.style.transform = 'translateX(-' + (current * 100) + '%)';

        dots.forEach(function (dot, dotIndex) {
            dot.classList.toggle('active', dotIndex === current);
        });

        counter.textContent = formatCounter(current);
        progressFill.style.width = (((current + 1) / total) * 100) + '%';
    }

    prevBtn.addEventListener('click', function () {
        goTo(current - 1);
    });

    nextBtn.addEventListener('click', function () {
        goTo(current + 1);
    });

    dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
            goTo(parseInt(this.getAttribute('data-target'), 10));
        });
    });

    if (startBtn) {
        startBtn.addEventListener('click', function () {
            goTo(1);
        });
    }

    var startX = 0;
    var diffX = 0;
    var viewport = document.querySelector('.slide-viewport');

    if (viewport) {
        viewport.addEventListener('touchstart', function (event) {
            startX = event.touches[0].clientX;
            diffX = 0;
        }, { passive: true });

        viewport.addEventListener('touchmove', function (event) {
            diffX = event.touches[0].clientX - startX;
        }, { passive: true });

        viewport.addEventListener('touchend', function () {
            if (Math.abs(diffX) > 50) {
                goTo(diffX > 0 ? current - 1 : current + 1);
            }
        });
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft') {
            goTo(current - 1);
        }
        if (event.key === 'ArrowRight') {
            goTo(current + 1);
        }
    });

    goTo(0);
})();
