/**
 * 六根清浄サイト 改善用JavaScript
 */

// スクロール進捗バー
(function() {
    'use strict';
    
    const progressBar = document.getElementById('scrollProgress');
    if (!progressBar) return;
    
    function updateProgress() {
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY || window.pageYOffset;
        const scrollPercent = (scrollTop / (documentHeight - windowHeight)) * 100;
        progressBar.style.width = Math.min(scrollPercent, 100) + '%';
    }
    
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
})();
