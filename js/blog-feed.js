document.addEventListener('DOMContentLoaded', () => {
    const BLOG_GRID = document.querySelector('.blog-grid');
    if (!BLOG_GRID) return;

    // note RSSのURL
    const RSS_URL = 'https://note.com/rokkon_uranai/rss';
    // rss2jsonを使ってJSONとして取得 (alloriginsより安定性が高い)
    const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

    fetch(API_URL)
        .then(response => {
            if (response.ok) return response.json();
            throw new Error('Network response was not ok.');
        })
        .then(data => {
            if (data.items && data.items.length > 0) {
                // 既存のコンテンツをクリア
                BLOG_GRID.innerHTML = '';

                // 最新6件を取得
                const items = data.items.slice(0, 6);

                items.forEach((item, index) => {
                    // タイトル
                    const title = item.title || "無題";
                    
                    // リンク
                    const link = item.link || "#";
                    
                    // 日付
                    const dateObj = new Date(item.pubDate);
                    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
                    
                    // カテゴリ (rss2jsonではcategories配列)
                    const category = (item.categories && item.categories.length > 0) ? item.categories[0] : 'コラム';

                    // サムネイル
                    let thumbUrl = item.thumbnail;
                    
                    // サムネイルがない場合、descriptionから画像を探すフォールバック
                    if (!thumbUrl) {
                        const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
                        if (imgMatch) {
                            thumbUrl = imgMatch[1];
                        } else {
                            thumbUrl = 'images/favicon.png';
                        }
                    }

                    // 抜粋 (HTMLタグ除去)
                    const plainText = item.description.replace(/<[^>]+>/g, '');
                    const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;

                    // 記事カード生成
                    const article = document.createElement('article');
                    article.className = 'article-card';
                    article.style.opacity = '0';
                    article.style.transform = 'translateY(20px)';
                    article.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

                    article.innerHTML = `
                        <div class="article-image">
                            <span class="article-category">${category}</span>
                            <img src="${thumbUrl}" alt="${title}" class="article-thumb">
                        </div>
                        <div class="article-content">
                            <div class="article-date">${formattedDate}</div>
                            <h2 class="article-title">${title}</h2>
                            <p class="article-excerpt">${excerpt}</p>
                            <a href="${link}" class="read-more" target="_blank" rel="noopener noreferrer">記事を読む →</a>
                        </div>
                    `;

                    BLOG_GRID.appendChild(article);

                    // フェードインアニメーション
                    setTimeout(() => {
                        article.style.opacity = '1';
                        article.style.transform = 'translateY(0)';
                    }, index * 100 + 100);
                });
            } else {
                console.warn('No content found in feed');
                // データがない場合でも、ハードコードされた記事を残すか、エラー表示するかは要検討
                // 現状はinnerHTMLクリア前なので、何もしなければハードコードされた初期表示が残る
                // ここではもしデータ取得できてitemsが空ならクリアしてしまう可能性があるので、
                // data.itemsがある場合のみクリアするように分岐済み。
            }
        })
        .catch(error => {
            console.error('Blog feed load failed:', error);
            // エラー時は既存のハードコード記事がそのまま残る（安全策）
        });
});
