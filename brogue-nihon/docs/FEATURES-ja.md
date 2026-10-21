# Brogue CEの機能と受け入れ基準

この文書は、Brogue: Community Edition 1.15.1のどの機能を何によって検証するかの正本とする。機能がCソースに存在すること、Rustが入力を受理すること、実ゲームで効果を観測したことを分ける。ここに挙げた機能の全実行を保証する文書ではない。C/Rustの責務と配布契約は [WEB-ja.md](WEB-ja.md)、実行コマンドは [tests/README.md](../tests/README.md) に置く。

## 比較する版と資料

- 原作リリースは [CE 1.15.1 / tag v1.15.1](https://github.com/tmewett/BrogueCE/releases/tag/v1.15.1)。同梱のRapid Brogueは1.7.1、Bullet Brogueは1.2.1で、独立した設定・表を持つ。版の正本は [Rogue.h](../src/brogue/Rogue.h)、[GlobalsBrogue.c](../src/variants/GlobalsBrogue.c)、[GlobalsRapidBrogue.c](../src/variants/GlobalsRapidBrogue.c)、[GlobalsBulletBrogue.c](../src/variants/GlobalsBulletBrogue.c)。`dungeonVersion` は生成・録画互換性の識別子で、リリース版と同じ意味ではない。
- 同梱の操作説明は [IO.c](../src/brogue/IO.c) の `printHelpScreen` と [Recordings.c](../src/brogue/Recordings.c) の `printPlaybackHelpScreen`。原作説明は [README](../README.md) の原作品節と [CHANGELOG](../CHANGELOG.md) も参照する。別ファイルの操作マニュアルは同梱されていない。
- [Commands（oldid 855399）](https://brogue.wiki/mw/index.php?title=Commands&oldid=855399) と [Combat（oldid 856261）](https://brogue.wiki/mw/index.php?title=Combat&oldid=856261) は補助資料。CE 1.15.1専用の仕様書ではない。Commandsのvariant案内はBulletを列挙しておらず、Combatにも未確認注記がある。数式、深度、効果、操作の判定は対象版Cを優先する。

ソースの参照は以下の関数・enum・テーブル名を主とする。行番号だけを機能の識別子にしない。[一覧生成器](../tests/inventory-features.mjs) は現在のソースからリポジトリルートの `.local/feature-verification/data-inventory.json` を再生成し、対象HEAD、ソースのLF正規化SHA256、全symbol・定義・テーブルを記録する。[検証表生成器](../tests/report-features.mjs) は本書の全IDと一覧を明示された実行証拠へ対応付け、同じディレクトリーの `report.json` と `report.md` へ実プレイ・自動検証・未確認を出力する。初回調査の `inventory.json` は当時のソースを示す履歴資料として区別する。派生JSONや過去の成功件数を恒久仕様へ転記しない。

## 証拠と合格の単位

| 区分 | 証明する範囲 |
|---|---|
| ソース確認 | dispatch、分岐、表の範囲、期待結果の根拠。実行成功には数えない |
| Rust単体検査 | キー変換、待ちの検証、表示設定など当該関数の契約 |
| C実行・原作比較 | 同じ初期条件と消費済み入力によるCの状態・効果・ターン・乱数の結果 |
| 通常ブラウザー操作 | productionと同じUIからキー・マウス・タッチを使った到達と画面 |
| fixtureブラウザー操作 | 専用ビルドで条件を準備した後、実入力からCの分岐・画面へ到達した結果 |
| 実機操作 | 対象端末・OS・ブラウザーで確認した範囲。画面エミュレーションとは別 |

各ケースに機能ID、variant/mode/seed、事前状態、実際に消費した入力、後続待ち、前後の公開状態・必要なC観測、期待値、結果、証拠の場所を持たせる。`pass`、`fail`、`unreached`、`not_run`、`not_applicable` を区別する。fixtureの初期値を読むだけでは、その効果の合格にならない。

表示・情報表示だけの操作は、substantive乱数、ターン、位置、HPを変えないことを比較する。行動は単純に「一キーで一ターン」としない。壁への衝突、無効品、呪い、取消、速度・攻撃回復、連続行動、階移動、強制行動を原作の分岐と照合する。成功・拒否・取消後に次の通常操作へ戻れることまで含める。

## 通常コマンド

キー値の正本は [Rogue.h](../src/brogue/Rogue.h) のKeyboard commands、dispatchは [IO.c](../src/brogue/IO.c) の `executeKeystroke`。言語切替はswitchより前の独立経路である。PCは各キー・修飾キー、タッチは同じ意図の操作部品・公開候補・盤面操作から到達できるかを別々に確認する。下表の「後続」は代表的な待ちであり、品物や状態による入れ子の確認も対象にする。

| ID | 操作・条件 | 所有者と後続 | 期待結果・ターン |
|---|---|---|---|
| cmd.move | `h j k l y u b n`、矢印、テンキー1/2/3/4/6/7/8/9 | `playerMoves` / [Movement.c](../src/brogue/Movement.c) | 8方向、斜め障害、近接攻撃、品物取得、扉・レバー・味方との接触を原作どおり処理。消費は成否による |
| cmd.run | 移動のCtrlまたはShift、大文字vi | `stripShiftFromMovementKeystroke`、`playerRuns` | 同方向へ連続移動し、原作の障害・危険・入力による停止条件で止まる |
| cmd.stairs | `<` / `>`、階段未発見・既知・到達時 | `proposeOrConfirmLocation`、`travel`、`useStairs` | 既知の階段へ移動。未到達・封印・深度端・Amulet所有を別判定。経路取消は移動しない |
| cmd.cursor | Enter | `showCursor`、`mainInputLoop`、`moveCursor` | カーソル操作へ移り、方向だけでプレイヤーは移動しない。確定・取消を区別 |
| cmd.rest | `z` / `.` / テンキー5 | `playerTurnEnded` / [Time.c](../src/brogue/Time.c) | 待機一回。HP回復・飢餓・敵・環境の時間が原作どおり進む |
| cmd.auto_rest | `Z`、負傷・悪状態・埋没・平常 | `autoRest` | 状態回復または所定回数まで休む。危険・割込み・埋没解除による停止を含む |
| cmd.search | `s` | `manualSearch` | 能動探索、連続探索強度、隠し扉・罠等の発見、ターン進行 |
| cmd.long_search | Ctrl+`s` | `executeKeystroke`内の反復、`manualSearch` | 詳細探索完了または割込みまで継続。単発探索と別ケース |
| cmd.inventory | `i` / 右クリック / 原作の持ち物ボタン | `displayInventory` / [Items.c](../src/brogue/Items.c) → 品物・説明・操作候補 | 一覧・説明だけではターンを進めない。上下選択、Shift付き情報、ページ・取消を含む |
| cmd.equip | `e` → 品物、3個目の指輪は交換対象も選択 | `equip`、`equipItem` → 品物・確認 | 武器・鎧・指輪の装備と交換。呪い・既装備・不適合・取消は成功と分ける。成功時消費 |
| cmd.unequip | `r` → 装備品 | `unequip`、`unequipItem` | 装備を外す。呪い・未装備・取消は失敗、成功時消費 |
| cmd.apply | `a` → 品物 → 効果固有の選択・対象・確認 | `apply` | 食料・薬・巻物・杖・魔法棒・護符の本来の効果。回数・残量・再充填・鑑定・拒否を確認 |
| cmd.throw | `t` → 品物 → 必要なら装備解除確認 → 対象 | `throwCommand`、`chooseTarget` | 軌道、投擲距離、命中・着地・破損・対象への効果。対象取消では投擲しない |
| cmd.rethrow | `T`、直前の投擲品が所持中 | `throwCommand(lastItemThrown, true)` | 同品と前対象の再利用。対象消失・品切れ・未投擲は別ケース |
| cmd.drop | `d` → 品物 | `drop`、`dropItem` | 足元への配置と既存品との交換。呪い・置けない地形・取消を分け、成功時消費 |
| cmd.call | `c` → 品物 → 種類名または個別銘 → 文字 | `call`、`inscribeItem` | 未鑑定種類の呼称と個別銘を区別。文字編集・空名・取消・保存再生。ターン非消費 |
| cmd.relabel | `R` → 品物 → 新しい英字 | `relabel` | `a-z`の付替え、使用済み文字との交換、大文字入力・同字・取消。ターン非消費 |
| cmd.swap | `w`、有効な直前装備交換がある | `swapLastEquipment` | 直前の装備を戻す。履歴なし・品の離脱・呪いは拒否、成功時消費 |
| cmd.colors | `\` | `executeKeystroke` → 再描画 | 色効果の有効・無効を切り替える。行動・乱数非消費 |
| cmd.stealth | `]` | `executeKeystroke` → 再描画 | ステルス範囲表示を切り替える。敵の実際の認知を変更しない |
| cmd.explore | `x` | `exploreKey` / [IO.c](../src/brogue/IO.c)、`explore` / [Movement.c](../src/brogue/Movement.c) | 自動探索・既知の危険・未踏領域・品物・停止を原作どおり処理 |
| cmd.fast_explore | Ctrl+`x` | 同上、fast-forward引数 | 同じゲーム行動列を高速表示。単発探索と速度・停止条件を比較 |
| cmd.autopilot | `A` → 確認 | `autoPlayLevel` | 戦闘を含む自動行動。確認取消、低HP、危険、途中入力を確認 |
| cmd.fast_autopilot | Ctrl+`A` → 確認 | 同上、fast-forward引数 | 高速実行しても同じ条件で停止。危険を無視する別ルールにしない |
| cmd.messages | `M` / メッセージ領域クリック | `displayMessageArchive`、`scrollMessageArchive` | 履歴表示、上下・ページ送り、閉じる。履歴不足で開かない経路も確認 |
| cmd.help | `?` | `printHelpScreen` → acknowledgment | 通常用の操作一覧を表示して復帰。録画中のhelpとは別 |
| cmd.feats | `F` | `displayFeatsScreen` | 未達・達成・失敗のfeatをvariantの表に従って表示 |
| cmd.discoveries | `D` | `printDiscoveriesScreen` | 鑑定済み・未鑑定・出現確率・魔力情報。未獲得の個別品の正体を漏らさない |
| cmd.wizard_create | `C`、Wizard modeだけ | `dialogCreateItemOrMonster` / [Wizard.c](../src/brogue/Wizard.c) | 原作の品物・怪物生成メニュー。通常modeで生成しない。検証fixtureとは別機能 |
| cmd.save | `S` → 確認 → ファイル名 → 上書き確認 → acknowledgment | `saveGame` / [Recordings.c](../src/brogue/Recordings.c) | 保存してタイトルへ戻る。取消・同名拒否・禁止文字・長さ制限・新instance復元後の次操作 |
| cmd.new | `N`（原作の移動キーと衝突） | `stripShiftFromMovementKeystroke` → `DOWNRIGHT_KEY`、未到達の `NEW_GAME_KEY` case | CE 1.15.1はswitch前にNをnへ変換し、物理Nは南東移動／走行として処理される。`NEW_GAME_KEY` 内の50ターン未満／以降の再開始分岐には届かない。この原作制約を保持し、新規開始はタイトルから行う |
| cmd.quit | `Q` → 確認 → 終了処理 | `gameOver` / [RogueMain.c](../src/brogue/RogueMain.c) | 放棄・記録・スコア・タイトル復帰。No・取消は元ゲームへ戻る |
| cmd.graphics | `G`、原作は`hasGraphics`時 | `setGraphicsMode`、Web表示側 | 原作のtext/tiles/hybridとWebの3表示を区別。下記の環境適応契約で検証 |
| cmd.seed | `~`、Wizardでは診断表示も追加 | `printSeed`、`displayLoops/ChokeMap/Machines/Waypoints` | seed・ターン・mode・version表示。Wizardの追加画面も送り・復帰できる |
| cmd.easy | `&`、通常／既にEasy／Wizard | `enableEasyMode` / [RogueMain.c](../src/brogue/RogueMain.c) | 確認と不可逆なmode変更、原作の能力・得点条件。拒否・再指定を含む |
| cmd.screenshot | `,` / PrtSc | `takeScreenshot`、プラットフォームcallback | 描画画面の取得。未対応callbackによる無動作を成功と数えない |
| cmd.language | F2（日本語化固有） | switch前の`LANGUAGE_KEY`処理 | 英日表示だけを変更。ターン・乱数・recording入力を変更しない |

## 盤面、後続選択、メニュー

| ID | 操作と正本 | 受け入れ条件 |
|---|---|---|
| cursor.inspect | `mainInputLoop/refreshSideBar` / [IO.c](../src/brogue/IO.c)、`moveCursor` / [Items.c](../src/brogue/Items.c) | マウス移動、Enterカーソル、8方向、Shiftによる移動幅、Tab/Shift+Tabの前後候補、敵・品物・地形の説明、Space/Esc解除。公開された対象だけを説明する |
| cursor.travel | `mainInputLoop`、`executeMouseClick`、`travel/travelRoute` | 近傍クリックの一歩・攻撃・レバー、遠方経路、Ctrlクリック一歩、階段、未探索・通行不能・危険確認、途中割込みを分ける。確認だけで移動しない |
| target.select | `chooseTarget` / [Items.c](../src/brogue/Items.c)、`moveCursor` | 8方向・矢印・テンキー・大文字vi・Tab/Shift+Tab・Enter・クリック・右クリック取消・Esc。視認不能対象の漏出を防ぎ、取消後の次commandまで確認 |
| item.inspect_action | `displayInventory`、`printCarriedItemDetails` | 通常一覧、コマンドからの対象一覧、eligible品の濃淡、上下選択、Shift情報、個別説明からapply/equip/remove/throw/drop/call等へ進む経路を区別 |
| menu.actions | `initializeMenuButtons`、`actionMenu` / [IO.c](../src/brogue/IO.c) | 底部の自動探索・休憩・探索・Actions・持ち物の操作と、Actions内の表示・mode・保存・放棄。録画中は内容・有効性が変わる |
| menu.title | `initializeMainMenuButtons`、`titleMenu` / [MainMenu.c](../src/brogue/MainMenu.c) | New Game(n/N)、Play(p/P)、View(v/V)、Quit(q/Q)、F2。PC・縦長・横長で到達可能 |
| menu.play | `initializeFlyoutMenu` | seed指定(s/S)、保存読込(l/L)、variant(a/A)、mode(m/M)。flyoutを閉じる・再選択・取消も対象 |
| menu.variants | `chooseGameVariant` | Brogue(b/B)、Rapid(r/R)、Bullet(l/L)。表示名だけでなく次ゲームの設定・表が切り替わる |
| menu.modes | `chooseGameMode` | Normal(n/N)、Easy(e/E)、Wizard(w/W)。効果・得点・記録上のmodeも一致 |
| menu.view | `initializeFlyoutMenu` | 録画(r/R)、high scores(h/H)、game stats(g/G)と復帰 |
| menu.file_pages | `dialogChooseFile` | 対象suffixによるフィルター、日付順、`a-z/A-Z`選択、上下・テンキー・PgUp/PgDn・画面ボタン、一覧なし、長名、複数ページ、取消 |
| text.edit | `getInputTextString` / [IO.c](../src/brogue/IO.c) | normal・filename・numbersの各文字範囲、既定値、削除、上限、Enter、Esc、ファイル名禁止文字。日本語を表示できることと原作ASCII入力制限を混同しない |
| dialog.ack_confirm | `waitForAcknowledgment`、`waitForKeystrokeOrMouseClick`、`confirm`、`buttonInputLoop` | Space/Esc/クリック必須のack、任意キーのack、Yes/No確認を別扱い。別種のキーを勝手にYesへ変換しない |

## 録画・保存と履歴

[Recordings.c](../src/brogue/Recordings.c) の `executePlaybackInput` は通常commandの別名ではなく専用dispatchである。

| ID | 録画中の操作・正本 | 期待結果 |
|---|---|---|
| replay.pause_speed | Space、Esc、`k`/↑、`j`/↓、画面操作 | 一時停止・再開・速度上下限。OOS時の停止を解除成功と扱わない |
| replay.seek_turn | `h`/←、`l`/→、Shift、Ctrl、数字入力 | 前後1ターン、Shiftで5倍、Ctrlで20倍（両方なら両倍率）、任意ターン、先頭・末尾、巻戻し確認 |
| replay.seek_depth | `<` / `>` | 前後階層、先頭、最深到達階。巻戻しは再初期化・再実行であり任意の状態スナップショットではない |
| replay.omniscience | Tab | 録画観賞だけの全知表示。通常ゲームの可視性へ流用しない |
| replay.inspect | `i`、右クリック、`D`、`F`、`M`、`?`、`~`、公開対象のマウス操作 | 観賞中の持ち物・知識・feat・履歴・専用help・seed表示と復帰。観賞の通常待ちでは原作 `executePlaybackInput` にEnterのcaseがなく、`mainInputLoop` もEnterから `showCursor` を呼ばない。Enter単独のカーソル検査開始を合格条件や有効なタッチ候補にしない |
| replay.switch_file | `V` / `O` / `Q`、到達しない原作case `N` | 別録画、保存からの通常再開、タイトルへ終了。それぞれの確認・取消・ファイルなしを含む。CE 1.15.1の `executePlaybackInput` はswitch前に `stripShiftFromMovementKeystroke` を通すため、大文字Nは移動用の小文字nになり `NEW_GAME_KEY` caseへ届かない。この原作制約を保持し、新ゲームはタイトルへ戻って開始する |
| replay.display | `\`、`]`、`G` | 観賞設定だけを変え、記録入力列・実際のゲーム結果を変更しない |
| replay.takeover | `P`、`ENABLE_PLAYBACK_SWITCH`ビルドだけ | 健全な途中録画から再開。通常productionで有効化していない機能は対象外として記録 |
| replay.integrity | `RNGCheck`、`OOSCheck`、`playbackPanic` | 同版・同variant・同seed・同消費入力で結果一致。不正／不適合／途中切断録画の拒否・OOS表示・安全な復帰 |
| save.resume | `saveGame/saveGameNoPrompt/loadSavedGame/switchToPlaying` | 原作のseed＋消費入力方式を保持。新instance、入力後の次結果、loaded印、読込済み保存の削除条件、録画継続を確認 |
| save.finish_recording | `saveRecording/saveRecordingNoPrompt` | 死亡・放棄・勝利後の命名、上書き、取消時のLastRecording保存、再観賞 |
| history.scores | `saveHighScore` / [platformdependent.c](../src/platform/platformdependent.c)、`printHighScores` / [IO.c](../src/brogue/IO.c) | 得点・説明・mode・上位件数・新しいスコアの強調、永続化、空一覧、復帰 |
| history.stats | `saveRunHistory/saveResetRun`、`viewGameStats` / [MainMenu.c](../src/brogue/MainMenu.c) | 勝利・mastery・深度・累積・連勝・リセットを原作の集計対象modeに従って保存・表示 |

## ゲーム内容の全定義を対象にする

列挙の正本は [Rogue.h](../src/brogue/Rogue.h) のenumと、[Globals.c](../src/brogue/Globals.c) および各variantのテーブル。sentinel、予約0、bitmask alias、説明配列の未初期化枠を実機能数へ重複加算しない。enumの存在だけで、全variantがその種類を生成するとは判定しない。JSONの全symbol一覧はこの区別を保持する。

| ID・定義群 | 正本・所有者 | 全種について必要な受け入れ |
|---|---|---|
| items.food_weapon_armor | `foodKind/weaponKind/armorKind`、共通`foodTable/weaponTable/armorTable` | 食料・武器・鎧の全kind。取得・表示・適用／装備・数量・強度不足／余剰・呪い・保護・燃焼／腐食・特殊攻撃形状 |
| items.potions_scrolls | `potionKind/scrollKind`、variantの`potionTable/scrollTable`、`apply` | 各種類の使用・対象・抵抗・鑑定・同種呼称・在庫変化。投げた場合・無効時・取消時は別branch |
| items.staff_wand_charm | `staffKind/wandKind/charmKind`、`staffTable`とvariant表、`boltCatalog` | 各kindの射程・軌道・反射・障害・味方／敵／自分への適否、チャージ／再充填／強化、照準取消、安全確認 |
| items.rings_keys_treasure | `ringKind/keyKind`、`ringTable/keyTable`、`AMULET/GEM/GOLD` | 全指輪の効果と装備枠、鍵のoriginDepth／位置／machine対応、金貨自動取得、Amulet・lumenstoneの勝利／得点条件 |
| items.runics | `weaponEnchants/armorEnchants`、`weaponRunicNames/armorRunicNames`、`applyArmorRunicEffect`、戦闘処理 | 全runicの発動／不発・敵種特効・反射・耐性・悪性効果・鑑定。装備にflagが付いたことだけで合格にしない |
| items.knowledge | `tableForItemCategory`、`identify/autoIdentify`、`printDiscoveriesScreen` | 各カテゴリの鑑定・未鑑定外見・使用回数・runic知識・祝呪・呼称・銘。表示やatlas選択で隠れた正体を漏らさない |
| terrain.tiles | `tileType/tileCatalog`、`applyInstantTileEffectsToCreature` / [Time.c](../src/brogue/Time.c) | 全tileの通行・視界・足元・液体／気体／surface層、発見・踏入・時間・燃焼・爆発・溶解・凍結・電気・罠・落下の該当flag効果 |
| terrain.features | `dungeonFeatureTypes/dungeonFeatureCatalog`、`spawnDungeonFeature` | 全DFの生成・伝播・対象層・副作用。予約0とnamed DFを区別 |
| terrain.machines | `machineTypes`、variantの`blueprintCatalog/autogeneratorCatalog`、[Architect.c](../src/brogue/Architect.c) | 各machineの生成可能条件、鍵・レバー・祭壇・檻・橋・報酬・起動／遷移。生成済みの外観だけで連動完了としない |
| terrain.levels_visibility | `dungeonProfileTypes`、`startLevel`、`updateFieldOfViewDisplay` / [Movement.c](../src/brogue/Movement.c) | 部屋・洞窟・湖・接続・階段・複数階往復、記憶地形・光・遮蔽・透明視・遠隔感知・水中状態 |
| statuses | `statusEffects`、`statusEffectCatalog`、`decrementMonsterStatus`、`playerTurnEnded` | 全statusの付与・重複／上限・持続・減衰／解除・耐性・HP／視界／行動への効果。`STATUS_AGGRAVATING`等、説明表の空枠を通常説明と同一視しない |
| ai.monsters | `monsterTypes/monsterCatalog`、[Monsters.c](../src/brogue/Monsters.c) | 全怪物の表示・生成・行動、睡眠・徘徊・追跡・逃走・味方、視聴覚・臭跡・経路・特殊移動・回復・寿命 |
| ai.flags_bolts | `monsterBehaviorFlags/monsterAbilityFlags`、variantの`boltCatalog`、`monstersTurn/updateMonsterState` | 全原子flagと全boltの効果。合成maskは原子と分離。召喚・分裂・盗み・毒・拘束・投射・反射・耐性・味方支援を該当種で観測 |
| ai.groups_mutations | variantの`hordeCatalog`、共通`monsterClassCatalog/mutationCatalog` | 群れ・リーダー・従属・捕虜・味方加入・変異・死亡／復活。各variantで定義された行を対象にする |
| combat | `attack/attackHit/inflictDamage` / [Combat.c](../src/brogue/Combat.c)、`playerRecoversFromAttacking` | 命中・防御・ダメージ、速度・haste/slow、奇襲・lunge・多方向／貫通攻撃、吸収・再生・鎧／武器runic・腐食・免疫・死亡。Wikiの数値だけで期待値を固定しない |
| turn.environment | `playerTurnEnded/updateEnvironment` / [Time.c](../src/brogue/Time.c) | プレイヤー行動と敵・環境の時間、飢餓・探索・回復・気体／火・落下・水中・照明の連動 |
| feats | variantの`featTable`、`displayFeatsScreen` | 各featの未達・達成・失敗・維持と終了画面の一覧。説明と閾値は原作の別フィールドとして比較し、独断で修正しない |

## 勝敗、mode、variant

終了の正本は [Movement.c](../src/brogue/Movement.c) の `useStairs` と [RogueMain.c](../src/brogue/RogueMain.c) の `gameOver/victory/enableEasyMode`。

| ID | 条件 | 期待結果 |
|---|---|---|
| ending.death | 致死攻撃・状態・地形など | HP0、死亡原因・持ち物確認、記録保存、スコア／履歴、タイトルへ復帰。死因ごとのbranchと二重終了防止も対象 |
| ending.quit | 通常ゲームQでYes | 放棄として記録。通常死亡や勝利とは区別し、取消なら継続 |
| ending.escape | Amulet所持でdepth1から上る | depth0へ脱出し、通常勝利の複数画面・所持品評価・feat・録画・スコアまで完了 |
| ending.mastery | Amulet所持で最深階の下り出口を使う | transcended/masteredの別終了、Amulet評価・lumenstoneを含む集計、記録・復帰 |
| ending.sealed | Amuletなしでdepth1の上り／最深出口 | 原作の封印メッセージ。勝利扱いにせずゲーム継続 |
| mode.normal | Normal | 原作の通常ルールと集計条件 |
| mode.easy | 開始時Easyまたはゲーム中`&` | 確認・不可逆切替、強さ・得点の原作条件を比較。CE 1.15.1のmode修正を過去版の挙動に戻さない |
| mode.wizard | 開始時Wizard | 不死・生成C・即時移動／階移動・診断表示。元の通常ルールの証拠や通常勝利の攻略に使わない |
| variant.brogue | CEの`gameConst` | Amulet26階、最深40階。CEの各表・成長／生成設定を使う |
| variant.rapid | Rapidの`gameConst` | Amulet6階、最深10階。通常版の階数や表の値を流用しない |
| variant.bullet | Bulletの`gameConst` | Amulet3階、最深5階。Bullet固有machine等も対象 |

Amulet取得・目的階到達・終了ウインドウの最初の一枚だけを勝利の証拠にしない。通常プレイでの到達と、fixtureで終了条件を準備して終端処理を確認したことは区分する。

## 環境固有の適応と条件付き機能

| 機能 | 原作の入口 | Webでの受け入れ方針 |
|---|---|---|
| 画像表示 | `hasGraphics/setGraphicsMode`、text/tiles/hybrid | Webは依頼されたオリジナル・ドット絵・イラストを提供する。Gと画面の表示選択を同じWeb表示処理へ接続し、Cターン・乱数を変えない。原作hybridをイラストと同一視しない |
| screenshot | `takeScreenshot`、PrtScを`,`へ変換 / [sdl2-platform.c](../src/platform/sdl2-platform.c) | Rustの実Canvas画像取得・ダウンロードまで確認する。callback未接続や空画像を合格にしない。OSがPrtScを奪う場合は実行できた入口を明記 |
| 拡縮・サイズ | SDL resize、PgUp/PgDn、`+`/`=`/`-` | Webの倍率選択・画面サイズ変更の機能で検証する。ゲーム文字入力・ファイル一覧ページ送りとの衝突を防ぐ |
| fullscreen | SDL F11/F12/Alt+Enter、`resizeWindow` | ブラウザーの全画面API・通常画面復帰、未許可時の扱い、画面内操作からの到達を確認。ブラウザー自身のF11とアプリ実装の成功は区別 |
| 入力置換 | `loadKeymap`、SDLの`remap/applyRemaps` | Web入力設定と原作keymapの適用範囲を明示し、未接続のkeymap読込を機能対応と数えない |
| アプリを閉じる | SDL_QUIT→`quitImmediately` | SDLの終了時自動保存と、Webのpagehideで既存ファイルを保存する処理は同じではない。未保存の行動から再開できるかを実観測し、明示保存Sと区分 |
| OS／CLI | `main.c` の引数、SDL専用flags、curses | `--language/-s/-o/-v/-vn/--variant/--wizard/--scores/--print-seed-catalog`等のC入口とWeb UI／URLの公開範囲を分ける。`--size/-G/-H/-F/--no-gpu/--term`は該当backendの条件付き機能 |
| 録画から操作 | `ENABLE_PLAYBACK_SWITCH` | macroの有無をビルド情報と照合。通常ビルドで無効なら未検証ではなく当該構成の対象外 |
| 開発用可視化 | `AUDIT_RNG/LOG_LIGHTS/SCREEN_UPDATE_BENCHMARK`、D_*定義 | enabled構成だけを別検査。Wizardのruntime機能と開発時macroを混同しない |

## 原作比較とfixtureの境界

原作比較は、版とソース識別情報を固定した同じ原作Cから比較用native・Webを作り、同seed・同初期条件・同消費済み入力を与える。位置・HP・ターン・substantive RNGの消費回数だけでなく、対象の品物／状態／地形／敵の変化、次の入力による結果、録画のRNGチェックを比較する。消費回数だけを観測した比較を内部RNG状態の完全一致とは記載しない。CSV seed catalogは生成物の比較であり、戦闘・AI・全コマンドの原作一致を証明しない。

難到達のfixtureは通常配布と別の検証ビルドだけに置く。scenario IDと注入条件を記録し、注入後は実キー／タッチから原作関数へ進める。原作と比較する場合は両方へ同じfixtureを適用する。保存はseedと入力を再生するため、直接注入した状態を通常保存で再現できると仮定しない。再生初期化への同fixture再適用が必要な検査は、通常の保存互換性検査と分ける。fixtureを選べるURL・状態変更exportをproductionへ含めない。

Staff／Wandの種類別検査は、CEの有効な12種／9種とenumの境界定義を分ける。`useStaffOrWand`の空判定は品物instanceの`ITEM_IDENTIFIED`に依存し、種類全体の既知状態とは別である。既知の空は照準前に無消費で拒否し、未鑑定の空は照準確定後の不発で1ターン進む。照準取消はターン・実質乱数消費数・チャージ・発射回数を変えない。`forbiddenMonsterFlags`による自動照準候補の除外を、手動照準した効果の免疫と同一視しない。

効果の期待値は説明文より実行経路を優先する。例えばCEの減速Wandは実行時50ターン、強化Wandは最大HPを12増やす。状態の設定値と次の入力待ちまでの通常減衰を分け、`maxStatus`・途中観測・対照操作を用いる。反射は反射先の実効果まで確認し、距離のある対象の手前で止まるBlinking／Obstruction／Conjurationと、返った光線が自分に当たる場合を区別する。種類の判明やチャージ減少だけで個別効果を合格にしない。

`maxStatus`の意味も効果ごとに確認する。`addPoison`は持続を加算する一方、`maxStatus`には最大HPを毒の濃度で割った値を設定するため、持続の設定値とは一致しない。自然経過の対照は同じ物理状態・実質乱数消費数から実際の1回の待機入力を与え、通常の毒・燃焼・減衰を消費品の直接効果と区別する。初期配置には階段座標と地形の整合を含め、原作の自動昇降や生物退避が別の効果検査へ混入しないようにする。

実行入口と結果の読取り方は [tests/README.md](../tests/README.md) に集約する。既存の [browser.mjs](../tests/browser.mjs) は基本UI・保存・表示の検査、[artifacts.test.mjs](../tests/artifacts.test.mjs) は生成物・出典・通知の検査であり、それだけをゲーム内容の全種実行へ広げて報告しない。

呼称と偉業の代表分岐は [knowledge-feats.mjs](../tests/knowledge-feats.mjs) で検査する。未知の種類の呼称と個別品の銘を分け、空名による解除・文字入力取消・対象品の他属性と別品への非干渉を確認する。偉業の初期空白は初期述語の維持であり、達成の証拠ではない。Pure Mageは武器装備だけでは失敗せず、可視敵への武器攻撃の到達で命中前に失敗する。Pure Warriorは杖の照準取消では維持され、確定した使用で失敗する。Fの公開マーカー、表示の非消費と後続操作を検査し、他の偉業・variant・最終勝利への維持は未確認として残す。
