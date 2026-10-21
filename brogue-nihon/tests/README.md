# Web検証

作品フォルダーを作業ディレクトリーとする。受け入れ条件と責務は [Web実装](../docs/WEB-ja.md) が正本。Node.js、Rust 1.98以上、wasm32-unknown-unknownターゲット、Emscripten SDK、Cargo.lockと同じ版のwasm-bindgen-cli、PlaywrightとChromiumを使用する。

```powershell
cargo test --offline --locked --manifest-path rust/Cargo.toml --lib
.\build-web.ps1
.\build-web.ps1 -Check -SkipRust
node tests/browser.mjs
node tests/input-flows.mjs
node tests/menu-flows.mjs
node tests/features.mjs
node tests/persistence.mjs
```

SDKは `-SdkRoot` または `EMSDK` で指定する。wasm-bindgen-cliがPATHにない場合は、`BROGUE_WASM_BINDGEN` に実行ファイルを指定する。Playwrightのパッケージは `BROGUE_PLAYWRIGHT`、ブラウザー実行ファイルは `BROGUE_BROWSER` で明示できる。環境固有の絶対パスをテストの正本へ埋め込まない。

`browser.mjs` はローカルサーバーを起動し、検証専用の `game-check.js` をPlaywrightのrouteで読み込む。productionのhost・生成物を変更せず、検証用の状態観測をテストページだけに追加する。通常のPCキー・タッチイベントから原作を操作する。

実行対象は、固定seed42の開始、ターンを進める入力、持ち物、品物から対象選択・取消、3表示の実画素差とC状態不変、文字入力を含む保存、新instance復元後の次操作、縦・横向きのスマートフォン画面。結果とスクリーンショットは `.local/browser-verification/` に出力する。スマートフォン画面はPlaywrightによるエミュレーションであり、実機操作とは区別する。

全機能を検査する範囲と判定単位は [機能と受け入れ基準](../docs/FEATURES-ja.md) を参照する。`input-flows.mjs` は実キー・マウス・タッチ、入力待ち・フォーカス・連打・取消・表示・PNG取得を検査する。`features.mjs` はCheckだけにリンクする `fixtures.c` で明示した初期条件を準備し、その後は実ブラウザー入力から原作の効果を実行する。fixtureを通常プレイや通常保存の成功と扱わない。`persistence.mjs` は通常配布のCでゲームを終了し、3variantのスコア・履歴・録画の内容を新しいページまで照合する。各結果・操作と画像は `.local/feature-verification/` 以下に出力する。

原作との差分比較には、[公式v1.15.1](https://github.com/tmewett/BrogueCE/releases/tag/v1.15.1) の展開ソースとGCCが必要。`BROGUE_ORIGINAL_SOURCE` に原作フォルダーを指定して `node tests/original-compare.mjs` を実行する。コンパイラーは `BROGUE_CC`（省略時 `gcc`）。[固定ソースハッシュ](upstream-1.15.1.json) の全入力を照合し、ブラウザーの実際の消費入力を、原作本体を変更しない専用consoleで再生する。各入力待ちのseed・ターン・実質乱数消費数・位置・HP・階・終了状態を比較する。内部RNG全状態、全アイテム・敵の状態、自動行動への時間依存の割込みまで同一と保証する比較ではない。

通常プレイのJSONL操作記録がある場合は、`BROGUE_ACTION_LOG` にそのファイルを指定して同じ比較を追加できる。実キー操作を保存・終了の直前まで比較し、ゲーム入力を発生させない表示・フォーカス操作は明示して除外する。保存・終了後のタイトルのアニメーションはこの同期consoleの比較対象外とし、除外した操作と境界を結果に記録する。原作のpauseを割込みなしとして再生するため、待ち時間中に押した入力の時間差は別の入力検査で確認する。

リポジトリのルートから次を実行すると、Git・既存の監査結果に依存せずソースの全定義を収集し、実行結果を対応付けた検証表を再生成する。

```powershell
node brogue-nihon/tests/inventory-features.mjs
node brogue-nihon/tests/report-features.mjs
node --test brogue-nihon/tests/inventory-features.test.mjs brogue-nihon/tests/report-features.test.mjs
```

一覧と検証表はルートの`.local/feature-verification/`へ出力する。結果がない行は未実行のままとし、旧ビルドの結果・fixtureの準備・代表例の成功を現行の全種成功へ読み替えない。対象の原作版、variant、入力方法、実行物・ソースのハッシュ、実アサートを照合する。

通知は次の手順で再生成・照合する。実際に使用するSDKとRust標準ライブラリーのソース・通知が必要。

```powershell
python tools/collect-web-licenses.py --sdk-root <Emscripten SDK>
python tools/collect-web-licenses.py --sdk-root <Emscripten SDK> --check
node --test tests/artifacts.test.mjs
```

既存の日本語辞書・原文export検証は [locales/README.md](../locales/README.md) を参照する。原作比較では比較元の版・sourceと固定seed入力を照合し、専用exportを通常配布へ含めない。共通クレートの検査は [rust-common](../../rust-common/README.md) から実行する。
