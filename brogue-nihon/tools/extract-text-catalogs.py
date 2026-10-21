#!/usr/bin/env python3
"""Inventory C string literals without changing the game or requiring a C build.

Comments are ignored, adjacent literals are joined, and every literal is accounted
for, including inactive preprocessor branches and non-translatable strings.
The output is an English source catalog, not a runtime localization implementation.
"""

import argparse
import bisect
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "locales"
CATEGORIES = ("ui", "messages", "content", "help", "errors", "cli", "diagnostics", "internal")
PRINTF = re.compile(r"%(?:\d+\$)?[-+ #0']*(?:\d+|\*(?:\d+\$)?)?(?:\.(?:\d+|\*(?:\d+\$)?))?(?:hh|ll|[hljztL])?[diouxXfFeEgGaAcspn%]")
TOKENS = re.compile(r"\$(?:HISHER|HIMHER|HESHE|HIMSELFHERSELF)\b|\*\*\*\*")


@dataclass
class Token:
    kind: str
    raw: str
    start: int
    end: int


def tokenize(source):
    """Lex the subset of C needed for string and source-context extraction."""
    pattern = re.compile(
        r"(?P<space>\s+)|(?P<comment>//[^\n]*|/\*[\s\S]*?\*/)|"
        r'(?P<string>(?:u8|u|U|L)?"(?:\\[\s\S]|[^"\\])*")|'
        r"(?P<char>(?:u8|u|U|L)?'(?:\\[\s\S]|[^'\\])*')|"
        r"(?P<identifier>[A-Za-z_]\w*)|(?P<number>\d[\w.]*)|(?P<punct>.)",
        re.DOTALL,
    )
    result = []
    masked = list(source)
    for match in pattern.finditer(source):
        kind = match.lastgroup
        if kind in ("comment", "string", "char"):
            for index in range(match.start(), match.end()):
                if masked[index] != "\n":
                    masked[index] = " "
        if kind not in ("space", "comment"):
            result.append(Token(kind, match.group(), match.start(), match.end()))
    return result, "".join(masked)


def decode_literal(raw):
    body = raw[raw.index('"') + 1:-1]
    body = re.sub(r"\\\r?\n", "", body)
    escapes = {"a": "\a", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\", '"': '"', "'": "'", "?": "?"}
    output = []
    index = 0
    while index < len(body):
        if body[index] != "\\":
            output.append(body[index])
            index += 1
            continue
        index += 1
        escape = body[index]
        if escape in escapes:
            output.append(escapes[escape])
            index += 1
        elif escape in "01234567":
            match = re.match(r"[0-7]{1,3}", body[index:])
            output.append(chr(int(match.group(), 8)))
            index += len(match.group())
        elif escape == "x":
            match = re.match(r"[0-9a-fA-F]+", body[index + 1:])
            if not match:
                raise ValueError("Invalid C hexadecimal escape: " + raw)
            output.append(chr(int(match.group(), 16)))
            index += len(match.group()) + 1
        elif escape in ("u", "U"):
            length = 4 if escape == "u" else 8
            output.append(chr(int(body[index + 1:index + 1 + length], 16)))
            index += length + 1
        elif escape == "e":  # GNU escape used by terminal implementations.
            output.append("\x1b")
            index += 1
        else:
            raise ValueError("Unsupported C escape: " + raw)
    return "".join(output)


def spans(masked):
    """Find function bodies and global initializers in comment-free source."""
    result = []
    function = re.compile(r"^[ \t]*(?:[A-Za-z_]\w*[ \t*]+)+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{", re.MULTILINE)
    array = re.compile(r"\b([A-Za-z_]\w*)\s*(?:\[[^;{}]*?\]\s*)*\s*=\s*\{")
    for pattern, kind in ((function, "function"), (array, "initializer")):
        for match in pattern.finditer(masked):
            opening = masked.rfind("{", match.start(), match.end())
            depth = 1
            index = opening + 1
            while index < len(masked) and depth:
                if masked[index] == "{":
                    depth += 1
                elif masked[index] == "}":
                    depth -= 1
                index += 1
            if match.group(1) not in ("if", "for", "while", "switch"):
                result.append((opening, index, match.group(1), kind))
    return result


def directive_at(source, offset):
    start = source.rfind("\n", 0, offset) + 1
    while start > 0 and source[:start - 1].rstrip("\r").endswith("\\"):
        start = source.rfind("\n", 0, start - 1) + 1
    line = source[start:offset]
    match = re.match(r"[ \t]*#\s*(\w+)(?:\s+([A-Za-z_]\w*))?", line)
    return match.groups() if match else (None, None)


def contexts(tokens):
    """Record the nearest containing function call and argument index."""
    result = {}
    stack = []
    previous = None
    for token in tokens:
        if token.kind == "string":
            calls = [entry for entry in stack if entry[0]]
            result[token.start] = (calls[-1][0], calls[-1][1]) if calls else (None, None)
        if token.raw == "(":
            name = previous.raw if previous and previous.kind == "identifier" else None
            if name in ("if", "for", "while", "switch", "sizeof"):
                name = None
            stack.append([name, 0, 0])
        elif token.raw == ")" and stack:
            stack.pop()
        elif token.raw in ("{", "[") and stack:
            stack[-1][2] += 1
        elif token.raw in ("}", "]") and stack:
            stack[-1][2] -= 1
        elif token.raw == "," and stack and stack[-1][2] == 0:
            stack[-1][1] += 1
        previous = token
    return result


def classify(path, symbol, scope_kind, call, argument, directive, text, statement, function_name):
    """Classify by consumer first, then by data table or containing function."""
    name = Path(path).name
    lower = text.lower()
    owner = function_name or symbol
    scope = owner.lower()
    if directive == "include":
        return "internal", "include_path"
    if directive in ("if", "elif", "pragma", "error"):
        return "internal", "build_directive"
    if name in ("LocalizedText.c", "LocalizedText.h", "LocalizationVerification.c"):
        if call in ("fprintf", "printf", "puts"):
            return "diagnostics", "localization_diagnostic"
        return "internal", "localization_protocol_or_test_fixture"
    if call in ("fopen", "freopen", "fseek", "fscanf", "sscanf", "getenv", "setenv", "SDL_GetHint", "SDL_SetHint", "strcmp", "strncmp", "endswith", "remove", "chdir", "createBlobOnGrid"):
        return "internal", "machine_value"
    if call in ("strftime", "strptime"):
        return "internal", "date_format"
    if not text or not re.search(r"[A-Za-z]", PRINTF.sub("", text)):
        return "internal", "format_or_separator"
    if name == "Architect.c" and call == "temporaryMessage":
        return "diagnostics", "generation_visualization"
    if "help" in scope and name != "main.c" and directive != "include":
        return "help", "help_text"
    if call in ("initializeMainMenuButton", "initializeCreateItemButton", "dialogSelectEntryFromList", "dialogChooseFile", "getInputTextString", "confirm", "temporaryMessage", "flashTemporaryAlert", "displayCenteredAlert", "displayMoreSign"):
        return "ui", "display_text"
    if call == "notifyEvent":
        return "internal", "event_payload"
    if call in ("saveRunHistory", "saveResetRun"):
        return "internal", "persisted_value"
    if call in ("SDL_CreateWindow", "SDL_SetWindowTitle", "term_title"):
        return "ui", "window_title"
    if name == 'tiles.c' and 'Optimizing tile' in text:
        return 'ui', 'window_title'
    if call == "writeToLog" or call == "RNGLog" or "rngmessage" in statement.lower():
        return "diagnostics", "diagnostic_text"
    if call in ("printf", "fprintf", "puts", "fputs"):
        if name == "SeedCatalog.c":
            if call == "fprintf" or text.startswith("Scanning seed"):
                return "cli", "progress_text"
            return "internal", "export_format"
        if name == "main.c" and function_name == "main" and "^" in text:
            return "diagnostics", "numeric_diagnostic"
        if name == "main.c":
            return "cli", "console_text"
        if name == "RogueMain.c" and owner == "printBrogueVersion":
            return "cli", "console_text"
        if name == "platformdependent.c" and owner in ("initScores", "saveScoreBuffer", "saveRunHistory", "saveResetRun", "dumpScores"):
            return "internal", "persistence_or_export_format"
        if name == "term.c":
            if "\x1b" in text or not re.search(r"[A-Za-z]", PRINTF.sub("", text)):
                return "internal", "terminal_protocol"
            return "errors", "terminal_error"
        return "diagnostics", "diagnostic_text"
    if name == "main.c":
        if call in ("cliError", "badArgument"):
            return "cli", "argument_error"
        return "internal", "command_line_value"
    if name == "SeedCatalog.c":
        if text.startswith("Brogue seed catalog"):
            return "cli", "catalog_help_text"
        if "errorMessage" in statement:
            return "cli", "argument_error"
        return "internal", "export_value"
    if directive == "define":
        if symbol in ("OOS_APOLOGY", "PLAY_AGAIN_STRING"):
            return ("errors" if symbol == "OOS_APOLOGY" else "ui"), "display_text"
        return "internal", "macro_value"
    if text in ("Escaped", "Mastered", "Died", "Quit", "Reset", "none", "recording ended", "rb", "wb", "r+b", "ab", "r", "w", "a"):
        return "internal", "persisted_or_protocol_value"
    if "versionstring" in scope or "versionpattern" in scope:
        return "internal", "version_value"
    if scope.startswith("mainmenutitle"):
        return "ui", "title_art"
    if name.startswith("Globals"):
        if "blueprint" in scope:
            return "diagnostics", "generation_label"
        return "content", "game_data_text"
    if name == "browser-platform.c":
        return "diagnostics", "browser_verification_protocol"
    if name in ("term.c", "curses-platform.c"):
        if owner in ("ensure_size", "curses_init") and (call in ("mvprintw", "printw") or "terminal" in lower):
            return "errors", "display_text"
        return "internal", "platform_value"
    if name in ("sdl2-platform.c", "tiles.c"):
        return "internal", "resource_or_platform_value"
    if name == "Recordings.c":
        if owner in ("describeKeystroke", "appendModifierKeyDescription", "parseFile", "RNGLog", "RNGCheck", "OOSCheck"):
            if call in ("message", "dialogAlert"):
                return ("ui" if text == "File parsed." else "errors"), "display_text"
            return "diagnostics", "recording_diagnostic"
        if any(word in lower for word in ("out of sync", "not found", "cannot be opened", "unrecognized", "diverged")):
            return "errors", "display_text"
        if owner in ("getAvailableFilePath", "getDefaultFilePath", "characterForbiddenInFilename"):
            return "internal", "filename_value"
        return "ui", "recording_ui_text"
    if any(word in lower for word in ("something has gone terribly wrong", "error:", "no applicable files found", "file not found")):
        return "errors", "display_text"
    if name == "Wizard.c":
        return "ui", "wizard_ui_text"
    if name == "MainMenu.c":
        return "ui", "menu_text"
    if re.search(r"details|description|describe|itemname|itemkindname|itemrunicname|monstername|monsterabilities|monsterdomination|tileflavor|tiletext|ordinal|pronoun|attackverb", scope):
        return "content", "generated_description_fragment"
    if name == "IO.c":
        if owner in ("formatCountedMessage", "foldMessages", "printSeed"):
            return "messages", "message_format"
        if owner in ("printMonsterInfo", "printItemInfo", "printTerrainInfo", "refreshSideBar", "describeHallucinatedItem"):
            return "content", "sidebar_text"
        return "ui", "display_text"
    if owner in ("inscribeItem", "call", "chooseTarget", "throwCommand", "relabel", "promptForItemOfType", "displayInventory"):
        return "ui", "item_prompt_text"
    if name == "Buttons.c":
        return "ui", "button_format"
    return "messages", "game_message_or_fragment"


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:48] or "text"


def build_catalogs():
    buckets = {category: {} for category in CATEGORIES}
    files = []
    logical_count = 0
    literal_count = 0
    for path in sorted((ROOT / "src").rglob("*")):
        if path.suffix not in (".c", ".h"):
            continue
        if path.name == "LocalizedTextData.h":
            continue  # Derived Japanese data is inventoried by locales/ja/display.json.
        raw_bytes = path.read_bytes()
        source = raw_bytes.decode("utf-8").replace("\r\n", "\n")
        relative = path.relative_to(ROOT).as_posix()
        tokens, masked = tokenize(source)
        source_spans = spans(masked)
        call_contexts = contexts(tokens)
        newline_offsets = [-1] + [m.start() for m in re.finditer("\n", source)]
        logical_in_file = 0
        tokens_in_file = 0
        index = 0
        while index < len(tokens):
            token = tokens[index]
            if token.kind != "string":
                index += 1
                continue
            group = [token]
            index += 1
            directive, macro = directive_at(source, token.start)
            # Preprocessor boundaries prevent joining independent directives.
            while index < len(tokens) and tokens[index].kind == "string":
                between = source[group[-1].end:tokens[index].start]
                if "\n" in between and directive:
                    next_directive, next_macro = directive_at(source, tokens[index].start)
                    if (directive, macro) != (next_directive, next_macro):
                        break
                group.append(tokens[index])
                index += 1
            text = "".join(decode_literal(part.raw) for part in group)
            logical_count += 1
            literal_count += len(group)
            logical_in_file += 1
            tokens_in_file += len(group)
            containing = [s for s in source_spans if s[0] <= token.start < s[1]]
            functions = [s for s in containing if s[3] == "function"]
            function_name = min(functions, key=lambda s: s[1] - s[0])[2] if functions else None
            if directive == "define":
                symbol, scope_kind = macro or "macro", "macro"
            elif containing:
                chosen = min(containing, key=lambda s: s[1] - s[0])
                symbol, scope_kind = chosen[2:]
            else:
                line_start = max(source.rfind(";", 0, token.start), source.rfind("}", 0, token.start)) + 1
                prefix = masked[line_start:token.start]
                assignment = list(re.finditer(r"\b([A-Za-z_]\w*)\s*(?:\[[^;{}]*\]\s*)*\s*=", prefix))
                symbol = assignment[-1].group(1) if assignment else "global"
                scope_kind = "global"
            call, argument = call_contexts[token.start]
            start_of_statement = max(masked.rfind(";", 0, token.start), masked.rfind("{", 0, token.start)) + 1
            statement = masked[start_of_statement:token.start]
            category, kind = classify(relative, symbol, scope_kind, call, argument, directive, text, statement, function_name)
            context = relative + "\0" + symbol + "\0" + kind + "\0" + text
            digest = hashlib.sha256(context.encode("utf-8")).hexdigest()[:12]
            entry_id = f"{slug(path.stem)}.{slug(symbol)}.{slug(text)}.{digest}"
            location = {
                "file": relative,
                "line": bisect.bisect_left(newline_offsets, token.start),
                "end_line": bisect.bisect_left(newline_offsets, group[-1].end - 1),
                "symbol": symbol,
                "function": function_name,
                "scope": scope_kind,
                "call": call,
                "argument_index": argument,
                "literal_count": len(group),
            }
            bucket = buckets[category]
            if entry_id not in bucket:
                entry = {
                    "text": text,
                    "translatable": category not in ("diagnostics", "internal"),
                    "kind": kind,
                    "sources": [],
                }
                specifiers = [match.group() for match in PRINTF.finditer(text) if match.group() != "%%"]
                markers = TOKENS.findall(text)
                if specifiers or markers:
                    entry["placeholders"] = {"c_format": specifiers, "brogue_tokens": markers}
                if any(ord(c) < 32 and c not in "\n\r\t" for c in text):
                    entry["contains_control_characters"] = True
                bucket[entry_id] = entry
            bucket[entry_id]["sources"].append(location)
        files.append({"file": relative, "sha256": hashlib.sha256(raw_bytes).hexdigest(), "literal_tokens": tokens_in_file, "logical_strings": logical_in_file})
    catalogs = {}
    counts = {}
    for category, entries in buckets.items():
        catalogs[f"en/{category}.json"] = {
            "schema_version": 1,
            "language": "und" if category == "internal" else "en",
            "category": category,
            "purpose": "source_inventory",
            "entries": dict(sorted(entries.items())),
        }
        counts[category] = {"entries": len(entries), "occurrences": sum(len(e["sources"]) for e in entries.values())}
    assert sum(c["occurrences"] for c in counts.values()) == logical_count
    assert sum(s["literal_count"] for entries in buckets.values() for e in entries.values() for s in e["sources"]) == literal_count
    catalogs["manifest.json"] = {
        "schema_version": 1,
        "upstream": {"project": "Brogue: Community Edition", "version": "1.15.1", "url": "https://github.com/tmewett/BrogueCE/releases/tag/v1.15.1"},
        "scope": "All string literals in src/**/*.c and src/**/*.h, including all variants and conditional build branches, except the derived Japanese dictionary header LocalizedTextData.h. Its sources are locales/ja/*.json. Comments and character literals are excluded. Documentation and development scripts are outside this game-source inventory.",
        "excluded_derived_sources": ["src/brogue/LocalizedTextData.h"],
        "runtime_integration": {"source_inventory": False, "display_dictionary": ["ja/ui.json", "ja/messages.json", "ja/content.json", "ja/help.json", "ja/errors.json", "ja/display.json", "ja/composed.json"], "compilation": "tools/compile-locales.py", "backend": "SDL and browser"},
        "diagnostic_language": "en",
        "classification": "Source-context classification; display strings can have additional consumers. Verify consumers when integrating each entry.",
        "totals": {"files": len(files), "literal_tokens": literal_count, "logical_strings": logical_count, "entries": sum(c["entries"] for c in counts.values())},
        "catalogs": [{"file": f"en/{category}.json", **counts[category]} for category in CATEGORIES],
        "sources": files,
    }
    return catalogs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check catalog coverage and detect stale or edited generated files without writing")
    args = parser.parse_args()
    catalogs = build_catalogs()
    for relative, document in catalogs.items():
        target = OUTPUT / relative
        serialized = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
        if args.check:
            if not target.is_file() or target.read_text(encoding="utf-8") != serialized:
                raise SystemExit(f"Catalog is missing or stale: {target}")
            # Round-trip checks ensure literal control bytes and escapes survive JSON.
            assert json.loads(serialized) == document
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(serialized, encoding="utf-8", newline="\n")
    manifest = catalogs["manifest.json"]
    print(json.dumps({"verified" if args.check else "created": len(catalogs), "totals": manifest["totals"], "catalogs": manifest["catalogs"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
