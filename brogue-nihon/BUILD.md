# Web版のビルド

`brogue-nihon/` で実行します。Emscripten SDK、Rust 1.98以上、`wasm32-unknown-unknown` ターゲット、Node.js、Cargo.lockに記録された版のwasm-bindgen-cliが必要です。Cargo依存は事前に取得し、ビルド時は `--offline --locked` を使います。SDLはWeb版へリンクしません。

```powershell
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
.\build-web.ps1
.\start.ps1 -SkipBuild
```

SDKの既定はユーザーホームの `emsdk/` です。別のSDKは `-SdkRoot <path>` または `EMSDK`、wasm-bindgen-cliの実行ファイルは `BROGUE_WASM_BINDGEN` で指定します。SDKに同梱されたPythonを使います。

`build-web.ps1` は原作CをEmscripten/Asyncifyでコンパイルし、作品固有Rustとルートの `roguelike-common` をWasmへビルドします。生成先は `build/game.js`・`game.wasm`・`browser-ui.js`・`browser-ui.wasm` と `build-manifest.json`。各段階が成功し、ハッシュを取得してから配布用ファイルへ反映します。sourceハッシュはテキストの改行をLFへ統一し、出力ハッシュは配布バイト列そのものを使います。通常ビルドはRustを省略しません。

検証専用の `-Check -SkipRust` は、通常版を上書きせず `game-check.js`・`game-check.wasm` を生成します。検証手順は [tests/README.md](tests/README.md) を参照してください。

再配布する静的ファイルは `web/` と上記productionの `build/` です。`web/licenses/` と `web/assets/` の通知・出典を含め、対応ソースを提供します。SDK・`.local/`・検証用モジュールは配布しません。通知の再収集には通常ビルドが生成する `.local/web-build/game.map` を使い、`python tools/collect-web-licenses.py --sdk-root <SDK>`、続けて `--check` を実行します。

# 日本語対応版のWindowsビルド

Python 3とVisual StudioのC/C++ビルドツールを使用します。`brogue-nihon/` から実行します。

```text
python tools/setup-windows-deps.py
python tools/build-windows.py
bin\brogue-nihon.cmd
```

依存ライブラリは固定バージョンのSDL2、SDL2_image、SDL2_ttfです。配布元の
VC開発パッケージを取得し、SHA-256を検証して `.deps/` に展開します。
ビルドスクリプトは日本語JSONからCの辞書を生成し、実行ファイルとDLLを `bin/` に作ります。
コンパイラ設定は `BROGUE_VCVARS` で `vcvars64.bat` の絶対パスを指定できます。
未指定時はVisual Studio Installerのvswhereでインストールを検索します。

コード検証は `python tools/build-windows.py --probe`、`python tools/verify-locale-catalogs.py`、
`python tools/generate-locale-audit.py`、`python tools/verify-generated-text.py --from-game` です。
全アイテム・全モンスターの説明文と全表示用原文を検査します。詳細は [locales/README.md](locales/README.md) にあります。
従来のSDLビルドでも `SDL2_ttf` が追加で必要です。

Building Brogue CE
==================

You need these things at minimum to compile the game:

- a C compiler (Clang or GCC)
- Make
- diffutils (cmp)

You will also need additional dependencies based on the build options you select.
You can see the options and their requirements in `config.mk`. You can configure
the build by editing `config.mk` or appending options to the Make command,
e.g. `make TERMINAL=YES`.

More specific instructions follow on how to acquire the dependencies and
build the game.


Windows
-------

There are many ways to compile software on Windows. The method here was
tested by the author and is relatively simple.

### Setting up

1. Install [MSYS2][1] for x86_64. Refer to the website for essential info
on how to use it.

2. (Installing the dependencies) Open the MSYS2 shell and run the following:

    ```
    pacman -S make diffutils mingw-w64-x86_64-{gcc,SDL2,SDL2_image}
    ```

### Building

1. (Compiling the game) Open the Mingw64 shell. Navigate to the Brogue CE
directory (the one containing this file; your Windows drives can be accessed
at `/c`, `/d` etc.) and run

    ```
    make SYSTEM=WINDOWS bin/brogue.exe
    ```

2. Optional: You can now run the game by running `cd bin; ./brogue.exe`.
However if you want to be able to run it from outside the Mingw64 shell,
you'll need to add the `/mingw64/bin` directory of MSYS2 to your system
PATH. By default this is at `C:\msys2\mingw64\bin`. Some info is here:
[How do I set or change the PATH system variable?][3] You only need to
perform this step once.


Mac
---

These instructions are intended for developers and testers, as this will
not create an App. You will have to run the game with the `./brogue` script,
just like for the Linux version.

### Setting up

1. Install the [Homebrew package manager][4].

2. Install the dependencies:

    ```
    brew install sdl2 sdl2_image
    ```

### Building

1. Navigate to the Brogue CE directory (the one containing this file) and run:

    ```
    make bin/brogue
    ```

### App distribution

The above steps will suffice for single-user testing, but to create an app
bundle instead of a loose binary:

1.  (`make clean` if necessary)
1.  `make GRAPHICS=YES MAC_APP=YES Brogue.app`
1.  Rename to "Brogue CE.app"

To distribute this app you will have to bundle the dylib libraries, e.g. with
[dylibbundler][]. See our GitHub Actions workflow for more details.

[dylibbundler]: https://github.com/auriamg/macdylibbundler


Linux
-----

These instructions are for the graphical version only.

### Setting up

1. Install the dependencies; for example, on Debian/Ubuntu, run

    ```
    sudo apt install make gcc diffutils libsdl2-2.0-0 libsdl2-dev libsdl2-image-2.0-0 libsdl2-image-dev
    ```

### Building

1. Navigate to where this file is and run

    ```
    make bin/brogue
    ```


[1]: https://www.msys2.org/
[3]: https://www.java.com/en/download/help/path.xml
[4]: https://brew.sh/
