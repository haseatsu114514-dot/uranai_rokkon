document.addEventListener('DOMContentLoaded', () => {
    const BLOG_GRID = document.querySelector('.blog-grid');
    if (!BLOG_GRID) return;

    // note RSSのURLをrss2json経由で取得
    const RSS_URL = 'https://note.com/rokkon_uranai/rss';
    const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

    fetch(API_URL)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok') {
                // 既存のコンテンツをクリアして最新記事を表示
                BLOG_GRID.innerHTML = '';
                
                // 最新6件を取得
                const items = data.items.slice(0, 6);

                items.forEach((item, index) => {
                    // サムネイル画像取得（thumbnailフィールド優先、なければdescription内のimgタグ）
                    let thumbUrl = item.thumbnail;
                    if (!thumbUrl || thumbUrl === "") {
                        const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
                        if (imgMatch) {
                            thumbUrl = imgMatch[1];
                        } else {
                            // デフォルト画像
                            thumbUrl = 'images/favicon.png';
                        }
                    }

                    // 日付フォーマット
                    const dateObj = new Date(item.pubDate);
                    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;

                    // カテゴリ
                    const category = (item.categories && item.categories.length > 0) ? item.categories[0] : 'コラム';

                    // 抜粋
                    const plainText = item.description.replace(/<[^>]+>/g, '');
                    const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;

                    // 記事カード生成
                    const article = document.createElement('article');
                    article.className = 'article-card';
                    // main.jsのアニメーション監視には乗らない可能性が高いため、直接スタイルで表示
                    article.style.opacity = '0';
                    article.style.transform = 'translateY(20px)';
                    article.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

                    article.innerHTML = `
                        <div class="article-image">
                            <span class="article-category">${category}</span>
                            <img src="${thumbUrl}" alt="${item.title}" class="article-thumb">
                        </div>
                        <div class="article-content">
                            <div class="article-date">${formattedDate}</div>
                            <h2 class="article-title">${item.title}</h2>
                            <p class="article-excerpt">${excerpt}</p>
                            <a href="${item.link}" class="read-more" target="_blank" rel="noopener noreferrer">記事を読む →</a>
                        </div>
                    `;

                    BLOG_GRID.appendChild(article);

                    // フェードインアニメーション
                    setTimeout(() => {
                        article.style.opacity = '1';
                        article.style.transform = 'translateY(0)';
                    }, index * 100 + 100);
                });
            }
        })
        .catch(error => {
            console.error('Blog feed load failed:', error);
            // 失敗時は静的コンテンツが表示されたままになる
        });
});
