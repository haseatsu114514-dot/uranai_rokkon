const axios = require('axios');
const xml2js = require('xml2js');

const RSS_URL = 'https://note.com/rokkon_uranai/rss';

async function checkRSS() {
    try {
        console.log(`Fetching RSS from ${RSS_URL}...`);
        const response = await axios.get(RSS_URL);
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(response.data);

        const items = result.rss.channel.item;
        console.log(`Found ${items.length} items.`);

        items.forEach((item, index) => {
            console.log(`[${index}] ${item.title}`);
            console.log(`     Link: ${item.link}`);
            console.log(`     Date: ${item.pubDate}`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

checkRSS();
