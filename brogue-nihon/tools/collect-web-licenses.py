"""Collect the Brogue Web runtime and asset notices for its actual Cargo build graph."""
import argparse
import hashlib
from html import unescape
import json
import os
from pathlib import Path
import re
import subprocess
import tomllib
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [("brogue-browser-ui", "wasm32-unknown-unknown")]
C_TARGET = "wasm32-unknown-emscripten"
MIT_CHOICES = {"MIT", "MIT OR Apache-2.0", "Apache-2.0 OR MIT", "MIT/Apache-2.0",
               "Unlicense OR MIT", "Zlib OR Apache-2.0 OR MIT",
               "MIT OR Apache-2.0 OR Zlib", "Zlib OR MIT OR Apache-2.0",
               "MIT OR Zlib OR Apache-2.0", "0BSD OR MIT OR Apache-2.0",
               "(MIT OR Apache-2.0) AND Unicode-3.0"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(*args, cwd=ROOT, env=None):
    return subprocess.check_output(args, cwd=cwd, env=env, text=True, encoding="utf-8")


def graph(manifest, package, target, cwd=ROOT, features=None, env=None):
    args = ["cargo", "tree", "--offline", "--locked", "--manifest-path", str(manifest),
            "-p", package, "--target", target, "--edges", "normal,build", "--prefix", "none",
            "--format", "{p}"]
    if features:
        args += ["--features", features]
    return {(m[1], m[2]) for line in run(*args, cwd=cwd, env=env).splitlines()
            if (m := re.match(r"^(\S+) v(\S+)", line))}


def license_files(directory, declared):
    files = sorted(p for p in directory.iterdir() if p.is_file()
                   and re.match(r"^(LICEN[CS]E|COPYING|COPYRIGHT|NOTICE|AUTHORS)", p.name, re.I))
    chosen = declared
    if declared in MIT_CHOICES and any("MIT" in p.name.upper() for p in files):
        # Only alternate license texts are removed. Copyright and supplementary notices remain.
        files = [p for p in files if not any(x in p.name.upper() for x in ("APACHE", "ZLIB", "UNLICENSE", "0BSD"))
                 and not (p.name == "COPYING" and declared == "Unlicense OR MIT")]
        chosen = "MIT AND Unicode-3.0" if "AND Unicode-3.0" in declared else "MIT"
    if not files:
        raise ValueError(f"No license text for {directory.name}; acquire notices at the exact source revision")
    return chosen, files


def source_header(path, *, canonical_lf=False):
    """Preserve notices; canonicalize only repository-owned source text on request."""
    data = path.read_bytes()
    if canonical_lf:
        data = data.replace(b"\r\n", b"\n")
    offset, comments = 0, []
    while match := re.match(rb"\s*(/\*.*?\*/|(?://[^\n]*(?:\n|$))+)", data[offset:], re.S):
        offset += match.end()
        if re.search(rb"copyright|SPDX-License-Identifier", match[1], re.I):
            comments.append(match[1])
    return b"\n".join(comments) + b"\n" if comments else None


def linked_musl_notices(emscripten, link_map):
    """Use the C build's actual archive members, rather than all musl architectures."""
    text = link_map.read_text(encoding="utf-8")
    objects = set(re.findall(r"\blibc(?:-[^()]*)?\.a\(([^()/]+)\)", text))
    if not objects:
        raise ValueError(f"No Emscripten libc inputs in link map: {link_map}; build the Web game first")
    source = emscripten / "system/lib/libc/musl/src"
    notices = []
    # The wasm target uses the generic sources directly in each category. Nested
    # arm/x86/etc implementations are intentionally excluded.
    for path in sorted(source.glob("*/*.c")):
        if path.stem + ".o" in objects and (header := source_header(path)):
            notices.append((path.relative_to(emscripten).as_posix() + ":header", header))
    extra_objects = set(re.findall(r"\b(?:libdlmalloc|libstubs)(?:-[^()]*)?\.a\(([^()/]+)\)", text))
    runtime_headers = []
    for path in sorted((emscripten / "system/lib/libc").glob("*.c")):
        if path.stem + ".o" in objects | extra_objects and (header := source_header(path)):
            runtime_headers.append((path.relative_to(emscripten).as_posix() + ":header", header))
    return notices, runtime_headers, sorted(objects), sorted(extra_objects)


def std_attribution(sysroot):
    """Retain in-tree notices; stop if a new exception needs target/license review."""
    document = (sysroot / "share/doc/rust/COPYRIGHT-library.html").read_text(encoding="utf-8")
    in_tree = document.split('<h2 id="in-tree-files">', 1)[1].split('<h2 id="out-of-tree-dependencies">', 1)[0]
    included = {".", "library/core/src/unicode", "mod.rs", "library/backtrace", "library/std/src/sync/mpmc"}
    excluded = {"library/std/src/sys/sync/mutex/fuchsia.rs"}
    current, result = None, []
    for paragraph in re.findall(r"<p>(.*?)</p>", in_tree, re.S):
        value = " ".join(unescape(re.sub(r"<[^>]*>", "", paragraph)).split())
        if value.startswith("File/Directory: "):
            current = value.removeprefix("File/Directory: ")
            if current not in included | excluded:
                raise ValueError(f"Review new Rust in-tree license exception: {current}")
        elif current in included:
            if value.startswith("License: ") and value not in {"License: Apache-2.0 OR MIT", "License: Unicode-3.0"}:
                raise ValueError(f"Review Rust in-tree license: {current}: {value}")
            if value.startswith("Copyright: "):
                result.append(f"{current}: {value}")
    if not result:
        raise ValueError("Rust standard-library copyright metadata missing")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk-root", type=Path, default=Path(os.environ.get('EMSDK', Path.home() / 'emsdk')))
    parser.add_argument("--link-map", type=Path, default=ROOT / ".local/web-build/game.map",
                        help="Production C link map emitted by build-web.ps1")
    parser.add_argument("--check", action="store_true", help="Compare regenerated files without writing")
    args = parser.parse_args()
    destination = ROOT / "web/licenses"
    previous = json.loads((destination / "manifest.json").read_text(encoding="utf-8-sig"))
    components, bodies = [], {}

    def add(name, origin, declared, chosen, targets, notices, source_urls, attribution=None):
        record = dict(component=name, origin=origin, declared_license=declared,
                      selected_license=chosen, targets=sorted(targets), source_urls=source_urls, notices=[])
        if attribution:
            record["attribution"] = attribution
        for filename, data in notices:
            notice_id = digest(data)
            bodies[notice_id] = data
            record["notices"].append(dict(name=filename, id=notice_id))
        if not record["notices"]:
            raise ValueError(f"Missing notices: {name}")
        components.append(record)

    metadata = json.loads(run("cargo", "metadata", "--offline", "--locked", "--manifest-path",
                              str(ROOT / "rust/Cargo.toml"), "--format-version", "1"))
    packages = {(p["name"], p["version"]): p for p in metadata["packages"]}
    memberships = {}
    for package, target in TARGETS:
        for key in graph(ROOT / "rust/Cargo.toml", package, target):
            if packages[key]["source"] is not None:
                memberships.setdefault(key, set()).add(target)
    for (name, version), targets in sorted(memberships.items()):
        package = packages[name, version]
        declared = package["license"] or "SEE LICENSE FILE"
        chosen, files = license_files(Path(package["manifest_path"]).parent, declared)
        add(f"{name}-{version}", "cargo", declared, chosen, targets,
            [(p.name, p.read_bytes()) for p in files], [f"https://crates.io/crates/{name}/{version}"])

    # cli-support emits the browser API bindings. The separate C game's JS is
    # generated by Emscripten and is inventoried below.
    bindgen = next(p for p in metadata['packages'] if p['name'] == 'wasm-bindgen')
    version = bindgen['version']
    chosen, files = license_files(Path(bindgen['manifest_path']).parent, bindgen['license'])
    add(f'wasm-bindgen-cli-support/{version}', 'generated-javascript', bindgen['license'], chosen,
        ['wasm32-unknown-unknown'], [(p.name, p.read_bytes()) for p in files],
        [f'https://github.com/wasm-bindgen/wasm-bindgen/blob/{version}/crates/cli-support/src/js/mod.rs',
         f'https://github.com/wasm-bindgen/wasm-bindgen/blob/{version}/LICENSE-MIT'])

    # rust-src has the exact std Cargo.lock and vendored sources for this installed toolchain.
    sysroot = Path(run("rustc", "--print", "sysroot").strip())
    rust_version = run("rustc", "--version").split()[1]
    library = sysroot / "lib/rustlib/src/rust/library"
    std_env = dict(os.environ, RUSTC_BOOTSTRAP="1")
    std_memberships = {}
    for _, target in TARGETS:
        for name, version in graph(library / "Cargo.toml", "std", target, cwd=library,
                                   features="backtrace,panic-unwind", env=std_env):
            if (library / "vendor" / f"{name}-{version}").is_dir():
                std_memberships.setdefault((name, version), set()).add(target)
    for (name, version), targets in sorted(std_memberships.items()):
        directory = library / "vendor" / f"{name}-{version}"
        package = tomllib.loads((directory / "Cargo.toml").read_text(encoding="utf-8"))["package"]
        chosen, files = license_files(directory, package["license"])
        add(f"rust-std/{name}-{version}", "rust-std", package["license"], chosen, targets,
            [(p.name, p.read_bytes()) for p in files], [f"https://crates.io/crates/{name}/{version}"])

    all_targets = [target for _, target in TARGETS]
    rust_url = f"https://raw.githubusercontent.com/rust-lang/rust/{rust_version}/LICENSE-MIT"
    # Reuse the verified full text for the same Rust version, making repeated runs offline.
    rust_component = next((p for p in previous.get("components", [])
                           if p["component"] == f"rust-std/{rust_version}"), None) if isinstance(previous, dict) else None

    def previous_notice(component, filename):
        entry = next(n for n in component["notices"] if n["name"] == filename)
        body = next(n for n in previous["notices"] if n["id"] == entry["id"])
        data = (destination / "THIRD-PARTY.txt").read_bytes()[body["byte_offset"]:body["byte_offset"] + body["bytes"]]
        if digest(data) != body["id"]:
            raise ValueError(f"Corrupt retained notice: {filename}")
        return data

    if rust_component:
        rust_mit = previous_notice(rust_component, "LICENSE-MIT")
    else:
        with urlopen(rust_url, timeout=30) as response:
            rust_mit = response.read()
    add(f"rust-std/{rust_version}", "rust-std", "(MIT OR Apache-2.0) AND Unicode-3.0", "MIT AND Unicode-3.0", all_targets,
        [("LICENSE-MIT", rust_mit), ("Unicode-3.0.txt", (sysroot / "share/doc/rust/licenses/Unicode-3.0.txt").read_bytes())],
        [rust_url, f"https://github.com/rust-lang/rust/blob/{rust_version}/COPYRIGHT"],
        std_attribution(sysroot))
    builtins = library / "compiler-builtins"
    builtins_package = tomllib.loads((builtins / "compiler-builtins/Cargo.toml").read_text())["package"]
    add(f"rust-std/compiler_builtins-{builtins_package['version']}", "rust-std", builtins_package["license"],
        builtins_package["license"], all_targets, [("LICENSE.txt", (builtins / "LICENSE.txt").read_bytes())],
        [f"https://github.com/rust-lang/rust/tree/{rust_version}/library/compiler-builtins"],
        builtins_package["authors"])

    emscripten = args.sdk_root / "upstream/emscripten"
    em_version = (emscripten / "emscripten-version.txt").read_text().strip().strip('"')
    musl_notices, runtime_headers, libc_objects, extra_objects = linked_musl_notices(emscripten, args.link_map)
    for name, declared, filename in [
        ("emscripten-runtime", "MIT OR NCSA", "LICENSE"),
        ("musl", "MIT AND BSD notices", "system/lib/libc/musl/COPYRIGHT"),
        ("compiler-rt", "Apache-2.0 WITH LLVM-exception AND legacy notices", "system/lib/compiler-rt/LICENSE.TXT"),
    ]:
        attribution = (["Emscripten JavaScript, Asyncify, MEMFS and C runtime are shipped with game.js/game.wasm."]
                       if name == "emscripten-runtime" else None)
        source_urls = [f"https://github.com/emscripten-core/emscripten/blob/{em_version}/{filename}"]
        notices = [(Path(filename).name, (emscripten / filename).read_bytes())]
        if name == "emscripten-runtime":
            notices.append(("AUTHORS", (emscripten / "AUTHORS").read_bytes()))
            for relative in ("src/lib/libasync.js", "src/lib/libfs.js", "src/lib/libmemfs.js"):
                notices.append((relative + ":header", source_header(emscripten / relative)))
                source_urls.append(f"https://github.com/emscripten-core/emscripten/blob/{em_version}/{relative}")
            notices += runtime_headers
            source_urls += [f"https://github.com/emscripten-core/emscripten/blob/{em_version}/{relative.removesuffix(':header')}"
                            for relative, _ in runtime_headers]
        if name == "musl":
            notices += musl_notices
            source_urls += [f"https://github.com/emscripten-core/emscripten/blob/{em_version}/{relative.removesuffix(':header')}"
                            for relative, _ in musl_notices]
        add(f"{name}/{em_version}", "emscripten-runtime", declared,
            "MIT" if name == "emscripten-runtime" else declared,
            [C_TARGET], notices,
            source_urls, attribution)
    if "dlmalloc.o" in extra_objects:
        dlmalloc = (emscripten / "system/lib/dlmalloc.c").read_bytes()
        declaration = re.search(rb"/\*\s*(This is a version .*?)(?= \* Quickstart)", dlmalloc, re.S)
        if not declaration:
            raise ValueError("Review changed dlmalloc public-domain declaration")
        add("dlmalloc/2.8.6", "emscripten-runtime", "Public domain (upstream declaration)",
            "Public domain (upstream declaration)", [C_TARGET],
            [("dlmalloc.c:public-domain-declaration", declaration[1].rstrip() + b"\n")],
            [f"https://github.com/emscripten-core/emscripten/blob/{em_version}/system/lib/dlmalloc.c"],
            ["Doug Lea; Emscripten modifications are covered by the separate Emscripten runtime notices."])
    # Fonts are redistributed unchanged. Pin both the font bytes and their upstream notices;
    # after initial collection, the consolidated verified bodies make regeneration offline.
    font_directory = ROOT / "web/assets/fonts"
    font_metadata = json.loads((font_directory / "metadata.json").read_text(encoding="utf-8"))
    if font_metadata["schema_version"] != 1:
        raise ValueError("Unsupported font asset metadata")
    for font in font_metadata["fonts"]:
        data = (font_directory / font["file"]).read_bytes()
        if len(data) != font["bytes"] or digest(data) != font["sha256"]:
            raise ValueError(f"Font asset differs from its pinned source: {font['file']}")
        component_name = f"{font['name']}/{font['source_revision'][:12]}"
        retained = next((p for p in previous["components"]
                         if p["component"] == component_name), None)
        notices = []
        for notice in font["notices"]:
            if retained:
                notice_bytes = previous_notice(retained, notice["name"])
            else:
                with urlopen(notice["source_url"], timeout=30) as response:
                    notice_bytes = response.read()
            if digest(notice_bytes) != notice["sha256"]:
                raise ValueError(f"Font notice differs from its pinned source: {font['name']}/{notice['name']}")
            notices.append((notice["name"], notice_bytes))
        add(component_name, "font-asset", font["license"], font["license"],
            ["wasm32-unknown-unknown"], notices,
            [font["source_url"]] + [notice["source_url"] for notice in font["notices"]],
            font["copyright"] + [f"Unmodified {font['file']}; {font['version']}."])

    # Git stores these repository-owned text sources with LF. Their notices must
    # be identical for LF and CRLF checkouts; external pinned notices stay raw.
    source_notices = [("LICENSE.txt", (ROOT / "LICENSE.txt").read_bytes().replace(b"\r\n", b"\n")),
                      ("GPL-3.0.txt", (sysroot / "share/doc/rust/licenses/GPL-3.0-or-later.txt").read_bytes())]
    source_files = sorted([*ROOT.glob("src/brogue/*.[ch]"), *ROOT.glob("src/variants/*.[ch]")])
    source_files += [ROOT / "src/platform/platformdependent.c", ROOT / "src/platform/PlatformDefines.h"]
    for path in source_files:
        if header := source_header(path, canonical_lf=True):
            source_notices.append((path.relative_to(ROOT).as_posix() + ":header", header))
    game_license = "AGPL-3.0-or-later AND GPL-3.0-or-later"
    add("Brogue:CE/1.15.1", "game-source", game_license, game_license,
        [C_TARGET], source_notices,
        ["https://github.com/tmewett/BrogueCE/releases/tag/v1.15.1", "https://www.gnu.org/licenses/gpl-3.0.txt"],
        ["Copyright and GPL/AGPL notices in the original source files remain intact; their headers are reproduced here.",
         "Corresponding modified source, including rust-common: https://github.com/cacazu/roguelike-nihon/tree/codex/brogue-web-common-rust"])
    tile_license = ROOT / "web/assets/DOT-TILES-LICENSE.txt"
    cc_license = sysroot / "share/doc/rust/licenses/CC-BY-SA-4.0.txt"
    add("BrogueCE/tiles", "unmodified-asset", "CC-BY-SA-4.0", "CC-BY-SA-4.0",
        ["wasm32-unknown-unknown"], [(tile_license.name, tile_license.read_bytes()),
                                   (cc_license.name, cc_license.read_bytes())],
        ["https://github.com/tmewett/BrogueCE/blob/v1.15.1/bin/assets/LICENSE.txt"],
        ["Unmodified tiles.png is redistributed as web/assets/dot-tiles.png."])
    components.sort(key=lambda p: p["component"])
    inventory = dict(format=1, scope=dict(targets=[dict(package=p, target=t) for p, t in TARGETS]
        + [dict(package="brogue-game", target=C_TARGET, language="C", outputs=["game.js", "game.wasm"])],
        cargo_edges="normal,build", cargo_lock_sha256=digest((ROOT / "rust/Cargo.lock").read_bytes()),
        rust_version=rust_version, rust_std_features=["backtrace", "panic-unwind"],
        rust_std_lock_sha256=digest((library / "Cargo.lock").read_bytes()), emscripten_version=em_version,
        c_runtime_archive="libc", c_runtime_objects=libc_objects, c_runtime_auxiliary_objects=extra_objects),
        components=components, notices=[])
    text = ["Third-party notices for Brogue: Community Edition 1.15.1 Web\n\n",
            "Original Brogue notices remain in LICENSE.txt and original source headers.\n",
            "Cargo runtime and code-generation dependencies cover brogue-browser-ui; Emscripten C/JS runtime notices are also included.\n",
            "Rust std covers the installed target libraries, including backtrace/unwind support.\n",
            "Unused lockfile packages, other target runtimes, compiler tools and test libraries are excluded.\n\n"]
    for p in components:
        text += [f"Component: {p['component']}\nDeclared license: {p['declared_license']}\n",
                 f"Selected license: {p['selected_license']}\nTargets: {', '.join(p['targets'])}\n"]
        text += [f"Attribution: {a}\n" for a in p.get("attribution", [])]
        text += [f"Source: {url}\n" for url in p["source_urls"]]
        text += [f"Notice: {n['name']} -> {n['id']}\n" for n in p["notices"]]
        text += ["\n"]
    payload = bytearray("".join(text).encode("utf-8"))
    for notice_id, data in sorted(bodies.items()):
        payload.extend(f"\n===== NOTICE {notice_id} ({len(data)} bytes) =====\n".encode())
        inventory["notices"].append(dict(id=notice_id, byte_offset=len(payload), bytes=len(data)))
        payload.extend(data)
        payload.extend(b"\n===== END NOTICE =====\n")
    outputs = {"THIRD-PARTY.txt": bytes(payload),
               "manifest.json": (json.dumps(inventory, ensure_ascii=False, indent=2) + "\n").encode("utf-8")}
    for name, data in outputs.items():
        if args.check:
            if (destination / name).read_bytes() != data:
                raise ValueError(f"Outdated license inventory: {name}")
        else:
            (destination / name).write_bytes(data)
    print(f"{'Checked' if args.check else 'Collected'} {len(components)} components, "
          f"{len(bodies)} unique notices, {sum(map(len, outputs.values()))} bytes")


if __name__ == "__main__":
    main()
