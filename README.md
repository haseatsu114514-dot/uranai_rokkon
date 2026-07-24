# uranai_rokkon

「占い処 六根清浄」公式サイトのリポジトリ。

- 本番: https://uranai-rokkon.com/ （GitHub Pages / `main` ブランチ / `CNAME` でカスタムドメイン）
- 静的サイト（HTML + CSS + Vanilla JS）。ビルド不要
- ブランドコンセプト: **「出会う場所。選ぶ相手。動く時期。」** — 相性とタイミングを、次の一手に変える四柱推命

## 構成の概要

| 項目 | 内容 |
|------|------|
| ページ | index / beginner / about / pricing / testimonials / faq / blog / reserve / privacy |
| ブログ | Note (https://note.com/rokkon_uranai) のRSSを GitHub Actions が毎時取得し `blog/` と `blog.html` を自動生成（`scripts/update_blog.js`） |
| 予約 | `reserve.html` のフォーム → Google Apps Script（`google-apps-script/reservation.gs`）。カレンダー連携で空き日時のみ表示 |
| 予約状況表示 | トップページに GAS + Google Calendar 連携で昼・夕・夜の部を表示（`js/main.js`） |
| スタイル | `css/style.css`（茶の湯テーマ共通）+ `css/redesign.css`（2026リデザイン共通コンポーネント）+ ページ別CSS |

## ローカル確認

```bash
cd uranai_rokkon
python3 -m http.server 8000
# → http://localhost:8000
```

ブログ自動更新をローカルで試す場合:

```bash
npm install
node scripts/update_blog.js
```

## 運用・編集ガイド

詳細な運用ルール（お知らせの更新、料金・実績表記のポリシー、壊してはいけない機能）は `CLAUDE.md` を参照してください。

## 注意

- 料金（オンライン30分 5,000円 / 60分 10,000円 / 延長15分 2,000円）はサイト上で変更しない
- 実績の「No.1」表記は対象期間・母集団が確認できるまで掲載しない
- 口コミの元データは `docs/archive/` に保存（表示は厳選したもののみ）
- `docs/事業戦略/` と `docs/BASE商品登録用テキスト.md` には過去案（1,500件、旧料金、No.1表記など）が残っているため、公開サイトの現行仕様として流用しない
