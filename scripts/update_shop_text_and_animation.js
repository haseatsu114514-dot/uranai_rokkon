const fs = require('fs');
const path = require('path');
const glob = require('glob');

const targetDir = path.join(__dirname, '../');
const htmlFiles = glob.sync('*.html', { cwd: targetDir, absolute: true });

htmlFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let updated = false;

    // 1. Text Update: 物販・講座 -> 物販・レポート
    if (content.includes('物販・講座')) {
        content = content.replace(/物販・講座/g, '物販・レポート');
        updated = true;
    }

    // 2. Animation Re-sequencing
    // Find the container
    const containerRegex = /(<div class=\"(?:page-links-container|page-links-inner)\">)([\s\S]*?)(\s*<\/div>)/;
    const match = content.match(containerRegex);

    if (match) {
        const header = match[1];
        let innerHtml = match[2];
        const footer = match[3];

        // Split into anchor tags approximately
        // This regex captures the whole <a>...</a> block
        // We use a global match to find all <a> tags
        const linkRegex = /<a href=[\s\S]*?<\/a>/g;
        const links = innerHtml.match(linkRegex);

        if (links && links.length > 0) {
            let newInnerHtml = innerHtml;

            links.forEach((link, index) => {
                let newLink = link;

                // Remove existing animate-delay-* classes
                newLink = newLink.replace(/\s*animate-delay-\d+/g, '');

                // Add new delay class (start from 0, so index 0 has no delay class, index 1 has delay-1, etc.)
                // Or maybe start from delay-0? animate-delay-0 isn't usually defined. 
                // animate-on-scroll usually has base transition.
                // index 0: just animate-on-scroll
                // index 1: animate-on-scroll animate-delay-1

                if (index > 0) {
                    // Check if it already has animate-on-scroll
                    if (newLink.includes('animate-on-scroll')) {
                        // Insert animate-delay-X after animate-on-scroll
                        newLink = newLink.replace('animate-on-scroll', `animate-on-scroll animate-delay-${index}`);
                    } else {
                        // Add class attribute or append to existing
                        if (newLink.includes('class="')) {
                            newLink = newLink.replace('class="', `class="animate-on-scroll animate-delay-${index} `);
                        }
                    }
                } else {
                    // Index 0: Ensure NO delay class, but has animate-on-scroll
                    if (!newLink.includes('animate-on-scroll')) {
                        if (newLink.includes('class="')) {
                            newLink = newLink.replace('class="', 'class="animate-on-scroll ');
                        }
                    }
                }

                // Replace the specific link in the newInnerHtml string
                // Note: string.replace only replaces the first occurrence, which is tricky if links are identical.
                // But full string replacement of the tag is safer if we do it sequentially via building a new string?
                // Building a new string loses the whitespace formatting between tags.
                // Better: Iterate and replace in the original innerHtml but keep track of position?
                // Simple approach: Reconstruct the innerHtml from the new links, preserving approximate whitespace if possible?
                // Actually, just map the links array to new links, and join them with newlines/indentation?
                // Let's try to be precise.
            });

            // Re-build innerHtml from links
            // This might lose surrounding divs if any (there shouldn't be inside the container based on structure)
            // The structure is <a>...</a> \n <a>...</a>

            const newLinks = links.map((link, index) => {
                let newLink = link;
                // Clean old delays
                newLink = newLink.replace(/\s*animate-delay-\d+/g, '');

                // Add new delays
                if (index > 0) {
                    // Find insertion point for class
                    // Assuming class exists
                    newLink = newLink.replace(/class="([^"]*)"/, (match, cls) => {
                        let classes = cls.split(/\s+/).filter(c => c && c !== 'animate-delay');
                        // Ensure animate-on-scroll is present
                        if (!classes.includes('animate-on-scroll')) classes.push('animate-on-scroll');
                        classes.push(`animate-delay-${index}`);
                        return `class="${classes.join(' ')}"`;
                    });
                } else {
                    // Index 0
                    newLink = newLink.replace(/class="([^"]*)"/, (match, cls) => {
                        let classes = cls.split(/\s+/).filter(c => c && !c.startsWith('animate-delay-'));
                        if (!classes.includes('animate-on-scroll')) classes.push('animate-on-scroll');
                        return `class="${classes.join(' ')}"`;
                    });
                }
                return newLink;
            });

            // Wrap with essentially the same whitespace? 
            // We can just join with \n            
            newInnerHtml = '\n            ' + newLinks.join('\n            ') + '\n        ';

            const newBlock = header + newInnerHtml + footer;
            content = content.replace(match[0], newBlock);
            updated = true;
        }
    }

    if (updated) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${path.basename(file)}`);
    } else {
        console.log(`Skipping ${path.basename(file)}: No changes needed.`);
    }
});
