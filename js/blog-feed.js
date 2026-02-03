document.addEventListener('DOMContentLoaded', () => {
    const BLOG_WRAPPER = document.getElementById('blog-wrapper');
    const LOADING_INDICATOR = document.getElementById('loading-indicator');
    if (!BLOG_WRAPPER) return;

    // Note RSS URL
    const RSS_URL = 'https://note.com/rokkon_uranai/rss';
    // Use rss2json as primary (stable, JSON)
    const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

    fetch(API_URL)
        .then(response => {
            if (response.ok) return response.json();
            throw new Error('Network response was not ok.');
        })
        .then(data => {
            if (data.items && data.items.length > 0) {
                // Remove loading indicator
                if (LOADING_INDICATOR) LOADING_INDICATOR.style.display = 'none';

                data.items.forEach((item) => {
                    // Extract data from JSON
                    const title = item.title || "無題";
                    const link = item.link || "#";

                    // rss2json returns date as "YYYY-MM-DD HH:mm:ss"
                    let pubDate;
                    if (item.pubDate.includes(' ')) {
                        pubDate = new Date(item.pubDate.replace(' ', 'T'));
                    } else {
                        pubDate = new Date(item.pubDate);
                    }
                    if (isNaN(pubDate.getTime())) { pubDate = new Date(); }

                    const formattedDate = `${pubDate.getFullYear()}年${pubDate.getMonth() + 1}月${pubDate.getDate()}日`;

                    // Category
                    const category = (item.categories && item.categories.length > 0) ? item.categories[0] : 'コラム';

                    // Thumbnail Logic
                    let thumbUrl = item.thumbnail; // Often empty for Note

                    // Fallback to extraction from description or content
                    if (!thumbUrl) {
                        const imgMatchDesc = item.description.match(/<img[^>]+src="([^">]+)"/);
                        // content field is provided by rss2json if available
                        const imgMatchContent = item.content ? item.content.match(/<img[^>]+src="([^">]+)"/) : null;

                        if (imgMatchDesc) {
                            thumbUrl = imgMatchDesc[1];
                        } else if (imgMatchContent) {
                            thumbUrl = imgMatchContent[1];
                        } else {
                            // Default Fallback
                            thumbUrl = 'images/otya.png';
                        }
                    }

                    // Excerpt
                    const plainText = item.description.replace(/<[^>]+>/g, '');
                    const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;

                    // Create Slide
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';

                    slide.innerHTML = `
                        <article class="article-card">
                            <div class="article-image">
                                <span class="article-category">${category}</span>
                                <img src="${thumbUrl}" alt="${title}" class="article-thumb" onerror="this.src='images/otya.png'">
                            </div>
                            <div class="article-content">
                                <div class="article-date">${formattedDate}</div>
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
                        </article>
                    `;

                    BLOG_WRAPPER.appendChild(slide);
                });

                // Add "View More" Slide
                const moreSlide = document.createElement('div');
                moreSlide.className = 'swiper-slide';
                moreSlide.innerHTML = `
                    <a href="https://note.com/rokkon_uranai" class="article-card view-more-card" target="_blank" rel="noopener noreferrer">
                        <div class="view-more-content">
                            <div class="view-more-icon-wrapper">
                                <span class="view-more-icon">📚</span>
                            </div>
                            <h3 class="view-more-text">Noteで<br>すべての記事を見る</h3>
                            <div class="view-more-btn">
                                <span>View All</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M5 12h14M12 5l7 7-7 7"/>
                                </svg>
                            </div>
                        </div>
                    </a>
                `;
                BLOG_WRAPPER.appendChild(moreSlide);

                // Initialize Swiper
                new Swiper('.blog-slider', {
                    slidesPerView: 1.2, // Show part of the next slide on mobile
                    spaceBetween: 20,   // Smaller gap on mobile
                    loop: false,
                    pagination: {
                        el: '.swiper-pagination',
                        clickable: true,
                    },
                    navigation: {
                        nextEl: '.swiper-button-next',
                        prevEl: '.swiper-button-prev',
                    },
                    breakpoints: {
                        // when window width is >= 768px
                        768: {
                            slidesPerView: 2,
                            spaceBetween: 30
                        },
                        // when window width is >= 1024px
                        1024: {
                            slidesPerView: 3,
                            spaceBetween: 40
                        }
                    }
                });

            } else {
                console.warn('No content found in feed');
                if (LOADING_INDICATOR) LOADING_INDICATOR.innerHTML = '<p>記事が見つかりませんでした。</p>';
            }
        })
        .catch(error => {
            console.error('Blog feed load failed:', error);
            if (LOADING_INDICATOR) LOADING_INDICATOR.innerHTML = '<p>記事の読み込みに失敗しました。</p>';
        });
});
