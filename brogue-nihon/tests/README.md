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
