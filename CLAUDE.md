# CLAUDE.md — 占い処 六根清浄 ウェブサイト

## サイト概要

「占い処 六根清浄」の公式ウェブサイト。
GitHub Pages でホスティングされた静的サイト（HTML + CSS + JS）。

- **本番URL**: https://uranai-rokkon.com/
- **リポジトリ**: https://github.com/haseatsu114514-dot/uranai_rokkon
- **ホスティング**: GitHub Pages（`main` ブランチ）
- **ドメイン**: `CNAME` ファイルで設定

---

## ファイル構成

```
uranai_rokkon/
├── index.html          # トップページ（お知らせ・予約状況・フロー）
├── about.html          # 占い師紹介ページ
├── beginner.html       # はじめての方向けページ
├── pricing.html        # 料金案内ページ
├── testimonials.html   # 口コミページ
├── faq.html            # Q&A ページ
├── blog.html           # ブログ一覧ページ（自動更新される）
├── reserve.html        # ご予約ページ（LINE / フォームの2導線）
├── blog/               # 個別記事ページ（自動生成される）
│   ├── n633fe53dad05.html
│   ├── n17d97d65d2bc.html
│   └── ...
├── css/
│   ├── style.css       # 全ページ共通スタイル
│   ├── animations.css  # アニメーション定義
│   ├── blog.css        # ブログページ用スタイル
│   ├── about.css       # 占い師紹介ページ用
│   ├── beginner.css    # はじめてページ用
│   ├── pricing.css     # 料金案内ページ用
│   ├── testimonials.css# 口コミページ用
│   ├── faq.css         # Q&Aページ用
│   └── reserve.css     # ご予約ページ用
├── js/
│   ├── main.js         # 全ページ共通JS（ヘッダー・スクロール・予約状況）
│   ├── blog-feed.js    # ブログ一覧のフィルタリング・ページネーション
│   ├── calendar.js     # カレンダー・予約枠表示（pricing.htmlで使用）
│   ├── testimonials.js # 口コミスライダー
│   ├── faq.js          # FAQ アコーディオン
│   └── reserve.js      # 予約フォーム送信（★ RESERVE_ENDPOINT をここで設定）
├── scripts/
│   ├── update_blog.js  # ★ ブログ自動更新スクリプト（GitHub Actionsで実行）
│   ├── debug_rss.js    # RSS デバッグ用
│   ├── add_shop_link.js # SHOP リンク追加スクリプト
│   └── update_shop_text_and_animation.js
├── images/             # 画像ファイル
├── docs/               # ドキュメント・事業資料
├── .github/workflows/
│   └── update-blog.yml # ★ ブログ自動更新のワークフロー
├── google-apps-script/
│   └── reservation.gs  # ★ 予約フォーム受付GAS（通知・自動返信・リマインド）
├── rss_proxy.js        # GAS用 RSSプロキシ（参考コード）
├── rss_proxy_v2.js     # GAS用 API版プロキシ（参考コード）
├── package.json        # Node.js 依存関係
├── sitemap.xml         # サイトマップ（自動更新される）
├── robots.txt          # ロボット設定
└── CNAME               # カスタムドメイン設定
```

---

## ブログ更新の仕組み

### 概要

Note (https://note.com/rokkon_uranai) に記事を投稿すると、GitHub Actions が1時間ごとに自動で記事を取得し、サイトに反映する。

### フロー

```
Note に記事投稿
    ↓
GitHub Actions (毎時, cron: '0 * * * *')
    ↓
scripts/update_blog.js 実行
    ↓
1. Note の RSS フィードを取得
2. 各記事の個別ページをスクレイピング
3. blog/ ディレクトリに個別 HTML を生成
4. blog.html のカード一覧を更新
5. sitemap.xml を更新
    ↓
変更があれば自動 commit & push
    ↓
GitHub Pages が自動デプロイ
```

### 手動実行

GitHub の Actions タブから `Update Blog Content` を手動トリガーできる（`workflow_dispatch`）。

### ローカルで実行する場合

```bash
cd uranai_rokkon
npm install
node scripts/update_blog.js
```

---

## 予約状況表示

- Google Apps Script (GAS) と Google Calendar を連携
- `GAS_WEBAPP_URL` で GAS Web アプリの URL を設定（`js/main.js` で定義）
- トップページ (`index.html`) に予約状況（昼・夕・夜の部）を動的に表示
- 21:30以降は自動的に翌日の予約状況を表示

---

## 予約フォーム

- `reserve.html` に LINE 予約とフォーム予約の2導線がある
- フォーム送信先は GAS（`google-apps-script/reservation.gs`）。スプレッドシート記録・カレンダー仮予約・LINE/メール通知・お客様への自動返信・未対応リマインドを行う
- ウェブアプリ URL は `js/reserve.js` の `RESERVE_ENDPOINT` に設定する（空のままだとフォームは「準備中」表示になり LINE へ誘導される）
- セットアップ手順・トラブル対処は `docs/reservation-form-setup.md` を参照
- 全ページのヘッダー「ご予約」ボタンとスマホ追従ボタンは `reserve.html` に向いている

---

## お知らせの更新

`index.html` 内の `notices-section` を直接編集する。

```html
<div class="notice-item active">
    <span class="notice-date">2026.03.07</span>
    <span class="notice-text">通常通り鑑定のご予約を受付中です。</span>
</div>
```

複数のお知らせを追加する場合は `notice-item` を追加する（最初の1つだけ `active` クラスを付ける）。

---

## 各ページ共通のナビゲーション

全ページに共通のヘッダーナビ:

| リンク | ページ |
|--------|--------|
| TOP | index.html |
| はじめて | beginner.html |
| 占い師 | about.html |
| 料金案内 | pricing.html |
| 口コミ | testimonials.html |
| Q&A | faq.html |
| ブログ | blog.html |
| SHOP | https://uranairokkon.base.shop |

ヘッダーの最後に SHOP ボタン（BASEへのリンク）がある。

---

## よくあるトラブルと対処

### ブログが更新されない

1. GitHub Actions タブで `Update Blog Content` の実行ログを確認
2. Note の RSS (https://note.com/rokkon_uranai/rss) が正常に応答するか確認
3. Note の HTML 構造が変わった可能性 → `update_blog.js` の `fetchArticleContent()` 内のセレクタを更新
4. 手動でワークフローを実行してみる

### 予約状況が表示されない

1. GAS Web アプリの URL が有効か確認
2. GAS のデプロイが最新版か確認
3. ブラウザのコンソールでエラーを確認

### HTMLが崩れる

- `update_blog.js` が `blog.html` を更新する際、`#blog-grid` の中身のみを置き換える方式を採用
- Cheerio による全HTML再出力は行わない（エスケープ問題を回避）

---

## デプロイ

`main` ブランチに push するだけで GitHub Pages が自動デプロイする。

```bash
git add .
git commit -m "Update content"
git push origin main
```

---

## 技術スタック

- **フロントエンド**: HTML5 + CSS3 + Vanilla JS
- **フォント**: Shippori Mincho (Google Fonts)
- **ホスティング**: GitHub Pages
- **ブログソース**: Note (RSS 経由)
- **予約管理**: Google Apps Script + Google Calendar
- **ビルドツール**: Node.js (axios, cheerio, xml2js, date-fns)
- **CI/CD**: GitHub Actions
- **アナリティクス**: Google Analytics (G-T47H5DSFTR)
