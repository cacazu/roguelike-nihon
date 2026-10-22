brogue-nihon
============

Brogue: Community Edition 1.15.1 の日本語表示対応版です。PC・スマートフォンのWebブラウザーで遊べます。

```powershell
# ビルド済みファイルから起動（Node.js）
.\start.ps1 -SkipBuild
# C/EmscriptenとRustのUIを再ビルドして起動
.\start.ps1
```

ブラウザーで `http://127.0.0.1:4174/` を開きます。PCのキーボード、タッチ操作、オリジナル・ドット絵・イラストの表示を選べます。スマートフォン実機への配信にはHTTPSを使います。ビルド環境は [BUILD.md](BUILD.md)、構造・入力・保存・検証は [Web実装](docs/WEB-ja.md)、画像の出典は [素材一覧](web/assets/SOURCES.md)、再配布する依存物の通知は [THIRD-PARTY.txt](web/licenses/THIRD-PARTY.txt) を参照してください。

WindowsのSDL版は `bin/brogue-nihon.cmd` で起動します。日本語化の正本は [locales/README.md](locales/README.md) です。
以下は元作品の説明です。

> *Countless adventurers before you have descended this torch-lit staircase,
> seeking the promised riches below. As you reach the bottom and step into
> the wide cavern, the doors behind you seal with a powerful magic...*
>
> ***Welcome to the Dungeons of Doom!***

*Brogue* is a single-player strategy game set in the halls of a mysterious
and randomly-generated dungeon. The objective is simple enough -- retrieve the
fabled Amulet of Yendor from the 26th level -- but the dungeon is riddled with
danger. Horrifying creatures and devious, trap-ridden terrain await. Yet it is
also riddled with weapons, potions, and artifacts of forgotten power. Survival
demands strength and cunning in equal measure as you descend, making the most
of what the dungeon gives you. You will make sacrifices, narrow escapes,
and maybe even some friends along the way -- but will you be one of the
lucky few to return alive?

- [Downloads][releases]
- [Wiki](https://brogue.fandom.com/wiki/Brogue_Wiki)
- [Forum (Reddit)](https://www.reddit.com/r/brogueforum/)
- [Roguelikes Discord](https://discord.gg/9pmFGKx) (we have a #brogue channel)
- IRC: [##brogue on Libera Chat](https://kiwiirc.com/nextclient/irc.libera.chat/##brogue)
- [Original website](https://sites.google.com/site/broguegame/)
- [Android port](https://github.com/bilgincoskun/brogue-android-port/releases)


Playing
-------

If you downloaded a [release][releases], you can open the game as follows:

### Windows

Run `brogue.exe`.

### Mac

Run the included app.

As it's an unsigned program, you may have to convince macOS to let you run it.
You can do this by right-clicking the app and choosing *Open* the first time you
run it.

### Linux

Run the `./brogue` script in the same the folder as this file.

Make sure you have SDL2 and SDL2_image installed via your package manager. The
required packages are:

- Debian/Ubuntu: `libsdl2-2.0-0 libsdl2-image-2.0-0`
- Fedora: `SDL2 SDL2_image`
- Arch: `sdl2 sdl2_image`

You can also run `./make-link-for-desktop.sh` to generate a .desktop file to
place on your desktop or applications folder.

### More information

Graphical tiles are included; press 'G' to toggle them.

For some tips on playing the game, see the original website, linked above. Also
check out the wiki -- although keep in mind CE may differ from it.

If you downloaded the source code, you will need to build the game first. For
instructions, see `BUILD.md`.

Brogue supports some command-line options; run `brogue --help` for more info.
(On Windows, if you want to see output in the command prompt, use
`brogue-cmd.bat`.)


Contributing
------------

Please see our [contribution guide][contrib] for all the ways you can help make
Brogue better!

[contrib]: https://github.com/tmewett/BrogueCE/wiki/Contribution-guide


About
-----

### What is Community Edition?

Brogue was created by Brian Walker. This version, *Brogue: Community Edition*,
is a continuation of its development. It has several main goals:

- fix bugs and crashes
- add useful quality of life and non-gameplay features
- improve the gameplay and keep it exciting
- ease development and maintenance
- be a convenient base for forks and ports to new platforms

### How is CE different from the original Brogue?

Please refer to the changelog or release history for a complete list. There is
also a wiki page: [Changes from original][cfo].

[cfo]: https://github.com/tmewett/BrogueCE/wiki/Changes-from-original

### How is the project run, and how are changes decided?

The project is run with a "benevolent dictator" model, with myself (tmewett) in
charge. There are many other testers and regular contributors; see the
contribution guide to get involved!

We always try to make changes in the same spirit as the rest of the game. Anyone
can propose a change - all discussion occurs in our GitHub issue tracker or on
our development Discord (see contributing guide). We also make sure that things are
well play-tested.


[releases]: https://github.com/tmewett/BrogueCE/releases
