# 共通Rust描画

`roguelike-common` はゲームに依存しないソフトウェア描画クレートです。呼び出し元がフォントbytes・PNG画像・描画命令を渡し、`Renderer` から完成したRGBAを受け取ります。文字計測、PNG decode、画像crop・回転・拡大・合成、図形・SVG path・クリップを共有します。

ゲームのルール、入力コマンド、地図記号から画像への対応、可視性、翻訳、保存形式、ブラウザーAPIは各作品が所有します。このクレートは作品の設定や素材を自動検索しません。PNGは確保前に辺8192px・16M画素・RGBA 64MiB以内か検査します。

各作品のCargo manifestからこのディレクトリーへ直接path依存を設定します。独立したworkspaceなので、利用作品のworkspace構成やゲーム固有クレートを必要としません。

## 検証

リポジトリのルートで実行します。文字描画検査には、Noto Sans JPとNoto Color Emojiの既存素材を明示します。

```powershell
$env:ROGUELIKE_TEST_FONTS = (Resolve-Path rogue-nihon/web/assets/fonts).Path
cargo test --offline --locked --manifest-path rust-common/Cargo.toml --lib
```

別の素材配置では、`ROGUELIKE_TEST_FONTS` に `NotoSansJP.ttf` と `NotoColorEmoji.ttf` のあるディレクトリーを指定します。製品の描画は環境変数を参照せず、APIから受け取ったフォントだけを使用します。各作品の実ブラウザー検証は作品のtests READMEを参照してください。
