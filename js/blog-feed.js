document.addEventListener('DOMContentLoaded', () => {
    const BLOG_GRID = document.getElementById('blog-grid');
    const LOADING_INDICATOR = document.getElementById('loading-indicator');
    const PAGINATION_CONTAINER = document.getElementById('pagination-container');
    const LOAD_MORE_BTN = document.getElementById('load-more-btn');

    if (!BLOG_GRID) return;

    // Configuration
    // Google Apps Script Proxy V2 (Uses Note API: Returns high-res images & like counts)
    const API_URL = 'https://script.google.com/macros/s/AKfycbyQACn3cVV5yeXP5ZHVsKzwh92MQj5sSswXoiSKJMixNQwl271njvIIIf9U3LLJPCOUVQ/exec';
    const ITEMS_PER_PAGE = 6;

    let allItems = [];
    let displayedCount = 0;

    // Load Blog Data
    fetch(API_URL)
        .then(response => {
            if (response.ok) return response.json();
            throw new Error('Network response was not ok.');
        })
        .then(data => {
            if (data.status === 'ok' && data.items && data.items.length > 0) {
                allItems = data.items;

                // Hide loading
                if (LOADING_INDICATOR) LOADING_INDICATOR.style.display = 'none';

                // Show first batch
                renderItems();

                // Show button if more items exist
                if (allItems.length > displayedCount) {
                    PAGINATION_CONTAINER.style.display = 'block';
                }

                // Remove empty class
                BLOG_GRID.classList.remove('blog-grid-empty');

            } else {
                console.warn('No content found in feed');
                if (LOADING_INDICATOR) LOADING_INDICATOR.innerHTML = '<p>記事が見つかりませんでした。</p>';
            }
        })
        .catch(error => {
            console.error('Blog feed load failed:', error);
            if (LOADING_INDICATOR) LOADING_INDICATOR.innerHTML = '<p>記事の読み込みに失敗しました。</p>';
        });

    // Load More Click Handler
    if (LOAD_MORE_BTN) {
        LOAD_MORE_BTN.addEventListener('click', () => {
            renderItems();
            if (displayedCount >= allItems.length) {
                PAGINATION_CONTAINER.style.display = 'none';
            }
        });
    }

    // Render Function
    function renderItems() {
        const fragment = document.createDocumentFragment();
        const nextBatch = allItems.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);

        nextBatch.forEach(item => {
            const card = createCard(item);
            fragment.appendChild(card);
        });

        BLOG_GRID.appendChild(fragment);
        displayedCount += nextBatch.length;
    }

    // specific helper
    function createCard(item) {
        // Extract data
        const title = item.title || "無題";
        const link = item.link || "#";

        let pubDate = new Date(item.pubDate);
        if (isNaN(pubDate.getTime())) { pubDate = new Date(); }
        const formattedDate = `${pubDate.getFullYear()}年${pubDate.getMonth() + 1}月${pubDate.getDate()}日`;

        const category = item.category || 'コラム';
        const likeCount = item.likeCount || 0;

        // Thumbnail Logic
        let thumbUrl = item.thumbnail;
        if (!thumbUrl) {
            thumbUrl = 'images/otya.png';
        }

        // Clean description for excerpt
        const plainText = item.description.replace(/<[^>]+>/g, '');
        const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;

        const articleDiv = document.createElement('article');
        articleDiv.className = 'article-card';
        articleDiv.innerHTML = `
            <div class="article-image">
                <span class="article-category">${category}</span>
                <img src="${thumbUrl}" alt="${title}" class="article-thumb" onerror="this.src='images/otya.png'">
            </div>
            <div class="article-content">
                <div class="article-meta" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.8rem; color: #888;">
                    <span class="article-date">${formattedDate}</span>
                    <span class="article-like" style="display: flex; align-items: center; gap: 4px; color: #ff5f5f;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        <span>${likeCount}</span>
                    </span>
                </div>
                <h2 class="article-title">${title}</h2>
                <p class="article-excerpt">${excerpt}</p>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <a href="${link}" class="read-more" target="_blank" rel="noopener noreferrer">記事を読む →</a>
                    <span class="note-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                        </svg>
                        note.com
                    </span>
                </div>
            </div>
        `;
        return articleDiv;
    }
});
