import {loadPlaywright, browserExecutable} from '../../tools/toolchain.mjs';
import assert from "node:assert/strict";
import http from "node:http";
import {spawn, execFileSync} from "node:child_process";
import {once} from "node:events";
import {cp, mkdir, mkdtemp, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createPreviewServer} from "../../../tools/server.mjs";
import {artifactDirectory} from "../../tools/temporary-artifacts.mjs";
import {prepareBrowserRuntime} from "./browser-runtime.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const previewServer = fileURLToPath(new URL("../../../tools/server.mjs", import.meta.url));
const output = artifactDirectory(path.join(root, "tests/browser-smoke/output/startup"));
await mkdir(output, {recursive: true});
const {chromium} = loadPlaywright();
const evidence = {started_at: new Date().toISOString(), checks: [], errors: [], screenshots: []};
const children = new Set(), servers = new Set();
let browser, runtime;

function launch(args) {
  const environment = {...process.env};
  for (const name of ["ROGUE_PORT", "ROGUE_HOST", "ROGUE_TLS_CERT", "ROGUE_TLS_KEY", "NODE_OPTIONS"]) delete environment[name];
  const child = spawn(process.execPath, args,
    {cwd: root, env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]});
  children.add(child);
  const result = {child, stdout: "", stderr: ""};
  child.stdout.on("data", data => {result.stdout += data;});
  child.stderr.on("data", data => {result.stderr += data;});
  result.closed = once(child, "close").then(([code]) => {children.delete(child); return {...result, code};});
  return result;
}

async function ready(result) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const match = result.stdout.match(/Game preview: (https?:\/\/127\.0\.0\.1:\d+\/)/);
    if (match) return match[1];
    if (result.child.exitCode !== null) throw Error("Startup failed: " + result.stderr + result.stdout);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw Error("Startup timeout: " + result.stderr + result.stdout);
}

async function completed(result) {
  let timer;
  try {
    return await Promise.race([result.closed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("Launcher failed to exit: " + result.stderr + result.stdout)), 10000);
    })]);
  } finally {clearTimeout(timer);}
}

async function listen(server) {
  servers.add(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}
async function check(label, run) {await run(); evidence.checks.push(label); console.log("PASS " + label);}
const launcher = port => [previewServer, "--root", root, String(port)];
async function click(page, id, touch = false) {
  const control = page.locator(`[data-control="${id}"]:not([disabled])`);
  await control.waitFor();
  if (touch) await control.tap(); else await control.click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
function observeProduction() {
  const NativeWorker = window.Worker;
  const observed = window.__startupObserved = {workers: 0, frame: null, trace: null, requests: 0};
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
      });
    }
  };
}
const idle = page => page.waitForFunction(() => __startupObserved.trace && __startupObserved.requests > 0 &&
  __startupObserved.frame?.ui.input.kind === "command" && !__startupObserved.frame.ui.window);
const state = page => page.evaluate(() => ({words: __startupObserved.trace.words,
  player: __startupObserved.frame.player, stats: __startupObserved.frame.stats}));
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
async function saveAtTop(page, touch) {
  await click(page, "settings-toggle", touch);
  for (const id of ["save", "download-save", "import-save"])
    assert.equal(await page.locator(`[data-control="${id}"]`).count(), 0);
  await click(page, "settings-top", touch);
  await page.locator('[data-control="load"]:not([disabled])').waitFor();
  const bytes = await stored(page); assert.ok(bytes?.length > 0); return bytes;
}
async function waitTurn(page, touch) {
  const turn = (await state(page)).words[13];
  if (touch) await click(page, "touch-.", true); else await page.keyboard.press(".");
  await page.waitForFunction(turn => __startupObserved.trace?.words[13] === turn + 1, turn);
  await idle(page);
}

try {
  const first = launch([previewServer, "--root", root, "0"]);
  let active = first;
  const base = await ready(first), port = Number(new URL(base).port);
  await check("fresh Node launcher serves the real game with isolation headers", async () => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.match(response.headers.get("x-rogue-preview"), /^[a-f0-9]{64}$/);
  });
  await check("repeated Node launcher succeeds and keeps the same server and origin", async () => {
    const second = await completed(launch(launcher(port)));
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /既に起動/);
    assert.ok(second.stdout.includes("Game preview: " + base));
    assert.equal(first.child.exitCode, null);
  });
  const foreign = http.createServer((_, response) => response.end("another application"));
  const foreignPort = await listen(foreign);
  await check("unrelated occupied port reports an actionable error without stopping its owner", async () => {
    const result = await completed(launch(launcher(foreignPort)));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /別のサーバーが使用/);
    assert.ok(result.stderr.includes("node tools/server.mjs --root <game-directory> " + (foreignPort + 1)));
    assert.doesNotMatch(result.stdout + result.stderr, /Preview stopped with an error|EADDRINUSE|Exception:/);
    assert.equal(await (await fetch(`http://127.0.0.1:${foreignPort}/`)).text(), "another application");
  });
  const stalled = http.createServer(() => {}), stalledPort = await listen(stalled);
  await check("unresponsive port owner cannot stall startup indefinitely", async () => {
    const started = Date.now();
    const result = await completed(launch([previewServer, "--root", root, String(stalledPort)]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /別のサーバーが使用/);
    assert.ok(Date.now() - started < 5000);
  });
  const otherRoot = await mkdtemp(path.join(output, "other-project-"));
  await mkdir(path.join(otherRoot, "web"));
  await cp(path.join(root, "web/index.html"), path.join(otherRoot, "web/index.html"));
  const otherPort = await listen(createPreviewServer({root: otherRoot}));
  await check("another Rogue folder is not reused even with the same title and isolation headers", async () => {
    const result = await completed(launch(launcher(otherPort)));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /別のサーバーが使用/);
  });
  const unidentified = createPreviewServer({root});
  unidentified.on("request", (_, response) => response.removeHeader("X-Rogue-Preview"));
  const unidentifiedPort = await listen(unidentified);
  await check("an isolated server without workspace identity is rejected without stopping its owner", async () => {
    const result = await completed(launch(launcher(unidentifiedPort)));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /別のサーバーが使用/);
    const response = await fetch(`http://127.0.0.1:${unidentifiedPort}/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.equal(response.headers.get("x-rogue-preview"), null);
  });
  runtime = await prepareBrowserRuntime(root);
  browser = await chromium.launch({executablePath: browserExecutable(),
    headless: true, args: ["--disable-gpu"], downloadsPath: runtime.downloadsPath});
  evidence.browser = browser.version();
  await check("HTTPS launcher also reuses its certificate and renders an isolated browser page", async () => {
    const certificate = path.join(output, "localhost-cert.pem"), key = path.join(output, "localhost-key.pem");
    const openssl = process.env.ROGUE_OPENSSL || "openssl";
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "1", "-keyout", key,
      "-out", certificate, "-subj", "/CN=Rogue startup", "-addext", "subjectAltName=IP:127.0.0.1"], {windowsHide: true, stdio: "ignore"});
    const secure = launch([previewServer, "--root", root, "0", "127.0.0.1", certificate, key]);
    const secureBase = await ready(secure), securePort = new URL(secureBase).port;
    const duplicate = await completed(launch([previewServer, "--root", root, securePort, "127.0.0.1", certificate, key]));
    assert.equal(duplicate.code, 0, duplicate.stderr);
    assert.ok(duplicate.stdout.includes(secureBase));
    const context = await browser.newContext({ignoreHTTPSErrors: true});
    try {
      const page = await context.newPage();
      page.on("pageerror", error => evidence.errors.push(error.message));
      await page.goto(secureBase);
      await page.waitForFunction(() => document.getElementById("rogue-canvas").width > 300);
      assert.equal(await page.evaluate(() => crossOriginIsolated), true);
      assert.equal(await page.evaluate(() => "__rogueBrowserTest" in window), false);
    } finally {await context.close();}
  });
  for (const touch of [false, true]) {
    const label = touch ? "mobile" : "PC";
    const context = await browser.newContext({viewport: touch ? {width: 390, height: 844} : {width: 1240, height: 900},
      isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1});
    try {
      await context.addInitScript(observeProduction);
      const page = await context.newPage();
      page.on("pageerror", error => evidence.errors.push(error.message));
      await page.goto(base + "?trace=1&lang=ja&view=pixels");
      await check(label + " reused origin starts the game and advances a turn", async () => {
        await page.locator('[data-control="new-game"]:not([disabled])').waitFor();
        for (const [id, value] of [["name", "起動確認勇者"], ["seed", "17"]]) {
          await page.locator("#" + id).fill(value);
        }
        await click(page, "new-game", touch);
        await idle(page); await waitTurn(page, touch);
        assert.equal(await page.evaluate(() => "__rogueBrowserTest" in window), false);
        const image = label + "-game.png";
        await page.screenshot({path: path.join(output, image)}); evidence.screenshots.push(image);
      });
      await check(label + " repeated launcher preserves saved data and resumed gameplay", async () => {
        const before = await state(page), bytes = await saveAtTop(page, touch);
        const result = await completed(launch(launcher(port)));
        assert.equal(result.code, 0, result.stderr);
        assert.ok(result.stdout.includes(base));
        assert.equal(active.child.exitCode, null);
        await page.reload(); await page.locator('[data-control="load"]:not([disabled])').waitFor();
        assert.deepEqual(await stored(page), bytes);
        await click(page, "load", touch); await idle(page);
        assert.deepEqual(await state(page), before); assert.equal(await stored(page), null);
        await waitTurn(page, touch);
      });
      await check(label + " restarting the server keeps the origin, autosave bytes and next game turn", async () => {
        const before = await state(page), bytes = await saveAtTop(page, touch);
        active.child.kill(); await active.closed;
        active = launch(launcher(port)); assert.equal(await ready(active), base);
        await page.reload(); await page.locator('[data-control="load"]:not([disabled])').waitFor();
        assert.deepEqual(await stored(page), bytes);
        await click(page, "load", touch); await idle(page);
        assert.deepEqual(await state(page), before); assert.equal(await stored(page), null);
        await waitTurn(page, touch);
      });
    } finally {await context.close();}
  }
  assert.deepEqual(evidence.errors, []);
  evidence.result = "pass";
  evidence.finished_at = new Date().toISOString();
} catch (error) {
  evidence.result = "fail"; evidence.failure = error.stack; throw error;
} finally {
  await writeFile(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  await browser?.close(); await runtime?.dispose();
  for (const child of children) child.kill();
  for (const server of servers) {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
}
