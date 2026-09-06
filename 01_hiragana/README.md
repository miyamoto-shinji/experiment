# もじのもり

4〜5歳向けの、ひらがな46文字で遊ぶブラウザゲーム。Three.js / TypeScript / Viteで構築した静的サイトです。

## 開発

Node.js 22.22.3で確認しています。依存関係のバージョンは `package-lock.json` に固定されています。

```sh
npm ci
npm run dev
```

## ビルド・公開用ZIP

```sh
npm run build
npm run package
```

- `dist/`：ビルド済みの公開ファイル
- `release/moji-no-mori/`：アップロード用フォルダ
- `release/moji-no-mori-1.0.0.zip`：ゲームと公開手順書
- `release/README-ja.txt`：日本語の公開手順

ZIPの作成にはOSの `zip` コマンドを使います。macOSで検証済みです。
レンタルサーバーには公開ファイルだけを置きます。公開方法は [公開手順書.md](./公開手順書.md) を参照してください。開発用サーバーを外部公開する必要はありません。

## GitHub Pages

公開URL：[もじのもり](https://miyamoto-shinji.github.io/experiment/01_hiragana/)

リポジトリ共通のGitHub Actionsが、`main` の更新時に各アプリをビルドしてフォルダ別に公開します。このアプリは `npm ci` → `npm run build` で作成した `dist/` の中身が `/experiment/01_hiragana/` に配置されます。ZIPの作成や手動アップロードは不要です。

`vite.config.ts` の `base: './'` を維持することで、JavaScript・フォント・画像をこのURL配下から読み込みます。

## テスト

```sh
npm test
npx playwright install chromium webkit
npm run build
npm run test:e2e
```

ブラウザテストはビルド済みの `dist` を、履歴ルーティングのフォールバックがない静的サーバーで配信します。ドメイン直下相当と `/nested/game/` の両方を検証します。
音声は自動テスト内でモックしています。実際の端末音声・日本語の発音は、iOS / Android実機で別途確認してください。

## 設計

- `src/curriculum.ts`：教材。Course → LetterGroup → Letter。表示文字と読み上げ文を分離し、言語・同音文字・必須お手本の情報を持ちます。
- `src/game.ts`：画面に依存しない5問の出題・回答・進行。1問の正解は1度だけ受け付け、完了通知も1度だけ返します。
- `src/main.ts`：ホーム、行選び、練習、クイズ、ごほうび、図鑑、保護者設定。
- `src/forest.ts`：Three.jsで描画する森。フォントと描画コードを別途ロードし、UIから独立させています。影は画面更新時だけ計算し、通常描画は最大約30fps、解像度は端末ピクセル比1.5まで。画面外と非表示タブは描画を休止します。描画時間が長い端末では、3Dの常時アニメーションを止め、画面更新とごほうびのポーズだけを描画します。
- `src/speech.ts`：日本語音声の検出、発話キャンセル、開始失敗の検出。利用できない場合はお手本で遊べる表示へ切り替えます。
- `src/storage.ts`：バージョン付きのブラウザ内保存。読み込み不良は初期化し、保存拒否時はメモリ内で継続します。

画面切り替えにURLルーターは使わず、Viteの相対ベースパスで出力します。3Dや音声がなくても、文字ボタンとお手本は動作します。
`localStorage` のキーは `moji-no-mori:v1`。同じオリジン内の設置場所では記録を共有します。外部の記録APIや分析SDKは使いません。

## かたかな・アルファベットを追加するとき

新しい `Course` を追加し、安定した文字ID、表示文字、読み上げ名・出題文、言語、3文字以上の行グループを定義します。
教材を選ぶUIとコースごとの `Voice` を接続すれば、出題・採点・ごほうび・保存の構造を再利用できます。保存はコースIDで分離済みです。
英字は「文字の名前」と「フォニックス」のどちらを教えるかを教材設計時に決め、その発話を明示してください。初版にはこれらの未実装メニューは表示しません。

## ライセンス・素材

- Three.js：MIT、`public/licenses/Three-MIT.txt`
- Klee One：SIL OFL 1.1、`public/licenses/Klee-OFL.txt`
- 同梱フォントは https://github.com/fontworks-fonts/Klee の `fonts/ttf/KleeOne-SemiBold.ttf` をもとに、FontToolsで必要な日本語文字・ひらがな・かたかな・英数字をWOFF2にサブセット化しています。日本語UIへ新しい漢字を追加する場合は、必要に応じてフォントも再作成してください。含まれない文字は端末フォントにフォールバックします。
- 森・どうぶつ・花はプログラムによる形状、UIのアイコンはこのゲーム用のSVGです。
