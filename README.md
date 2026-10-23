# roguelike-nihon

外国産ローグライクの日本語版をまとめる親リポジトリです。作品ごとのソース・翻訳・ビルド・実行手順は独立したGitリポジトリで管理し、この親は採用するコミットをサブモジュールで固定します。

| 作品 | 親内の配置・実行手順 | 独立リポジトリ |
| --- | --- | --- |
| Rogue | [rogue-nihon/](rogue-nihon/README.md) | [cacazu/rogue-nihon](https://github.com/cacazu/rogue-nihon) |
| Brogue | [brogue-nihon/](brogue-nihon/README.md) | [cacazu/brogue-nihon](https://github.com/cacazu/brogue-nihon) |
| NetHack | [nethack/](nethack/README.md) | [cacazu/nethack-nihon](https://github.com/cacazu/nethack-nihon) |
| DRL | [drl/](drl/README.md) | [cacazu/drl-nihon](https://github.com/cacazu/drl-nihon) |
| Dungeon Crawl Stone Soup | [dcss/](dcss/README.md) | [cacazu/dcss-nihon](https://github.com/cacazu/dcss-nihon) |
| Angband | [angband/](angband/README.md) | [cacazu/angband-nihon](https://github.com/cacazu/angband-nihon) |
| Tales of Maj'Eyal | [tome/](tome/README.md) | [cacazu/tome-nihon](https://github.com/cacazu/tome-nihon) |
| Cataclysm: Dark Days Ahead | [cataclysm-dda/](cataclysm-dda/README.md) | [cacazu/cataclysm-dda-nihon](https://github.com/cacazu/cataclysm-dda-nihon) |

作品の実装段階、日本語の対応範囲、動作条件、原作と依存物のライセンスは各READMEを参照してください。

## 取得と起動

```powershell
git clone --recurse-submodules https://github.com/cacazu/roguelike-nihon.git
Set-Location roguelike-nihon
```

通常のcloneで取得した場合は、親の直下で次を実行します。

```powershell
git submodule update --init --recursive
```

実行する作品のフォルダーへ移動し、そのREADMEの起動手順を使います。一作品だけなら、表の独立リポジトリを直接cloneできます。ブラウザーの保存はオリジンに紐付きます。既存の保存を使う場合は、配信方式・アドレス・ポートを作品の手順に合わせてください。

## 更新と開発

親の更新後は、作品内の未コミット変更を保護してから `git submodule update --init --recursive` で親が指定した版を取得します。この操作は親が固定したコミットへ合わせます。独立リポジトリの最新コミットへ自動更新する手順ではありません。

作品を変更する場合は、対象作品内でブランチを選び、作品のAGENTS・READMEと検証手順に従います。作品の変更を先にコミット・pushし、その後に親で対象パスのgitlinkを更新します。親から到達できない子コミットを親の共有版へ記録しないでください。複数作品へ変更が必要なときも、各作品で理由と検証範囲を示します。

親は共通の作業規則、文書・ライセンスの管理方針、作品に依存しないスキルを持ちます。作品固有のコード・仕様・通知・ツールと生成物は各作品が持ちます。作品間の共通ランタイムは導入していません。

## 作業場所と依存環境

この親は各作品の追跡済み内容と既存の依存条件を保って版を固定します。実行・再構築に必要な作業場所、固定パス、取得物は各作品のREADMEと手順を参照してください。

SDK・依存物・ツールチェーンの指定方法と対応版は、各作品の既存の手順に従ってください。依存展開物、コンパイラーとビルドのキャッシュ、プレイヤー保存はローカルで保持します。

共通規則は [AGENTS.md](AGENTS.md)、文書と権利通知の扱いは [文書とライセンスの管理方針](docs/DOCS-AND-LICENSES-ja.md) にあります。
