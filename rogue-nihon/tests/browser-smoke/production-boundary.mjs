import {loadPlaywright, browserExecutable} from '../../tools/toolchain.mjs';
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {cp, mkdir, mkdtemp, readFile, readdir, writeFile} from "node:fs/promises";
import {once} from "node:events";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {artifactDirectory} from "../../tools/temporary-artifacts.mjs";
import {prepareBrowserRuntime} from "./browser-runtime.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const previewServer = fileURLToPath(new URL("../../../tools/server.mjs", import.meta.url));
const output = artifactDirectory(path.join(root, "tests/browser-smoke/output/production-boundary"));
await mkdir(output, {recursive: true});
const {chromium} = loadPlaywright();
const evidence = {started_at: new Date().toISOString(), checks: [], errors: [], screenshots: []};
let runtime, browser, child, context;

async function copyAssets(source, destination) {
  await mkdir(destination, {recursive: true});
  for (const entry of await readdir(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyAssets(from, to);
    else if (/\.(?:png|json|ttf)$/.test(entry.name)) await cp(from, to);
  }
}

async function copyRuntime(destination) {
  await mkdir(path.join(destination, "web"), {recursive: true});
  await mkdir(path.join(destination, "build"));
  for (const file of await readdir(path.join(root, "web"))) {
    if (/\.(?:m?js|css|html)$/.test(file)) await cp(path.join(root, "web", file), path.join(destination, "web", file));
  }
  for (const set of ["tiles", "pixels-v2", "fonts"]) {
    const assetPath = path.join("web/assets", set);
    await copyAssets(path.join(root, assetPath), path.join(destination, assetPath));
  }
  for (const file of ["game.wasm", "browser-ui.wasm", "browser-ui.js", "build-manifest.json"])
    await cp(path.join(root, "build", file), path.join(destination, "build", file));
}

async function start(destination) {
  const args = [previewServer, "--root", destination, "0"];
  const environment = {...process.env, ROGUE_KEEP_ARTIFACTS: "0"};
  for (const name of ["ROGUE_PORT", "ROGUE_HOST", "ROGUE_TLS_CERT", "ROGUE_TLS_KEY"]) delete environment[name];
  child = spawn(process.execPath, args,
    {cwd: destination, env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]});
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    const timer = setTimeout(() => reject(Error("Server startup timeout: " + stderr + stdout)), 15000);
    child.stderr.on("data", data => {stderr += data;});
    child.stdout.on("data", data => {
      stdout += data;
      const match = stdout.match(/Game preview: (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) {clearTimeout(timer); resolve(match[1]);}
    });
    child.once("error", error => {clearTimeout(timer); reject(error);});
    child.once("exit", code => {clearTimeout(timer); reject(Error("Server exited " + code + ": " + stderr));});
  });
}

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "close");
  child.kill();
  await closed;
}

async function check(label, run) {await run(); evidence.checks.push(label); console.log("PASS " + label);}
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function click(page, id, touch) {
  const control = page.locator(`[data-control="${id}"]:not([disabled])`);
  await control.waitFor();
  if (touch) await control.tap(); else await control.click();
  await paint(page);
}
async function selectTiles(page, touch) {
  // The selector is drawn on Canvas, immediately beside the controls button.
  const anchor = await page.locator('[data-control="mobile-controls"]').boundingBox();
  assert.ok(anchor);
  const x = anchor.x + anchor.width + 32, y = anchor.y + anchor.height / 2;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await click(page, "select-display-mode-tiles", touch);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("rogue-map-display-v1")).mode), "tiles");
}
function observeProduction() {
  const NativeWorker = window.Worker;
  const observed = window.__productionObserved = {workers: 0, frame: null, trace: null, requests: 0, errors: []};
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      const generation = ++observed.workers;
      observed.frame = observed.trace = null; observed.requests = 0;
      this.addEventListener("message", ({data}) => {
        if (generation !== observed.workers) return;
        if (data.type === "frame") observed.frame = data;
        else if (data.type === "trace") observed.trace = data;
        else if (data.type === "input-request") observed.requests++;
        else if (data.type === "error") observed.errors.push(data.text);
      });
    }
  };
}
const idle = page => page.waitForFunction(() => {
  const displayed = JSON.parse(document.getElementById("rogue-observation")?.textContent || "null");
  return __productionObserved.trace && __productionObserved.requests > 0 &&
    displayed?.input?.kind === "command" && !displayed.window;
});
const state = page => page.evaluate(() => ({words: __productionObserved.trace.words,
  player: __productionObserved.frame.player, stats: __productionObserved.frame.stats}));
async function stored(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("original-rogue-web", 1); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction("saves", "readonly"), read = transaction.objectStore("saves").get("manual");
      transaction.oncomplete = () => {db.close(); resolve(read.result ? Array.from(new Uint8Array(read.result)) : null);};
      transaction.onerror = () => {db.close(); reject(transaction.error);};
    };
  }));
}
async function waitTurn(page, touch) {
  const turn = (await state(page)).words[13];
  if (touch) await click(page, "touch-.", true); else await page.keyboard.press(".");
  await page.waitForFunction(turn => __productionObserved.trace?.words[13] === turn + 1, turn);
  await idle(page);
}

try {
  runtime = await prepareBrowserRuntime(root);
  browser = await chromium.launch({executablePath: browserExecutable(),
    headless: true, args: ["--disable-gpu"], downloadsPath: runtime.downloadsPath});
  evidence.browser = browser.version();
  for (const [label, poison, touch] of [["missing-tools", false, false], ["broken-tools", true, true]]) {
    const destination = await mkdtemp(path.join(output, label + "-"));
    await copyRuntime(destination);
    const sentinel = path.join(destination, ".local/tasks/node-interrupted/partial.wasm");
    await mkdir(path.dirname(sentinel), {recursive: true});
    await writeFile(sentinel, "untouched interrupted build");
    await writeFile(path.join(path.dirname(sentinel), ".rogue-owner.json"), "{invalid recovery metadata");
    if (poison) {
      await mkdir(path.join(destination, "tools"));
      await writeFile(path.join(destination, "tools/temporary-artifacts.mjs"), 'throw Error("Recovery must never be imported by production");');
      await writeFile(path.join(destination, "tools/artifact_registry.py"), 'raise RuntimeError("Recovery must never be invoked by production")');
    }
    const base = await start(destination);
    context = await browser.newContext({viewport: touch ? {width: 390, height: 844} : {width: 1240, height: 900},
      isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1});
    await context.addInitScript(observeProduction);
    const page = await context.newPage(), requests = [];
    page.on("pageerror", error => evidence.errors.push(error.message));
    page.on("request", request => requests.push(new URL(request.url()).pathname));
    page.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (!response.ok() && /\/(?:web\/assets|build)\//.test(pathname)) evidence.errors.push(`HTTP ${response.status()} ${pathname}`);
    });
    await check(label + " external preview tool renders runtime with no test adapter or development files", async () => {
      assert.ok(!(await readdir(path.join(destination, "web"))).includes("server.mjs"));
      await page.goto(base);
      await page.locator('[data-control="new-game"]:not([disabled])').waitFor();
      assert.equal(await page.evaluate(() => "__rogueBrowserTest" in window), false);
      assert.equal(await page.evaluate(() => "RogueCanvasUi" in window), false);
      assert.equal((await context.request.get(base + "web/server.mjs")).status(), 404);
      assert.equal((await context.request.get(base + "tools/server.mjs")).status(), 403);
      await page.screenshot({path: path.join(output, label + "-top.png")});
      evidence.screenshots.push(label + "-top.png");
    });
    await page.goto(base + "?trace=1&lang=ja&view=pixels");
    let checkpoint, saved;
    await check(label + " starts the production game and advances a turn", async () => {
      await page.locator('[data-control="new-game"]:not([disabled])').waitFor();
      for (const [id, value] of [["name", "独立確認勇者"], ["seed", "17"]]) {
        await page.locator("#" + id).fill(value);
      }
      await click(page, "new-game", touch);
      await idle(page); await waitTurn(page, touch);
      assert.equal(await page.evaluate(() => "__rogueBrowserTest" in window), false);
    });
    await check(label + " inventory, settings and automatic top save work without recovery", async () => {
      checkpoint = await state(page);
      await page.keyboard.press("i");
      await page.waitForFunction(() => Boolean(JSON.parse(document.getElementById("rogue-observation").textContent).window));
      await page.screenshot({path: path.join(output, label + "-inventory.png")});
      evidence.screenshots.push(label + "-inventory.png");
      await page.keyboard.press("Escape"); await idle(page);
      assert.deepEqual(await state(page), checkpoint);
      await click(page, "settings-toggle", touch);
      await selectTiles(page, touch);
      assert.deepEqual(await state(page), checkpoint);
      for (const id of ["save", "download-save", "import-save"])
        assert.equal(await page.locator(`[data-control="${id}"]`).count(), 0);
      await page.screenshot({path: path.join(output, label + "-settings.png")});
      evidence.screenshots.push(label + "-settings.png");
      await click(page, "settings-top", touch);
      await page.locator('[data-control="load"]:not([disabled])').waitFor();
      saved = await stored(page); assert.ok(saved?.length > 0);
    });
    await check(label + " reload restores into a new Worker and resumes play", async () => {
      await page.reload(); await page.locator('[data-control="load"]:not([disabled])').waitFor();
      assert.deepEqual(await stored(page), saved);
      assert.equal(await page.evaluate(() => __productionObserved.workers), 0);
      await click(page, "load", touch); await idle(page);
      assert.equal(await page.evaluate(() => __productionObserved.workers), 1);
      assert.deepEqual(await state(page), checkpoint); assert.equal(await stored(page), null);
      await waitTurn(page, touch);
      assert.deepEqual(await page.evaluate(() => __productionObserved.errors), []);
      await page.reload(); await page.locator('[data-control="new-game"]:not([disabled])').waitFor();
      assert.equal(await page.locator('[data-control="load"]').isDisabled(), true);
    });
    await check(label + " runtime requests and interrupted files stay independent", async () => {
      assert.ok(requests.every(request => !/\/(?:tests|tools)\/|fixture|artifact/.test(request)));
      assert.equal(await readFile(sentinel, "utf8"), "untouched interrupted build");
      assert.deepEqual(evidence.errors, []);
    });
    await context.close(); context = null; await stop(); child = null;
  }
  evidence.result = "pass";
  evidence.finished_at = new Date().toISOString();
} catch (error) {
  evidence.result = "fail"; evidence.failure = error.stack; throw error;
} finally {
  await writeFile(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  await context?.close(); await browser?.close(); await stop(); await runtime?.dispose();
}
