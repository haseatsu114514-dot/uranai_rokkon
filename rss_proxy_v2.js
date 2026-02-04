function doGet(e) {
    // NoteのAPI endpoint (ユーザー名: rokkon_uranai)
    // page=1で最新記事を取得
    var apiUrl = "https://note.com/api/v2/creators/rokkon_uranai/contents?kind=note&page=1";

    try {
        var response = UrlFetchApp.fetch(apiUrl);
        var json = JSON.parse(response.getContentText());

        var notes = json.data.contents;
        var jsonItems = [];

        for (var i = 0; i < notes.length; i++) {
            var note = notes[i];

            // APIのレスポンスから必要な情報を抽出
            // eyecatchがサムネイル画像
            var thumbnail = note.eyecatch || "";

            // bodyは本文。長いので先頭100文字だけ取得して要約とする
            var description = note.body ? note.body.substring(0, 100) + "..." : "";

            jsonItems.push({
                title: note.name,
                link: note.noteUrl,
                pubDate: note.publishAt,
                thumbnail: thumbnail,
                description: description,
                likeCount: note.likeCount, // スキ数
                category: "コラム" // APIにはカテゴリがないため固定
            });
        }

        var result = {
            status: "ok",
            items: jsonItems
        };

        return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        var errorResult = {
            status: "error",
            message: error.toString()
        };
        return ContentService.createTextOutput(JSON.stringify(errorResult))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
