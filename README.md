# roguelike-nihon

外国産ローグライクを日本語化する複数作品の作業リポジトリです。作品名とフォルダ名は **`元の作品名-nihon`** に統一します。

| 作品 | 元作品 | 起動・開発 | ライセンス |
|---|---|---|---|
| [brogue-nihon](brogue-nihon/README.md) | Brogue: Community Edition 1.15.1 | `brogue-nihon/` で `.\start.ps1`、Webは `http://127.0.0.1:4174/`。SDL版は `bin/brogue-nihon.cmd` | [GNU AGPL v3](brogue-nihon/LICENSE.txt)、[Web版の依存物](brogue-nihon/web/licenses/THIRD-PARTY.txt) |
| [rogue-nihon](rogue-nihon/README.md) | 古典Rogue / RRP Rogue 5.4.4 | `rogue-nihon/` で `.\start.ps1`、ブラウザで `http://127.0.0.1:4173/` | [原典のBSD形式ライセンス](rogue-nihon/logic/LICENSE.TXT)、[依存物の通知](rogue-nihon/THIRD-PARTY-NOTICES.md) |

RogueはCのゲームロジックとRustの表示・入力・プラットフォームを分けたWeb版です。日本語の本文、品名、怪物、ヘルプ、設定、終了画面と、入力途中の保存・復元に対応します。実装資料と検証方法は作品内のREADMEを参照してください。[原典とWeb版の仕様対応](rogue-nihon/docs/ORIGINAL-SPEC-ja.md)も記録しています。

両作品のソフトウェア描画は、ルートの共通クレート [rust-common](rust-common/README.md) を直接利用します。原作のゲームロジック、作品固有のRust入力・表示・保存処理、記号と画像の対応設定は各作品が所有します。今後の作品も共通クレートへゲームルールを追加せず、同じAPIへフォント・画像・描画命令を渡します。

ローカル配信には、作品フォルダー外の開発・テスト用 [tools/server.mjs](tools/server.mjs) を使います。各作品の `start.ps1` が配信対象を指定します。直接起動する場合は `node tools/server.mjs --root rogue-nihon 4173`、Brogueは `node tools/server.mjs --root brogue-nihon 4174` です。本番公開は各作品の静的ファイルを配信し、このツールを含めません。

BrogueのWeb版はPCのキー入力・スマートフォンのタッチ操作と、オリジナル・ドット絵・イラストの表示に対応します。Cの原作がゲーム状態・乱数・保存を所有し、ブラウザーの入力・表示・保存ファイルの管理は作品固有Rustが担当します。英語・日本語表示に対応し、ゲームデータ、録画、診断出力は英語を保持します。[翻訳辞書](brogue-nihon/locales/README.md)、[Web実装](brogue-nihon/docs/WEB-ja.md)、[原作機能と受け入れ基準](brogue-nihon/docs/FEATURES-ja.md)を参照してください。

- Brogue upstream: https://github.com/tmewett/BrogueCE
- Brogue source release: https://github.com/tmewett/BrogueCE/releases/tag/v1.15.1

各作品の原著作権表示とライセンスを保持します。今後の作品も同じリポジトリ内に追加します。

文書の残し方と配布対象に応じた通知の整理は [文書とライセンスの管理方針](docs/DOCS-AND-LICENSES-ja.md)、エージェント向けの索引は [AGENTS.md](AGENTS.md) を参照してください。

## 作業場所とパス

リポジトリ名とルートフォルダー名は `roguelike-nihon` です。作品フォルダーの配置を保てば、チェックアウトの保存場所や名前は変更できます。スクリプトの既定参照先は、そのスクリプト自身の位置を基準に解決します。コマンドへ渡す相対パスは、各手順で指定された作業ディレクトリーが基準です。別チェックアウトへのコピーに使う Rogue・NetHack・DRL の配布ツールは、`-Destination`、`--destination` またはリポジトリ引数でコピー先を明示します。

Emscripten SDK は `EMSDK` で指定できます。作品固有の SDK 引数・環境変数がある場合はそちらが優先され、省略時はユーザーホームの `emsdk/` を使います。Python、Node、Cargo は PATH から呼び出します。外部SDKの場所をリポジトリからの固定相対パスで決めません。

NetHack の翻訳カタログを再生成する場合だけ、別途 JNetHack の Git チェックアウトが必要です。既定は `nethack/upstream/jnethack-alpha/`。別の場所は各ツールの `--jnethack`、`--jnethack-checkout`、`--checkout` で指定します。

## Gitで管理するもの

ソース、翻訳JSON、ビルド・テストスクリプト、説明・取得記録、ライセンスを管理します。両Web版の起動に必要な各作品の `build/` 内のゲームWasm、Rust UIのWasm、ブラウザーAPI接続用JavaScript、ビルドmanifestも含めます。専用の検証ビルドは含めません。

SDK、依存ライブラリの展開物、コンパイラキャッシュ、Brogueの実行ファイル・DLL、プレイヤー保存、テスト用バイナリ、詳細トレース、スクリーンショット、ローカル配達記録は管理対象外です。取得アーカイブとバックアップはローカルで保持します。
