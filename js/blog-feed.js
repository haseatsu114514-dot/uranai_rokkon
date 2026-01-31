document.addEventListener('DOMContentLoaded', () => {
    const BLOG_GRID = document.querySelector('.blog-grid');
    if (!BLOG_GRID) return;

    // note RSSのURL
    const RSS_URL = 'https://note.com/rokkon_uranai/rss';
    // allorigins.winを使ってCORSを回避しつつRaw XMLを取得
    const API_URL = `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`;

    fetch(API_URL)
        .then(response => {
            if (response.ok) return response.json();
            throw new Error('Network response was not ok.');
        })
        .then(data => {
            if (data.contents) {
                // XMLをパース
                const parser = new DOMParser();
                const xml = parser.parseFromString(data.contents, "text/xml");
                const items = xml.querySelectorAll("item");

                // 既存のコンテンツをクリア
                BLOG_GRID.innerHTML = '';

                // 最新6件を取得
                // NodeListはsliceできないのでArray.fromするか、ループでカウントする
                const maxItems = Math.min(items.length, 6);

                for (let i = 0; i < maxItems; i++) {
                    const item = items[i];
                    
                    // タイトル
                    const title = item.getElementsByTagName("title")[0]?.textContent || "無題";
                    
                    // リンク
                    const link = item.getElementsByTagName("link")[0]?.textContent || "#";
                    
                    // 日付
                    const pubDateText = item.getElementsByTagName("pubDate")[0]?.textContent;
                    const dateObj = new Date(pubDateText);
                    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
                    
                    // カテゴリ (categoriesタグはない場合が多いが念のためチェック)
                    // NoteのRSSにはcategoryタグがない場合もあるため、デフォルト固定か、あれば使う
                    const categoryTag = item.getElementsByTagName("category")[0];
                    const category = categoryTag ? categoryTag.textContent : 'コラム';

                    // サムネイル (media:thumbnail)
                    // getElementsByTagNameは名前空間付きタグを"media:thumbnail"で取れるブラウザが多いが
                    // 安全のため名前空間なしでも探す、あるいは "thumbnail" で探す
                    let thumbUrl = "";
                    const mediaThumb = item.getElementsByTagName("media:thumbnail")[0] || item.getElementsByTagName("thumbnail")[0];
                    
                    if (mediaThumb) {
                        thumbUrl = mediaThumb.textContent;
                    } else {
                        // description内のimgタグを探す (フォールバック)
                        const description = item.getElementsByTagName("description")[0]?.textContent || "";
                        const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
                        if (imgMatch) {
                            thumbUrl = imgMatch[1];
                        } else {
                            thumbUrl = 'images/favicon.png';
                        }
                    }

                    // 抜粋
                    const description = item.getElementsByTagName("description")[0]?.textContent || "";
                    const plainText = description.replace(/<[^>]+>/g, '');
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
                    }, i * 100 + 100);
                }
            } else {
                console.error('No content found in feed');
            }
        })
        .catch(error => {
            console.error('Blog feed load failed:', error);
        });
});
