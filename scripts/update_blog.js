const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { format } = require('date-fns');

const RSS_URL = 'https://note.com/rokkon_uranai/rss';
const BLOG_HTML_PATH = path.join(__dirname, '../blog.html');

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

// Category Logic (Mirrored from frontend for server-side generation)
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

function generateCardHTML(item) {
    const title = item.title || "無題";
    const link = item.link || "#";
    const pubDate = new Date(item.pubDate);
    const formattedDate = format(pubDate, 'yyyy年M月d日');

    // Extract thumbnail
    let thumbUrl = 'images/otya.png';
    if (item['media:thumbnail']) {
        thumbUrl = item['media:thumbnail'];
    }

    // Clean description
    const plainText = (item.description || '').replace(/<[^>]+>/g, '');
    const excerpt = plainText.length > 60 ? plainText.substring(0, 60) + '...' : plainText;

    const assignedCategory = assignCategory(title, plainText, item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : []);

    const catMap = {
        'love': '恋愛・結婚',
        'work': '仕事・金運',
        'fortune': '占い・運勢',
        'life': 'コラム・人生'
    };
    const displayCategory = catMap[assignedCategory] || 'コラム';

    // New Badge logic (calculated at build time, but really this becomes stale quickly if static. 
    // We can keep the badge if the build runs frequently, or let JS handle the badge hiding.)
    // For now, let's just render it if it's new at build time.
    const now = new Date();
    const diffHours = (now - pubDate) / (1000 * 60 * 60);
    const isNew = diffHours < 24;
    const newBadgeHtml = isNew ? '<span class="new-badge">NEW</span>' : '';

    return `
        <a href="${link}" class="article-card" target="_blank" rel="noopener noreferrer" data-category="${assignedCategory}" data-timestamp="${pubDate.getTime()}">
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

async function updateBlogHTML() {
    console.log('Fetching RSS...');
    const xml = await fetchRSS();
    const result = await parseRSS(xml);

    const items = result.rss.channel.item;
    console.log(`Found ${items.length} items.`);

    const cardsHtml = items.map(generateCardHTML).join('\n');

    console.log('Reading blog.html...');
    let html = fs.readFileSync(BLOG_HTML_PATH, 'utf8');

    // Regex to find the <div id="blog-grid" ...> ... </div> block
    // We need to be careful not to break the structure.
    // The current div has classes "blog-grid blog-grid-empty"
    // We should remove "blog-grid-empty" and inject content.

    // Replace content inside id="blog-grid"
    const gridRegex = /(<div id="blog-grid" class="[^"]*">)([\s\S]*?)(<\/div>)/;

    if (gridRegex.test(html)) {
        html = html.replace(gridRegex, (match, openTag, content, closeTag) => {
            const newOpenTag = openTag.replace('blog-grid-empty', '').trim();
            return `${newOpenTag}\n${cardsHtml}\n${closeTag}`;
        });

        // Also remove the Loading Indicator if it exists in the source
        const loadingRegex = /<div id="loading-indicator"[\s\S]*?<\/div>/;
        html = html.replace(loadingRegex, '');

        console.log('Writing updated blog.html...');
        fs.writeFileSync(BLOG_HTML_PATH, html);
        console.log('Done!');
    } else {
        console.error('Could not find #blog-grid in blog.html');
    }
}

updateBlogHTML();
