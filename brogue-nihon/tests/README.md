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
node tests/world-variants.mjs
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

人工的なHP100・回復停止・STUCKによる必中・元のAI情報・階段退避を事前条件として記録する。Slayingの必中特性、他のルーン、全AI能力・自然な群れ／変異、機構blueprint生成、鍵の座標一致による成功、未訪問階の生成は今回の代表分岐とは別に残す。Vulnerabilityは敵の初期ticksを1、敵attackSpeedとplayer movementSpeedを100にし、同じ待機中の実攻撃を1回に分離する。通常モード・無盾・毒／燃焼なし・栄養あり・回復停止を確認し、同一初期状態と乱数からの被害を厳密に2倍比較する。原作の血DFは被害量によって拡散と後続乱数消費を変えるため、末尾の対照間乱数同一を仮定しない。各primaryの全観測値は原作へ照合し、別controlページはブラウザー対照として扱う。CHECK観測にはrunic／鍵の照合情報、機構番号、水中と戦闘数値を追加し、鍵配列は終端後も含む固定上限を確認する。これらの読取export・準備sceneはproductionにはリンクしない。

CHECKを拡張した後の比較は新しいmanifestと生成物で再実行する。旧版の全回帰は `.local/phase-evidence/` の版別証拠として維持し、新版の合格へ自動で移さない。検証表のcurrentとhistoricalはこの版の一致を区別して読む。

共通fixture harnessのタッチ地図撮影は、command待ちで既存の＠ボタンを実タップし、プレイヤーをviewport内へ戻す。全観測状態・入力serial・消費入力記録が変わらないことと画面内座標を保存する。modal画面はこの再配置を適用せず、各検査の表示範囲を確認する。

`world-variants.mjs` はworldのcase factoryをRapid／Bulletの原作設定で実行する。CASEのvariant名と実際の `gameConst->variantName` は綴りが異なるため、各ページの準備前と効果前に実値を確認する。CHECKの起動設定として原作 `--variant` を渡し、未実装のURL queryに依存しない。productionのURLは `lang/seed/load` の既存範囲を保ち、タイトルのvariant選択は別の操作経路である。IDとPC／タッチ比較キャッシュはvariantごとに分ける。CEの絶対半径・ダメージ・位置列を他variantへ流用しない。

共通fixture suiteの `progress.json` はrun ID、選択case数、完了／合格／失敗数、実行中case、更新時刻を各caseの前後に保存する。終端の進捗保存失敗もFAILと診断へ反映してから `results.json` を確定し、処理終了と古い成功結果を混同しない。進捗のsuccessと準備失敗・進捗書込失敗はharness回帰検査で確認する。

`advanced-contracts.mjs` はCEのPC／タッチ34ケースで、Pink Jellyの分裂／空きなし、Spiderの近接毒／接触遅延、Acid Moundの防具腐食／保護、Monkeyの盗難数量と実逃走／装備品のみ、Bog Monsterの拘束と可視時取消／浮遊、Conjurerの実召喚とleader／麻痺を確認する。怪物の元infoを保ち、効果を準備で呼び出さない。STUCK、HP100、回復停止、行動時刻と地形制約は人工条件として記録する。遅延と麻痺は行動gateの対照であり、能力消去とは扱わない。

同suiteは鍵の座標一致・異machine、金貨取得によるUntempted失敗、実強化の+15→+16と+14→+15でのSpecialist達成境界も扱う。Fのstatus列は期待行に合わせてタッチ画面を実panし、赤minus／緑plusと閲覧の非消費を保存する。`BROGUE_ADVANCED_CONTRACTS` はカンマ区切りの完全case IDで絞り込む。

未訪問階のcase45だけは既存の生成地形・品物・怪物・階層情報を残し、playerを安全な実階段の隣へ移す。地下1階の上口は`DUNGEON_EXIT`である。実移動1→2→1→2でseed、visited、生成後の階段位置と再訪を確認する。未訪問階の座標は生成ヒントなので初回生成前後の不変を要求しない。`awaySince`は退出時に初期化されるため、訪問済みかつ非現在階だけを読み、他の人工sceneでは階層metadataを観測しない。通常攻略による到達や全profile生成の証拠とは区別する。

```powershell
node brogue-nihon/tests/advanced-contracts.mjs
$env:BROGUE_FIXTURE_RESULTS='brogue-nihon/.local/feature-verification/advanced-contracts/results.json'
$env:BROGUE_COMPARE_NAME='advanced-contracts'
$env:BROGUE_COMPARE_DOMAINS='none'
node brogue-nihon/tests/compare-fixtures.mjs
```

`advanced-variants.mjs` は上記17条件をRapid/Bulletの実variantでPC／タッチ各34件、計68件実行する。Specialistの準備は原作のEnchanting powerを読んで`16-power`／`15-power`とし、実使用後の+16／+15を正負対照にする。期待する強化幅は独立にCE1、Rapid/Bullet2として検査する。怪物の基本catalogは共通でも、生成・地形・光量・RNGの同一をvariant間で要求しない。自然階層は各variant自身の生成後の階段とseedを再訪時に比較する。原作比較は`BROGUE_FIXTURE_RESULTS`と`BROGUE_COMPARE_NAME`を`advanced-variants`へ切り替える。これはタイトルUIからのvariant選択とは別のCHECK起動経路である。

`overlay-messages.mjs` は製品のC／Rust描画を使い、Fと発見一覧の表示中に原作の半透明本文を上部メッセージ欄へ混入させない回帰6件を実行する。Cの表示ownerが保持scopeを開始／復元し、フレームと一緒にboolをRustへ渡す。入力待ちdescriptorから推測せず、セルと保持状態のどちらの変更でも再描画する。観測ラッパーも`frame(cells, ...metadata)`で追加情報を落とさず転送する。

最初の保持frameがAnyKey到達前であること、全保持frameのDOM不変、3表示・拡縮・タッチpanの非消費、終了後の実Strength Potionによる新メッセージ更新と再表示を確認する。Item／Text／Help ACKは別の非保持対照。pan後は慣性スクロールの停止を待ってから次のボタンへ触れる。Fの原作Canvasには暗い下地glyphが残るため、公開文字を読む際は既存の輝度判定を使う。真の入れ子・metadataだけの変更は別途ソースを確認し、致命例外の復旧や全modal対応まで実証したとは扱わない。原作比較は他の追加契約と同じく`overlay-messages`の合格結果と`BROGUE_COMPARE_DOMAINS=none`を指定する。

`weapon-runics.mjs` はCE/Rapid/Bulletの実variantとPC/touchで武器10runicの代表発動、通常武器、Slaying以外の原作INANIMATE gateを検証する。+9既知dagger、HP400/max1000・回復停止・ticks10000・web/STUCKの対象は人工的な準備条件。procは実攻撃の乱数でのみ起き、初発動で攻撃停止、30hit上限で未発動なら失敗とする。自然生成率・全武器種・負の強化・奇襲・死亡相手への例外は残る。

麻痺・減速・混乱は適用と実restによる自然解除、Multiplicityはplayer leader・元武器damage/accuracy・自律攻撃・寿命消滅、Forceは衝突前の実frameと末尾HPから衝突被害を分離する。Mercyはdefender回復、Plentyは親と同HPの敵cloneを検査する。凍結対象の状態適用を麻痺/混乱AI経路の網羅と呼ばない。各variant/PCtouch状態を照合し、各primaryを独立原作traceへ比較する。`BROGUE_WEAPON_RUNICS` は完全case IDのCSV。原作比較は `BROGUE_FIXTURE_RESULTS` を `brogue-nihon/.local/feature-verification/weapon-runics/results.json`、`BROGUE_COMPARE_NAME=weapon-runics`、`BROGUE_COMPARE_DOMAINS=none` とする。読取専用observerに装備netEnchant（16bit固定小数点）・player accuracy・monster damage/accuracyを追加し、効果は変更しない。

`weapon-runic-edges.mjs` は武器suiteからPlenty/Multiplicityの3variant・PCtouch12件とPCを選ばないtouch単独1件を抽出する。新個体の種類、生成前の床/非占有、player/親/他個体との非重複を実検査し、touch単独はPC同値未比較と結果へ明記する。通常120件では60組のPC/touch同値を維持する。初回120件実行後に追加した配置assertionはこの13件でも検証し、全件を理由なく繰り返さない。native比較名/結果は`weapon-runic-edges`へ替え、domain=noneを維持する。

`armor-runics.mjs` は防具11runic＋同条件のplain11＋対象外/保護条件7をCE/Rapid/Bullet・PC/touchで実行する174件。既知leather/raw30、未知runic、HP100/回復停止、DONNING0、弱体0、必要筋力=実筋力を準備し、効果・RNGをhelperで実行しない。近接はplayer web/STUCKと元のKobold/Goblin/SpectralBladeの実攻撃、ガスは攻撃者なし、爆発は元Explosive Bloatの実killでdeath DFを発生させ、反射は元SparkTurret/Spiderで分離する。SpiderとBloat攻撃にはSTUCKを準備せず、Spark/偶発効果は20実turnまで待って未到達を失敗にする。

Absorption+1の軽減と完全吸収時のみID、Mutuality丸め・非隣接、Reprisal+20/Immunity種族/無生物gate、Multiplicity+3の1HP像・leader/防御0/寿命・後続AI、Burden必要筋力/防御、ImmolationのACK後の実炎と火免疫時の非燃焼、Vulnerability2倍、Respirationのcaustic100ticks6被害差、DampeningのBloat死亡時爆発50被害差、Reflection+50/0/NEVER_REFLECTSを検査する。混乱/麻痺/腐敗ガス、lichen毒、全強化値、非melee例外、自然生成の完了とは呼ばない。plain first-hit controlは同variant/準備/RNGで比較し、血DF後の末尾RNG同一は要求しない。controlページはbrowser証拠、native比較はprimary全件。

`BROGUE_ARMOR_RUNICS` は完全case IDのCSV。`node brogue-nihon/tests/armor-runics.mjs` を実行し、原作比較は結果 `brogue-nihon/.local/feature-verification/armor-runics/results.json`、`BROGUE_COMPARE_NAME=armor-runics`、`BROGUE_COMPARE_DOMAINS=none` を指定する。item armorRaw・monster combat defenseは直接読取のみで通常配布へ含めない。

防具Multiplicity発動後は実際のremove/item選択で鎧を外し、再発動を止めてから元の像のAI・寿命を追う。観測やfixtureで装備を直接変更しない。

既配置GAS_EXPLOSIONへの東移動は、環境更新で消滅して爆発へ未到達だったため受入証拠にしない。DampeningはHP1の元Explosive Bloatを実素手攻撃で倒し、原作death DFの即時爆発を検査する。Multiplicityは元のdamage/accuracy/speed・性別以外のflagsとability継承、元床非占有を確認し、実remove後の生存TTL1→次rest消滅と公開文を追う。

`ring-effects.mjs` は全8ringの+2実効果/同準備の未装備対照、Awareness/Wisdomの2個合算と負値、Transference/Reapingの元INANIMATE対照を3variant・PC/touchで132件検査する。knownは個体ITEM_IDENTIFIED、初期は全て未装備。実equip/remove/移動/待機/攻撃から視界・回復・認知・自動検索・充填へ進み、bonus値だけで効果成功にしない。

Clairは壁裏CARPETの現在透視と解除後の発見記憶。Lightは人工base1の派生値を未装備状態で初期計算し、実+2で半径100→300→解除100と元Koboldの公開glyph/可視性。RegenはmaxHP100/HP50/timer1000から実equip/rest2で52対51、解除時は残timerを保持。Transferenceは元broadsword14～22実被害に対するCE比率20/RapidBullet10の回復と解除/無生物。Stealthは元TRACKING ArrowTurret/ticks101/攻撃速度250を保ち、装備+3restでrange2睡眠、未装備range4追跡、解除+restで再認知を確認する。

Awarenessは開始床だけ既検索にし、実装備後の未検索床への移動から隣接隠しtrapを発見する。2個+4の強度110と未踏隣接42,15の確定安全flag、-2の自動検索停止を区別し、plainの確率発見は許容する。Wisdomはstaff timer31の実充填、stack/negativeは高timer1000で28/5、解除10を測り、charmは通常1のまま。Reapingはstaff timer1000/charm100から最大20実hitで充填/readyを必須にし、実Health charm使用まで接続する。充填前の抽選Nは0..2D、timer差10(1+N)/cooldown差1+N、充填後の乱数timerと末尾pairRNGは比較しない。解除後追加gain停止はstaffの10差で示す。

負ringは既に呪いを解いた人工状態で、呪いによる固定・全強化値・全相互作用・自然生成までの完了とは呼ばない。追加observerは直接読む8bonus/保持stealthRange/再生間隔（千分の1turn）とring種類数。初期派生計算以外にeffect/RNG helperをfixtureで呼ばない。`BROGUE_RING_EFFECTS` は完全case IDのCSV。実行は`node brogue-nihon/tests/ring-effects.mjs`、原作比較は結果`brogue-nihon/.local/feature-verification/ring-effects/results.json`、`BROGUE_COMPARE_NAME=ring-effects`、`BROGUE_COMPARE_DOMAINS=none`。


`monster-abilities.mjs` は新7能力の正負14条件を3variant・PC/touchで84件実行する。元Acid Moundの武器腐食/保護、Toad幻覚、Centipede弱体、Vampire Bat敵90%吸血とanimal class2 Immunity対照、Ogre押出/壁、Goblin貫通/射線外、Naga全隣接/範囲外を実攻撃・待機で検証する。純正info/能力/速度/AIを保持し、HP100・web/STUCK・回復停止・防具raw30/0・配置は明示的な準備。麻痺倍増や効果helper/RNG再設定は使わない。Batのnative max18、被害役の元Ogre max55も保持する。

幻覚はCE/Rapid20・Bullet10、弱体は300/100/50の付与と直後tickを確認する。自然解除、継続被弾、味方40%吸血、全耐性・全配置・全monster相互作用・自然生成は未確認。player/allyの各被害を個別に判定し、対照の末尾RNG同値は要求しない。追加observerはmonsterのturnsUntilRegen/regenPerTurnを直接読むだけ。`BROGUE_MONSTER_ABILITIES` は完全case IDのCSV。実行は `node brogue-nihon/tests/monster-abilities.mjs`、原作比較には `brogue-nihon/.local/feature-verification/monster-abilities/results.json` と `BROGUE_COMPARE_NAME=monster-abilities`、`BROGUE_COMPARE_DOMAINS=none` を指定する。


酸の正条件は原作の確認画面で一度取消し、全観測状態/RNGが不変のまま再攻撃を確定して腐食を起こす。Immunity対照は被害0だけでなく未鑑定→実命中によるrunic鑑定も必須。正負の初期対照は明示した装備フィールド・壁と派生視界・味方位置/web/占有だけを正規化し、残り全観測状態とRNGを比較する。関連Dampening回帰では、既存の実Bloat kill→death DFのassertionをMK_EXPLOSIVE_BLOAT/MA_DF_ON_DEATHへ明示対応する。以前の動作を新規発見とは扱わない。


`node brogue-nihon/tools/play-browser.mjs --seed 43 --out normal-play-04-seed43-replay --replay .local/feature-verification/normal-play-03-seed43/actions.jsonl` は通常配布のみを使う公開画面・入力の記録ツール。新しい別試行として開始し、production manifest/4artifact/seedを照合してから、保存済み各操作の前後で公開テキスト・入力待ち・候補を比較し、最初の差異で再生を停止する。RGBの揺らぎは比較対象外で、公開HPは保存PNGから確認する。CHECK・game module・非公開地図・未識別品の内部値を読まない。`--out` は未使用の `normal-play-*` 名に限る。操作/画面/実frontendイベントと不確定な要求を逐次保存し、完了・勝利・全機能合格を自動判定しない。

出力先の `live-controller.json` に専用localhost URLと能力tokenがある。Bearer token付きGET `/state` は実ブラウザーの公開状態を読み、POST `/action` は `request_id`（UUID）と `commands`（`key`/`expect`/`reason` の公開キー入力のみ）を受ける。同じIDと命令の再送は保存結果を返して二重入力しない。通信不明時はGET `/request/<id>` と操作ログを先に確認し、新IDで盲目に再送しない。並行入力、再生差異後、要求失敗後、終了処理中の追加入力は拒否する。selector操作は扱わない。POST `/close` はゲーム内で保存・終了してから行い、ゲーム途中で閉じる場合は `abandon: true` と理由を明記して技術中断として記録する。端末切断でcontrollerが失われた場合は、その試行を技術中断として残し、再生/ロード/新規試行を区別する。操作数とターン数、通常攻略とfixture、保存テキスト同値と全内部状態同値を混同しない。

`monster-environment.mjs` はCE/Rapid/Bullet・PC/touchで10条件の正負120ケースを検証する。Revenantへの実剣攻撃0と雷被害、Wardenの実雷無効とOgre対照、Trollの自然1HP再生と毒による抑止、睡眠Wraithへの実初撃から次restでの逃走、Spider/Koboldのweb、Fury/Koboldのchasm通過、Eelのwet/dry攻撃（native flitと命中判定を保持し、最大20restで実被害に到達、dry対照は20rest無被害）、Nagaの最大30restでの自然潜水と公開glyph変化、火杖による木柵の燃焼後の実通行と石壁、水への実移動による消火と浮遊対照を確認する。PCの照準は実mouse、touchは実タップと必要時の確定ボタンを使う。

HP100・既知装備・配置・行動時計・webは人工初期条件で、monster info/能力/速度/HP上限と実効果・AIは原作を保持する。WraithはHP30/50、初期tick1から睡眠初撃の猶予を経て次の実restでAIへ届かせる。自然出現・全相互作用・通常攻略での全機能確認とは区別する。対照は明示した初期差を検査し、異なる怪物同士の全状態同値は主張しない。PC/touchはvariantごとに最終の全観測状態/RNGを比較する。セルobserverはterrainFlags/mechFlagsを純読取し、既存の壁/web正負比較では該当セルの原作値を検証してから正規化する。

`BROGUE_MONSTER_ENVIRONMENT` は完全case IDのCSV。実行は `node brogue-nihon/tests/monster-environment.mjs`。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-environment/results.json`、`BROGUE_COMPARE_NAME=monster-environment`、`BROGUE_COMPARE_DOMAINS=none` として `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。未到達はFAILとし、設定だけで個別定義を合格にしない。

`terrain-exposure.mjs` はガス・lichen・回復・bloodwortの10正負条件を3variant/PCtouchの120ケースで検証する。POISON_GASとSTEAMの直接6HP被害（毒状態ではない）、混乱25、麻痺の公開ACK・途中表示・20から0への自動解除、lichenの毒5/濃度1と次restの被害、回復50→56と99→100上限、podへのbumpによる未移動の破裂と次restの回復を確認する。Respirationは有害ガスを防いだ実曝露で未鑑定runicの識別を要求する。火免疫がsteamを防がないこと、Respirationがlichenを防がないことと浮遊の抑止も別対照にする。

敵なし・自然回復停止・HP100/50/99・装備・3×3のガス（麻痺8、他1000）・lichen/podは人工初期条件。状態をhelperで適用せず、実休止・実bump・ACKで効果を発生させる。麻痺はcommand復帰時の0だけで無反応とせず、途中frame・複数の残時間・追加absoluteTurnと照合する。回復雲とpod正条件はdot/illustration/originalの公開表示selectを使い、各画像・全観測state/RNG/待ちserial/消費入力不変を確認する。自然生成・通常攻略・全枝・実機Safariの確認とは区別する。

`BROGUE_TERRAIN_EXPOSURE` は完全IDのCSV。実行は `node brogue-nihon/tests/terrain-exposure.mjs`。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/terrain-exposure/results.json`、`BROGUE_COMPARE_NAME=terrain-exposure`、`BROGUE_COMPARE_DOMAINS=none` として `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。

`terrain-hazards.mjs` は隠れた毒罠の通常/浮遊/Respiration、火罠の通常/浮遊/火免疫、CHASMの落下/浮遊、深水の品物流失/浮遊という10条件を3variant・PC/touchで60例実行する。実移動で露出・押下後のpressure ACKを確認し、ACK後の原作DF生成と次restの被害/防御を測る。浮遊中も原作の受動探索で罠は露出し得るため、hidden/visibleの二者を許し、ACK・押下・全中間gas/fire・被害がないことを要求する。Respirationは罠を止めず実ガス曝露で未鑑定ルーンが識別され、火免疫もDFの火を止めない。

CHASMは公開Dive確認の取消で全観測状態/RNG不変を確かめ、再承認と落下ACKからnativeの2階へ到達する。時計増分を強制せず、実着地点の深水は被害0、沈水可能な液体は4～5、それ以外は8～10を要求する。observerの`deepest`は最下階上限で、到達階記録ではない。深水/浅水へ確実に着地させる初期状態はこのsuiteに含めず、固定seed42の現在の6例はいずれも通常床なので他の着地分岐は未確認。深水は未装備の既知単品を入水後最大20restで実pack→floorへ流失させ、公開文も確認する。浮遊対照は20rest保持。流失が入水だけで起きた場合はcmd.restを帰属させず、食事効果も確認済み扱いしない。

敵なし・HP100・自然回復停止・鎧raw0・隣の地形/単品/保護状態は人工初期条件であり、罠作動・落下・流失helperや乱数固定は使わない。自然罠配置、既知罠の確認分岐、再作動、致死落下、最下層転送、全装備組合せ、通常攻略全体、実機Safariは未確認。`BROGUE_TERRAIN_HAZARDS`は完全case IDのCSV。実行は `node brogue-nihon/tests/terrain-hazards.mjs`。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/terrain-hazards/results.json`、`BROGUE_COMPARE_NAME=terrain-hazards`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。

`monster-spells.mjs` はDragon白炎、Dar Priestess回復、Ogre Shaman加速、Pixie減速、Lich炎の5正負組を3variant・PC/touchの60例で検査する。公開frameの上3行を各描画で純読取し、実cast文と実効果の両方を要求する。炎は同turn/absoluteの隣接frameで未着火→着火のHP差をDragon15～49/Lich4～14として直接被害を検査し、後続burningと区別する。元Ogreの回復はHP1/native max55へ27、加速は実TRACKING個体の0→maxHASTED10・速度100/200→50/100、player減速はmax10・速度2倍を要求する。

正条件の上限は40実rest、未到達はFAIL。負条件は12実restで火免疫によるAIのfire選択拒否、満HPへの治癒cast自体の不在、元の既加速/既減速1000を10へ上書きしないことを検査する。Shaman/Lichのnative召喚と他対象へのcast、Sparkや近接の被害は許し、誤った「全体のcastなし/HP不変」は要求しない。初期follower OgreはPriest44,16/Shaman43,15のwebで識別保持し、召喚個体と取り違えない。

player HP/max1000・自然回復停止・鎧raw0、初期TRACKING/leader/follower、Ogreのweb/STUCK1000、保護/速度状態は検証専用準備。 Lich正負には射線外の座標(36,10),(38,10),(40,10),(42,10),(44,10)に麻痺1000の直接従者Fury5体を準備し、各restで位置・麻痺残存・leader/followerを保持確認する。元の召喚式は5体で1/77となり、新規召喚は許す。初期5体を自然horde生成、実召喚、Fury能力、麻痺付与の合格へ数えない。NPCの元info/bolts/生成clock/再生は保持し、effect/turn/RNG helperを呼ばない。元の徘徊地形・waypoint、全魔法相互作用・全怪物/flags・通常攻略・実機Safariを確認済みにしない。`BROGUE_MONSTER_SPELLS`は完全case IDのCSV。実行は `node brogue-nihon/tests/monster-spells.mjs`。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-spells/results.json`、`BROGUE_COMPARE_NAME=monster-spells`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。


`native-ai.mjs` は生成済み地形・items・hordes・waypoint・scentを保持した徘徊、遮蔽下睡眠、視認覚醒の3条件を3variant・PC/touch計18例で検査する。準備はreadonly preflight成立後のplayer/対象NPC位置と初期state、徘徊index -1のみ。native Kobold（群れなし）/Ratを選び、原作の通常床/絨毯と草/枯草（可燃属性だけを許可、火・液体・gas・絡まり・罠・machineは除外）、wp距離1..DCOLS/2未満の合法下降路、実FOV遮蔽または距離2の安全経路、対象と下降近傍の他NPC距離>12、player配置の他NPC距離>8と他NPC全てのplayer FOV0を準備前に確認する。hidden pairは距離>4・双方向FOV0、徘徊は合法な1歩候補もplayer FOV0とする。距離閾値は検証専用の配置条件で、原作AI規則ではない。terrain/waypoint/scentの64bit非暗号hash・counterとpack/floor/NPC info/生成clockを準備前後で照合する。hash一致は非観測フィールド全体の同一性の証明ではない。

徘徊は最大12restで実index選択・移動・同一after観測内の旧セル→新セル距離減少、睡眠対照は8restの位置/SLEEP/FOV0維持、視認は最大40restのSLEEP→TRACKINGと次の実接近を要求する。restで変わる実stealthRange、全描画観測の他NPC距離>4とplayer/対象HP・NUTRITION以外status初期値維持を確認し、未到達はFAIL。他NPC全てのFOV0は配置時の条件であり、その後は距離・HP/statusで実干渉を排除する。waypointの再計算、scent拡散/方向選択、AI/effect/turn/RNG helperは準備/観測から呼ばない。自然な配置/通常攻略、実臭跡追跡・未形成臭跡対照、alarm騒音、全AI/群れ/変異、実機Safariは未確認。`BROGUE_NATIVE_AI`は完全case IDのCSV。実行は `node brogue-nihon/tests/native-ai.mjs`。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/native-ai/results.json`、`BROGUE_COMPARE_NAME=native-ai`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。

CHECKの`nativeAIProbe`は未準備・turn0だけで適格NPCの数値ID/index、床候補と他NPC最小距離の件数、3条件の成立可否を純読取する。新suiteのstartup状態も保存し、配置条件の拒否を実AI未到達と区別する。候補計算からworld/RNG/waypoint/scentは変更しない。

### 自然生成地形上の臭跡追跡（CHECK専用）

`node brogue-nihon/tests/native-scent.mjs` の既定はCEの形成/未形成とRapid/Bulletの未形成、PC/タッチの8例。factoryは12例を保持し、残る形成追跡4例は明示IDで診断できるが未到達・未受入である。`BROGUE_NATIVE_SCENT`で対象IDを絞れる。共通の純粋な配置選択が、元の安全床で3〜8歩の単純な4方向経路と自然な遮蔽、対象の元臭跡0、対象/隣接セルの他NPC距離>12、player経路>8と初期他NPC非視認を満たす同じ対象・経路を選ぶ。不成立は状態/RNG不変の拒否。地形・waypoint・臭跡・元NPC情報/時計は保持し、playerと対象の位置・占有・初期TRACKINGだけを準備する。

正例は経路を実移動で最後まで進み、最初の視線喪失を助走とする。その後の、入力前後とも対象が非視認で、同じ入力後の旧セルも非視認、対象がTRACKINGを維持して1セル動き、同じ観測内で新セルの臭跡値が旧セルより大きい場面を要求する。`U=入力前の臭跡時計+3-入力前の対象セル臭跡` が `0..2*入力前stealthRange` に入る認知範囲内の証拠だけをfresh追跡とする。弱い臭跡での97%保持に該当する区間は、旧セル臭跡の入力前後一致で経過値を確定できる場合に別記録し、fresh合格へ使わない。全3variantの通常移動でNPC時計が進む。`D_BULLET_TIME`は無効なdebug分岐である。

負例は同じ経路の終点へplayerを最初から置き、元の未形成臭跡を保持したまま最大3回の実restでTRACKINGからWANDERINGへの遷移を要求する。正例を選択した実行では対象/経路/到達終点/RNGの一致も確認する。対象とplayerの全描画観測HP・特殊status、他NPCとの距離>4を検査する。負例だけ全観測の非視認を要求し、正例は形成区間と遮蔽追跡区間を分ける。認知喪失は特定helper呼出しの証明ではない。CHECK状態で観測した遮蔽動作を公開画面で見えた効果、自然配置、全AI、通常攻略、実機Safariの確認へ昇格しない。新条件の実行結果は保存結果を参照し、未実行を合格にしない。

臭跡fixtureに限り、元生成地形で必要な安全経路を選ぶため42以外の明示seedを受け付ける。他のfixtureは42限定を維持する。ブラウザ証拠のseedと初期状態を一致させ、原作比較も同じuint64 seedで起動する。`BROGUE_SCENT_SEED`は候補診断用の上書きで、実際のseedは各caseに保存される。候補不成立の診断も保持する。

現在の既定受入対象はCEの形成/未形成とRapid/Bulletの未形成、PC/タッチの計8例。Rapid/Bulletの形成追跡4例は、元seed42で安全な遮蔽退路が不成立、seed43で実移動後のfresh遮蔽witness未到達（Bulletの一候補は接触被害guardも失敗）として診断を保存し、既定の成功対象に含めない。明示IDで診断できるが、未到達を成功や原作欠落の証明にしない。CE42・Rapid43・Bullet43の明示生成seedを記録し、正常な原作生成地形での代表条件だけを確認する。全AI/全seedを完了扱いしない。


### Original植物記号の色（CHECK専用）

`node brogue-nihon/tests/original-symbol-colors.mjs` は3variant×PC/タッチエミュレーション6件。Cの公開フレームにFOLIAGE/BLOODWORT_STALKのU+2648と緑・紫・暗い緑、非黒背景を明示するUI専用fixtureを使う。実際のRust canvasで前景色の同一alpha合成・十分な色応答・透明な背景・上下左右のセル境界を検査し、fit/14/24倍率でOriginal→Dot→Illustration→OriginalをDOM操作する。各操作後にC状態・RNG・入力待ちserial・消費入力数の不変を検査する。最後の実入力restのみがCのturnを進める。自然な地形配置・治癒・照明・全記号・実機Safariの合格には使わない。`BROGUE_ORIGINAL_SYMBOL_COLORS` は完全case IDのCSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/original-symbol-colors/results.json`、`BROGUE_COMPARE_NAME=original-symbol-colors`、`BROGUE_COMPARE_DOMAINS=none` を指定し `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。原作比較はC状態と入力の一致で、canvas色はブラウザpixel検査の証拠を使う。


### 逃走・追詰め反撃・魔法恐怖の期限（CHECK専用）

`node brogue-nihon/tests/monster-flight.mjs` は3variant×PC/タッチ×4初期条件の24件。原作Monkey情報を保持し、初期FLEEING・mode・盗品dart3本・時計1と任意の7壁/魔法恐怖4を明示する。実restで安全mapによる最初の退避、追詰め反撃、恐怖中の反撃禁止、実期限切れ後のNORMAL/PERM状態差を検証する。恐怖0直後は両modeの一時TRACKINGを許し、公開攻撃文/HP低下/位置固定/fear0を伴う実NPC行動後に状態差を評価する。減衰はrest番号と固定対応させない。最大8rest未到達はFAIL。恐怖2条件の両方が選ばれた場合はfixture/mode以外の全初期state/RNG一致、PC/touchも両方が選ばれた場合は全初期/最終state/RNG一致を検査する。単独IDで対照未選択なら未比較と記録する。初期状態の存在だけ、自然な恐怖付与・配置・群れ生成・実機Safariの証拠にはしない。`BROGUE_MONSTER_FLIGHT` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-flight/results.json`、`BROGUE_COMPARE_NAME=monster-flight`、`BROGUE_COMPARE_DOMAINS=none` を指定し `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。


### 怪物の魔法反射（CHECK専用）

`node brogue-nihon/tests/monster-reflection.mjs` はGuardian/Winged Guardian/Mirrored Totemの100%反射、Ogre無反射対照、Golemの確率反射を3variant×PC/タッチの30件で検証する。原作の対象情報/HP/flagsを保持し、初期時計10000/回復抑制/playerHP100と既知+1雷staffを用意する。staffのcharge12は明示的な容量超過fixtureで、通常容量の証明ではない。timer1000を使い原作の過充填排出条件を避ける。麻痺は被弾時にmoralAttackが時計を99へ変えるため使わない。原作autotargetは100%反射敵を除外するため、全発で実PCキー/タッチ方向ボタンにより公開cursorを43,14へ手動移動し、ターン/RNG/HP/charge不変とEnter直前座標を検査する。100%反射は術者被害2..6/対象無傷/公開deflect文、Ogreは対象被害2..6/術者無傷、Golemは最大12発で反射返し被害と非反射被害の両方を要件化する。乱反射で術者無被害も合法だが、両者無被害の発は方向未確認・反射creditなしと記録する。各発の新しい描画観測区間とHP差で区別し、古いメッセージ文字だけで反射を数えない。位置・残時計・生存・無干渉status・charge/turn消費・PC/touch全初期最終state/RNGも検査する。未到達はFAILとして保存。反射頻度の統計、自然配置/召喚、怪物AI、実機Safariへ広げない。`BROGUE_MONSTER_REFLECTION` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-reflection/results.json`、`BROGUE_COMPARE_NAME=monster-reflection`、`BROGUE_COMPARE_DOMAINS=none` を指定し `node brogue-nihon/tests/compare-fixtures.mjs` を実行する。

### 自爆攻撃と死亡feature（CHECK専用）

`node brogue-nihon/tests/monster-kamikaze.mjs` は3variant×PC/タッチ×Bloat/Explosive Bloat/Rat対照の18件。playerHP100/回復なし・空pack、NPC初期位置41,14/時計1と周囲7壁だけを用意し、原作info/HP/flags/status/FLITS/回復/速度を保持する。実restのみ最大12回で、満HPの自爆→公開死亡feature文→ガス/爆発と実被害を確認する。Bloatはactorセルのガス生成・playerセルへの実拡散・曝露後の100ticks実restで原作値6HPの被害を分け、POISONEDは0を要求する。Explosiveは新しい観測の50HP低下と爆発免疫を確認し、併発する燃焼は別の効果として許容する。Ratは生存/元HPを保ち公開scratch/biteと1..3被害を示す。尿surfaceは許容し、ガス/爆発/燃焼不在を対照にする。消失や初期flagだけでは合格にしない。全初期最終state/RNGのPC/touch一致、実入力、位置/深度/他NPC/status干渉を検査。自然配置・全AI・全爆発免疫分岐・実機Safariへ一般化しない。`BROGUE_MONSTER_KAMIKAZE` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-kamikaze/results.json`、`BROGUE_COMPARE_NAME=monster-kamikaze`、`BROGUE_COMPARE_DOMAINS=none` を指定し `node brogue-nihon/tests/compare-fixtures.mjs`。

### Wispの直接着火と火炎免疫の期限（CHECK専用）

`node brogue-nihon/tests/monster-burn.mjs` は3variant×PC/タッチ×無免疫/免疫20/期限4の18件。原作WispのHP10/基礎打撃0/flags/FLITS/恒久status1000を保持し、初期位置41,14/時計1/7壁/playerHP100no regen/空pack/人工初期防御0と任意の人工火炎免疫だけを設定する。非可燃FLOOR上で全新描画観測の環境火を排除し、MA_HIT_BURNの直接着火とFIERYの地形着火を分ける。実rest最大12で公開scorches/burns命中とHP100での着火、燃焼中の別restの1..3被害を要件化。免疫20は新しい最初の公開命中と免疫残存の完了rest/HP100/burning0、期限4はその保護後に実期限0→着火→別rest被害を要求する。期限0最初のframeに着火する義務や、再命中で更新される燃焼時間の単調減少は要求しない。古い命中文字だけで期限後着火を数えない。player速度100/防御0、無干渉status/位置/原作info、実restイベント/turn消費、PC/touch全初期最終state/RNGも照合する。自然な薬の使用、FIERY地形着火、全免疫分岐/AI/自然配置/実機Safariの証明にはしない。`BROGUE_MONSTER_BURN` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-burn/results.json`、`BROGUE_COMPARE_NAME=monster-burn`、`BROGUE_COMPARE_DOMAINS=none` を指定し `node brogue-nihon/tests/compare-fixtures.mjs`。

### 怪物の鞭射程と接近・遮蔽対照（CHECK専用）

`node brogue-nihon/tests/monster-whip.mjs` は3variant×PC/タッチ×距離4/射程端5/射程外6から接近/opaque壁下AI/Ogre通常近接の30件。player38,14/HP100no regen/空pack/人工初期防御0、原作Salamanderを42/43/44,14または原作Ogre42,14・時計1へ用意し、情報/HP/flags/status/DFを維持。原作のAI選択dirの8方向rayに同一行で合わせ、実restで距離4/5の位置不変・公開whips/lashes・直接5..11被害、距離6初restの無被害接近44→43後の実鞭攻撃を確認。Ogreは遠隔無被害の実接近から隣接9..13公開攻撃へ到達し、原作stagger38→37を許容する。壁40,14は最初の実restの無被害/壁維持/実移動またはWANDERING遷移だけを検査する遮蔽下AI負対照で、targets[]・鞭衝突creditなし。後の迂回や再視認を遮断不具合と扱わず、鞭のactual-impact分岐は未確認に残す。新frameのplayer燃焼0/地形火なしで直接被害を区別し、原作の非火EMBERS/ASHは許容。実rest/turn消費・原作NPC情報・他NPC/status干渉・PC/touch全初期最終state/RNGも検査。自然配置/全AI/斜めray/全障害/実機Safariへ一般化しない。`BROGUE_MONSTER_WHIP` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-whip/results.json`、`BROGUE_COMPARE_NAME=monster-whip`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs`。


### 召喚宿主への格納と撃破後の復帰（CHECK専用）

`node brogue-nihon/tests/monster-enter.mjs` は原作Phylactery→Lichへの格納・実宿主撃破後の同個体復帰と、Phylactery直接撃破の負対照を3variant×PC/タッチ12件で確認する。人工初期playerHP2000/防御0/no regen、原作Phylactery42,14/時計1、既知+45雷staffcharge1（容量内）/timer111を用意し、原作NPC情報・HP・攻撃150・召喚確率と自然充填RNGを維持。準備から召喚/死亡/AI/effect/turn/RNG helperを呼ばない。実rest最大120で公開Lich再形成・親のactive一覧からの除去・nativeHP35のLichに同親が格納されたことを要件化。scene67/68限定のdepth1純読取carriedMonsterとpreparedSubject比較を使い、死後の古いpointerを参照せずfree前にresetする。timer<=10の場合だけ別記録の実rest1回で>10へ進め、移動/原作Phantom/Fury召喚を許し宿主座標を取り直す。Wisdom0/通常速度100/無加速減速で実castのcharge-1/timer-10を確認。実cursor取消で全観測state/RNG一致→再照準Enter→native宿主撃破/同親HP30の同位置復帰・新frame時計200・公開appearsを要求する。負対照は公開destroys/宿主なし/復帰なし。自然なDYING同居・ASH/RUBBLEは許容する。全初期最終state/RNGのPC/touch一致を検査し、Vampire/Phoenix・自然horde配置・全復帰分岐・全AI・実機Safariへ一般化しない。`BROGUE_MONSTER_ENTER` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-enter/results.json`、`BROGUE_COMPARE_NAME=monster-enter`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs`。


### Vampire・Phoenixの格納宿主と復帰（CHECK専用）

`node brogue-nihon/tests/monster-forms.mjs` は3variant×PC/タッチ×Vampire/Phoenix eggの新規正12件。scene69/70で工程28と同じ人工player2000/防御0/no regen・既知+45雷charge1/timer111・原作親42,14clock1だけを用意し、原作info/HP/速度/status/召喚確率・自然充填RNGを保持。実rest最大120で公開cloud of bats/newborn Phoenix・active親0/carried同親1・原作bat3またはPhoenix1を要求する。宿主はcarried identityから一意特定し、Vampire移動/blink・bat FLITS・NUTRITIONの自然減衰/格納中凍結・通常血痕/ASH・Phoenix→egg照明変化を許容。必要時だけ別記録の実rest1回でtimer>10にし再取得、公開CセルのG_BAT191/v118またはG_PHOENIX193/P80と明度を厳密確認し、実公開cursorの取消/再照準/Enterで宿主の初期HP18/30（追加rest後のbat吸血超過18..23を許容し実値記録）を撃破、同親HP75/50が死亡位置に1体復帰・carried0・fresh時計200・公開appearsを確認。雷貫通で他batも死亡し得るため残存0..2を許容、Phoenixは死亡DFなしでegg総数1を必須にして二重eggを排除する。新frameの文は折返し空白を正規化。charge-1/timer-10/turn1・取消全stateRNG不変・6PCtouch初期最終一致を検査する。準備/observerから召喚/death/effect/RNG/turn helperを呼ばない。自然horde/noncarrier死亡対照/連続復帰/Vampire親deathDF・吸血・blink/全照明・AI/実機Safariは未確認。`BROGUE_MONSTER_FORMS` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-forms/results.json`、`BROGUE_COMPARE_NAME=monster-forms`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs`。


### 不可視・telepathyと原作negation（CHECK専用）

`node brogue-nihon/tests/monster-negation.mjs` は3variant×PC/タッチ×Phantom/Phylacteryの12件。scene71/72で人工player100/防御0/no regen・原作対象42,14/時計10000・既知negationwand4（CE4..6/Rapid・Bullet2..4の交点）、Phantomだけ既知telepathy薬bを用意。元info/HP/status/DFを保持し、初期長時計で能動AIを除外する。Phantomは不可視/種名なし/自動候補除外→実薬で白ASCII Xだけ感知/候補は引続き除外→公開Xへ実manual cursor/取消不変/再照準Enterでnegation→HP35/速度50・200保持/INVIS・LEV0/maxStatuses1000保持/IMMUNE_WEBSのみ/wasNegated/本来165・P80と種名公開を検査。候補なしのTarget入口で手動移動前Tabがplayer位置のまま、可視化後も既知negaの効果が残らず候補除外、を実操作する。touch namedTabは既存の製品Tab9ボタンへ送る1aliasだけ追加した。Phylacteryは通常可視から実negaで公開shatters/消滅/宿主・復帰なしを確認。各castはcharge-1・wand enchant2（使用回数）+1・turn1、薬CE300/他50は自然減衰、native非火ECTOPLASMと地形発見を許容。public文は解除前の名前なのでsomething strippedが正当。取消全stateRNG不変・6PCtouch初期最終一致・実C入力待ちを照合する。準備/observerからnegation/visibility/effect/RNG/turn helperを呼ばない。telepathy期限切れ・自然AI/召喚・全反射/negation分岐・実機Safariは未確認。`BROGUE_MONSTER_NEGATION` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-negation/results.json`、`BROGUE_COMPARE_NAME=monster-negation`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs`。


### 群れ所属時の通路回避（CHECK専用）

`node brogue-nihon/tests/monster-corridors.mjs` は3variant×PC/タッチ×群れOgre狭路/単独Ogre同狭路/群れKobold同狭路/群れOgre幅3の24件。人工安全室/player40,14HP100防御0no regen、原作actor44,14clock1と壁列41y10..18（41,14FLOOR、幅3では41,13/15もFLOOR）、隔離1セル20,14の原作Koboldclock10000を準備する。群れ条件だけ元bookkeepingを残してactorにMB_LEADER、隔離個体にMB_FOLLOWERとleader pointerを付ける人工membershipで、自然horde生成ではない。pointer比較markerで同kind2体を区別し、元情報/HP/速度/statusを維持する。全条件で初回restの44→43接近、正条件はcurrentarc0/候補42,14arc2/実候補臭跡高/非player非占有/無害地形/TRACKING/MA+role/ENRAGED0/FOVを純観測し、8実restでgate東側維持。停止座標を固定しない。3対照は最大8restでx<=41実通過を必須にし、その場で止めて近接/押出しを混ぜない。arcは周囲通行可能領域の分割数で、単純な幅ではない。observerからは純読取passableArcCount/生scent/FOV/terrainだけを読み、臭跡を書換えるscentDirectionやpathfinder/AI/effect/RNG/turn helperを呼ばない。全freshでplayerHP/位置/status、元NPC情報/役割/leader関係/隔離個体の位置・HP・正時計・FOV0、実rest/turn消費、PCtouch12組の全初期最終stateRNGを照合する。公開subjectが見える時だけ種glyphと文字を厳密比較し、隠れた位置はCHECK観測として区別。自然horde/全AI/大域迂回選択/有害地形・enrage解除/実機Safariの信用へ広げない。`BROGUE_MONSTER_CORRIDORS` は完全ID CSV。原作比較は `BROGUE_FIXTURE_RESULTS=brogue-nihon/.local/feature-verification/monster-corridors/results.json`、`BROGUE_COMPARE_NAME=monster-corridors`、`BROGUE_COMPARE_DOMAINS=none` で `node brogue-nihon/tests/compare-fixtures.mjs`。

node tests/monster-distance.mjs はnative Goblin Mysticの距離維持を、距離2／3とKobold対照、3variant・PC/touchの18件で確認する。人工安全室の単独配置であり、自然pack生成の証拠にはしない。元のHP・flags・能力・shieldingを保持し、scene限定の純読取20bolt配列を記録する。shieldingの自己対象禁止と敵player不適格で干渉を避け、能力を消さない。実restでMysticの距離2→3(FLEEING)→2(TRACKING)→3、または3→2→3→2と、Kobold2→1接近を要求する。後退方向は固定せずChebyshev距離と1cell実移動、各確定stateと発生fresh、公開glyph、PC/touch state・RNGを照合する。protection効果・所持品抽選・自然horde・全caster・包囲反撃・swarming・実機Safariは未確認。絞込は BROGUE_MONSTER_DISTANCE、原作比較は BROGUE_FIXTURE_RESULTS=.local/feature-verification/monster-distance/results.json BROGUE_COMPARE_NAME=monster-distance BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs。

`node tests/food-fruit.mjs` はFRUITの1550栄養量、数量2→1、満腹2150との厳密境界（初期600は確認なし、601は確認あり）、No／Esc取消とYes消費を3variant・PC/touchの18件で確認する。人工現在栄養300／600／601と数量だけを準備し、原作最大栄養2150を保持する。実a→aで確定栄養1849／2149、一ターン、公開mango成功文、数量減少／削除、取消の全state・RNG不変を要求する。食後tickで1減るため、直後1850／2150の中間描画は必須にせず、観測用flushを追加しない。実発生freshはstatus配列、消費は実stateで検査する。自然生成、stack生成・合成、飢餓強制摂食、全栄養処理、整数overflow、個数境界は未確認。絞込は `BROGUE_FOOD_FRUIT`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/food-fruit/results.json BROGUE_COMPARE_NAME=food-fruit BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。

`node tests/monster-aggravate.mjs` は、既知aggravate巻物の実Yes／No対照と、期限切れ後の原作AIを2怪物・3variant・PC/touchの24件で確認する。人工TRACKINGのMystic距離2／群れOgre狭路を元能力のまま準備し、subject時計10801、隔離Kobold時計20000で初動を遅らせる。Yesの読書1ターン＋107実rest、Noの取消＋108実restでAGGRAVATING current0・subject時計1へ達し、その後Mystic1rest／Ogre3restで接近／門セルx41への進入と、退避／回避の対照を要求する。Yes期限後max108、No max0を区別する。原作の臭跡・waypoint・alert・表示変更を許容し、後続世界全体を同一とは要求しない。D_BULLET_TIMEは原作でも無効なdebug定義で、通常Bulletの別仕様と混同しない。初期spawnFuse下限125未満の総109／111ターンでNPC干渉も全状態検査する。観測は純読取、毎確定状態と発生freshを検査し、停止restの描画を強制しない。自然horde、到達不能／ALLY除外、再獲得、全AI、無限の将来、実機Safariは未確認。絞込は `BROGUE_MONSTER_AGGRAVATE`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/monster-aggravate/results.json BROGUE_COMPARE_NAME=monster-aggravate BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。


`node tests/cage-keys.mjs` はKEY_CAGEと捕虜解放を、使い捨て／再利用／誤深度／誤machine、3variant・PC/touchの24件で確認する。人工閉檻41,14・native JackalのMB_CAPTIVE・時計10000と鍵だけを準備し、効果・解放・地形昇格・AIを初期状態で実行しない。鍵座標は全例20,14、残19slotはゼロで、座標OR照合による誤対照を防ぐ。正例は実l確認のNo／Esc取消で全state・RNG不変、その後Yesで1ターン・檻OPEN・ALLY/FOLLOWER/leaderplayer・時計9900と鍵消費／保持を要求する。誤深度／machineは実bumpの原作鉄格子文・確認なし・0ターン・全state不変を要求する。NPCが檻を覆うので公開glyphは前後j、(Captive)→(Ally)・確認／解放文・PNGを照合する。native尿DFと自然栄養減衰を保持し、公開されない檻glyphの変化や存在しない開檻メッセージを要求しない。自然horde・鍵／machine生成・追従AI・経験値／Companionfeat・orb／portal・全配線・実機Safariは未確認。絞込は `BROGUE_CAGE_KEYS`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/cage-keys/results.json BROGUE_COMPARE_NAME=cage-keys BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。


`node tests/portal-activation.mjs` は水晶の球と祭壇の配線、同じ休眠Unicornの実起動を、有効／誤深度／誤machine／遮断器、3variant・PC/touchの24件で確認する。人工祭壇41,14・門44,14・machine7と既にALLYの休眠個体、既知orb・非一致座標20,14・19空slotだけを準備し、初期状態で鍵使用・昇格・起動・仲間化・AIを実行しない。原作native情報・HEALING/SHIELDING・gender・poop DF1%を保持する。全条件の実lは祭壇へ移動して1ターンを使う。有効側はorb消費、原作flash文、最初の確定PORTAL_LIGHT、同一個体のdormant→active・時計200を要求し、実rest後に時計100と光解除／合法残留を記録する（原作は0..10000の両端を含む乱数が10000未満のとき昇格するため、1/10001の残留があり得る）。誤鍵はorb保持、遮断器はorb消費して配線だけ停止、両者は休眠維持。祭壇・門のDUNGEONは残り、最終IS_POWEREDは0。scene限定の純読取portal観測はlive list内で同一性・native情報・3セルを記録し、既存carried観測を再利用する。発生freshと全確定state・公開Ω→Ú・実画像・PC/touch状態RNG・原作比較を確認し、自然poopは保持して有害地形は許容しない。初期ALLYなので仲間化の証拠にはしない。自然blueprint／horde／鍵生成・全legendary・追従戦闘呪文・経験値／Companionfeat・全配線・実機Safariは未確認。絞込は `BROGUE_PORTAL_ACTIVATION`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/portal-activation/results.json BROGUE_COMPARE_NAME=portal-activation BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。


`node tests/embedded-tunneling.mjs` は壁内のnative砲台4種とSentinelの掘削破壊を、可掘削／IMPREGNABLE各5条件と通常Kobold対照、3variant・PC/touchの66件で確認する。人工WALL41,14・TRACKING個体・時計10000・既知+2杖charges2/timer1000だけを準備し、native HP/flags/能力/status/20bolt/血を保持する。実a,a→h→Tabの適格性を確認後、実方向入力でcursor41,14へ揃え、Enter直前座標を記録する。開始cursorを固定の東1入力とは仮定しない。可掘削5種はFLOOR/RUBBLE化と個体消失・HAS_MONSTER解除、IMPREGNABLEは壁とHP保持、Koboldは壁だけ開いてHP7で生存を要求する。全例charge2→1/timer1000→990/1ターン・player無傷、残存個体時計9900を検査する。杖は指定セルを越えて進むので他セル全不変を要求せず、合法な追加掘削・瓦礫・視界・RNGは原作照合する。死亡HP0中間frameは許容し、発生を強制しない。Arrowの黒い元前景色は一律の明度閾値で判定せず、公開glyphと背景とのコントラスト・実画面を照合する。専用撃破文は存在しないため実zap文・glyph変化・地形・PNGを証拠にする。自然砲台machine生成・元bolt発射・全AI／合成mask効果・休眠起動・実機Safariは未確認。絞込は `BROGUE_EMBEDDED_TUNNELING`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/embedded-tunneling/results.json BROGUE_COMPARE_NAME=embedded-tunneling BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。


`node tests/turret-fire.mjs` はnative砲台4種とSentinelの壁内からの実発射を、開放射線／透明な閉鉄格子、3variant・PC/touchの60件で確認する。player40,14・HP100・def0・再生停止・空pack、WALL44,14のnative個体・TRACKING・時計1だけを準備し、元情報・速度・status・20bolt・血を保持する。負対照だけPORTCULLIS_CLOSED42,14を置き、FOV・公開可視性・stealthRange≧4・TRACKINGを初期／各fresh／確定時に確認して覚知喪失と射線拒否を混同しない。実periodキー／タッチ中央padで正例は最大40rest内の最初の命中、負例は8restの非発射を要求する。Arrowの合法missは記録するが実命中2..6の代わりにしない。Spark/Sentinel2..6、Dart1..2と弱化1・最大期間CE300/Rapid100/Bullet50・現在DまたはD−1・毒0、Flame4..14とBURNING7を要求する。Flame直後の別1restは再発射なしで燃焼1..3・7→6を検査する。時計は各rest前後から原作間隔を算出し、Sentinel実発射だけ175→350、不発175を区別する。freshの仮時計33やidleのfresh0は合法とし、全確定stateも検査する。Arrow/Sparkには過去の発射証拠があり、新規範囲は壁内発射・射線拒否・詠唱間隔である。初期鉄格子の生成／開閉、IMMOBILEやTURRETmask全体、Sentinelの仲間修復、地形着火・煙、自然machine、実機Safariは未確認。絞込は `BROGUE_TURRET_FIRE`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/turret-fire/results.json BROGUE_COMPARE_NAME=turret-fire BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。


`node tests/sentinel-repair.mjs` は壁内Sentinel同士の修復を、HP10→35／HP40→50の上限／満HP50の非発動／修復射線遮断、3variant・PC/touchの24件で確認する。player40,14HP100・def0・再生停止・空pack、caster44,14WALL/clock1/LEADER、recipient44,16WALL/clock10000/FOLLOWER→casterという純初期データだけを置き、native情報・再生0・速度・20bolt・血を保持する。player-rayは常設透明PORT42,14でSparkを除外し、遮断対照だけPORT44,15を追加する。実periodキー／中央padの正例最大40rest内の最初の修復、負例8restのHP保持を検査する。同種2体は座標で識別しleaderIndexを実caster indexと比較する。原作HEALING magnitude5の最大HP50に対する50%=25と上限、実casts healing／looks healthier文、実詠唱clock350／不発175、公開glyph・状態RNGを照合する。recipientは毎rest時計100減算で常に正・元再生0を保持し、本人AI未実行を自然回復や覚知の証明と混同しない。casterのFOV／公開可視／TRACKING／stealthRange≧4を実guardし、途中frameと確定stateは取得可能field別に検査する。治癒自体には工程19の既存証拠があり、新規範囲は無機物の同群れ修復・上限・射線拒否である。初期FOLLOWER関係は仲間加入・自然horde生成の証拠にせず、門開閉・全SentinelAI／mask・自然machine・実機Safariは未確認。絞込は `BROGUE_SENTINEL_REPAIR`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/sentinel-repair/results.json BROGUE_COMPARE_NAME=sentinel-repair BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。


`node tests/pit-bloat-throw.mjs` はnative Pit Bloatを実ダーツで倒した直後の穴生成とRatの非生成を、3variant・PC/touchの12件で確認する。純初期値はplayer40,14HP100・def0・STR12・LEV1000、安全な床42,14のnative個体・時計10000、既知+0DART10本だけ。元HP・能力・血・再生・DFを保持し、事前hit/death/DF呼出しを禁止する。両条件は最初の実restで満HPと穴なしを確認し、実t,a→Tab→方向調整→Enterを最大10投まで実行する。各投の座標・1本消費・1ターンを照合し、Rat最初の命中は非致死を要求する。Pitはdart killed文とbursts/floor-underneath-disappears文、最初の確定中心SURFACE HOLEを要求し、Ratの血・自然URINEは許容して穴を拒否する。HOLE_EDGEは同期DFの途中なのでframe0を許容・件数だけ記録し、追加coverageにしない。新規nativeDFType/Chanceはscene限定の純読取。全fresh位置・HP・階・LEV・無gasと確定MB_IS_FALLINGをguardし、死亡前のHP0/負値を合法に扱う。初期LEVは適用効果、native接触自爆・FLITS・飛行・player落下・自然生成・全DF・実機Safariの証拠にしない。Descent薬の既存hole証拠とは別の死亡接続である。絞込は `BROGUE_PIT_BLOAT_THROW`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/pit-bloat-throw/results.json BROGUE_COMPARE_NAME=pit-bloat-throw BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。

`node tests/bog-interactions.mjs` はnative Bogの追加相互作用を、湿地2セルの実移動＋自然潜伏／乾gapの拒否／泥の不可視拘束struggle／深水の可視保持者浮上、3variant・PC/touchの24件で検証する。初拘束には既存native Bogの実行証拠があり、未実行と読み替えない。fixtureSafeWorldで階段を退避し、nativeHP55・def60・accuracy5000・damage3..4・move200・attack100・regen3・FLITSとstatusを保持する。移動正負はclock1、拘束はclock3001と30実restの初期待ちだけを設定し、SUBMERGEDやSEIZINGを事前注入しない。自然潜伏と実42→41を30rest以内必須にし、乾gapは30restとpureなturnsSpentStationary増分で実AI機会を確認する。特定方向の試行まで証明したとはしない。泥はrest31の不可視初拘束後に実hを消費し、深水は可視初拘束の即浮上後に実restを送り、それぞれ実3..4締付被害と公開文を要求する。自然METHANEは許容してgas0を強制せず、未潜伏や未移動はFAIL。combatは拘束2条件、cmd.moveは泥struggleだけへ対応付け、全freshと確定state・PC/touch・原作比較を照合する。新読取はBog scene限定のstationarycounterで、共通fresh schemaを拡張しない。自然horde・全FLITS・瀕死逃走・全拘束解除・水中照明／品物・実機Safariは未確認。絞込は `BROGUE_BOG_INTERACTIONS`、原作比較は `BROGUE_FIXTURE_RESULTS=.local/feature-verification/bog-interactions/results.json BROGUE_COMPARE_NAME=bog-interactions BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。


`node tests/horde-mutations.mjs` は召喚巻物の原作生成を、閾値での現存群れ／生成変異の適用数値／8隣接壁の不発、3variant・PC/touchの18件で検証する。fixtureは人工17×17床・深度10/3/2または34/8/4・playerHP30000・初期LEV1000/FIREIMM1000・既知巻物3枚だけを用意し、NPC生成・変異・AI・effect helperをprepで呼ばず、乱数の上書き・成功選別をしない。giveによるnative初期アイテム生成の乱数消費は維持し、生成後RNGを巻き戻さない。実a,a,yを正側最大3read、空き隣接セルと既存6体以下を続行条件とし、最初の適格証拠で停止する。未到達・容量超過は診断FAILのまま保存する。pinned CE1.15.1のC initializerを純読取して現物の数値と照合し、群れは非BOUNDの現存leader/follower全体と候補行の種類・最大数を比較する。複製/power/ENTER/BOUND群を除外し、CAST_SUMMON能力だけでは除外しない。pinned召喚行の可能member種が現在の全member種と不交差であることを要求し、交差/非互換群は全群除外する。原作による再親化の可能性は残り、現存関係の候補照合だけで出生最小数・確定hordeID・分布を主張しない。変異は生存かつ非negated/非power個体のnative info速度、HP上限、戦闘値、flags/abilities、DF・blood・boltsを整数式と比較する。live速度や現HPを初期値へ固定しない。新観測はscene限定のnative速度2項目と実player中心8セルで、fresh共通形式は拡張しない。全fresh/full深度と初期LEVからの累計950以上を守り、再付与なしで環境更新50以下・初期periodic spawn未到来を示す。absolute差90未満は容量制限であり客観tick換算ではない。栄養・位置・麻痺自動進行はrawに記録し、盗難で巻物が追加減少したreadは数値cost証拠不適格として区別する。8壁の1枚消費とNPC0は厳密検査する。出現文は描画前にNPC文で流れる原作経路があるため観測有無を記録し、幻覚中を証拠不適格とし、選択座標の公開gameglyphをpinned displayGlyphと厳密照合する。種名は左20列のsidebar項目から取り、変異titleは同じ項目の種名直後の行へ対応付ける。PCはsidebarの実画面も確認する。touchのsidebar検査はC frameの論理セル照合であり、上10行に絞る既存mobile HUDでNPC名・変異titleが実viewportに見えるという証拠にはしない。touchではmap glyphの可視性と区別し、原作Tab/カーソル詳細の実touch表示は残件にする。人工深度を自然攻略とせず、未観測出生・全群れ・全8変異の実効果・実機Safariは未確認。選択 `BROGUE_HORDE_MUTATIONS`、原作比較 `BROGUE_FIXTURE_RESULTS=.local/feature-verification/horde-mutations/results.json BROGUE_COMPARE_NAME=horde-mutations BROGUE_COMPARE_DOMAINS=none node tests/compare-fixtures.mjs`。
