import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Uses the already-installed browser; no browser binary is downloaded.
const qaBase = process.env.QUIL_QA_URL || "http://127.0.0.1:4173";
const qaHealth = await (await fetch(new URL("/api/health", qaBase))).json();
if (qaHealth.mode !== "fixture")
  throw Error(
    "Full browser QA requires a fixture-mode backend; no live runs were started.",
  );
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
let runCreates = 0;
let expectedNetworkFailure = false;
try {
  let version;
  for (let i = 0; i < 50; i++) {
    try {
      version = await (await fetch("http://127.0.0.1:9227/json/version")).json();
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
        if (message.error) request.reject(Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      }
    }
    if (
      message.method === "Network.requestWillBeSent" &&
      message.params.request.method === "POST" &&
      message.params.request.url.split("?")[0].endsWith("/api/runs")
    )
      runCreates++;
    if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
    if (
      message.method === "Log.entryAdded" &&
      message.params.entry.level === "error" &&
      !(
        expectedNetworkFailure &&
        /api\/brief|ERR_BLOCKED_BY_CLIENT/.test(
          message.params.entry.text + " " + message.params.entry.url,
        )
      )
    )
      errors.push(
        message.params.entry.text +
          (message.params.entry.url ? " " + message.params.entry.url.split("?")[0] : ""),
      );
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const click = async (selector) =>
    evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});el.focus();el.click();return true})()`,
    );
  const screenshot = async (name) => {
    const result = await send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 82,
      captureBeyondViewport: false,
    });
    await writeFile(path.join(out, name + ".jpg"), Buffer.from(result.data, "base64"));
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "try{if(!sessionStorage.getItem('quil:qa-initialized')){localStorage.removeItem('quil:saved:v2');sessionStorage.removeItem('quil:active-run');sessionStorage.setItem('quil:qa-initialized','yes')}}catch{}",
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
  const qaUserId = await evaluate(
    "fetch('/api/session').then(r=>r.json()).then(r=>r.user.id)",
  );
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__quilQaUserId=${JSON.stringify(qaUserId)}`,
  });
  await evaluate(`window.__quilQaUserId=${JSON.stringify(qaUserId)}`);
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
        fontLoaded:document.fonts.check('16px system-ui'),
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
  await type("Find cleaning businesses in Manchester that could use a website.");
  await evaluate(
    "window.__pauseWatcher=setInterval(()=>{const b=document.querySelector('.composer-stop:not(:disabled)');if(b){clearInterval(window.__pauseWatcher);b.click()}},8)",
  );
  await click(".composer-send");
  for (let i = 0; i < 80; i++) {
    if (
      await evaluate(
        "document.querySelector('.crew-exchange')?.dataset.status==='paused'",
      )
    )
      break;
    await wait(50);
  }
  const discovering = await evaluate(
    "!!document.querySelector('.crew-exchange[data-status=paused]')",
  );
  const paused = discovering;
  await screenshot("16-crew-on-a-mission");
  const createsBeforeReload = runCreates;
  await send("Page.reload");
  for (let i = 0; i < 80; i++) {
    if (
      await evaluate(
        "document.querySelector('.crew-exchange')?.dataset.status==='paused'",
      )
    )
      break;
    await wait(50);
  }
  const refreshSameRun =
    runCreates === createsBeforeReload &&
    (await evaluate(
      "document.querySelector('.crew-exchange')?.dataset.status==='paused'",
    ));
  await evaluate("window.__sawLiveCrew=false;window.__crewObserver=setInterval(()=>{if(document.querySelector('.crew-activity-live .agent-contribution[data-state=working] .agent-sprite'))window.__sawLiveCrew=true},10)");
  await click(".resume-mission");
  for (let i = 0; i < 100; i++) {
    if (
      await evaluate(
        "document.querySelector('.crew-exchange')?.dataset.status==='completed'",
      )
    )
      break;
    await wait(60);
  }
  const serverVerified = await evaluate(
    `(async()=>{const saved=JSON.parse(sessionStorage.getItem('quil:'+window.__quilQaUserId+':active-run'));const response=await fetch('/api/runs/'+saved.run.id,{headers:{Authorization:'Bearer '+saved.accessToken}});const {run,usage}=await response.json();return run.status==='completed'&&run.mode==='fixture'&&usage.length===0&&document.querySelector('.answer-prose p').textContent===run.outcome.text&&document.querySelector('.crew-exchange').dataset.missionId===run.id})()`,
  );
  const mission = await evaluate(
    `({phase:document.querySelector('.crew-activity-live').dataset.phase,leads:document.querySelectorAll('.conversation-results .lead-entry').length,review:document.querySelector('.conversation-messages').textContent.includes('withdrawn'),exampleLabel:document.querySelector('.results-note').textContent.includes('FICTIONAL')})`,
  );
  const compactAnswer = await evaluate("!document.querySelector('details.crew-activity')&&!!document.querySelector('[aria-label=\"Copy answer\"]')&&getComputedStyle(document.querySelector('.exchange-brief')).borderLeftWidth==='0px'");
  await screenshot("53-clean-conversation-answer");
  const exchange = await evaluate(`(()=>{
    const nodes=[...document.querySelectorAll('.agent-contribution')];
    const rects=nodes.map(node=>node.getBoundingClientRect());
    const map=document.querySelector('.collaboration-map').getBoundingClientRect();
    const colors=nodes.map(node=>getComputedStyle(node.querySelector('p')).color);
    return {
      rounds:document.querySelectorAll('.crew-exchange').length,
      agents:nodes.length,
      branches:document.querySelectorAll('.collaboration-lines > g').length,
      distinctVoices:new Set(colors).size,
      coloredReplies:nodes.every(node=>getComputedStyle(node).color===getComputedStyle(node.querySelector('p')).color),
      separatePositions:rects.every((a,i)=>rects.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)),
      nodesFit:rects.every(r=>r.left>=map.left-1&&r.right<=map.right+1),
      sharedAnswers:document.querySelectorAll('.shared-outcome').length,
      primaryLeads:document.querySelectorAll('.conversation-results > .lead-entry').length,
      detailsClosed:!document.querySelector('.reviewed-others').open,
      resultVisible:document.querySelector('.shared-outcome').getBoundingClientRect().top>=document.querySelector('.room-conversation').getBoundingClientRect().top,
      persistentCrewVisible:document.querySelectorAll('.room-crew-area .agent-contribution').length===5&&document.querySelector('.room-crew-area').getBoundingClientRect().bottom<=document.querySelector('.room-conversation').getBoundingClientRect().top
      ,singleResponse:!document.querySelector('.outcome-summary')&&!document.querySelector('.lead-answer .lead-entry-top')&&!!document.querySelector('.answer-prose')
      ,unifiedAnswerColor:new Set([...document.querySelectorAll('.shared-outcome p,.shared-outcome span,.shared-outcome button,.shared-outcome h2,.shared-outcome summary')].map(el=>getComputedStyle(el).color)).size===1
    };
  })()`);
  const liveCrewObserved = await evaluate("(()=>{clearInterval(window.__crewObserver);return window.__sawLiveCrew})()");
  const simultaneousView = [];
  for (const [width,height] of [[1366,768],[960,540],[390,844],[375,568]]) {
    await send("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:width<600});
    await wait(150);
    simultaneousView.push(await evaluate(`(()=>{
      const f=document.querySelector('.room-conversation').getBoundingClientRect(),
        p=document.querySelector('.exchange-brief').getBoundingClientRect(),
        a=document.querySelector('.answer-prose').getBoundingClientRect(),
        c=document.querySelector('.crew-activity-live').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,requestVisible:p.top>=f.top-1&&p.bottom<=f.bottom+1,
        answerStartsVisible:a.top>=f.top&&a.top<f.bottom,answerFits:a.bottom<=f.bottom+1,
        crewVisible:c.top>=0&&c.bottom<=f.top,
        avatarsFit:[...document.querySelectorAll('.crew-live-person')].every(e=>{const r=e.getBoundingClientRect();return r.top>=c.top&&r.bottom<=c.bottom}),
        overflow:document.documentElement.scrollWidth>innerWidth};
    })()`));
    if (width===960 || width===375) await screenshot(`56-simultaneous-workspace-${width}`);
  }
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await wait(150);
  await screenshot("17-conversation-results");
  await evaluate(
    "(()=>{const feed=document.querySelector('.room-conversation');const exchange=document.querySelector('.crew-exchange');feed.scrollTo({top:feed.scrollTop+exchange.getBoundingClientRect().top-feed.getBoundingClientRect().top-20,behavior:'instant'})})()",
  );
  await wait(200);
  await screenshot("51-combined-crew-desktop");
  await click(".reviewed-others summary");
  const reviewedOthers = await evaluate(
    "document.querySelector('.reviewed-others').open&&document.querySelectorAll('.reviewed-others .lead-entry').length===2",
  );
  await click(".reviewed-others summary");
  await click(".lead-entry .lead-save");
  await click(".lead-entry-links button:first-child");
  const evidence = await evaluate(
    "document.querySelectorAll('.lead-evidence>div').length",
  );
  await click(".prospect-dialog[open] .prospect-sections button:nth-child(2)");
  const draft = await evaluate("!!document.querySelector('.lead-introduction textarea')");
  await screenshot("18-inline-introduction");
  await evaluate(
    "(()=>{const field=document.querySelector('.lead-introduction textarea');field.focus();field.setSelectionRange(field.value.length,field.value.length)})()",
  );
  await send("Input.insertText", { text: "\n\nA short outline is available." });
  const savedDraftUpdated = await evaluate(
    "JSON.parse(localStorage.getItem('quil:'+window.__quilQaUserId+':saved:v3'))[0].draft.includes('A short outline is available.')",
  );
  await evaluate(
    "[...document.querySelector('.prospect-dialog[open]').querySelectorAll('.prospect-sections button')].find(button=>button.textContent==='Offer').click()",
  );
  const tailoredOffer = await evaluate(
    "document.querySelector('.tailored-offer textarea')?.value.includes('To be agreed')",
  );
  await evaluate(
    "(()=>{const field=document.querySelector('.tailored-offer textarea');field.focus();field.setSelectionRange(field.value.length,field.value.length)})()",
  );
  await send("Input.insertText", { text: "\n\nScope reviewed by me." });
  const savedOfferUpdated = await evaluate(
    "JSON.parse(localStorage.getItem('quil:'+window.__quilQaUserId+':saved:v3'))[0].offer.includes('Scope reviewed by me.')",
  );
  await screenshot("64-editable-tailored-offer");
  await evaluate(
    "[...document.querySelector('.prospect-dialog[open]').querySelectorAll('.prospect-sections button')].find(button=>button.textContent==='Contact').click()",
  );
  const fictionalOutreachBlocked = await evaluate(
    "document.querySelector('.outreach-note')?.textContent.includes('fictional business')&&!document.querySelector('.outreach-compose')",
  );
  const businessDialog = await evaluate(`(()=>{
    const d=document.querySelector('.prospect-dialog[open]'),h=d.querySelector('header').getBoundingClientRect(),
      c=d.querySelector('.prospect-dialog-content').getBoundingClientRect();
    return d.querySelectorAll('.prospect-sections button').length===4&&h.bottom<=c.top&&d.scrollHeight===d.clientHeight;
  })()`);
  await click(".prospect-dialog[open] .prospect-close");
  await wait(80);
  const businessDialogClosed = await evaluate("!document.querySelector('.prospect-dialog[open]')&&document.activeElement?.closest('.lead-entry-links')!==null");
  await click(".room-saved-button");
  await wait(150);
  const saved = await evaluate(
    "document.querySelectorAll('.saved-leads .lead-entry').length",
  );
  const savedReadability = await evaluate("({color:getComputedStyle(document.querySelector('.saved-leads .lead-one-line')).color,font:getComputedStyle(document.querySelector('.saved-leads .lead-one-line')).fontSize})");
  await screenshot("54-readable-saved-opportunities");
  await click(".saved-leads .lead-remove");
  let savedRemoval = false;
  for (let i=0;i<30;i++) {
    savedRemoval = await evaluate("fetch('/api/me/saved').then(r=>r.json()).then(r=>r.saved.length===0&&!!document.querySelector('.saved-nothing'))");
    if (savedRemoval) break;
    await wait(100);
  }
  await send("Page.reload");
  for (let i=0;i<80;i++) {
    if (await evaluate("document.querySelector('.crew-exchange')?.dataset.status==='completed'")) break;
    await wait(60);
  }
  const removalSurvivesReload = await evaluate("JSON.parse(localStorage.getItem('quil:'+window.__quilQaUserId+':saved:v3')).length===0&&!document.querySelector('.room-saved-button').textContent.includes('1')");
  await click(".lead-entry .lead-save");
  await click(".room-saved-button");
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
  const createsBeforeCompletedReload = runCreates;
  await send("Page.reload");
  for (let i = 0; i < 80; i++) {
    if (
      await evaluate(
        "document.querySelector('.crew-exchange')?.dataset.status==='completed'",
      )
    )
      break;
    await wait(60);
  }
  const completedRecovery =
    runCreates === createsBeforeCompletedReload &&
    (await evaluate(
      "document.querySelectorAll('.shared-outcome').length===1&&document.querySelector('.room-saved-button').textContent.includes('1')",
    ));
  const createsBeforeFollowUp = runCreates;
  await click(".room-connect-button");
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!!document.querySelector('.google-setup')")) break;
    await wait(40);
  }
  const googleSetupHonest = await evaluate(
    "document.querySelector('.google-setup')?.textContent.includes('docs/ACCOUNTS.md')&&document.querySelector('.account-content .button').disabled",
  );
  await screenshot("65-google-connection-setup");
  await click(".side-sheet .icon-button");
  await type("Why did you choose Fern & Co. Cleaning?");
  await click(".composer-send");
  await wait(150);
  const freeFollowUp =
    runCreates === createsBeforeFollowUp &&
    (await evaluate(
      "[...document.querySelectorAll('.message-crew p')].at(-1)?.textContent.includes('Search snippets can be incomplete')",
    ));
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(150);
  const mobileRoom = await evaluate(
    `({overflow:document.documentElement.scrollWidth>innerWidth,composer:document.querySelector('.chat-composer').getBoundingClientRect().bottom<=innerHeight,agents:document.querySelectorAll('.room-crew-area .agent-contribution').length})`,
  );
  await screenshot("19-mobile-conversation");
  await evaluate(
    "(()=>{const feed=document.querySelector('.room-conversation');const exchange=document.querySelector('.crew-exchange');feed.scrollTo({top:feed.scrollTop+exchange.getBoundingClientRect().top-feed.getBoundingClientRect().top-16,behavior:'instant'})})()",
  );
  await wait(200);
  const mobileExchange = await evaluate(
    `(()=>{const map=document.querySelector('.collaboration-map').getBoundingClientRect();return {agents:document.querySelectorAll('.agent-contribution').length,overflow:document.documentElement.scrollWidth>innerWidth,nodesFit:[...document.querySelectorAll('.agent-contribution')].every(n=>{const r=n.getBoundingClientRect();return r.left>=map.left-1&&r.right<=map.right+1})}})()`,
  );
  await screenshot("52-combined-crew-mobile");
  await click(".room-saved-button");
  const mobileSaved = await evaluate("({fits:document.querySelector('.side-sheet').scrollWidth<=document.querySelector('.side-sheet').clientWidth,remove:!!document.querySelector('.saved-leads .lead-remove')})");
  await screenshot("55-mobile-saved-remove");
  await click(".saved-leads .lead-entry-links button:first-child");
  const mobileBusinessDialog = await evaluate(`(()=>{const d=document.querySelector('.prospect-dialog[open]'),r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth===d.clientWidth&&d.querySelector('.prospect-close').getBoundingClientRect().right<=innerWidth})()`);
  await screenshot("57-mobile-business-details");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape"});
  await send("Input.dispatchKeyEvent", {type:"keyUp",key:"Escape",code:"Escape"});
  await wait(80);
  const savedStaysOpen = await evaluate("!document.querySelector('.prospect-dialog[open]')&&!!document.querySelector('.saved-leads')");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape"});
  await send("Input.dispatchKeyEvent", {type:"keyUp",key:"Escape",code:"Escape"});
  await click(".room-header .icon-button");
  await wait(100);
  await screenshot("20-mobile-welcome");
  const savedSurvivesReset = await evaluate(
    "document.querySelector('.room-saved-button').textContent.includes('1')",
  );
  await evaluate(
    "window.__cancelWatcher=setInterval(()=>{const b=document.querySelector('.cancel-mission:not(:disabled)');if(b){clearInterval(window.__cancelWatcher);b.click()}},8)",
  );
  await click(".try-mission");
  for (let i = 0; i < 80; i++) {
    if (
      await evaluate(
        "document.querySelector('.crew-exchange')?.dataset.status==='cancelled'",
      )
    )
      break;
    await wait(50);
  }
  const cancelled = await evaluate(
    "document.querySelector('.crew-exchange')?.dataset.status==='cancelled'&&!document.querySelector('.shared-outcome')",
  );
  await click(".room-header .icon-button");
  await wait(150);
  const createsBeforeOffline = runCreates;
  expectedNetworkFailure = true;
  await send("Network.setBlockedURLs", { urls: ["*/api/brief"] });
  await type("Find cleaning businesses in Manchester that need a website.");
  await click(".composer-send");
  for (let i = 0; i < 60; i++) {
    if (await evaluate("!!document.querySelector('.mission-error')")) break;
    await wait(50);
  }
  const offlineHonest =
    runCreates === createsBeforeOffline &&
    (await evaluate(
      "!!document.querySelector('.mission-error')&&!document.querySelector('.crew-exchange')&&!document.querySelector('.shared-outcome')&&document.getElementById('crew-prompt').value.length>0",
    ));
  await send("Network.setBlockedURLs", { urls: [] });
  await wait(200);
  expectedNetworkFailure = false;
  await click(".composer-send");
  for (let i = 0; i < 100; i++) {
    if (
      await evaluate(
        "document.querySelector('.crew-exchange')?.dataset.status==='completed'",
      )
    )
      break;
    await wait(60);
  }
  const reconnected = await evaluate(
    "document.querySelector('.crew-exchange')?.dataset.status==='completed'&&!document.querySelector('.mission-error')",
  );
  await click(".room-header .icon-button");
  await wait(100);
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
  let accountIsolation = null;
  if (process.env.QUIL_QA_ACCOUNTS) {
    const [alice, bob] = JSON.parse(process.env.QUIL_QA_ACCOUNTS);
    const enterAccount = async (account) => {
      // Leave the old document before replacing its HTTP-only fixture cookie.
      // Otherwise its pending autosave correctly fails the stale-workspace guard.
      await send("Page.navigate", { url: "about:blank" });
      await wait(80);
      await send("Network.setCookie", {
        name: "quil_session",
        value: account.token,
        url: qaBase,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      });
      await send("Page.navigate", { url: qaBase + "/#/workspace" });
      // A fragment-only navigation retains the old React tree. Simulate a fresh
      // signed-in page load after replacing this fixture's HTTP-only cookie.
      await wait(120);
      const email = account.id.replace("browser-", "") + "@example.test";
      for (let i = 0; i < 80; i++) {
        if (
          await evaluate(
            `document.querySelector('.room-account-button')?.title===${JSON.stringify(email)}`,
          )
        )
          return;
        await wait(50);
      }
      throw Error("The fixture account did not open in the browser");
    };
    await enterAccount(alice);
    const startsEmpty = await evaluate(
      "!document.querySelector('.crew-exchange')&&!document.querySelector('.room-saved-button').textContent.includes('1')",
    );
    await type("Find cleaning businesses in Manchester that need a website.");
    await click(".composer-send");
    for (let i = 0; i < 120; i++) {
      if (
        await evaluate(
          "document.querySelector('.crew-exchange')?.dataset.status==='completed'",
        )
      )
        break;
      await wait(50);
    }
    await click(".lead-entry .lead-save");
    for (let i = 0; i < 50; i++) {
      if (
        await evaluate(
          "fetch('/api/me/saved').then(r=>r.json()).then(r=>r.saved.length===1)",
        )
      )
        break;
      await wait(50);
    }
    const aliceSaved = await evaluate(
      "(async()=> (await (await fetch('/api/me/saved')).json()).saved.length===1&&localStorage.getItem('quil:browser-alice:saved:v3')!==null)()",
    );
    await enterAccount(bob);
    const bobEmpty = await evaluate(
      "!document.querySelector('.crew-exchange')&&!document.querySelector('.room-saved-button').textContent.includes('1')&&fetch('/api/me/saved').then(r=>r.json()).then(r=>r.saved.length===0)",
    );
    await enterAccount(alice);
    for (let i = 0; i < 50; i++) {
      if (
        await evaluate(
          "document.querySelector('.room-saved-button').textContent.includes('1')",
        )
      )
        break;
      await wait(50);
    }
    const aliceRestored = await evaluate(
      "document.querySelector('.room-saved-button').textContent.includes('1')",
    );
    await click(".room-account-button");
    await click(".account-content .text-link");
    for (let i = 0; i < 50; i++) {
      if (
        await evaluate(
          "!!document.querySelector('.room-account-button[aria-label=\"Sign in to Quil\"]')",
        )
      )
        break;
      await wait(50);
    }
    const signedOutClean = await evaluate(
      "!document.querySelector('.crew-exchange')&&!document.querySelector('.room-saved-button').textContent.includes('1')&&Object.keys(localStorage).every(k=>!k.startsWith('quil:browser-alice:'))&&Object.keys(sessionStorage).every(k=>!k.startsWith('quil:browser-alice:'))",
    );
    accountIsolation = {
      startsEmpty,
      aliceSaved,
      bobEmpty,
      aliceRestored,
      signedOutClean,
    };
    if (Object.values(accountIsolation).some((value) => value !== true))
      throw Error(
        "Browser account isolation failed: " + JSON.stringify(accountIsolation),
      );
  }
  // Enter the workspace directly, as a returning user does. Earlier checks
  // began at home, which had already cached the lazily loaded animation.
  const homeNavigation = [];
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  for (const blockScene of [false, true]) {
    await send("Page.navigate", { url: "about:blank" });
    await wait(100);
    expectedNetworkFailure = blockScene;
    await send("Network.setBlockedURLs", { urls: blockScene ? ["*ParticleScene-*.js*"] : [] });
    await send("Page.navigate", { url: qaBase + "/#/workspace" });
    await wait(150);
    for (let i = 0; i < 100; i++) {
      if (await evaluate("!!document.querySelector('.room-header .brand')")) break;
      await wait(50);
    }
    await click(".room-header .brand");
    for (let i = 0; i < 100; i++) {
      if (await evaluate(blockScene ? "!!document.querySelector('.scene-recovery')" : "!!document.querySelector('.hero-section canvas')")) break;
      await wait(50);
    }
    homeNavigation.push(await evaluate(`({blocked:${blockScene},
      homeVisible:!!document.querySelector('.hero-section')&&!!document.querySelector('.site-header'),
      heading:document.querySelector('h1')?.textContent==='Your next client.Already in sight.',
      atTop:scrollY===0,homeRoute:!location.hash.startsWith('#/workspace'),
      animation:!!document.querySelector('.hero-section canvas'),
      fallback:!!document.querySelector('.scene-recovery'),
      usable:!!document.querySelector('.header-cta')&&!!document.querySelector('.site-footer')})`));
    if (blockScene) await screenshot("58-home-animation-recovery");
  }
  await send("Network.setBlockedURLs", { urls: [] });
  expectedNetworkFailure = false;
  const report = {
    homeNavigation,
    businessDialog, businessDialogClosed, mobileBusinessDialog, savedStaysOpen,
    desktop,
    autoMorph,
    landingCrew,
    room,
    welcomeFit,
    introduced,
    discovering,
    refreshSameRun,
    serverVerified,
    runCreates,
    paused,
    mission,
    exchange,
    liveCrewObserved,
    simultaneousView,
    compactAnswer,
    savedReadability,
    savedRemoval,
    removalSurvivesReload,
    reviewedOthers,
    mobileExchange,
    mobileSaved,
    evidence,
    draft,
    savedDraftUpdated,
    tailoredOffer,
    savedOfferUpdated,
    fictionalOutreachBlocked,
    googleSetupHonest,
    completedRecovery,
    freeFollowUp,
    cancelled,
    offlineHonest,
    reconnected,
    saved,
    filtered,
    mobileRoom,
    savedSurvivesReset,
    mobileLandingOverflow,
    mobileMenu,
    accountIsolation,
    errors: [...new Set(errors)],
  };
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
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
        !fit.bodyFont.includes("sans-serif") ||
        fit.bodyFont.includes("Mono") ||
        !fit.displayFont.includes("Departure"),
    ) ||
    !introduced ||
    !paused ||
    !refreshSameRun ||
    !serverVerified ||
    mission.phase !== "complete" ||
    mission.leads !== 3 ||
    !mission.review ||
    !mission.exampleLabel ||
    exchange.rounds !== 1 ||
    !compactAnswer ||
    homeNavigation.some(view => !view.homeVisible || !view.heading || !view.atTop || !view.homeRoute || !view.usable || (view.blocked ? !view.fallback : !view.animation)) ||
    !businessDialog || !businessDialogClosed || !mobileBusinessDialog || !savedStaysOpen ||
    savedReadability.color !== "rgb(237, 240, 245)" ||
    savedReadability.font !== "16px" ||
    exchange.agents !== 5 ||
    exchange.branches !== 5 ||
    exchange.distinctVoices !== 5 ||
    !exchange.coloredReplies ||
    !exchange.separatePositions ||
    !exchange.nodesFit ||
    exchange.sharedAnswers !== 1 ||
    exchange.primaryLeads !== 1 ||
    !exchange.detailsClosed ||
    !exchange.resultVisible ||
    !exchange.persistentCrewVisible ||
    !liveCrewObserved ||
    simultaneousView.some(view=>!view.requestVisible||!view.answerStartsVisible||!view.crewVisible||!view.avatarsFit||view.overflow||(view.width>600&&!view.answerFits)) ||
    !mobileSaved.fits ||
    !mobileSaved.remove ||
    !savedRemoval ||
    !removalSurvivesReload ||
    !exchange.singleResponse ||
    !exchange.unifiedAnswerColor ||
    !reviewedOthers ||
    mobileExchange.agents !== 5 ||
    mobileExchange.overflow ||
    !mobileExchange.nodesFit ||
    evidence < 1 ||
    !draft ||
    !savedDraftUpdated ||
    !tailoredOffer ||
    !savedOfferUpdated ||
    !fictionalOutreachBlocked ||
    !googleSetupHonest ||
    !completedRecovery ||
    !freeFollowUp ||
    !cancelled ||
    !offlineHonest ||
    !reconnected ||
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
