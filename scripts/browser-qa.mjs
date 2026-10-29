import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Uses the already-installed browser; no browser binary is downloaded.
const root = process.cwd(),
  out = path.join(root, ".sites-runtime", "qa");
await mkdir(out, { recursive: true });
const browser = spawn(
  process.env.QUIL_QA_BROWSER ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--remote-debugging-port=9227",
    `--user-data-dir=${path.join(out, "browser-profile")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
const errors = [];
try {
  let version;
  for (let i = 0; i < 50; i++) {
    try {
      version = await (
        await fetch("http://127.0.0.1:9227/json/version")
      ).json();
      break;
    } catch {
      await wait(150);
    }
  }
  if (!version) throw Error("Browser debugger did not start");
  const tabs = await (await fetch("http://127.0.0.1:9227/json/list")).json();
  const page = tabs.find((tab) => tab.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => {
        pending.delete(current);
        reject(Error(`CDP timeout: ${method}`));
      }, 25000);
      pending.set(current, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(message.id);
        message.error
          ? request.reject(Error(JSON.stringify(message.error)))
          : request.resolve(message.result);
      }
    }
    if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
    if (
      message.method === "Log.entryAdded" &&
      message.params.entry.level === "error"
    )
      errors.push(message.params.entry.text);
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  const click = async (selector) =>
    evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});el.click();return true})()`,
    );
  const screenshot = async (name) => {
    const result = await send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 82,
      captureBeyondViewport: false,
    });
    await writeFile(
      path.join(out, name + ".jpg"),
      Buffer.from(result.data, "base64"),
    );
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "try{localStorage.removeItem('quil:saved')}catch{}",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: "http://127.0.0.1:4173" });
  for (let i = 0; i < 50; i++) {
    if (
      await evaluate(
        `document.readyState==='complete'&&!!document.querySelector('.particle-scene canvas')`,
      )
    )
      break;
    await wait(200);
  }
  await evaluate("document.fonts.ready");
  await wait(900);
  const desktop = await evaluate(
    `({title:document.title,canvas:!!document.querySelector('canvas'),overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1')?.textContent})`,
  );
  await screenshot("01-landing-cube");
  await click(".scene-controls button:nth-child(3)");
  await wait(2200);
  const treeSelected = await evaluate(`document.querySelector('.scene-caption')?.textContent.includes('GROW FROM HERE')`);
  await click('.pause-button');
  const pauseWorks = await evaluate(`document.querySelector('.pause-button')?.getAttribute('aria-pressed')==='true'`);
  await screenshot("02-landing-tree");
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 655,
    y: 390,
  });
  await wait(250);
  await screenshot("03-tree-pointer");
  await click(".header-cta");
  await wait(450);
  const workspace = await evaluate(
    `({heading:document.querySelector('h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,preview:document.querySelector('.example-banner')?.textContent})`,
  );
  await screenshot("04-workspace-empty");
  await click(".example-button");
  await wait(4500);
  const example = await evaluate(
    `({cards:document.querySelectorAll('.prospect-card').length,events:document.querySelectorAll('.activity-event').length})`,
  );
  await click(".prospect-card .save-button");
  await click(".prospect-card .text-link");
  await wait(100);
  const dialog = await evaluate(
    `({open:!!document.querySelector('[role=dialog]'),sources:document.querySelectorAll('.evidence-item').length,draft:!!document.querySelector('.draft-textarea')})`,
  );
  await screenshot("05-opportunity-detail");
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
  });
  await evaluate(
    `document.querySelectorAll('.workspace-sidebar nav button')[1].click()`,
  );
  await wait(100);
  const saved = await evaluate(
    `document.querySelectorAll('.saved-grid .prospect-card').length`,
  );
  await evaluate(
    `document.querySelectorAll('.workspace-sidebar nav button')[0].click()`,
  );
  await screenshot("06-workspace-results");
  await click(".search-panel form button[type=submit]");
  const connections = await evaluate(
    `({modal:document.querySelector('#modal-heading')?.textContent,keysInBrowser:document.querySelectorAll('input[type=password]').length})`,
  );
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await screenshot("07-mobile-workspace");
  const mobileWorkspaceOverflow = await evaluate(
    "document.documentElement.scrollWidth>innerWidth",
  );
  await click(".sidebar-home");
  await wait(650);
  await screenshot("08-mobile-landing");
  const mobile = await evaluate(
    `({overflow:document.documentElement.scrollWidth>innerWidth,canvas:!!document.querySelector('canvas')})`,
  );
  await click(".mobile-menu-button");
  const mobileMenu = await evaluate(
    `document.querySelector('.mobile-menu-button').getAttribute('aria-expanded')==='true'`,
  );
  const report = {
    desktop,
    treeSelected,
    pauseWorks,
    workspace,
    example,
    dialog,
    saved,
    connections,
    mobile,
    mobileWorkspaceOverflow,
    mobileMenu,
    errors: [...new Set(errors)],
  };
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    report.errors.length ||
    desktop.overflow ||
    !treeSelected ||
    !pauseWorks ||
    workspace.overflow ||
    mobile.overflow ||
    mobileWorkspaceOverflow ||
    example.cards !== 3 ||
    example.events !== 5 ||
    saved !== 1 ||
    !dialog.open ||
    !mobileMenu
  )
    process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
}
