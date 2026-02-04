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

            // カテゴリ判定ロジック
            var category = "コラム"; // デフォルト
            var tags = [];
            if (note.hashtags && note.hashtags.length > 0) {
                tags = note.hashtags.map(function (h) { return h.hashtag.name; });
            }

            // 1. タグによる判定
            var isFortune = tags.some(function (t) { return ["占い", "四柱推命", "鑑定", "運勢"].indexOf(t.replace("#", "")) !== -1; });
            var isColumn = tags.some(function (t) { return ["コラム", "エッセイ", "思考", "人生"].indexOf(t.replace("#", "")) !== -1; });
            var isNews = tags.some(function (t) { return ["お知らせ", "告知", "news"].indexOf(t.replace("#", "")) !== -1; });

            if (isFortune) {
                category = "占い";
            } else if (isNews) {
                category = "お知らせ";
            } else if (isColumn) {
                category = "コラム";
            } else {
                // 2. タイトルによる判定
                if (note.name.indexOf("占い") !== -1 || note.name.indexOf("鑑定") !== -1) {
                    category = "占い";
                } else if (note.name.indexOf("お知らせ") !== -1) {
                    category = "お知らせ";
                }
            }

            jsonItems.push({
                title: note.name,
                link: note.noteUrl,
                pubDate: note.publishAt,
                thumbnail: thumbnail,
                description: description,
                likeCount: note.likeCount, // スキ数
                category: category,
                tags: tags
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
