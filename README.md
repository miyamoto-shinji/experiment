# Experiment

ブラウザアプリを、フォルダ名ごとのURLで公開するリポジトリです。

| アプリ | 公開URL |
| --- | --- |
| もじのもり | https://miyamoto-shinji.github.io/experiment/01_hiragana/ |
| SAKANA | https://miyamoto-shinji.github.io/experiment/02_sakana/ |

トップページ https://miyamoto-shinji.github.io/experiment/ には、公開中のアプリ一覧を自動で作成します。

## 新しいアプリを追加する

1. リポジトリ直下に `03_XXXX/` のような「2桁以上の番号_名前」のフォルダを作成します。名前には文字・数字・`_`・`-` を使用できます。
2. そのフォルダに `package.json` と `package-lock.json` を置き、`npm run build` で `dist/index.html` と必要なファイルが生成されるようにします。
3. Viteの場合は `base: './'` を設定します。動的に読み込む画像なども `import.meta.env.BASE_URL` を使い、ドメイン直下の `/assets/` などに固定しないでください。
4. `main` へpushすると、自動で `https://miyamoto-shinji.github.io/experiment/03_XXXX/` に公開され、トップページの一覧にも追加されます。フォルダ名をワークフローに追加する必要はありません。

一覧のアプリ名には、生成された `dist/index.html` の `<title>` を使います。まだ `package.json` がない番号付きフォルダは公開対象になりません。対象のアプリでbuildスクリプト・lockfile・`dist/index.html` が不足する場合やビルドが失敗した場合は公開を止め、直前の公開内容を維持します。

## 公開の仕組み

[GitHub Actions](.github/workflows/deploy-pages.yml) が [共通スクリプト](scripts/build-pages.mjs) で番号付きのnpmプロジェクトを検出し、それぞれ `npm ci` と `npm run build` を実行します。

各 `dist/` を `_site/フォルダ名/` へまとめ、アプリ一覧と一緒にGitHub Pagesへ公開します。アップロードするのは `_site/` だけで、ソース、依存パッケージ、参考資料はコピーしません。各アプリの公開用素材はViteの `public/` またはソースからのimportでビルド結果へ含めてください。

GitHubの **Settings → Pages → Source** は **GitHub Actions** に設定しています。自動公開に加え、Actionsの **Deploy experiments to GitHub Pages → Run workflow** から手動公開もできます。

## ローカルで公開内容を確認する

Node.js 22.12以降を使用し、リポジトリ直下で実行します。

```sh
node --test scripts/build-pages.test.mjs
node scripts/build-pages.mjs --install
python3 -m http.server 4174 --directory _site
```

`http://localhost:4174/` が一覧、`http://localhost:4174/01_hiragana/` と `http://localhost:4174/02_sakana/` が各アプリです。依存パッケージを既にインストール済みの場合は `--install` を省略できます。

`_site/` と各 `dist/` は生成物なのでGitへ追加しません。
