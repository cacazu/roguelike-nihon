# エージェント向け索引

文書の新設・整理、依存ライブラリや外部素材の追加・更新、配布対象やライセンス通知の変更では、[文書とライセンスの管理方針](docs/DOCS-AND-LICENSES-ja.md)を読んで従う。

## 作業スキル

- ゲームのRust対応・移植・層分離では、[game-rust-port](.agents/skills/game-rust-port/SKILL.md)を使う。
- 攻略調査・実プレイ・操作記録・記録からの再攻略では、[game-playthrough](.agents/skills/game-playthrough/SKILL.md)を使う。

## Rogueの実装資料

`rogue-nihon/` を変更するときは、変更対象に対応する正本を参照する。

- 層の責務、ABI、入力・保存の判断: [IMPLEMENTATION-ja.md](rogue-nihon/docs/IMPLEMENTATION-ja.md)
- 原作仕様、変更点、回帰条件: [ORIGINAL-SPEC-ja.md](rogue-nihon/docs/ORIGINAL-SPEC-ja.md)
- 翻訳、意味ID、辞書・UI文言: [LOCALIZATION-ja.md](rogue-nihon/docs/LOCALIZATION-ja.md)
- 記号・表示ID、画像、壁・足元の描画: [MAP-DISPLAY-ja.md](rogue-nihon/docs/MAP-DISPLAY-ja.md)

実行方法は作品のREADME、検証コマンドは [tests/README.md](rogue-nihon/tests/README.md) を参照する。上位の `AGENTS.md` の検証指示も適用する。

## 共通RustとBrogue Web

- ゲーム非依存の描画APIは [rust-common](rust-common/README.md)。ゲームの命令、ABI、記号と画像の対応、可視性、保存形式は作品側へ置く。
- BrogueのC/Rust境界、入力待ち、3表示、保存・配布の契約は [Web実装](brogue-nihon/docs/WEB-ja.md)、ビルドは [BUILD.md](brogue-nihon/BUILD.md)、検証入口は [tests/README.md](brogue-nihon/tests/README.md) を参照する。
- Brogue原作の全コマンド・内容定義と検証の単位は [機能と受け入れ基準](brogue-nihon/docs/FEATURES-ja.md) を参照する。通常プレイ、fixture、ソース確認、未確認を区別する。
- 作品固有の検証に加え、共通Rustを変更したら共通クレートの単体検査と両作品の関連ブラウザー操作を確認する。

## 一時スクリプトの後始末

- 調査・画像生成・動作確認のためだけに作った一時スクリプトは、用途が終わったら完了報告前に削除する。`.local/`、Gitの除外対象、OSの一時領域に置いても残してよい理由にはならない。
- 一回限りの処理は、可能ならファイルを作らずに実行する。ファイルが必要な場合は作成した絶対パスを把握し、サブエージェントが作ったものも含めて終了時に片付ける。失敗・中断で残ったものは作業を再開した際に確認し、用途終了後に削除する。
- 完了前に、作成した一時スクリプトの残存と参照元を確認する。必要な結果は会話で報告し、一時スクリプトを成果物や恒久的なテストとして残さない。
- 継続利用する正式なツール・回帰テストは、用途と参照元を明確にして所定の `tools/`・`tests/` 等へ配置する。ユーザーが保存を明示した一時スクリプトは、その指定に従う。
- 削除は内容・利用先・実行中でないことを確認した対象ファイルに限る。正式なソース・ツール・テスト、依存ライブラリ、ビルドキャッシュを一括削除しない。
