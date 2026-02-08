const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');

// Configuration
const RSS_URL = 'https://note.com/rokkon_uranai/rss';
const BLOG_HTML_PATH = path.join(__dirname, '../blog.html');
const ITEMS_TO_SHOW = 9; // Number of items to display initially

// Keywords for categorization (synchronize with frontend logic)
const LOVE_KEYWORDS = ['恋愛', '結婚', '復縁', 'モテ', 'パートナー', '婚活', '夫婦', '恋人', '失恋', '不倫', '彼氏', '彼女', 'カップル', '独身', '出会い', 'マッチングアプリ'];
const WORK_KEYWORDS = ['仕事', '転職', '起業', '経営', 'キャリア', 'ビジネス', '金運', '職場', '上司', '部下', '収入', '適職', 'フリーランス', 'ギャンブル', 'スロット', 'お金'];
const FORTUNE_KEYWORDS = ['運勢', '運気', '開運', '大殺界', '空亡', '2026年', '2025年', '年運', '月運', '日運'];
const ESSAY_INDICATORS = ['思う', '考え', '感じ', 'だろうか', 'ではないか', 'かもしれない', '価値', '意味', '本当', '実は', 'なぜ', 'どうして'];

// Category Assignment Logic
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

// Fetch RSS Feed
function fetchRSS(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

// Parse RSS XML (Simple Regex/DOM based parser for Node)
function parseRSS(xml) {
    const dom = new JSDOM(xml, { contentType: 'text/xml' });
    const items = dom.window.document.querySelectorAll('item');
    const parsedItems = [];

    items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const thumbnail = item.getElementsByTagName('media:thumbnail')[0]?.textContent || '';
        // Note: tags/categories are often not in standard RSS item, but we'll try 'category'
        const tags = Array.from(item.querySelectorAll('category')).map(c => c.textContent);

        parsedItems.push({
            title,
            link,
            pubDate,
            description,
            thumbnail,
            tags
        });
    });

    return parsedItems;
}

// Generate HTML Card
function createCardHTML(item) {
    const category = assignCategory(item.title, item.description, item.tags);
    const catMap = {
        'love': '恋愛・結婚',
        'work': '仕事・金運',
        'fortune': '占い・運勢',
        'life': 'コラム・人生'
    };
    const displayCategory = catMap[category] || 'コラム';
    
    // Date formatting
    const dateObj = new Date(item.pubDate);
    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;

    // New Badge
    const now = new Date();
    const diffMs = now - dateObj;
    const diffHours = diffMs / (1000 * 60 * 60);
    const isNew = diffHours < 48; // Extend to 48h for static generation safety
    const newBadgeHtml = isNew ? '<span class="new-badge">NEW</span>' : '';

    // Description cleaning
    const plainText = item.description.replace(/<[^>]+>/g, '');
    const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;

    // Thumbnail fallback
    const thumbUrl = item.thumbnail || 'images/otya.png';

    return `
            <a href="${item.link}" class="article-card" target="_blank" rel="noopener noreferrer">
                <div class="article-image">
                    <span class="article-category">${displayCategory}</span>
                    ${newBadgeHtml}
                    <img src="${thumbUrl}" alt="${item.title}" class="article-thumb" onerror="this.src='images/otya.png'">
                </div>
                <div class="article-content">
                    <div class="article-meta" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.8rem; color: #888;">
                        <span class="article-date">${formattedDate}</span>
                        <!-- Likes omitted in static build as they change dynamically -->
                    </div>
                    <h2 class="article-title">${item.title}</h2>
                    <p class="article-excerpt">${excerpt}</p>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span class="read-more">記事を読む</span>
                        <span class="note-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                            </svg>
                            note.com
                        </span>
                    </div>
                </div>
            </a>
    `;
}

// Main Function
async function updateBlogHTML() {
    try {
        console.log('Fetching RSS from Note...');
        const xmlData = await fetchRSS(RSS_URL);
        const items = parseRSS(xmlData);
        
        console.log(`Fetched ${items.length} items.`);

        let cardsHTML = '';
        // Only take the latest ITEMS_TO_SHOW for the static grid
        // The "Load More" button in frontend JS can still fetch dynamically if needed, 
        // OR we can render ALL and hide them with CSS/JS. 
        // For simplicity and performance, let's render all but assume JS handles pagination/filtering if present.
        // Actually, let's render ALL items to maximize SEO benefit of text content.
        // Frontend JS will need to handle "showing only first 9" if we want to keep layout clean,
        // or we can just render the top 9 statically and let the rest be hidden or loaded.
        // Strategy: Render ALL items statically so Google sees them. 
        
        items.forEach(item => {
            cardsHTML += createCardHTML(item);
        });

        // Read blog.html
        let htmlContent = fs.readFileSync(BLOG_HTML_PATH, 'utf-8');

        // Replace content inside #blog-grid
        // Regex to find content between <div id="blog-grid" ...> and </div>
        // Warning: Simple regex replacement on HTML is risky if structure changes.
        // For now, we assume standard structure.
        const gridRegex = /(<div id="blog-grid"[^>]*>)([\s\S]*?)(<\/div>)/;
        
        if (gridRegex.test(htmlContent)) {
            const newContent = htmlContent.replace(gridRegex, `$1${cardsHTML}$3`);
            
            // Also update "Loading" indicator to be hidden by default since we have content?
            // Actually, we should comment out or remove the loading indicator in the static version pattern,
            // or adding a class to hide it. 
            // Let's keep it simple: Just inject the cards. The frontend JS checks if grid is empty.
            // If grid is NOT empty, frontend JS logic might need adjustment.
            
            fs.writeFileSync(BLOG_HTML_PATH, newContent, 'utf-8');
            console.log('Successfully updated blog.html');
        } else {
            console.error('Could not find #blog-grid in blog.html');
        }

    } catch (error) {
        console.error('Error updating blog:', error);
        process.exit(1);
    }
}

updateBlogHTML();
