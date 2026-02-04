function doGet(e) {
    // 1. NoteのRSSのURL
    var rssUrl = "https://note.com/rokkon_uranai/rss";

    try {
        // 2. RSSデータを取得
        var response = UrlFetchApp.fetch(rssUrl);
        var xml = response.getContentText();
        var document = XmlService.parse(xml);
        var root = document.getRootElement();

        // 3. 必要な情報を抽出
        var channel = root.getChild("channel");
        var items = channel.getChildren("item");
        var jsonItems = [];

        // 名前空間の定義 (media:thumbnailなどを取得するため)
        var mediaNs = XmlService.getNamespace("media", "http://search.yahoo.com/mrss/");
        var noteNs = XmlService.getNamespace("note", "https://note.com/ns/note");

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var title = item.getChildText("title");
            var link = item.getChildText("link");
            var pubDate = item.getChildText("pubDate");
            var description = item.getChildText("description");

            // サムネイルの取得 (media:thumbnail)
            var thumbnail = "";
            var mediaThumbnail = item.getChild("thumbnail", mediaNs);
            if (mediaThumbnail) {
                thumbnail = mediaThumbnail.getText();
            }

            // カテゴリの取得 (今回はNoteなのでない場合が多いが一応)
            var category = "コラム";
            var categories = item.getChildren("category");
            if (categories.length > 0) {
                category = categories[0].getText();
            }

            jsonItems.push({
                title: title,
                link: link,
                pubDate: pubDate,
                thumbnail: thumbnail, // これが欲しかった正確な画像URL
                description: description, // 本文要約用
                category: category
            });
        }

        // 4. JSONとして返す
        var result = {
            status: "ok",
            items: jsonItems
        };

        return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        // エラー時の処理
        var errorResult = {
            status: "error",
            message: error.toString()
        };
        return ContentService.createTextOutput(JSON.stringify(errorResult))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
