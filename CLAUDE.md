# CLAUDE.md — 占い処 六根清浄 ウェブサイト

## サイト概要

「占い処 六根清浄」の公式ウェブサイト。
GitHub Pages でホスティングされた静的サイト（HTML + CSS + JS）。

- **本番URL**: https://uranai-rokkon.com/
- **リポジトリ**: https://github.com/haseatsu114514-dot/uranai_rokkon
- **ホスティング**: GitHub Pages（`main` ブランチ）
- **ドメイン**: `CNAME` ファイルで設定

---

## ブランドコンセプト（2026年7月リデザイン）

中心メッセージ: **「出会う場所。選ぶ相手。動く時期。」**
（相性とタイミングを、次の一手に変える四柱推命）

サイト全体で伝える3つの用途:

1. **出会う場所** — 五行・命式によって縁が生まれやすい場所・合う出会い方が違う（「生息地」はSNS企画名としては使用可。サイト本文では「縁が生まれやすい場所」等の上品な表現を使う）
2. **選ぶ相手** — 相手A/B/C・転職先A/B などの選択肢を同じ基準で比較する
3. **動く時期** — 動きやすい時期／準備・観察に回す時期を整理する（未来の保証はしない）

30分5,000円は「事前の命式分析 ＋ 30分の整理 ＋ 次の一手の確認」のセットとして見せる。

### コピー・表現ポリシー

- **使わない**: 必ず／絶対／人生が変わる／本音を丸裸／高精度／的中率／占いの帝王／今だけ／限定／一番人気（データがない場合）／科学・統計学として証明済み という趣旨の表現
- **使う**: 整理する／比較する／傾向／可能性／判断材料／補助線／選択／動く時期／待つ時期
- 「相手の本音を読む」ではなく「相手の性質・反応しやすいパターン・距離感」と表現する
- 歴史の説明は唐代・李虚中〜宋代・徐子平（子平術）の範囲で、「諸説あり」を明記。「中国4000年」「統計学」等の権威付けはしない
- **実績表記**: 占い歴7年・相談500件以上（占い館・チャット占い時代を含む注記つき）は掲載可。「売上No.1」「口コミ数No.1」は対象期間・母集団・カテゴリーが確認できるまで掲載しない（about.html 内のTODOコメント参照）
- **料金は変更しない**: オンライン30分 5,000円／60分 10,000円（対面は栄・60分のみ）／延長15分 2,000円。値下げ・初回割引・無料鑑定・モニター価格は導入しない
- 休止中のレポート商品・BASE商品（pricing.html 内 `display:none` ブロック）は勝手に再開しない
- 架空の鑑定例には必ず「説明用の例」と明記する

### 口コミの扱い

- 表示は厳選したケース形式（testimonials.html）。**元データ全件は `docs/archive/testimonials_20260724_original.html` に保存済み**（削除しない）
- 口コミ投稿への500円OFF特典は信頼性への配慮で掲載を取りやめた（復活させる場合は「特典つきで集めた感想」であることを明記する）

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
│   ├── style.css       # 全ページ共通スタイル（茶の湯テーマ）
│   ├── redesign.css    # ★ 2026リデザイン共通コンポーネント（rk- プレフィックス）
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
│   └── archive/        # ★ 旧ページの保存（旧口コミ全件など）
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

- **予約導線はフォーム一本**（LINE予約は2026年6月に廃止。公式LINEは友だち0のため導線から完全に外した）
- `reserve.html` が唯一の予約ページ。全ページのCTA（ヘッダー・ヒーロー・スマホ追従ボタンなど）はここに向ける
- フォーム送信先は GAS（`google-apps-script/reservation.gs`）。スプレッドシート記録・カレンダー仮予約・LINE/メール通知（リピーターは🔁表示）・お客様への自動返信・未対応リマインドを行う
- 承認はシートの「対応状況」プルダウン（確定/確定2/別日提案/お断り）。オンラインは確定案内を自動送信、対面はGmail下書きを自動作成
- カレンダーの【仮】イベントは `findFreeSlotStart` で部内の空き時刻に自動配置（30分バッファ）。同じ部に複数予約が入っても時間が重ならないので、固定Meet URLでもバッティングしない
- オンラインのMeet案内は `buildMeetGuide`（URL＋ステップ式の入り方）を確定案内・前日リマインドの両メールで共用
- 自動運用: 毎日17時に翌日の確定済み予約へ前日リマインドメール、毎月1日に先月の件数まとめをLINEへ送信（時間トリガー、`setup()` が登録）
- 予約完了画面に「希望日時をカレンダーに追加」ボタン（Google カレンダーの TEMPLATE リンク、`js/reserve.js` の `buildGcalUrl`）
- 希望日時の選択肢は GAS の空き状況API（`?action=availability`）でカレンダーから自動計算され、**当日から10日先までの空きがある日時だけが表示される**（30分刻み・前後30分バッファ）。当日は開始3時間前までの要確認リクエスト扱いで、LINE・管理者メールへ至急通知する。カレンダー予定は対象期間を1回でまとめて取得し、結果を90秒キャッシュする。取得失敗時は安全のため翌日から10日分を全日時表示にフォールバックするが、POST時に再検証する
- ウェブアプリ URL は `js/reserve.js` の `RESERVE_ENDPOINT` に設定する（空のままだとフォームは「準備中」表示になりメール予約へ誘導される）
- セットアップ手順・トラブル対処は `docs/reservation-form-setup.md` を参照
- 全ページのヘッダー「ご予約」ボタンとスマホ追従ボタンは `reserve.html` に向いている

---

## お知らせの更新

`index.html` 内の `notices-section` を直接編集する。

```html
<div class="notice-item active">
    <span class="notice-text">通常通り鑑定のご予約を受付中です。</span>
</div>
```

日付は出さない運用（更新が止まると古さが目立つため）。期限のある告知だけ
`<span class="notice-date">2026.03.07</span>` を文頭に足せば日付付きで表示できる。

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
| ご予約 | reserve.html |

SHOP・レポート商品は休止中のため、ヘッダーやページ導線には出さない。

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
