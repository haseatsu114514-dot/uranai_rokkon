const fs = require('fs');
const path = require('path');
const glob = require('glob');

const targetDir = path.join(__dirname, '../');
const htmlFiles = glob.sync('*.html', { cwd: targetDir, absolute: true });

const shopLinkHtml = `
            <a href="https://uranairokkon.base.shop" class="page-link-card animate-on-scroll animate-delay-4" target="_blank">
                <span class="page-link-title">SHOP</span>
                <span class="page-link-desc">物販・講座</span>
            </a>`;

htmlFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // Check if SHOP link already exists
    if (content.includes('uranairokkon.base.shop') && content.includes('class="page-link-title">SHOP</span>')) {
        console.log(`Skipping ${path.basename(file)}: SHOP link already exists.`);
        return;
    }

    // Find the end of page-links-container OR page-links-inner
    const containerRegex = /(<div class=\"(?:page-links-container|page-links-inner)\">[\s\S]*?)(\s*<\/div>)/;

    if (containerRegex.test(content)) {
        // Append the link before the closing div
        const newContent = content.replace(containerRegex, `$1${shopLinkHtml}\n$2`);
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated ${path.basename(file)}`);
    } else {
        console.log(`Skipping ${path.basename(file)}: Container not found.`);
    }
});
