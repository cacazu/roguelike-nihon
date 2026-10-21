# Web検証

作品フォルダーを作業ディレクトリーとする。受け入れ条件と責務は [Web実装](../docs/WEB-ja.md) が正本。Node.js、Rust 1.98以上、wasm32-unknown-unknownターゲット、Emscripten SDK、Cargo.lockと同じ版のwasm-bindgen-cli、PlaywrightとChromiumを使用する。

```powershell
cargo test --offline --locked --manifest-path rust/Cargo.toml --lib
.\build-web.ps1
.\build-web.ps1 -Check -SkipRust
node tests/browser.mjs
```

SDKは `-SdkRoot` または `EMSDK` で指定する。wasm-bindgen-cliがPATHにない場合は、`BROGUE_WASM_BINDGEN` に実行ファイルを指定する。Playwrightのパッケージは `BROGUE_PLAYWRIGHT`、ブラウザー実行ファイルは `BROGUE_BROWSER` で明示できる。環境固有の絶対パスをテストの正本へ埋め込まない。

`browser.mjs` はローカルサーバーを起動し、検証専用の `game-check.js` をPlaywrightのrouteで読み込む。productionのhost・生成物を変更せず、検証用の状態観測をテストページだけに追加する。通常のPCキー・タッチイベントから原作を操作する。

実行対象は、固定seed42の開始、ターンを進める入力、持ち物、品物から対象選択・取消、3表示の実画素差とC状態不変、文字入力を含む保存、新instance復元後の次操作、縦・横向きのスマートフォン画面。結果とスクリーンショットは `.local/browser-verification/` に出力する。スマートフォン画面はPlaywrightによるエミュレーションであり、実機操作とは区別する。

通知は次の手順で再生成・照合する。実際に使用するSDKとRust標準ライブラリーのソース・通知が必要。

```powershell
python tools/collect-web-licenses.py --sdk-root <Emscripten SDK>
python tools/collect-web-licenses.py --sdk-root <Emscripten SDK> --check
node --test tests/artifacts.test.mjs
```

既存の日本語辞書・原文export検証は [locales/README.md](../locales/README.md) を参照する。原作比較では比較元の版・sourceと固定seed入力を照合し、専用exportを通常配布へ含めない。共通クレートの検査は [rust-common](../../rust-common/README.md) から実行する。
