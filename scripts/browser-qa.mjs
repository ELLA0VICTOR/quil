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
  await send("Page.navigate", {
    url: process.env.QUIL_QA_URL || "http://127.0.0.1:4173",
  });
  for (let i = 0; i < 50; i++) {
    if (
      await evaluate(
        "document.readyState==='complete'&&!!document.querySelector('.particle-scene canvas')",
      )
    )
      break;
    await wait(200);
  }
  await evaluate("document.fonts.ready");
  await wait(700);
  const desktop = await evaluate(
    `({canvas:!!document.querySelector('canvas'),overflow:document.documentElement.scrollWidth>innerWidth,controls:document.querySelectorAll('.scene-controls').length,heroCards:document.querySelectorAll('.hero-section .feature-card').length})`,
  );
  await screenshot("11-open-hero");
  let autoMorph = false;
  for (let i = 0; i < 70; i++) {
    autoMorph = await evaluate(
      "document.querySelector('.scene-caption')?.textContent.includes('GROW FROM HERE')",
    );
    if (autoMorph) break;
    await wait(200);
  }
  await screenshot("12-open-tree");
  await evaluate(
    "document.getElementById('how-it-works').scrollIntoView({behavior:'instant'})",
  );
  await wait(200);
  const landingCrew = await evaluate(
    "document.querySelectorAll('.landing-crew .crew-member').length",
  );
  await screenshot("13-landing-crew");
  await evaluate(
    "document.getElementById('footer').scrollIntoView({behavior:'instant'})",
  );
  await wait(100);
  await screenshot("14-footer");
  await click(".header-cta");
  await wait(350);
  const room = await evaluate(
    `({heading:document.querySelector('h1')?.textContent,agents:document.querySelectorAll('.room-crew-area .crew-member').length,forms:document.querySelectorAll('select').length,sidebars:document.querySelectorAll('.workspace-sidebar').length,overflow:document.documentElement.scrollWidth>innerWidth})`,
  );
  await screenshot("15-crew-welcome");
  const welcomeFit = [];
  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
    [1440, 650],
    [1280, 600],
    [1920, 600],
    [960, 540],
    [1920, 1080],
    [768, 700],
    [390, 844],
    [390, 667],
    [375, 568],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await wait(650);
    const fit = await evaluate(`(()=>{
      const rect=selector=>document.querySelector(selector).getBoundingClientRect();
      const greeting=rect('.room-welcome h1'), conversation=document.querySelector('.room-conversation'), feed=conversation.getBoundingClientRect(), composer=rect('.chat-composer');
      return {
        width:innerWidth,height:innerHeight,
        greetingVisible:greeting.top>=feed.top&&greeting.bottom<=feed.bottom,
        welcomeFits:conversation.scrollHeight<=conversation.clientHeight+1,
        composerVisible:composer.bottom<=innerHeight&&composer.top>=feed.bottom,
        pageFits:document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth,
        agentsVisible:[...document.querySelectorAll('.crew-person')].every(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=greeting.top}),
        labelClearance:greeting.top-Math.max(...[...document.querySelectorAll('.crew-person')].map(el=>el.getBoundingClientRect().bottom)),
        quietWelcome:!document.querySelector('.room-preview-indicator')&&!document.querySelector('.room-header-middle')&&!document.querySelector('.composer-footnote').textContent.includes('Example mode'),
        bodyFont:getComputedStyle(document.querySelector('.room-welcome p')).fontFamily,
        displayFont:getComputedStyle(document.querySelector('.room-welcome h1')).fontFamily,
        fontLoaded:document.fonts.check('14px "SUSE Mono"'),
        scroll:conversation.scrollTop,overflowBy:conversation.scrollHeight-conversation.clientHeight
      };
    })()`);
    welcomeFit.push(fit);
    if (
      width === 1280 ||
      height === 667 ||
      height === 568 ||
      height === 540 ||
      (width === 1920 && height === 600)
    )
      await screenshot(`welcome-${width}x${height}`);
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click(".welcome-introduction button");
  await wait(200);
  await click(".crew-member-pip .crew-person");
  const introduced = await evaluate(
    "document.querySelector('.conversation-messages').textContent.includes('find businesses that fit your brief')",
  );
  const type = async (text) => {
    await evaluate("document.getElementById('crew-prompt').focus()");
    await send("Input.insertText", { text });
  };
  await type(
    "Find cleaning businesses in Manchester that could use a website.",
  );
  await click(".composer-send");
  await wait(3200);
  const discovering = await evaluate(
    "document.querySelector('.crew-scene-room').dataset.phase",
  );
  await screenshot("16-crew-on-a-mission");
  await click(".composer-stop");
  const paused = await evaluate(
    "document.querySelector('.crew-scene-room').dataset.phase==='paused'",
  );
  await click(".resume-mission");
  for (let i = 0; i < 65; i++) {
    if (
      await evaluate(
        "document.querySelector('.crew-scene-room').dataset.phase==='complete'",
      )
    )
      break;
    await wait(250);
  }
  const mission = await evaluate(
    `({phase:document.querySelector('.crew-scene-room').dataset.phase,leads:document.querySelectorAll('.conversation-results .lead-entry').length,review:document.querySelector('.conversation-messages').textContent.includes('withdrawn'),exampleLabel:document.querySelector('.results-note').textContent.includes('FICTIONAL')})`,
  );
  await screenshot("17-conversation-results");
  await click(".lead-entry .lead-save");
  await click(".lead-entry-links button:first-child");
  const evidence = await evaluate(
    "document.querySelectorAll('.lead-evidence>div').length",
  );
  await click(".lead-entry-links button:nth-child(2)");
  const draft = await evaluate(
    "!!document.querySelector('.lead-introduction textarea')",
  );
  await screenshot("18-inline-introduction");
  await click(".room-saved-button");
  await wait(150);
  const saved = await evaluate(
    "document.querySelectorAll('.saved-leads .lead-entry').length",
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
  await type("Only show the strongest opportunities.");
  await click(".composer-send");
  await wait(150);
  const filtered = await evaluate(
    "document.querySelector('.conversation-results:last-child')?.querySelectorAll('.lead-entry').length",
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(150);
  const mobileRoom = await evaluate(
    `({overflow:document.documentElement.scrollWidth>innerWidth,composer:document.querySelector('.chat-composer').getBoundingClientRect().bottom<=innerHeight,agents:document.querySelectorAll('.room-crew-area .crew-member').length})`,
  );
  await screenshot("19-mobile-conversation");
  await click(".room-header .icon-button");
  await wait(100);
  await screenshot("20-mobile-welcome");
  const savedSurvivesReset = await evaluate(
    "document.querySelector('.room-saved-button').textContent.includes('1')",
  );
  await click(".room-header .brand");
  await wait(500);
  await screenshot("21-mobile-hero");
  const mobileLandingOverflow = await evaluate(
    "document.documentElement.scrollWidth>innerWidth",
  );
  await evaluate(
    "document.getElementById('how-it-works').scrollIntoView({behavior:'instant'})",
  );
  await wait(150);
  await screenshot("22-mobile-crew");
  await click(".mobile-menu-button");
  const mobileMenu = await evaluate(
    "document.querySelector('.mobile-menu-button').getAttribute('aria-expanded')==='true'",
  );
  const report = {
    desktop,
    autoMorph,
    landingCrew,
    room,
    welcomeFit,
    introduced,
    discovering,
    paused,
    mission,
    evidence,
    draft,
    saved,
    filtered,
    mobileRoom,
    savedSurvivesReset,
    mobileLandingOverflow,
    mobileMenu,
    errors: [...new Set(errors)],
  };
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    errors.length ||
    desktop.overflow ||
    desktop.controls ||
    desktop.heroCards ||
    !autoMorph ||
    landingCrew !== 5 ||
    room.agents !== 5 ||
    room.forms ||
    room.sidebars ||
    room.overflow ||
    welcomeFit.some(
      (fit) =>
        !fit.greetingVisible ||
        !fit.welcomeFits ||
        !fit.composerVisible ||
        !fit.pageFits ||
        !fit.agentsVisible ||
        fit.labelClearance < 20 ||
        !fit.quietWelcome ||
        !fit.fontLoaded ||
        !fit.bodyFont.includes("SUSE Mono") ||
        !fit.displayFont.includes("Departure"),
    ) ||
    !introduced ||
    !paused ||
    mission.phase !== "complete" ||
    mission.leads !== 3 ||
    !mission.review ||
    !mission.exampleLabel ||
    evidence !== 3 ||
    !draft ||
    saved !== 1 ||
    filtered !== 1 ||
    mobileRoom.overflow ||
    !mobileRoom.composer ||
    !savedSurvivesReset ||
    mobileLandingOverflow ||
    !mobileMenu
  )
    process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
}
