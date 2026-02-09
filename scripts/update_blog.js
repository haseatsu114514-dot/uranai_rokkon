const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { format } = require('date-fns');
const cheerio = require('cheerio');

const RSS_URL = 'https://note.com/rokkon_uranai/rss';
const BLOG_HTML_PATH = path.join(__dirname, '../blog.html');
const BLOG_DIR = path.join(__dirname, '../blog');

// Ensure blog directory exists
if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR);
}

// Category Logic
const LOVE_KEYWORDS = ['恋愛', '結婚', '復縁', 'モテ', 'パートナー', '婚活', '夫婦', '恋人', '失恋', '不倫', '彼氏', '彼女', 'カップル', '独身', '出会い', 'マッチングアプリ'];
const WORK_KEYWORDS = ['仕事', '転職', '起業', '経営', 'キャリア', 'ビジネス', '金運', '職場', '上司', '部下', '収入', '適職', 'フリーランス', 'ギャンブル', 'スロット', 'お金'];
const FORTUNE_KEYWORDS = ['運勢', '運気', '開運', '大殺界', '空亡', '2026年', '2025年', '年運', '月運', '日運'];
const ESSAY_INDICATORS = ['思う', '考え', '感じ', 'だろうか', 'ではないか', 'かもしれない', '価値', '意味', '本当', '実は', 'なぜ', 'どうして'];

function assignCategory(title, description, tags = []) {
    const tagsText = tags.join(' ');
    const allText = title + ' ' + description + ' ' + tagsText;

    if (LOVE_KEYWORDS.some(k => allText.includes(k))) return 'love';
    if (WORK_KEYWORDS.some(k => allText.includes(k))) return 'work';

    const hasFortuneTopic = FORTUNE_KEYWORDS.some(k => allText.includes(k));
    const hasEssayStyle = ESSAY_INDICATORS.some(k => description.includes(k));
    const isQuestionTitle = title.includes('？') || title.includes('?');
    const isAboutFortuneTelling = title.includes('占い') && (isQuestionTitle || title.includes('価値') || title.includes('好き') || title.includes('べき'));

    if (isAboutFortuneTelling) return 'life';
    if (hasFortuneTopic && !hasEssayStyle) return 'fortune';
    if (hasEssayStyle) return 'life';
    if (hasFortuneTopic) return 'fortune';

    return 'life';
}

const CAT_MAP = {
    'love': '恋愛・結婚',
    'work': '仕事・金運',
    'fortune': '占い・運勢',
    'life': 'コラム・人生'
};

async function fetchRSS() {
    try {
        const response = await axios.get(RSS_URL);
        return response.data;
    } catch (error) {
        console.error('Error fetching RSS:', error);
        process.exit(1);
    }
}

async function parseRSS(xml) {
    const parser = new xml2js.Parser({ explicitArray: false });
    return await parser.parseStringPromise(xml);
}

// Scraping Function
async function fetchArticleContent(url) {
    try {
        console.log(`Scraping: ${url}`);
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Note article body seems to be in .note-common-styles__text-body or similar
        // We need to target the main content.
        // As of 2024/2026, structure changes, but finding the main readable area is key.
        // Often strictly: .p-article__content or .note-common-styles__text-body

        let contentHtml = '';

        // Try common selectors
        if ($('.note-common-styles__text-body').length) {
            contentHtml = $('.note-common-styles__text-body').html();
        } else if ($('[data-name="body"]').length) {
            contentHtml = $('[data-name="body"]').html();
        } else {
            // Fallback: try to get main article part
            contentHtml = $('article.o-noteContentText, .o-noteContentText').html() || '';
        }

        if (!contentHtml) {
            console.warn(`Could not extract content for ${url}`);
            return '<p>記事の取得に失敗しました。元の記事をNoteでご覧ください。</p>';
        }

        // Clean up:
        // Remove empty paragraphs
        contentHtml = contentHtml.replace(/<p><br><\/p>/g, '');

        // Fix images: Note often uses data-src for lazy loading. We want src.
        // Check if images are lazy loaded.
        const $content = cheerio.load(contentHtml, null, false); // false = fragment
        $content('img').each((i, el) => {
            const dataSrc = $content(el).attr('data-src');
            if (dataSrc) {
                $content(el).attr('src', dataSrc);
            }
            // Remove typical Note lazy load classes that might hide the image
            $content(el).removeClass('lazyload');

            // Add styling for responsiveness
            $content(el).css('max-width', '100%');
            $content(el).css('height', 'auto');
        });

        // Remove internal Note widgets (embeds might break, let's keep them if possible but iframe needs care)
        // For now, simpler is better.

        // Remove specific internal link embeds (uranai-rokkon.com)
        $content('a[href*="uranai-rokkon.com"]').each((i, el) => {
            // Trace back to the main container widget (figure or external-article-widget) and remove it
            const $widget = $content(el).closest('figure');
            if ($widget.length) {
                $widget.remove();
            } else {
                $content(el).closest('.external-article-widget').remove();
            }
        });

        return $content.html();

    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        return null;
    }
}

function generateArticlePage(item, content, categorySlug, displayCategory) {
    const title = item.title || "無題";
    const pubDate = new Date(item.pubDate);
    const formattedDate = format(pubDate, 'yyyy年M月d日');
    const noteUrl = item.link;

    // Extract ID from link (last part of url)
    // https://note.com/rokkon_uranai/n/n8ed86fa36803 -> n8ed86fa36803
    const urlParts = noteUrl.split('/');
    const articleId = urlParts[urlParts.length - 1].split('?')[0]; // remove query params

    const fileName = `${articleId}.html`;
    const filePath = path.join(BLOG_DIR, fileName);

    let thumbUrl = 'images/otya.png';
    if (item['media:thumbnail']) {
        thumbUrl = item['media:thumbnail'];
    }

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | 占い処 六根清浄 ブログ</title>
    <meta name="description" content="${title} - 六根清浄のブログ記事。">
    <!-- OGP -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title} | 占い処 六根清浄">
    <meta property="og:description" content="六根清浄のブログ記事です。">
    <meta property="og:url" content="https://uranai-rokkon.com/blog/${fileName}">
    <meta property="og:image" content="${thumbUrl}">
    
    <!-- Favicon -->
    <link rel="icon" href="../images/favicon.png">
    
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- CSS -->
    <link rel="stylesheet" href="../css/style.css">
    <link rel="stylesheet" href="../css/blog.css">
    <style>
        .article-body {
            font-family: 'Shippori Mincho', serif;
            line-height: 2.0;
            color: #333;
            font-size: 1.05rem;
            margin-top: 40px;
        }
        .article-body h2 {
            font-size: 1.4rem;
            margin-top: 50px;
            margin-bottom: 25px;
            border-bottom: 1px solid var(--color-gold);
            padding-bottom: 10px;
            color: var(--color-primary-dark);
        }
        .article-body h3 {
            font-size: 1.2rem;
            margin-top: 40px;
            margin-bottom: 20px;
            font-weight: 600;
        }
        .article-body p {
            margin-bottom: 2em;
        }
        .article-body img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 20px 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .article-body blockquote {
            border-left: 4px solid var(--color-gold);
            padding-left: 15px;
            margin: 20px 0;
            color: #666;
            font-style: italic;
        }
        .article-header-image {
            width: 100%;
            height: auto;
            aspect-ratio: 1.91 / 1;
            object-fit: cover;
            border-radius: 12px;
            margin-bottom: 30px;
        }
        .original-link {
            display: inline-block;
            margin-top: 40px;
            padding: 15px 25px;
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 8px;
            color: #666;
            text-decoration: none;
            font-size: 0.9rem;
            transition: all 0.3s;
        }
        .original-link:hover {
            background: #f0f0f0;
            color: #333;
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-inner">
            <a href="../index.html" class="logo">
                <span class="logo-main">六根清浄</span>
                <span class="logo-sub">(Rokkon shojo)</span>
            </a>
            <div class="nav-wrapper">
                <nav class="nav">
                    <a href="../index.html">TOP</a>
                    <a href="../beginner.html">はじめて</a>
                    <a href="../about.html">占い師</a>
                    <a href="../pricing.html">料金案内</a>
                    <a href="../testimonials.html">口コミ</a>
                    <a href="../faq.html">Q&A</a>
                    <a href="../blog.html">ブログ</a>
                    <a href="https://uranairokkon.base.shop" target="_blank">物販</a>
                </nav>
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSdG_cRsdXN-z8HUmzwUdAv7exsxFM41qp-WLr6hGORGmQI28w/viewform?usp=header" class="contact-btn" target="_blank">お問い合わせ</a>
            </div>
            <div class="menu-toggle" onclick="toggleMenu();" aria-label="メニュー">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    </header>

    <main class="main-content" style="padding-top: 100px; padding-bottom: 80px;">
        <article class="blog-inner" style="background: #fff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
            
            <header class="article-header">
                <div class="article-meta" style="margin-bottom: 15px; color: #888;">
                    <span class="article-date">${formattedDate}</span>
                    <span class="article-category" style="position: static; display: inline-block; margin-left: 10px;">${displayCategory}</span>
                </div>
                <h1 style="font-size: 1.8rem; margin-bottom: 30px; letter-spacing: 0.05em; line-height: 1.5;">${title}</h1>
                <img src="${thumbUrl}" alt="${title}" class="article-header-image" onerror="this.style.display='none'">
            </header>

            <div class="article-body">
                ${content}
            </div>

            <footer style="margin-top: 60px; border-top: 1px solid #eee; padding-top: 30px;">
                <a href="${noteUrl}" target="_blank" rel="noopener" class="original-link">
                    この記事のNote元ページを開く
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-left: 5px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
                <div style="margin-top: 30px; text-align: center;">
                    <a href="../blog.html" class="load-more-btn" style="text-decoration: none;">ブログ一覧に戻る</a>
                </div>
            </footer>
        </article>
    </main>

    <footer class="footer">
        <div class="footer-inner">
             <div class="footer-copy">© 2026 六根清浄 All Rights Reserved.</div>
        </div>
    </footer>
</body>
</html>`;

    console.log(`Writing article page: ${fileName}`);
    fs.writeFileSync(filePath, html);
    return fileName; // return relative filename
}

function generateCardHTML(item, internalLink, manualExcerpt = null) {
    const title = item.title || "無題";
    const link = internalLink; // Link to internal file
    const pubDate = new Date(item.pubDate);
    const formattedDate = format(pubDate, 'yyyy年M月d日');

    let thumbUrl = 'images/otya.png';
    if (item['media:thumbnail']) {
        thumbUrl = item['media:thumbnail'];
    }

    let excerpt = '';
    const plainText = (item.description || '').replace(/<[^>]+>/g, '');

    if (manualExcerpt) {
        excerpt = manualExcerpt;
    } else {
        excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;
    }

    const assignedCategory = assignCategory(title, plainText, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
    const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

    const now = new Date();
    const diffHours = (now - pubDate) / (1000 * 60 * 60);
    const isNew = diffHours < 24;
    const newBadgeHtml = isNew ? '<span class="new-badge">NEW</span>' : '';

    return `
        <a href="blog/${internalLink}" class="article-card" data-category="${assignedCategory}" data-timestamp="${pubDate.getTime()}">
            <div class="article-image">
                <span class="article-category">${displayCategory}</span>
                ${newBadgeHtml}
                <img src="${thumbUrl}" alt="${title}" class="article-thumb" onerror="this.src='images/otya.png'">
            </div>
            <div class="article-content">
                <div class="article-meta" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.8rem; color: #888;">
                    <span class="article-date">${formattedDate}</span>
                </div>
                <h2 class="article-title">${title}</h2>
                <p class="article-excerpt">${excerpt}</p>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span class="read-more">記事を読む</span>
                </div>
            </div>
        </a>
    `;
}

async function updateBlogHTML() {
    console.log('Fetching RSS...');
    const xml = await fetchRSS();
    const result = await parseRSS(xml);

    // Convert single item to array if needed
    let items = result.rss.channel.item;
    if (!Array.isArray(items)) {
        items = [items];
    }

    console.log(`Found ${items.length} items.`);

    // Helper to process items sequentially to not overload
    const cardHtmls = [];

    for (const item of items) {
        const link = item.link;

        const urlParts = link.split('/');
        const articleId = urlParts[urlParts.length - 1].split('?')[0];
        const fileName = `${articleId}.html`;
        const filePath = path.join(BLOG_DIR, fileName);

        // Wait a bit between requests to be nice
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Always scrape to get the full content for excerpt generation, 
        // even if file exists (unless we store metadata separately, but for now scraping is safer for excerpt)
        // Optimization: If file exists, we could arguably skip scraping IF we had the excerpt stored.
        // But the user reported missing excerpts, so we need to re-scrape to get the text.
        // Let's scrape.

        let content = await fetchArticleContent(link);

        if (content) {
            // Generate plain text excerpt from the full HTML content
            const $ = cheerio.load(content);
            const fullText = $.text().replace(/\s+/g, ' ').trim();
            const excerpt = fullText.length > 60 ? fullText.substring(0, 60) + '...' : fullText;

            const plainTextDesc = (item.description || '').replace(/<[^>]+>/g, '');
            // Use RSS description keywords if available for category, but use scraped text for card excerpt if description is empty or just image

            const categoryTextSource = plainTextDesc + ' ' + fullText;
            const assignedCategory = assignCategory(item.title, categoryTextSource, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
            const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

            generateArticlePage(item, content, assignedCategory, displayCategory);

            // Generate card with the extracted excerpt
            cardHtmls.push(generateCardHTML(item, fileName, excerpt));
        } else {
            console.warn(`Skipping generation for ${link} due to scrape failure`);
            // Fallback
            const title = item.title || "無題";
            const pubDate = new Date(item.pubDate);
            const formattedDate = format(pubDate, 'yyyy年M月d日');
            let thumbUrl = item['media:thumbnail'] || 'images/otya.png';
            const plainText = (item.description || '').replace(/<[^>]+>/g, '');
            const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;
            const assignedCategory = assignCategory(item.title, plainText, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
            const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

            cardHtmls.push(`
                 <a href="${link}" class="article-card" target="_blank" rel="noopener noreferrer" data-category="${assignedCategory}" data-timestamp="${pubDate.getTime()}">
                     <div class="article-image">
                         <span class="article-category">${displayCategory}</span>
                         <img src="${thumbUrl}" alt="${title}" class="article-thumb" onerror="this.src='images/otya.png'">
                     </div>
                     <div class="article-content">
                         <div class="article-meta"><span class="article-date">${formattedDate}</span></div>
                         <h2 class="article-title">${title}</h2>
                         <p class="article-excerpt">${excerpt}</p>
                         <span class="read-more">noteで読む</span>
                     </div>
                 </a>
              `);
        }
    }

    const cardsHtmlJoined = cardHtmls.join('\n');

    console.log('Reading blog.html...');
    let html = fs.readFileSync(BLOG_HTML_PATH, 'utf8');

    // Use Cheerio to update blog.html safely
    const $ = cheerio.load(html, { decodeEntities: false });

    // Remove the loading indicator text specifically
    // It's in .blog-inner > p containing "記事を読み込んでいます..."
    $('.blog-inner p').filter((i, el) => $(el).text().includes('記事を読み込んでいます')).remove();
    // Also remove explicit id if it existed (backwards compatibility)
    $('#loading-indicator').remove();

    const $grid = $('#blog-grid');
    if ($grid.length) {
        $grid.html('\n' + cardsHtmlJoined + '\n');
        $grid.removeClass('blog-grid-empty');

        console.log('Writing updated blog.html...');
        fs.writeFileSync(BLOG_HTML_PATH, $.html());
        console.log('Done!');
    } else {
        console.error('Could not find #blog-grid in blog.html');
    }
}

updateBlogHTML();
