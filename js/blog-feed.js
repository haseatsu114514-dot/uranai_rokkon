document.addEventListener('DOMContentLoaded', () => {
    const BLOG_GRID = document.getElementById('blog-grid');
    const LOADING_INDICATOR = document.getElementById('loading-indicator');
    const PAGINATION_CONTAINER = document.getElementById('pagination-container');
    const LOAD_MORE_BTN = document.getElementById('load-more-btn');
    const FILTER_BTNS = document.querySelectorAll('.filter-btn');

    if (!BLOG_GRID) return;

    // Configuration
    const API_URL = 'https://script.google.com/macros/s/AKfycbyDNFpgHQpxg7S2v6zJybs0iWIC3Ci87eR9EK9CfyuJkdFfczrxPWUs9NYtmbpQ7_2w/exec';
    const ITEMS_PER_PAGE = 9; // Show 9 items (3x3 grid)

    // Cache Configuration
    const CACHE_KEY = 'blog_feed_cache_v10';
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

    let allItems = []; // All fetched items
    let filteredItems = []; // Items matching current filter
    let displayedCount = 0;
    let currentFilter = 'all';

    // Auto-Categorization Logic
    // Priority: Love > Work > Fortune > Life (Default)
    const CATEGORY_RULES = {
        'love': ['恋愛', '結婚', '復縁', 'モテ', 'パートナー', '婚活', '夫婦', '恋人', '失恋', '不倫', '彼氏', '彼女', '愛', 'カップル'],
        'work': ['仕事', '転職', '起業', 'お金', '経営', 'キャリア', 'ビジネス', '金運', '職場', '上司', '部下', '収入', '適職', 'フリーランス'],
        'fortune': ['四柱推命', '鑑定', '占い', '運勢', '運気', '2026', 'スピリチュアル', '開運', '神社', 'パワースポット', '宿命'],
    };

    function assignCategory(title, description) {
        // Specific Overrides
        if (title.includes('テイカー') ||
            title.includes('いつ死ぬか') ||
            title.includes('丙午') ||
            title.includes('MBTI')) return 'life';

        if (title.includes('ギャンブル')) return 'work';
        if (title.includes('運気を上げたい')) return 'fortune';

        const text = (title + description).toLowerCase();
        for (const [key, keywords] of Object.entries(CATEGORY_RULES)) {
            if (keywords.some(k => text.includes(k))) {
                return key;
            }
        }
        return 'life'; // Default fallback (コラム・人生)
    }

    // Function to load data (Cache -> Network)
    async function loadBlogData() {
        const now = new Date().getTime();
        const cachedData = localStorage.getItem(CACHE_KEY);

        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData);
                if (now - parsed.timestamp < CACHE_DURATION) {
                    console.log('Using cached blog data');
                    processData(parsed.data);
                    return;
                }
            } catch (e) {
                console.warn('Cache parse error', e);
                localStorage.removeItem(CACHE_KEY);
            }
        }

        console.log('Fetching fresh blog data...');
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Network response was not ok.');

            const data = await response.json();
            if (data.status === 'ok') {
                // Save to cache
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: now,
                    data: data
                }));
                processData(data);
            } else {
                throw new Error('API Error: ' + data.message);
            }
        } catch (error) {
            console.error('Blog feed load failed:', error);
            if (LOADING_INDICATOR) LOADING_INDICATOR.innerHTML = '<p>記事の読み込みに失敗しました。</p>';
        }
    }

    // Process and Render Data (Extracted for reuse)
    function processData(data) {
        if (data.items && data.items.length > 0) {
            // Pre-process items with category assignment
            allItems = data.items.map(item => {
                const assignedCat = assignCategory(item.title, item.description);
                return { ...item, assignedCategory: assignedCat };
            });

            // Initialize view
            applyFilter('all');

            // Hide loading
            if (LOADING_INDICATOR) LOADING_INDICATOR.style.display = 'none';

            // Remove empty class
            BLOG_GRID.classList.remove('blog-grid-empty');

        } else {
            console.warn('No content found in feed');
            if (LOADING_INDICATOR) LOADING_INDICATOR.innerHTML = '<p>記事が見つかりませんでした。</p>';
        }
    }

    // Start Loading
    loadBlogData();

    // Filter Click Handler
    FILTER_BTNS.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            FILTER_BTNS.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Apply filter
            const filterType = btn.getAttribute('data-filter');
            applyFilter(filterType);
        });
    });

    function applyFilter(filterType) {
        currentFilter = filterType;
        displayedCount = 0;
        BLOG_GRID.innerHTML = ''; // Clear current grid

        if (filterType === 'all') {
            filteredItems = allItems;
        } else {
            filteredItems = allItems.filter(item => item.assignedCategory === filterType);
        }

        renderItems();
        updatePagination();
    }

    // Load More Click Handler
    if (LOAD_MORE_BTN) {
        LOAD_MORE_BTN.addEventListener('click', () => {
            renderItems();
            updatePagination();
        });
    }

    function updatePagination() {
        if (displayedCount >= filteredItems.length) {
            PAGINATION_CONTAINER.style.display = 'none';
        } else {
            PAGINATION_CONTAINER.style.display = 'block';
        }
    }

    // Render Function
    function renderItems() {
        const fragment = document.createDocumentFragment();
        const nextBatch = filteredItems.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);

        nextBatch.forEach(item => {
            const card = createCard(item);
            fragment.appendChild(card);
        });

        BLOG_GRID.appendChild(fragment);
        displayedCount += nextBatch.length;
    }

    // specific helper
    function createCard(item) {
        const title = item.title || "無題";
        const link = item.link || "#";

        let pubDate = new Date(item.pubDate);
        if (isNaN(pubDate.getTime())) { pubDate = new Date(); }
        const formattedDate = `${pubDate.getFullYear()}年${pubDate.getMonth() + 1}月${pubDate.getDate()}日`;

        // Use assigned category for display label if you want, 
        // or keep original Note category. Let's use the UI friendly name.
        const catMap = {
            'love': '恋愛・結婚',
            'work': '仕事・金運',
            'fortune': '占い・運勢',
            'life': 'コラム・人生'
        };
        const displayCategory = catMap[item.assignedCategory] || 'コラム';

        const likeCount = item.likeCount || 0;

        // Thumbnail Logic
        let thumbUrl = item.thumbnail;
        if (!thumbUrl) {
            thumbUrl = 'images/otya.png';
        }

        // New Badge Logic (within 24 hours) - Enhanced
        const now = new Date();
        const diffMs = now - pubDate;
        const diffHours = diffMs / (1000 * 60 * 60);
        const isNew = diffHours < 24;
        const newBadgeHtml = isNew ? '<span class="new-badge">NEW</span>' : '';

        // Clean description
        const plainText = item.description.replace(/<[^>]+>/g, '');
        const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;

        const articleDiv = document.createElement('a'); // Changed to anchor tag
        articleDiv.className = 'article-card';
        articleDiv.href = link;
        articleDiv.target = '_blank';
        articleDiv.rel = 'noopener noreferrer';
        articleDiv.innerHTML = `
            <div class="article-image">
                <span class="article-category">${displayCategory}</span>
                ${newBadgeHtml}
                <img src="${thumbUrl}" alt="${title}" class="article-thumb" onerror="this.src='images/otya.png'">
            </div>
            <div class="article-content">
                <div class="article-meta" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.8rem; color: #888;">
                    <span class="article-date">${formattedDate}</span>
                    <span class="article-like" style="display: flex; align-items: center; gap: 4px; color: #999; font-size: 0.95rem;">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        <span>${likeCount}</span>
                    </span>
                </div>
                <h2 class="article-title">${title}</h2>
                <p class="article-excerpt">${excerpt}</p>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span class="read-more">記事を読む</span> <!-- Changed to span -->
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
