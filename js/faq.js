// FAQアコーディオン
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.question').forEach(q => {
        q.addEventListener('click', () => {
            const item = q.parentElement;
            item.classList.toggle('faq-open');
        });
    });
});
