# Web画像・フォントの出典

## イラスト

- ファイル: [illustrations.png](illustrations.png)
- 生成手段: OpenAI の組み込み `image_gen`。参照画像は使用していない。
- 用途: Brogue Web版のイラスト表示。既存ゲーム画像を加工したものではなく、下記の文章指定から生成した。
- 寸法: 1254×1254、RGBA、8列×8行、64セル。セル配置は [illustrations.json](illustrations.json) が正本。
- SHA-256: `f8e057e276590a0cf068c30a23c6560747e7f7c3fb6757b0083919c3bdbe9418`
- このリポジトリでの利用・再配布を目的とする新規生成素材。生成したことを理由に独占的な著作権や第三者からの保証を主張しない。原作コード・原作タイル・フォントの各ライセンスはそれぞれ保持する。

生成に使用したプロンプト:

```text
Use case: stylized-concept
Asset type: production sprite atlas for a traditional dungeon roguelike, illustration display mode.
Primary request: create ONE perfectly regular square 8 by 8 atlas with EXACTLY 64 separate hand-painted fantasy game illustrations, 1024 by 1024 pixels. Each equal cell is 128 by 128 pixels. Every icon is entirely inside its own cell with a generous clear transparent margin; its bounding box must not cross its cell. No grid lines, labels, numbers, text, watermarks or decorative outer frame.
Style: crisp small-scale painted fantasy illustration, readable silhouettes, restrained natural colors with clear highlights and depth, coherent overhead / three-quarter view. These are illustrations, not pixel art. Each cell contains one distinct object only, centered, no large scene or floor behind characters. The atlas background and the gaps are fully transparent.
Row 1 left to right: cobblestone floor patch; rough grey stone wall block; closed wooden door; open wooden doorway; staircase descending; staircase ascending; dark blue pool of water; orange lava pool.
Row 2: green grass tuft; dark tree; red mushroom; thorny vine; small orange campfire; grey boulder; iron gate; pressure plate trap.
Row 3: gold coins; leather food ration; short sword; round shield; red potion bottle; rolled parchment scroll; magic staff; golden ring.
Row 4: silver key; golden amulet; leather armor; glowing blue crystal; arrow bundle; glowing magic wand; dark pit; white web.
Row 5: human adventurer in dark cloak with short sword; grey rat; black bat with spread wings; green goblin; brown jackal; red kobold; giant brown spider; green snake.
Row 6: pale zombie; white skeleton warrior; red imp; orange fire spirit; blue frost spirit; green jelly blob; purple tentacled horror; grey ogre.
Row 7: troll; red dragon head; floating eyeball; dark wraith; stone golem; golden centaur; dark armored knight; purple lich.
Row 8: red health heart; yellow lightning spark; blue magical orb; white starburst; black smoke puff; red blood splatter; green poison cloud; small wooden treasure chest.
Constraints: EXACT 8 columns, EXACT 8 rows with equal cell sizes. Purely original generic fantasy assets; do not copy any existing game artwork, no trademarks. No text anywhere. Preserve the transparent background. All 64 cells must be occupied.
```

## ドット絵

- ファイル: [dot-tiles.png](dot-tiles.png)
- 取得元: Brogue CE 1.15.1 の `bin/assets/tiles.png` を未加工でコピー。
- 原作: <https://github.com/tmewett/BrogueCE/releases/tag/v1.15.1>
- 著作権: Brogue: Community Edition maintainers。Antony Boucher / Oryx Design Lab に基づく由来は原文のとおり。
- 採用条件: CC BY-SA 4.0。原文の出典・通知は [DOT-TILES-LICENSE.txt](DOT-TILES-LICENSE.txt)、条件全文は [配布通知](../licenses/THIRD-PARTY.txt) に収録。
- SHA-256: `40bb927cf8f1816f16720e7630e1d004974f7e780c9f137258ad017d554ec7af`
- Web版での使用はファイル自体を変更せず、描画時に個々のタイルを切り出す。

## フォント

`rogue-nihon/web/assets/fonts/` の既存素材を変更せずコピーした。上流コミット、取得URL、版、著作権、ファイルのSHA-256は [fonts/metadata.json](fonts/metadata.json) に記録する。

- [NotoSansJP.ttf](fonts/NotoSansJP.ttf): Noto Sans JP、OFL-1.1。[ライセンス原文](fonts/NotoSansJP-OFL.txt)。
- [NotoColorEmoji.ttf](fonts/NotoColorEmoji.ttf): Noto Color Emoji、OFL-1.1。[ライセンス原文](fonts/NotoColorEmoji-OFL.txt)、[AUTHORS](fonts/NotoColorEmoji-AUTHORS.txt)。

通知は既存の検証済み `rogue-nihon/licenses/THIRD-PARTY.txt` から抽出し、metadata記載の各通知SHA-256と一致する原文を保持する。
