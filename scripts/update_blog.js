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

// Axios Configuration with User-Agent to avoid blocking
const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 15000 // 15 seconds timeout
};

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
        const response = await axios.get(RSS_URL, axiosConfig);
        return response.data;
    } catch (error) {
        console.error('Error fetching RSS:', error.message);
        process.exit(1);
    }
}

async function parseRSS(xml) {
    const parser = new xml2js.Parser({ explicitArray: false });
    return await parser.parseStringPromise(xml);
}

// Scraping Function with retry and improved selectors
async function fetchArticleContent(url, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`  Retry ${attempt}/${retries} for: ${url}`);
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
            console.log(`Scraping: ${url}`);
            const response = await axios.get(url, axiosConfig);
            const $ = cheerio.load(response.data);

            let contentHtml = '';

            // Try multiple selectors in order of likelihood (Note's DOM structure changes frequently)
            const selectors = [
                '.note-common-styles__textnote-body',
                '.note-common-styles__text-body',
                '[data-name="body"]',
                '.p-article__content',
                'article.o-noteContentText',
                '.o-noteContentText',
                '.note-body',
                'article .note-common-styles__textnote-body'
            ];

            for (const selector of selectors) {
                if ($(selector).length) {
                    contentHtml = $(selector).html();
                    console.log(`  Found content with selector: ${selector}`);
                    break;
                }
            }

            if (!contentHtml) {
                console.warn(`  Could not extract content for ${url} (attempt ${attempt + 1})`);
                if (attempt < retries) continue;
                return null;
            }

            // Clean up:
            // Remove empty paragraphs
            contentHtml = contentHtml.replace(/<p><br><\/p>/g, '');

            // Fix images: Note often uses data-src for lazy loading
            const $content = cheerio.load(contentHtml, null, false);
            $content('img').each((i, el) => {
                const dataSrc = $content(el).attr('data-src');
                if (dataSrc) {
                    $content(el).attr('src', dataSrc);
                }
                $content(el).removeClass('lazyload');
                $content(el).css('max-width', '100%');
                $content(el).css('height', 'auto');
            });

            // Remove internal link embeds (uranai-rokkon.com)
            $content('a[href*="uranai-rokkon.com"]').each((i, el) => {
                const $widget = $content(el).closest('figure');
                if ($widget.length) {
                    $widget.remove();
                } else {
                    $content(el).closest('.external-article-widget').remove();
                }
            });

            return $content.html();

        } catch (error) {
            console.error(`  Error scraping ${url} (attempt ${attempt + 1}):`, error.message);
            if (attempt >= retries) return null;
        }
    }
    return null;
}

const SITEMAP_PATH = path.join(__dirname, '../sitemap.xml');

function generateArticlePage(item, content, categorySlug, displayCategory, excerpt) {
    const title = item.title || "無題";
    const pubDate = new Date(item.pubDate);
    const formattedDate = format(pubDate, 'yyyy年M月d日');
    const isoDate = pubDate.toISOString();
    const noteUrl = item.link;

    // Extract ID from link
    const urlParts = noteUrl.split('/');
    const articleId = urlParts[urlParts.length - 1].split('?')[0];

    const fileName = `${articleId}.html`;
    const filePath = path.join(BLOG_DIR, fileName);
    const canonicalUrl = `https://uranai-rokkon.com/blog/${fileName}`;

    let thumbUrl = 'images/otya.png';
    if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$']['url']) {
        thumbUrl = item['media:thumbnail']['$']['url'];
    } else if (typeof item['media:thumbnail'] === 'string') {
        thumbUrl = item['media:thumbnail'];
    }

    // JSON-LD Structured Data
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "image": thumbUrl.startsWith('http') ? thumbUrl : `https://uranai-rokkon.com/${thumbUrl}`,
        "datePublished": isoDate,
        "author": {
            "@type": "Person",
            "name": "占い処 六根清浄"
        },
        "description": excerpt || title
    };

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | 占い処 六根清浄 ブログ</title>
    <meta name="description" content="${(excerpt || title).replace(/"/g, '&quot;')}">
    <link rel="canonical" href="${canonicalUrl}">
    
    <!-- Structured Data -->
    <script type="application/ld+json">
    ${JSON.stringify(jsonLd)}
    </script>

    <!-- OGP -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title} | 占い処 六根清浄">
    <meta property="og:description" content="${(excerpt || '六根清浄のブログ記事です。').replace(/"/g, '&quot;')}">
    <meta property="og:url" content="${canonicalUrl}">
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
        .article-body a {
            color: #2cb696;
            text-decoration: underline;
            text-underline-offset: 3px;
            transition: color 0.2s;
        }
        .article-body a:hover {
            color: #1a9a7a;
        }
        .article-body .external-article-widget {
            display: flex;
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            overflow: hidden;
            background: #fff;
            text-decoration: none;
            margin: 20px 0;
            transition: box-shadow 0.2s;
        }
        .article-body .external-article-widget:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .article-body .external-article-widget a {
            text-decoration: none;
            color: inherit;
        }
        .article-body .external-article-widget-title {
            font-size: 0.95rem;
            color: #333;
            display: block;
            margin-bottom: 4px;
        }
        .article-body .external-article-widget-description,
        .article-body .external-article-widget-url {
            font-size: 0.8rem;
            color: #999;
            display: block;
        }
        .article-body .external-article-widget-price {
            font-size: 0.85rem;
            color: #333;
            margin-top: 6px;
        }
        .article-body .external-article-widget-button .a-button {
            display: inline-block;
            background: #333;
            color: #fff;
            padding: 6px 16px;
            border-radius: 4px;
            font-size: 0.8rem;
            margin-top: 8px;
        }
        .article-body .external-article-widget-image {
            flex-shrink: 0;
        }
        .article-body .external-article-widget-productImage {
            display: block;
            width: 120px;
            height: 120px;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
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
                </nav>
                <span class="contact-btn" style="opacity: 0.5; cursor: default;">SHOP（準備中）</span>
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

    <script src="../js/main.js"></script>
</body>
</html>`;

    console.log(`Writing article page: ${fileName}`);
    fs.writeFileSync(filePath, html);
    return fileName;
}

function generateCardHTML(item, internalLink, manualExcerpt = null) {
    const title = item.title || "無題";
    const link = internalLink;
    const pubDate = new Date(item.pubDate);
    const formattedDate = format(pubDate, 'yyyy年M月d日');

    let thumbUrl = 'images/otya.png';
    if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$']['url']) {
        thumbUrl = item['media:thumbnail']['$']['url'];
    } else if (typeof item['media:thumbnail'] === 'string') {
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

async function updateSitemap(items) {
    if (!fs.existsSync(SITEMAP_PATH)) {
        console.error('Sitemap not found!');
        return;
    }

    console.log('Updating sitemap...');
    const sitemapContent = fs.readFileSync(SITEMAP_PATH, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });

    try {
        const result = await parser.parseStringPromise(sitemapContent);

        let urls = result.urlset.url;
        if (!Array.isArray(urls)) {
            urls = [urls];
        }

        let updated = false;

        for (const item of items) {
            const link = item.link;
            const urlParts = link.split('/');
            const articleId = urlParts[urlParts.length - 1].split('?')[0];
            const fileName = `${articleId}.html`;
            const fullUrl = `https://uranai-rokkon.com/blog/${fileName}`;

            // Check if exists
            const exists = urls.some(u => u.loc === fullUrl);
            if (!exists) {
                console.log(`Adding ${articleId} to sitemap`);
                urls.push({
                    loc: fullUrl,
                    lastmod: format(new Date(), 'yyyy-MM-dd'),
                    changefreq: 'monthly',
                    priority: '0.7'
                });
                updated = true;
            }
        }

        if (updated) {
            result.urlset.url = urls;
            const builder = new xml2js.Builder({
                xmldec: { version: '1.0', encoding: 'UTF-8' },
                renderOpts: { 'pretty': true, 'indent': '  ', 'newline': '\n' }
            });
            const xml = builder.buildObject(result);
            fs.writeFileSync(SITEMAP_PATH, xml);
            console.log('Sitemap updated.');
        } else {
            console.log('No new articles to add to sitemap.');
        }

    } catch (e) {
        console.error('Error updating sitemap:', e);
    }
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

    const cardHtmls = [];

    for (const item of items) {
        const link = item.link;

        const urlParts = link.split('/');
        const articleId = urlParts[urlParts.length - 1].split('?')[0];
        const fileName = `${articleId}.html`;
        const filePath = path.join(BLOG_DIR, fileName);

        // Wait a bit between requests to be nice
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if article page already exists (skip re-scraping for efficiency)
        const articleExists = fs.existsSync(filePath);

        let content = null;
        let excerpt = '';

        if (!articleExists) {
            // Only scrape new articles
            content = await fetchArticleContent(link);
        }

        if (content) {
            // Generate plain text excerpt from the full HTML content
            const $ = cheerio.load(content);
            const fullText = $.text().replace(/\s+/g, ' ').trim();
            excerpt = fullText.length > 60 ? fullText.substring(0, 60) + '...' : fullText;

            const plainTextDesc = (item.description || '').replace(/<[^>]+>/g, '');
            const categoryTextSource = plainTextDesc + ' ' + fullText;
            const assignedCategory = assignCategory(item.title, categoryTextSource, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
            const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

            generateArticlePage(item, content, assignedCategory, displayCategory, excerpt);
            cardHtmls.push(generateCardHTML(item, fileName, excerpt));
        } else if (articleExists) {
            // Article page exists, just generate card from RSS data
            const plainText = (item.description || '').replace(/<[^>]+>/g, '');
            excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;
            cardHtmls.push(generateCardHTML(item, fileName, excerpt));
        } else {
            // Scraping failed and no existing page - create fallback card pointing to Note
            console.warn(`Skipping article page generation for ${link} due to scrape failure`);
            const title = item.title || "無題";
            const pubDate = new Date(item.pubDate);
            const formattedDate = format(pubDate, 'yyyy年M月d日');

            let thumbUrl = 'images/otya.png';
            if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$']['url']) {
                thumbUrl = item['media:thumbnail']['$']['url'];
            } else if (typeof item['media:thumbnail'] === 'string') {
                thumbUrl = item['media:thumbnail'];
            }

            const plainText = (item.description || '').replace(/<[^>]+>/g, '');
            excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;
            const assignedCategory = assignCategory(item.title, plainText, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);
            const displayCategory = CAT_MAP[assignedCategory] || 'コラム';

            // Also generate a minimal article page with RSS description as fallback
            const fallbackContent = `<p>${plainText || '記事の取得に失敗しました。元の記事をNoteでご覧ください。'}</p>`;
            generateArticlePage(item, fallbackContent, assignedCategory, displayCategory, excerpt);
            cardHtmls.push(generateCardHTML(item, fileName, excerpt));
        }
    }

    const cardsHtmlJoined = cardHtmls.join('\n');

    console.log('Reading blog.html...');
    let html = fs.readFileSync(BLOG_HTML_PATH, 'utf8');

    // Replace only the blog-grid content using regex to avoid Cheerio HTML re-encoding issues
    const gridRegex = /(<div id="blog-grid"[^>]*>)([\s\S]*?)(<\/div>\s*\n?\s*\n?\s*(?:<\!-- Load More|\s*<\/div>))/;
    const match = html.match(gridRegex);

    if (match) {
        // Find the exact blog-grid div and replace its contents
        const blogGridStart = html.indexOf('<div id="blog-grid"');
        if (blogGridStart !== -1) {
            // Find the opening tag end
            const openTagEnd = html.indexOf('>', blogGridStart) + 1;
            // Find the closing </div> for blog-grid
            // We need to count nested divs
            let depth = 1;
            let pos = openTagEnd;
            while (depth > 0 && pos < html.length) {
                const nextOpen = html.indexOf('<div', pos);
                const nextClose = html.indexOf('</div>', pos);

                if (nextClose === -1) break;

                if (nextOpen !== -1 && nextOpen < nextClose) {
                    depth++;
                    pos = nextOpen + 4;
                } else {
                    depth--;
                    if (depth === 0) {
                        // Replace content between openTagEnd and nextClose
                        html = html.substring(0, openTagEnd) + '\n' + cardsHtmlJoined + '\n' + html.substring(nextClose);
                        break;
                    }
                    pos = nextClose + 6;
                }
            }
        }

        // Remove loading indicator if present
        html = html.replace(/<p[^>]*>[\s\S]*?記事を読み込んでいます[\s\S]*?<\/p>/g, '');
        html = html.replace(/<div[^>]*id="loading-indicator"[^>]*>[\s\S]*?<\/div>/g, '');

        console.log('Writing updated blog.html...');
        fs.writeFileSync(BLOG_HTML_PATH, html);
        console.log('Done!');
    } else {
        console.error('Could not find #blog-grid in blog.html');
    }

    // Update Sitemap
    await updateSitemap(items);
}

updateBlogHTML();
