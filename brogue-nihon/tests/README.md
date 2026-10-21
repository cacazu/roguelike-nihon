# Web検証

作品フォルダーを作業ディレクトリーとする。受け入れ条件と責務は [Web実装](../docs/WEB-ja.md) が正本。Node.js、Rust 1.98以上、wasm32-unknown-unknownターゲット、Emscripten SDK、Cargo.lockと同じ版のwasm-bindgen-cli、PlaywrightとChromiumを使用する。

```powershell
cargo test --offline --locked --manifest-path rust/Cargo.toml --lib
.\build-web.ps1
.\build-web.ps1 -Check -SkipRust
node tests/browser.mjs
node tests/input-flows.mjs
node tests/menu-flows.mjs
node tests/command-flows.mjs
node tests/features.mjs
node tests/consumables.mjs
node tests/scrolls.mjs
node tests/bolts.mjs
node tests/projectiles.mjs
node tests/knowledge-feats.mjs
node tests/world-contracts.mjs
node tests/persistence.mjs
```

SDKは `-SdkRoot` または `EMSDK` で指定する。wasm-bindgen-cliがPATHにない場合は、`BROGUE_WASM_BINDGEN` に実行ファイルを指定する。Playwrightのパッケージは `BROGUE_PLAYWRIGHT`、ブラウザー実行ファイルは `BROGUE_BROWSER` で明示できる。環境固有の絶対パスをテストの正本へ埋め込まない。

`browser.mjs` はローカルサーバーを起動し、検証専用の `game-check.js` をPlaywrightのrouteで読み込む。productionのhost・生成物を変更せず、検証用の状態観測をテストページだけに追加する。通常のPCキー・タッチイベントから原作を操作する。

実行対象は、固定seed42の開始、ターンを進める入力、持ち物、品物から対象選択・取消、3表示の実画素差とC状態不変、文字入力を含む保存、新instance復元後の次操作、縦・横向きのスマートフォン画面。結果とスクリーンショットは `.local/browser-verification/` に出力する。スマートフォン画面はPlaywrightによるエミュレーションであり、実機操作とは区別する。

全機能を検査する範囲と判定単位は [機能と受け入れ基準](../docs/FEATURES-ja.md) を参照する。`input-flows.mjs` は実キー・マウス・タッチ、入力待ち・フォーカス・連打・取消・表示・PNG取得を検査する。`features.mjs` はCheckだけにリンクする `fixtures.c` で明示した初期条件を準備し、その後は実ブラウザー入力から原作の効果を実行する。fixtureを通常プレイや通常保存の成功と扱わない。`persistence.mjs` は通常配布のCでゲームを終了し、3variantのスコア・履歴・録画の内容を新しいページまで照合する。各結果・操作と画像は `.local/feature-verification/` 以下に出力する。

`consumables.mjs`、`scrolls.mjs`、`bolts.mjs` は、CEの薬・チャーム、巻物、Staff／Wandを種類別に扱う。初期条件・公開C画面・実入力・途中／事後状態を保存し、効果、取消、確認、空チャージ、対象への適否、反射を別caseで評価する。`BROGUE_CONSUMABLES`、`BROGUE_SCROLLS`、`BROGUE_BOLTS` にcase IDをカンマ区切りで指定すると絞り込める。`node tests/bolts.mjs --list` は設計とcase一覧だけを出力し、実行証拠を生成しない。fixture番号は `fixture-scenes.h`、実行対象の構築は共通harnessの失敗記録範囲内にあるcase factoryを正本とする。定義・契約・依存関係の読込みに失敗した場合も新しい失敗結果へ更新し、以前の成功を今回の結果として残さない。

`projectiles.mjs` はfixtureのPC／タッチによる投擲・再投擲・照準取消・矢の使い切り、cursor中のShift操作、独立して照準できる3体を使ったTab／Shift+Tabの正逆巡回を検査する。`BROGUE_PROJECTILES`でcaseを絞り込む。fixtureを使用するので通常プレイの証拠とは分け、保存確認を拒否したcaseを保存ファイル作成の成功とは扱わない。

`knowledge-feats.mjs` は既存のCHECK初期状態から、未知の薬の種類呼称と既知の剣の個別銘の置換・空名解除・文字入力取消をPC／タッチで検査する。許可した名称フィールド以外は対象品を含む全観測状態を比較し、未知の正体を公開在庫が漏らさないことも確認する。偉業はPure Mageの装備だけ／実際の可視敵への武器攻撃と、Pure Warriorの照準取消／杖の発射を分け、F画面の初期空白と失敗の赤いマーカーを検査する。初期空白を達成と数えず、他の偉業・終了画面・他variantを合格に広げない。スマホ相当では実タッチで名前と状態欄を表示範囲内へ動かし、スクロールがゲーム入力を送らないことを確認する。`BROGUE_KNOWLEDGE_FEATS` でcaseを絞り込める。

原作との差分比較には、[公式v1.15.1](https://github.com/tmewett/BrogueCE/releases/tag/v1.15.1) の展開ソースとGCCが必要。`BROGUE_ORIGINAL_SOURCE` に原作フォルダーを指定して `node tests/original-compare.mjs` を実行する。コンパイラーは `BROGUE_CC`（省略時 `gcc`）。[固定ソースハッシュ](upstream-1.15.1.json) の全入力を照合し、ブラウザーの実際の消費入力を、原作本体を変更しない専用consoleで再生する。各入力待ちのseed・ターン・実質乱数消費数・位置・HP・階・終了状態を比較する。内部RNG全状態、全アイテム・敵の状態、自動行動への時間依存の割込みまで同一と保証する比較ではない。

薬・チャームの全種類検査に成功した後、同じ原作ソース設定で `node tests/compare-fixtures.mjs` を実行すると、同じ検証用初期状態と消費入力を原作へ与えられる。元のゲームC・ヘッダー42件を全ハッシュ固定し、原作のヘッダーを優先して同じfixtureと専用consoleだけを追加リンクする。fixture注入後の初期状態と、実際の入力待ちごとの観測全項目を比較する。原作にない入力待ちdescriptorの`ready`だけを比較から除外する。途中のアニメーションやpauseへの時間依存の割込みは比較対象外。正しい効果の判定は、別に調べた原作仕様に基づく消費品テストのassertionで行い、同じfixtureでの一致だけを正しさの根拠にしない。

巻物やStaff／Wandを比較する場合は、各ブラウザーsuiteが成功した後に対象と出力先を明示する。以下は作品フォルダーで実行する例で、原作ソースとコンパイラーの設定は同じものを使う。

```powershell
$env:BROGUE_FIXTURE_RESULTS='.local/feature-verification/scrolls/results.json'
$env:BROGUE_COMPARE_DOMAINS='scrollKind'
$env:BROGUE_COMPARE_NAME='scrolls'
node tests/compare-fixtures.mjs
$env:BROGUE_FIXTURE_RESULTS='.local/feature-verification/bolts/results.json'
$env:BROGUE_COMPARE_DOMAINS='staffKind,wandKind'
$env:BROGUE_COMPARE_NAME='bolts'
node tests/compare-fixtures.mjs
```

結果は `fixture-compare-scrolls/`、`fixture-compare-bolts/` に分かれる。比較は実操作をした主ページのtraceが対象であり、別ページの自然経過対照はブラウザー側の証拠として保存する。原作と同じ初期fixtureになったこと、個別効果の独立assertion、同じ実入力での原作一致を分けて読む。CEの成功をRapid／Bulletや全branchの成功へ広げない。

通常プレイのJSONL操作記録がある場合は、`BROGUE_ACTION_LOG` にそのファイルを指定して同じ比較を追加できる。実キー操作を保存・終了の直前まで比較し、ゲーム入力を発生させない表示・フォーカス操作は明示して除外する。保存・終了後のタイトルのアニメーションはこの同期consoleの比較対象外とし、除外した操作と境界を結果に記録する。原作のpauseを割込みなしとして再生するため、待ち時間中に押した入力の時間差は別の入力検査で確認する。

リポジトリのルートから次を実行すると、Git・既存の監査結果に依存せずソースの全定義を収集し、実行結果を対応付けた検証表を再生成する。

```powershell
node brogue-nihon/tests/inventory-features.mjs
node brogue-nihon/tests/report-features.mjs
node --test brogue-nihon/tests/inventory-features.test.mjs brogue-nihon/tests/report-features.test.mjs brogue-nihon/tests/fixture-browser.test.mjs
```

一覧と検証表はルートの`.local/feature-verification/`へ出力する。結果がない行は未実行のままとし、旧ビルドの結果・fixtureの準備・代表例の成功を現行の全種成功へ読み替えない。対象の原作版、variant、入力方法、実行物・ソースのハッシュ、実アサートを照合する。

通知は次の手順で再生成・照合する。実際に使用するSDKとRust標準ライブラリーのソース・通知が必要。

```powershell
python tools/collect-web-licenses.py --sdk-root <Emscripten SDK>
python tools/collect-web-licenses.py --sdk-root <Emscripten SDK> --check
node --test tests/artifacts.test.mjs
```

既存の日本語辞書・原文export検証は [locales/README.md](../locales/README.md) を参照する。原作比較では比較元の版・sourceと固定seed入力を照合し、専用exportを通常配布へ含めない。共通クレートの検査は [rust-common](../../rust-common/README.md) から実行する。

種類全体を対象にしない追加契約の原作比較は、`BROGUE_FIXTURE_RESULTS` にその合格結果、`BROGUE_COMPARE_NAME` に短い識別名、`BROGUE_COMPARE_DOMAINS=none` を明示する。この設定は全種類網羅を主張しないだけで、入力結果の全case合格、生成物とmanifestの一致、全消費入力待ちの長さと全観測値の一致は省略しない。通常の省略値と種類domain指定は従来どおり全primitiveの独立した効果assertionを必要とする。偉業の内部配列は現在のCHECK観測に含まれないため、Fの状態マーカーはブラウザーの公開セルと画像による証拠であり、native側の内部偉業配列を直接照合したとは記載しない。

`world-contracts.mjs` は、CHECKの準備だけを `fixtures.c` に置き、以降はPCキー／公開されたタッチ候補から原作を操作する。Slayingの一致／別種、Vulnerabilityと通常鎧の同じ待機中の実AI被害、Spiderの開通／壁遮断、捕虜のNo／Yes／実追随、レバーの機構別連動／遮断器、鍵のmachine一致と使い捨て／再利用／深度違い／別機構、水中と浮遊時の光半径、迂回での地形発見と視界外の記憶を検査する。`BROGUE_WORLD_CONTRACTS` でcaseを絞り込める。別初期条件の対照はharnessの `control(callback, fixture_id)` で独立ページを開き、準備状態・消費入力・最終状態を保存する。省略時は主caseと同じ初期条件を使う。

人工的なHP100・回復停止・STUCKによる必中・元のAI情報・階段退避を事前条件として記録する。Slayingの必中特性、他のルーン、全AI能力・自然な群れ／変異、機構blueprint生成、鍵の座標一致による成功、未訪問階の生成は今回の代表分岐とは別に残す。Vulnerabilityは同じ待機中の総近接被害の対照であり、敵が1回だけ攻撃したとは仮定しない。CHECK観測にはrunic／鍵の照合情報、機構番号、水中と戦闘数値を追加し、鍵配列は終端後も含む固定上限を確認する。これらの読取export・準備sceneはproductionにはリンクしない。

CHECKを拡張した後の比較は新しいmanifestと生成物で再実行する。旧版の全回帰は `.local/phase-evidence/` の版別証拠として維持し、新版の合格へ自動で移さない。検証表のcurrentとhistoricalはこの版の一致を区別して読む。

共通fixture harnessのタッチ地図撮影は、command待ちで既存の＠ボタンを実タップし、プレイヤーをviewport内へ戻す。全観測状態・入力serial・消費入力記録が変わらないことと画面内座標を保存する。modal画面はこの再配置を適用せず、各検査の表示範囲を確認する。
