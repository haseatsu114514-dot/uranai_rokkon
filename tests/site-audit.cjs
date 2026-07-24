const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { globSync } = require('glob');

const root = process.cwd();
const htmlFiles = globSync(['*.html', 'blog/*.html']).sort();
const issues = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const $ = cheerio.load(html);
  const ids = new Map();

  $('[id]').each((_, element) => {
    const id = $(element).attr('id');
    ids.set(id, (ids.get(id) || 0) + 1);
  });
  for (const [id, count] of ids) {
    if (count > 1) issues.push(`${file}: duplicate id #${id}`);
  }

  if ($('h1').length !== 1) issues.push(`${file}: h1 count is ${$('h1').length}`);
  if (!$('title').text().trim()) issues.push(`${file}: title is missing`);
  if (!$('meta[name="description"]').attr('content')) issues.push(`${file}: meta description is missing`);
  if ($('.menu-toggle').length !== 1 || !$('.menu-toggle').is('button')) {
    issues.push(`${file}: mobile menu must be one button`);
  }
  if ($('.menu-toggle').attr('aria-expanded') !== 'false') {
    issues.push(`${file}: mobile menu aria-expanded is missing`);
  }

  $('[href],[src]').each((_, element) => {
    const attr = $(element).attr('href') != null ? 'href' : 'src';
    const raw = $(element).attr(attr);
    if (!raw || /^(?:#|data:|mailto:|tel:|javascript:|https?:\/\/)/.test(raw)) return;
    const clean = decodeURIComponent(raw.split(/[?#]/)[0]);
    const target = path.resolve(path.dirname(path.join(root, file)), clean);
    if (!fs.existsSync(target)) issues.push(`${file}: missing ${attr} ${raw}`);
  });
}

assert.deepEqual(issues, [], issues.join('\n'));

const primaryFiles = [
  'index.html', 'beginner.html', 'about.html', 'pricing.html',
  'testimonials.html', 'faq.html', 'blog.html', 'reserve.html', 'privacy.html'
];
for (const file of primaryFiles) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  assert.equal($('.header .contact-btn').attr('href'), 'reserve.html', `${file}: header CTA`);
}

const about = fs.readFileSync('about.html', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
assert.match(about, /500件以上/);
assert.match(index, /500件以上/);
assert.doesNotMatch(about, /1,500件以上/);
assert.doesNotMatch(index, /1,500件以上/);

const reserve = fs.readFileSync('reserve.html', 'utf8');
assert.match(reserve, /オンライン30分（5,000円）/);
assert.match(reserve, /オンライン60分（10,000円）/);
assert.match(reserve, /対面・栄 60分（10,000円）/);
assert.match(reserve, /id="privacyConsent"/);
assert.match(reserve, /開始3時間前まで/);
assert.match(reserve, /id="sameDayNotice"/);
assert.ok(
  reserve.indexOf('id="message"') < reserve.indexOf('id="date1"'),
  'reserve.html: schedule fields should appear after the questions'
);

for (const file of globSync('blog/*.html')) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  assert.equal($('.header .contact-btn').attr('href'), '../reserve.html', `${file}: article header CTA`);
}

const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
for (const page of ['beginner.html', 'about.html', 'pricing.html', 'reserve.html', 'privacy.html']) {
  assert.match(sitemap, new RegExp(`https://uranai-rokkon\\.com/${page.replace('.', '\\.')}`));
}

const reserveJs = fs.readFileSync('js/reserve.js', 'utf8');
assert.match(reserveJs, /const RESERVE_ENDPOINT = 'https:\/\/script\.google\.com\/macros\/s\//);
assert.doesNotMatch(reserveJs, /availability&_t=/);

console.log(`site audit: ok (${htmlFiles.length} HTML files)`);
