# brogue-nihon テキストカタログ

作品のタイトルは `brogue-nihon` です。リポジトリ内の日本語化作品は
`元の作品名-nihon` の形式で命名します。このタイトルの英字表記は意図した表示です。

Brogue CE 1.15.1 の原文一覧と、SDL版の日本語表示辞書です。ゲーム内の名称、
文章の組み立て、保存値、リプレイ、診断ログは英語を維持し、表示するときに変換します。

## 起動・切り替え

ビルド済みWindows版は `bin/brogue-nihon.cmd` で日本語起動できます。
従来の `bin/brogue-ja.cmd` からも同じ作品を起動できます。
直接起動する場合は `brogue-nihon.exe --language ja`、英語は `--language en` です。
メニューとゲーム中の **F2** で切り替えられます。切り替えはターンを進めず、
リプレイへ記録しません。履歴に保存した英語原文を、その時点の選択言語で表示します。
起動時の既定値は英語です。`BROGUE_LANGUAGE=ja` でも起動時の言語を指定できます。
設定は保存ファイルに追加しません。

日本語表示は現在WindowsのSDL版で検証しています。日本語フォントはOS上の
Meiryo/MS Gothicを使用し、配布物には含めません。別のCJK対応TTF/OTFを使う場合は
`BROGUE_FONT` に絶対パスを指定します。Linux/macOSにはフォントの候補パスがありますが、
SDL版の動作検証はWindowsのみです。端末版の日本語描画は未対応です。
Web版は同じ辞書を使い、同梱フォントをRustで描画します。起動と検証範囲は
[Web実装](../docs/WEB-ja.md)と[検証入口](../tests/README.md)を参照してください。

## 日本語辞書

`ja/ui.json`、`ja/messages.json`、`ja/content.json`、`ja/help.json`、`ja/errors.json`
に全表示用原文の翻訳を収録しています。`ja/display.json` は表示上の定型文、
`ja/composed.json` は戦闘文・装備名などの合成文を補います。`{0}` から `{15}` は
名前・数値などの差し込み値で、翻訳側では順序を変えられます。内部の原文は書き換えません。

```json
{"source": "you found {0} pieces of gold.", "text": "金貨を{0}枚見つけた。"}
```

メニュー、操作説明、確認文、履歴、状態、アイテム・モンスター・地形の名称と説明、
画面上のエラーを対象にします。通常版・高速版・弾丸版の原文を含みます。
ファイル名、操作キー、保存形式の識別子、文法用の接尾辞とタイトル画像のデータは
`preserve` で理由を記録します。ユーザーが入力した銘や外部の注釈は固定翻訳の対象外です。

Cの書式文字列だけでなく実引数も解析し、数値、名前、色、文法上の選択肢を区別します。
複数形、代名詞の展開、能力一覧の区切り、ランダムな巻物名も表示時に処理します。
未知の文字列の英語フォールバックは残しますが、対象原文の未翻訳はビルド時にエラーになります。
色は一致する翻訳語句・ホットキーへ引き継ぎます。

辞書を編集したら `python tools/compile-locales.py` を実行して再ビルドします。
Windows用ビルドスクリプトとMakefileは、この生成処理を含みます。
`en/*.json` は原文の調査一覧で、ゲームが実行時に読む設定ファイルではありません。

## ファイル

| ファイル | 内容 | 翻訳対象 |
| --- | --- | --- |
| `en/ui.json` | メニュー、画面ラベル、確認、入力プロンプト、リプレイ操作 | はい |
| `en/messages.json` | ゲーム内メッセージ、戦闘、ゲーム終了時の文章 | はい |
| `en/content.json` | 名前、説明、地形、状態、未鑑定の外見、文法用の断片 | はい |
| `en/help.json` | ゲーム内・リプレイの操作説明 | はい |
| `en/errors.json` | ユーザーが画面などで読むエラー | はい |
| `en/cli.json` | 開発・解析用コマンドラインのヘルプ、引数エラー、進捗、バージョン表示 | 英語 |
| `en/diagnostics.json` | 診断出力、乱数監査、解析用の説明、生成のデバッグ表示 | **英語固定** |
| `en/internal.json` | 保存値、ファイル名、入出力書式、端末制御、区切り、ビルド用文字列 | いいえ |
| `manifest.json` | 抽出範囲、件数、参照元のハッシュ、カタログ一覧 | いいえ |

分類はソースの呼び出し先・関数・データテーブルを基準にしています。同じ文字列が
画面とファイル出力などで兼用される場合があります。ゲームへの組み込み時には、
各項目の参照元とその利用先を確認して表示用と保存用を分けてください。

## 抽出範囲

- `src/` 以下の `.c` / `.h` ファイル。各ファイルと件数は `manifest.json` に記録します。
- 通常版、Rapid Brogue、Bullet Brogue、および条件付きビルドのコードを含みます。
- コメント内の文章と、`'a'` などのC文字リテラルは含みません。
- 表示文だけでなく、空文字列、区切り、ヘッダーのパスなども `internal.json` に
  記録し、ソース中の文字列リテラルが抽出対象から落ちないようにしています。
- README、ライセンス全文、設定ファイルのコメント、開発・テスト用スクリプトの
  文章は、このゲームソースのカタログには含めません。
- ユーザーが入力する銘や外部のリプレイ注釈は固定原文ではないため収録しません。
- 生成物 `src/brogue/LocalizedTextData.h` の重複収録は行いません。
  日本語の原本は `ja/*.json` です。翻訳処理のテスト文字列は `internal.json` に収録します。

Cで隣接する文字列リテラルは結合して収録します。ただし、間にマクロや
プリプロセッサ指示がある場合は、実行時の完成した文章ではなく各リテラル群を
収録します。文の断片や単語も収録しているため、項目数は完成した文章数ではありません。

## 項目の形式

```json
{
  "text": "you found %i pieces of gold.",
  "translatable": true,
  "kind": "game_message_or_fragment",
  "sources": [
    {
      "file": "src/brogue/Items.c",
      "line": 877,
      "end_line": 877,
      "symbol": "pickUpItemAt",
      "function": "pickUpItemAt",
      "scope": "function",
      "call": "sprintf",
      "argument_index": 1,
      "literal_count": 1
    }
  ],
  "placeholders": {
    "c_format": ["%i"],
    "brogue_tokens": []
  }
}
```

各JSONの `entries` はIDをキーとしたオブジェクトです。同じ参照元のシンボルにある
同一原文は一つの項目へまとめ、出現箇所をすべて `sources` に残しています。
IDはファイル名、シンボル名、原文の短い見出し、ハッシュから生成します。
行番号の変更では変わりませんが、原文・分類上の種類・シンボル・パスの変更では
変わることがあります。初期抽出用IDなので、組み込み時に必要なら固定の意味的IDへ
整理してください。

- `sources.file` は `brogue/` からの相対パス、行番号は1始まりです。
- `argument_index` は0始まりです。初期化配列など、呼び出しの引数でない場合は `null` です。
- `literal_count` はその箇所で結合したC文字列リテラルの数です。
- `%s`、`%i`、`$HESHE`、`****` などは原文のままです。Cの書式、代名詞置換、
  ヘルプの色指定に使われるため、通常の文章として置き換えないでください。
- Cの改行・タブ・制御文字は復号した値をJSONでエスケープして保存しています。
  `text` の前後の空白も原文の一部です。
- `diagnostics.json` は `language: "en"`、全項目が `translatable: false` です。
- `internal.json` は言語を指定しない `language: "und"`、全項目が `translatable: false` です。

## 再生成・コード検証

`brogue/` ディレクトリからPython 3で実行します。画面操作・スクリーンショットは不要です。

```text
python tools/extract-text-catalogs.py
python tools/refresh-ja-sources.py
python tools/build-windows.py
python tools/build-windows.py --probe
python tools/verify-locale-catalogs.py
python tools/generate-locale-audit.py
python tools/verify-generated-text.py --from-game
python tools/extract-text-catalogs.py --check
python tools/compile-locales.py --check
bin\brogue-nihon.exe --test-localization
```

`extract-text-catalogs.py` は全C文字列を分類・収録し、参照元とソースのハッシュを保存します。
`refresh-ja-sources.py` は翻訳を残して参照元を更新し、未知の表示用原文があれば停止します。
`compile-locales.py` は翻訳・プレースホルダー・原文の一致を確認してC辞書を生成します。
`ja/coverage.json` には分類ごとの翻訳件数、保存理由のある項目と未翻訳件数を記録します。

`verify-locale-catalogs.py` は実際のC翻訳処理をDLLで呼び出し、原文と条件分岐の引数候補を
検査します。食事確認、戦闘文、血草の説明、装備の数値などの合成文も検査します。
`generate-locale-audit.py` は非描画のゲームを起動し、全アイテムの鑑定前後・複数個・呪い・
保護・ルーン、全モンスターの体力・味方・突然変異を変えて実際の説明文を生成します。
通常版・高速版・弾丸版の各1,953件を `.build/game-text-audit/` に出力します。
検査専用ディレクトリを使うため、プレイヤーのセーブファイルを使用しません。
`verify-generated-text.py --from-game` はその日本語出力に英語の単語が残っていないこと、
UTF-8の正常性、説明文の折り返し行数を検査します。英語モードの原文保持も確認します。

検査結果は `.build/locale-code-audit.json`、`.build/generated-text-audit.json` に保存します。
単文字の操作キーとEsc・Tabなどのキー名は保持します。診断ログ・保存値・CSVの列名と
シード解析の出力は英語を維持します。

旧 `verify-localization.py` はSDL描画の任意検査用として残しています。
現在の全訳検査には使用しません。
