// Headless checks for the New Year's office board.
// Countdown cases run in node. The same cases are loaded in headless Chrome,
// then a soak plays many clip ends and records heap, listeners, and frame drops.
import { createRequire } from "module";
import { execFileSync, spawnSync } from "child_process";
import crypto from "crypto";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const board = require("../board.config.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function check(cond, message) {
  if (!cond) failures.push(message);
}

function days(from, to) {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function chip(from) {
  return board.messageFor(board.parseISODate(from)).message;
}

function nyPartsFromIso(iso) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const bits = fmt.formatToParts(new Date(iso));
  const grab = (type) => Number(bits.find((part) => part.type === type).value);
  return { y: grab("year"), m: grab("month"), d: grab("day") };
}

const cases = [
  { date: "2026-01-01", mode: "greeting", message: "HAPPY NEW YEAR!" },
  { date: "2026-01-02", mode: "greeting", message: "HAPPY NEW YEAR!" },
  { date: "2026-01-03", mode: "countdown", until: "2027-01-01" },
  { date: "2026-10-27", mode: "countdown", until: "2027-01-01" },
  { date: "2026-12-30", mode: "countdown", until: "2027-01-01" },
  { date: "2026-12-31", mode: "countdown", until: "2027-01-01" },
  { date: "2027-01-01", mode: "greeting", message: "HAPPY NEW YEAR!" },
  { date: "2027-01-02", mode: "greeting", message: "HAPPY NEW YEAR!" },
  { date: "2027-01-03", mode: "countdown", until: "2028-01-01" },
  { date: "2024-02-29", mode: "countdown", until: "2025-01-01" },
  { date: "2025-12-31", mode: "countdown", until: "2026-01-01" },
  { date: "2028-01-02", mode: "greeting", message: "HAPPY NEW YEAR!" }
];

function expectedMessage(row) {
  if (row.message) return row.message;
  return chip(row.date);
}

function assertResolved(row, got, where) {
  const message = expectedMessage(row);
  const expectDays = row.mode === "countdown" ? days(row.date, row.until) : 0;
  const tag = where + " " + row.date;
  check(got.mode === row.mode, tag + " mode " + got.mode + " !== " + row.mode);
  check(got.message === message, tag + " message [" + got.message + "] !== [" + message + "]");
  check(got.days === expectDays, tag + " days " + got.days + " !== " + expectDays);
  if (row.mode === "countdown") {
    check(/^\d+D \d{2}H \d{2}M \d{2}S UNTIL NEW YEAR'S$/.test(got.message), tag + " format " + got.message);
  }
  if (got.clips) check(got.clips.length === 10, tag + " clip count " + got.clips.length);
  if (got.src) {
    check(String(got.src).indexOf("clips/ny") !== -1, tag + " playing " + got.src);
    check(got.count === 10, tag + " board count " + got.count);
  }
}

function sha10(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
}

function scheduleTests() {
  check(board.CONFIG.timeZone === "America/New_York", "timezone");
  check(board.CONFIG.greeting === "HAPPY NEW YEAR!", "greeting text");
  check(board.CONFIG.label === "NEW YEAR'S DAY", "label");
  check(board.CONFIG.clips.length === 10, "ten clips");

  const names = [];
  for (let n = 1; n <= 10; n++) names.push("ny" + String(n).padStart(2, "0") + ".mp4");
  const disk = fs.readdirSync(path.join(root, "clips")).filter((name) => name.endsWith(".mp4")).sort();
  check(disk.join() === names.join(), "clip filenames " + disk.join(","));

  const listed = board.CONFIG.clips.map((src) => path.basename(board.clipPath(src)));
  check(listed.join() === names.join(), "config names " + listed.join(","));
  for (let n = 0; n < names.length; n++) {
    const file = path.join(root, "clips", names[n]);
    const hash = sha10(file);
    check(board.CONFIG.clips[n] === "clips/" + names[n] + "?v=" + hash, names[n] + " ?v=" + hash);
  }

  for (const row of cases) {
    assertResolved(row, board.messageFor(board.parseISODate(row.date)), "node");
  }

  const at = (iso) => board.messageAt(Date.parse(iso));
  const nye = at("2027-01-01T05:00:00.000Z");
  check(nye.mode === "greeting" && nye.message === "HAPPY NEW YEAR!", "ny midnight greeting " + nye.message);
  const oneSec = at("2027-01-01T04:59:59.000Z");
  check(oneSec.message === "0D 00H 00M 01S UNTIL NEW YEAR'S", "one second left " + oneSec.message);
  const dec31 = at("2026-12-31T05:00:00.000Z");
  check(dec31.message === "1D 00H 00M 00S UNTIL NEW YEAR'S" && dec31.days === 1, "dec 31 midnight " + dec31.message);
  const dec31s = at("2026-12-31T05:00:01.000Z");
  check(dec31s.message === "0D 23H 59M 59S UNTIL NEW YEAR'S", "dec 31 plus 1s " + dec31s.message);
  const jan2late = at("2027-01-03T04:59:59.000Z");
  check(jan2late.mode === "greeting" && jan2late.message === "HAPPY NEW YEAR!", "jan 2 still greets " + jan2late.message);
  const jan3 = at("2027-01-03T05:00:00.000Z");
  const jan3Left = Date.parse("2028-01-01T05:00:00.000Z") - Date.parse("2027-01-03T05:00:00.000Z");
  check(jan3.mode === "countdown" && jan3.days === Math.floor(jan3Left / 86400000) && jan3.hours === 0, "jan 3 rolls " + jan3.message);
  const oct = at("2026-10-27T04:00:00.000Z");
  const octLeft = Date.parse("2027-01-01T05:00:00.000Z") - Date.parse("2026-10-27T04:00:00.000Z");
  check(oct.days === Math.floor(octLeft / 86400000) && oct.hours === Math.floor((octLeft % 86400000) / 3600000) && oct.minutes === 0 && oct.seconds === 0, "edt extra hour " + JSON.stringify(oct));
  check(board.wallClockUtc(2027, 1, 1, 0, 0, 0) === Date.parse("2027-01-01T05:00:00.000Z"), "jan 1 is 05:00 UTC");
  check(board.parseISODate("2026-02-31") === null, "reject Feb 31");
  check(board.parseISODate("2026-13-01") === null, "reject month 13");
  check(board.parseISODate("nope") === null, "reject bad date");
  check(board.parseISODate("2026-1-01") === null, "reject short month");

  const sample = board.CONFIG.clips;
  let repeats = 0;
  let prev = "";
  let order = board.shuffleClips(sample, "");
  for (let cycle = 0; cycle < 40; cycle++) {
    const paths = order.map(board.clipPath);
    check(new Set(paths).size === paths.length, "shuffle unique");
    if (prev && paths[0] === prev) repeats += 1;
    prev = paths[paths.length - 1];
    order = board.shuffleClips(sample, prev);
  }
  check(repeats === 0, "back-to-back repeats " + repeats);

  const rotated = board.rotateTo(sample, "clips/ny04.mp4");
  check(board.clipPath(rotated[0]) === "clips/ny04.mp4", "rotate starts at ny04");
  check(rotated.length === 10, "rotate length");

  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const version = (html.match(/styles\.css\?v=([A-Za-z0-9]+)/) || [])[1];
  check(version && html.includes("app.js?v=" + version), "app.js version");
  check(version && html.includes("board.config.js?v=" + version), "config version");
  check(version && sw.includes("styles.css?v=" + version) && sw.includes("app.js?v=" + version) && sw.includes("board.config.js?v=" + version), "sw shell version");
  check(sw.includes('var CACHE = "newyears-board-v1"'), "cache name");
  check(sw.includes("key.indexOf(PREFIX) === 0 && key !== CACHE"), "cache delete stays on this board");
  check(fs.existsSync(path.join(root, ".nojekyll")), ".nojekyll");
  check(readme.includes("https://ross680.github.io/NewYears-Office-Board/"), "readme url");
  check(app.includes('num("stall", 8, 1, 120)'), "stall default");
  check(app.includes('num("reload", 4, 0, 168)'), "reload default");
  check(app.includes("const FAIL_LIMIT = 3"), "fail limit");
  check(app.includes("const HARD_EXTRA_MS = 15 * 60 * 1000"), "hard fallback");
  check(app.includes('navigator.wakeLock.request("screen")'), "wake lock");
  check(app.includes('addEventListener("visibilitychange"'), "visibility");
  check(app.includes("nyb_"), "storage prefix");
  check(!/["']hol_/.test(app), "no holiday storage keys");
  check(!html.includes("holiday.config.js"), "no holiday config");

  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  check(css.includes("object-fit:contain"), "css contain");
  check(css.includes("background:#000"), "css black");
  check(css.includes("cursor:none"), "css cursor");
  check(!css.includes("rgba(") && !css.includes("hsla("), "css has no translucent color");
  check(!/opacity:\s*0\.\d/.test(css), "css has no partial opacity");

  probeClips();
}

function probeClips() {
  for (let n = 1; n <= 10; n++) {
    const name = "ny" + String(n).padStart(2, "0") + ".mp4";
    const file = path.join(root, "clips", name);
    const raw = execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_name,profile,level,width,height,codec_type,pix_fmt,avg_frame_rate,channels",
      "-of", "json",
      file
    ], { encoding: "utf8" });
    const parsed = JSON.parse(raw);
    const video = parsed.streams.find((stream) => stream.codec_type === "video");
    const audio = parsed.streams.find((stream) => stream.codec_type === "audio");
    check(!!video, name + " video stream");
    if (!video) continue;
    check(video.codec_name === "h264", name + " codec " + video.codec_name);
    check(video.profile === "Main", name + " profile " + video.profile);
    check(Number(video.level) === 40, name + " level " + video.level);
    check(video.width === 1920 && video.height === 1080, name + " size " + video.width + "x" + video.height);
    check(video.pix_fmt === "yuv420p", name + " pix_fmt " + video.pix_fmt);
    check(video.avg_frame_rate === "24/1", name + " fps " + video.avg_frame_rate);
    const duration = Number(parsed.format.duration);
    check(duration > 14.95 && duration < 15.05, name + " duration " + duration);
    check(audio && audio.codec_name === "aac", name + " audio");
    const probed = spawnSync("ffmpeg", [
      "-hide_banner", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"
    ], { encoding: "utf8" });
    const volume = (probed.stdout || "") + "\n" + (probed.stderr || "");
    const max = /max_volume:\s*(-inf|-?\d+(?:\.\d+)?)\s*dB/.exec(volume);
    const db = !max ? NaN : max[1] === "-inf" ? -Infinity : Number(max[1]);
    check(max && db <= -70, name + " not silent " + (max && max[1]));
    const bytes = fs.readFileSync(file);
    const moov = bytes.indexOf("moov");
    const mdat = bytes.indexOf("mdat");
    check(moov > 0 && mdat > moov, name + " faststart");
  }
}

function mime(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function startServer(control) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (control && control.failMedia && pathname.endsWith(".mp4")) {
      res.writeHead(500, { "Content-Type": "text/plain", "Cache-Control": "no-cache" });
      res.end("fail");
      return;
    }
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.normalize(path.join(root, pathname));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const type = mime(file);
      const range = req.headers.range;
      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Number(match[2]) : stat.size - 1;
          res.writeHead(206, {
            "Content-Type": type,
            "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
            "Accept-Ranges": "bytes",
            "Content-Length": end - start + 1,
            "Cache-Control": "no-cache"
          });
          fs.createReadStream(file, { start: start, end: end }).pipe(res);
          return;
        }
      }
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache"
      });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function listenerCount(cdp, expression) {
  const evaluated = await cdp.send("Runtime.evaluate", { expression: expression, returnByValue: false });
  if (!evaluated.result || !evaluated.result.objectId) return -1;
  const listed = await cdp.send("DOMDebugger.getEventListeners", { objectId: evaluated.result.objectId });
  return listed.listeners.length;
}

async function videoObjectCount(cdp) {
  const evaluated = await cdp.send("Runtime.evaluate", {
    expression: "HTMLVideoElement.prototype",
    returnByValue: false
  });
  const objects = await cdp.send("Runtime.queryObjects", { prototypeObjectId: evaluated.result.objectId });
  const counted = await cdp.send("Runtime.callFunctionOn", {
    objectId: objects.objects.objectId,
    functionDeclaration: "function(){return this.length}",
    returnByValue: true
  });
  return counted.result.value;
}

async function heapUsed(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const row = metrics.find((metric) => metric.name === "JSHeapUsedSize");
  return row ? row.value : 0;
}

async function browserTests(base, control) {
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--enable-precise-memory-info",
      "--mute-audio",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding"
    ]
  });
  const report = { dates: 0, soak: null, offline: null, wake: null, screenshots: [] };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    page.on("pageerror", (err) => failures.push("pageerror " + err.message));

    async function openBoard(query) {
      await page.goto(base + "/" + query, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => window.__board && window.__board.count === 10 && window.__board.message, { timeout: 15000 });
      return page.evaluate(() => {
        const boardState = window.__board;
        const chipEl = document.getElementById("countdown");
        const vid = document.getElementById("vid");
        return {
          holiday: boardState.holiday,
          mode: boardState.mode,
          days: boardState.days,
          message: boardState.message,
          src: boardState.src,
          count: boardState.count,
          hidden: chipEl.hidden,
          videos: boardState.videos,
          muted: vid.muted,
          playsInline: vid.playsInline
        };
      });
    }

    for (const row of cases) {
      const got = await openBoard("?date=" + row.date);
      report.dates += 1;
      assertResolved(row, got, "chrome");
      check(got.hidden === false, "chrome chip hidden " + row.date);
      check(got.videos === 1, "chrome video elements " + got.videos + " at " + row.date);
      check(got.muted === true, "muted " + row.date);
      check(got.playsInline === true, "playsinline " + row.date);
      check(got.holiday === "ny", "holiday tag " + row.date);
    }

    const styled = await openBoard("?date=2026-10-27");
    check(styled.message === chip("2026-10-27"), "style page message");
    const css = await page.evaluate(() => {
      const vid = document.getElementById("vid");
      const chipEl = document.getElementById("countdown");
      const stage = document.getElementById("stage");
      const controls = document.getElementById("controls");
      const vs = getComputedStyle(vid);
      const cs = getComputedStyle(chipEl);
      const rect = chipEl.getBoundingClientRect();
      return {
        objectFit: vs.objectFit,
        vidOpacity: vs.opacity,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        stageBg: getComputedStyle(stage).backgroundColor,
        htmlCursor: getComputedStyle(document.documentElement).cursor,
        cursor: getComputedStyle(stage).cursor,
        chipBg: cs.backgroundColor,
        chipOpacity: cs.opacity,
        chipAnimation: cs.animationName,
        chipTransition: cs.transitionDuration,
        chipShadow: cs.boxShadow,
        chipFilter: cs.backdropFilter || cs.webkitBackdropFilter || "none",
        chipFont: cs.fontSize,
        controlsVisibility: getComputedStyle(controls).visibility,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        ids: [...stage.children].map((el) => el.id)
      };
    });
    check(css.objectFit === "contain", "object-fit " + css.objectFit);
    check(css.vidOpacity === "1", "video opacity " + css.vidOpacity);
    check(css.bodyBg === "rgb(0, 0, 0)" && css.stageBg === "rgb(0, 0, 0)", "background " + css.bodyBg);
    check(css.cursor === "none" && css.htmlCursor === "none", "cursor " + css.cursor + " " + css.htmlCursor);
    check(css.chipBg === "rgb(26, 12, 12)", "chip background " + css.chipBg);
    check(css.chipOpacity === "1", "chip opacity " + css.chipOpacity);
    check(css.chipAnimation === "none", "chip animation " + css.chipAnimation);
    check(!css.chipTransition || css.chipTransition.indexOf("0s") === 0, "chip transition " + css.chipTransition);
    check(css.chipShadow === "none", "chip shadow " + css.chipShadow);
    check(!css.chipFilter || css.chipFilter === "none", "chip backdrop " + css.chipFilter);
    check(css.chipFont === "22px", "chip font " + css.chipFont);
    check(css.controlsVisibility === "hidden", "controls visible");
    check(css.rect.top >= 10 && css.rect.top <= 24, "chip top " + JSON.stringify(css.rect));
    check(css.rect.right >= 1890 && css.rect.right <= 1910, "chip right " + JSON.stringify(css.rect));
    check(css.rect.left > 1300 && css.rect.width <= 480 && css.rect.height <= 48, "chip compact " + JSON.stringify(css.rect));
    check(css.ids.join(",") === "vid,countdown,counter,controls", "stage children " + css.ids.join(","));
    const fit = await page.evaluate(() => {
      const el = document.getElementById("countdown");
      const prev = el.textContent;
      el.textContent = "364D 23H 59M 59S UNTIL NEW YEAR'S";
      const range = document.createRange();
      range.selectNodeContents(el);
      const textW = range.getBoundingClientRect().width;
      const cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      el.textContent = prev;
      return { textW: textW, inner: inner };
    });
    check(fit.textW > 0 && fit.textW <= fit.inner + 0.5, "chip text fits " + JSON.stringify(fit));

    const loadsBefore = await page.evaluate(() => Number(localStorage.getItem("nyb_loads") || 0));
    const srcBefore = styled.src;
    await page.evaluate(() => {
      window.__parts = () => ({ y: 2027, m: 1, d: 1 });
      window.__recheck();
    });
    let flipped = await page.evaluate(() => window.__board);
    check(flipped.mode === "greeting" && flipped.message === "HAPPY NEW YEAR!", "recheck Jan 1 " + flipped.message);
    check(flipped.count === 10 && flipped.videos === 1, "recheck keeps playlist");
    check(flipped.src === srcBefore, "recheck does not restart the clip");
    await page.evaluate(() => {
      window.__parts = () => ({ y: 2027, m: 1, d: 3 });
      window.__recheck();
    });
    flipped = await page.evaluate(() => window.__board);
    check(flipped.mode === "countdown" && flipped.message === board.messageFor({ y: 2027, m: 1, d: 3 }).message, "recheck Jan 3 " + flipped.message);
    const loadsAfter = await page.evaluate(() => Number(localStorage.getItem("nyb_loads") || 0));
    check(loadsAfter === loadsBefore, "recheck reloaded the page");

    const tickPage = await browser.newPage();
    await tickPage.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await tickPage.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await tickPage.waitForFunction(() => window.__board && /^\d+D \d{2}H \d{2}M \d{2}S UNTIL NEW YEAR'S$/.test(window.__board.message), { timeout: 15000 });
    const ticking = await tickPage.evaluate(() => {
      const el = document.getElementById("countdown");
      const box = el.getBoundingClientRect();
      return { message: window.__board.message, left: box.left, top: box.top, width: box.width, height: box.height };
    });
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const ticked = await tickPage.evaluate(() => {
      const el = document.getElementById("countdown");
      const box = el.getBoundingClientRect();
      return { message: window.__board.message, left: box.left, top: box.top, width: box.width, height: box.height };
    });
    check(ticked.message !== ticking.message, "countdown ticks " + ticking.message + " -> " + ticked.message);
    check(ticked.left === ticking.left && ticked.top === ticking.top && ticked.width === ticking.width && ticked.height === ticking.height, "chip box stays put");
    await tickPage.close();

    const zoneCases = [
      "2026-01-01T04:59:00Z",
      "2026-01-01T05:00:00Z",
      "2026-01-03T04:59:00Z",
      "2026-01-03T05:00:00Z",
      "2026-10-27T03:59:00Z",
      "2026-10-27T04:00:00Z"
    ];
    const octBefore = nyPartsFromIso(zoneCases[4]);
    const octAfter = nyPartsFromIso(zoneCases[5]);
    check(octBefore.d !== octAfter.d, "NY midnight split " + JSON.stringify(octBefore) + " " + JSON.stringify(octAfter));
    for (const iso of zoneCases) {
      const zonePage = await browser.newPage();
      await zonePage.evaluateOnNewDocument((value) => {
        window.__now = () => new Date(value);
      }, iso);
      await zonePage.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await zonePage.waitForFunction(() => window.__board && window.__board.message, { timeout: 15000 });
      const got = await zonePage.evaluate(() => window.__board.message);
      const expect = board.messageAt(Date.parse(iso)).message;
      check(got === expect, "zone " + iso + " [" + got + "] !== [" + expect + "]");
      await zonePage.close();
    }

    const art = "/opt/cursor/artifacts";
    fs.mkdirSync(art, { recursive: true });
    const countdownShot = path.join(art, "newyear_countdown_chip.png");
    const greetingShot = path.join(art, "newyear_greeting_chip.png");
    if (process.env.SKIP_SHOTS === "1") {
      report.screenshots.push(countdownShot, greetingShot);
    } else {
    await page.goto(base + "/?date=2026-10-27", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => {
      const vid = document.getElementById("vid");
      const chipEl = document.getElementById("countdown");
      return window.__board && window.__board.message.indexOf("UNTIL NEW YEAR'S") > 0 && chipEl.hidden === false && vid.videoWidth > 100 && vid.currentTime > 0.4;
    }, { timeout: 20000 });
    await page.screenshot({ path: countdownShot });
    report.screenshots.push(countdownShot);

    await page.goto(base + "/?date=2027-01-01", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => {
      const vid = document.getElementById("vid");
      const chipEl = document.getElementById("countdown");
      return window.__board && window.__board.message === "HAPPY NEW YEAR!" && chipEl.hidden === false && vid.videoWidth > 100 && vid.currentTime > 0.4;
    }, { timeout: 20000 });
    await page.screenshot({ path: greetingShot });
    report.screenshots.push(greetingShot);
    }

    const wakePage = await browser.newPage();
    await wakePage.evaluateOnNewDocument(() => {
      window.__wakeCalls = [];
      const fake = {
        request: async (type) => {
          window.__wakeCalls.push(type + ":" + document.hidden);
          return { released: true };
        }
      };
      try {
        Object.defineProperty(navigator, "wakeLock", { configurable: true, value: fake });
      } catch (e) {
        window.__wakeDefineError = String(e);
      }
    });
    await wakePage.goto(base + "/?date=2026-06-01", { waitUntil: "domcontentloaded", timeout: 30000 });
    await wakePage.waitForFunction(() => window.__board && window.__wakeCalls && window.__wakeCalls.length >= 1, { timeout: 15000 });
    await wakePage.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await wakePage.waitForFunction(() => window.__wakeCalls.length >= 2, { timeout: 5000 });
    report.wake = await wakePage.evaluate(() => window.__wakeCalls.slice());
    check(report.wake.filter((call) => call === "screen:false").length >= 2, "wake lock calls " + report.wake.join(","));
    await wakePage.close();

    await page.goto(base + "/?date=2026-11-02", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__board && navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 20000 });
    await page.evaluate(async () => {
      const markerUrl = location.origin + "/marker";
      const oldUrl = location.origin + "/old-marker";
      const foreign = await caches.open("holiday-board-v1");
      await foreign.put(markerUrl, new Response("keep"));
      const old = await caches.open("newyears-board-v0");
      await old.put(oldUrl, new Response("drop"));
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 });
    const cacheKeys = await page.evaluate(async () => {
      const keys = await caches.keys();
      const foreign = await caches.open("holiday-board-v1");
      const hit = await foreign.match(location.origin + "/marker");
      return { keys: keys, marker: hit ? await hit.text() : "" };
    });
    check(cacheKeys.marker === "keep", "foreign cache wiped");
    check(cacheKeys.keys.indexOf("newyears-board-v0") === -1, "old board cache kept " + cacheKeys.keys.join(","));
    check(cacheKeys.keys.indexOf("holiday-board-v1") !== -1, "foreign cache missing");

    await page.goto(base + "/?date=2026-08-01", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => {
      const vid = document.getElementById("vid");
      return window.__board && vid.videoWidth > 0 && navigator.serviceWorker && navigator.serviceWorker.controller;
    }, { timeout: 20000 });
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        const urls = reqs.map((entry) => entry.url);
        const ids = ["ny01", "ny02", "ny03", "ny04", "ny05", "ny06", "ny07", "ny08", "ny09", "ny10"];
        if (ids.every((id) => urls.some((url) => url.indexOf(id + ".mp4") !== -1))) return true;
      }
      return false;
    }, { timeout: 60000 });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => {
      const vid = document.getElementById("vid");
      return window.__board && window.__board.offline === true && window.__board.message.indexOf("NEW YEAR") !== -1 && vid.videoWidth > 0 && vid.currentTime > 0;
    }, { timeout: 20000 });
    report.offline = await page.evaluate(() => ({
      message: window.__board.message,
      src: window.__board.src,
      offline: window.__board.offline,
      width: document.getElementById("vid").videoWidth
    }));
    await page.setOfflineMode(false);
    await page.close();

    const stallContext = await browser.createBrowserContext();
    const stallPage = await stallContext.newPage();
    await stallPage.evaluateOnNewDocument(() => {
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const ret = original.apply(this, arguments);
        try { this.pause(); } catch (e) {}
        return ret;
      };
    });
    await stallPage.goto(base + "/?stall=1&date=2026-05-01", { waitUntil: "domcontentloaded", timeout: 30000 });
    await stallPage.waitForFunction(() => window.__board && window.__board.src, { timeout: 15000 });
    const firstSrc = await stallPage.evaluate(() => window.__board.src);
    const stallMarked = Date.now();
    await stallPage.waitForFunction((src) => {
      return window.__board && window.__board.src && window.__board.src !== src;
    }, { timeout: 10000 }, firstSrc);
    const stallElapsed = Date.now() - stallMarked;
    const stallErr = await stallPage.evaluate(() => localStorage.getItem("nyb_err") || "");
    check(stallElapsed < 10000, "stall skip waited " + stallElapsed);
    check(/stalled|playback rejected|error|no frames/.test(stallErr), "stall reason " + stallErr);
    await stallContext.close();

    const failContext = await browser.createBrowserContext();
    const failPage = await failContext.newPage();
    failPage.on("pageerror", (err) => failures.push("fail pageerror " + err.message));
    control.failMedia = true;
    try {
      await failPage.goto(base + "/?stall=1&date=2026-04-01", { waitUntil: "domcontentloaded", timeout: 30000 });
      await failPage.waitForFunction(() => location.search.indexOf("bust=") !== -1 && localStorage.getItem("nyb_reason") === "failures", { timeout: 30000 });
      const failReason = await failPage.evaluate(() => localStorage.getItem("nyb_reason"));
      check(failReason === "failures", "failure reload " + failReason);
    } catch (err) {
      let dump = "";
      try {
        dump = JSON.stringify(await failPage.evaluate(() => ({
          href: location.href,
          reason: localStorage.getItem("nyb_reason"),
          err: localStorage.getItem("nyb_err"),
          loads: localStorage.getItem("nyb_loads"),
          board: window.__board || null
        })));
      } catch (e) {
        dump = String(e);
      }
      failures.push("failure reload timeout " + err.message + " " + dump);
    } finally {
      control.failMedia = false;
      await failContext.close();
    }

    const hardContext = await browser.createBrowserContext();
    const hardPage = await hardContext.newPage();
    try {
      await hardPage.goto(base + "/?date=2026-06-15", { waitUntil: "domcontentloaded", timeout: 30000 });
      await hardPage.waitForFunction(() => window.__board && window.__board.count === 10, { timeout: 15000 });
      await hardPage.evaluate(() => {
        window.__nowMs = () => Date.now() + 5 * 3600 * 1000;
      });
      await hardPage.waitForFunction(() => location.search.indexOf("bust=") !== -1 && localStorage.getItem("nyb_reason") === "hard", { timeout: 10000 });
      const hardReason = await hardPage.evaluate(() => localStorage.getItem("nyb_reason"));
      check(hardReason === "hard", "hard reload " + hardReason);
    } catch (err) {
      let dump = "";
      try {
        dump = JSON.stringify(await hardPage.evaluate(() => ({
          href: location.href,
          reason: localStorage.getItem("nyb_reason"),
          err: localStorage.getItem("nyb_err"),
          board: window.__board || null
        })));
      } catch (e) {
        dump = String(e);
      }
      failures.push("hard reload timeout " + err.message + " " + dump);
    } finally {
      await hardContext.close();
    }

    const soakContext = await browser.createBrowserContext();
    const soak = await soakContext.newPage();
    await soak.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await soak.evaluateOnNewDocument(() => {
      window.__rate = 1;
      window.__quality = [];
      window.__seq = [];
      window.__repeats = [];
      const originalAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, fn, opts) {
        if (type === "ended" && this && this.id === "vid" && !window.__qualityHooked) {
          window.__qualityHooked = true;
          let pending = null;
          const readQuality = function () {
            const quality = typeof this.getVideoPlaybackQuality === "function"
              ? this.getVideoPlaybackQuality()
              : { droppedVideoFrames: 0, totalVideoFrames: 0 };
            return {
              dropped: quality.droppedVideoFrames || 0,
              total: quality.totalVideoFrames || 0,
              rate: this.playbackRate || 1
            };
          };
          originalAdd.call(this, "timeupdate", function () {
            const row = readQuality.call(this);
            if (row.total > 0) pending = row;
          });
          originalAdd.call(this, "ended", function () {
            const row = readQuality.call(this);
            if (row.total === 0 && pending) {
              row.dropped = pending.dropped;
              row.total = pending.total;
              row.rate = pending.rate;
            }
            pending = null;
            window.__quality.push(row);
            if (window.__quality.length >= 2) window.__rate = 4;
          });
        }
        return originalAdd.call(this, type, fn, opts);
      };
      window.addEventListener("DOMContentLoaded", () => {
        const vid = document.getElementById("vid");
        let last = "";
        vid.addEventListener("loadstart", () => {
          const clip = (vid.getAttribute("src") || "").split("?")[0];
          if (!clip) return;
          if (last && clip === last) window.__repeats.push(clip);
          last = clip;
          window.__seq.push(clip);
        });
      });
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        try { this.playbackRate = window.__rate || 1; } catch (e) {}
        return original.apply(this, arguments);
      };
    });
    const cdp = await soak.createCDPSession();
    await cdp.send("Performance.enable");
    await cdp.send("Runtime.enable");
    await soak.goto(base + "/?date=2026-11-15", { waitUntil: "domcontentloaded", timeout: 30000 });
    await soak.waitForFunction(() => window.__seq && window.__seq.length >= 1, { timeout: 20000 });

    const samples = [];
    async function sample(label) {
      const dom = await soak.evaluate(() => ({
        nodes: document.querySelectorAll("*").length,
        videos: document.querySelectorAll("video").length,
        ends: window.__quality.length,
        seq: window.__seq.length,
        repeats: window.__repeats.slice(),
        failures: window.__board.failures,
        loads: Number(localStorage.getItem("nyb_loads") || 0)
      }));
      let listeners = {};
      let videos = dom.videos;
      let heap = 0;
      try { listeners.vid = await listenerCount(cdp, "document.getElementById('vid')"); } catch (e) { listeners.vid = -1; }
      try { listeners.window = await listenerCount(cdp, "window"); } catch (e) { listeners.window = -1; }
      try { listeners.document = await listenerCount(cdp, "document"); } catch (e) { listeners.document = -1; }
      try { videos = await videoObjectCount(cdp); } catch (e) {}
      try { heap = await heapUsed(cdp); } catch (e) {}
      const row = Object.assign({ label: label, heap: heap, videoObjects: videos }, dom, { listeners: listeners });
      samples.push(row);
      return row;
    }

    await sample("start");
    const deadline = Date.now() + 600000;
    let lastSeq = 0;
    while (Date.now() < deadline) {
      const ends = await soak.evaluate(() => window.__quality.length);
      if (ends >= 24) break;
      const seq = await soak.evaluate(() => window.__seq.length);
      if (seq !== lastSeq && seq % 4 === 0) await sample("clip-" + seq);
      lastSeq = seq;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const finalRow = await sample("end");
    const quality = await soak.evaluate(() => ({
      quality: window.__quality,
      seq: window.__seq,
      repeats: window.__repeats,
      reason: localStorage.getItem("nyb_reason") || ""
    }));
    const realtime = quality.quality.filter((row) => row.rate < 1.5);
    const sped = quality.quality.filter((row) => row.rate >= 1.5);
    const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
    report.soak = {
      clipsStarted: quality.seq.length,
      clipEnds: quality.quality.length,
      repeats: quality.repeats,
      reloadReason: quality.reason,
      samples: samples,
      realtime: {
        clips: realtime.length,
        totalFrames: sum(realtime, "total"),
        droppedFrames: sum(realtime, "dropped")
      },
      spedUp: {
        clips: sped.length,
        totalFrames: sum(sped, "total"),
        droppedFrames: sum(sped, "dropped")
      }
    };

    check(quality.quality.length >= 24, "soak ended " + quality.quality.length + " clips");
    check(quality.seq.length >= 24, "soak started " + quality.seq.length + " clips");
    check(quality.repeats.length === 0, "soak back-to-back " + quality.repeats.join(","));
    check(!quality.reason, "unexpected reload " + quality.reason);
    check(finalRow.failures === 0, "soak failures " + finalRow.failures);
    check(finalRow.videos === 1, "document videos " + finalRow.videos);
    check(finalRow.videoObjects === samples[0].videoObjects, "video objects " + samples[0].videoObjects + " -> " + finalRow.videoObjects);
    check(finalRow.videoObjects <= 2, "video objects high " + finalRow.videoObjects);
    check(finalRow.heap > 0, "heap unavailable");
    const startNodes = samples[0].nodes;
    check(finalRow.nodes - startNodes <= 2, "DOM grew " + startNodes + " -> " + finalRow.nodes);
    for (const kind of ["vid", "window", "document"]) {
      const a = samples[0].listeners[kind];
      const b = finalRow.listeners[kind];
      if (a >= 0 && b >= 0) check(b <= a, kind + " listeners " + a + " -> " + b);
    }
    const warmed = samples.find((row) => row.seq >= 4) || samples[0];
    const heapGrowth = finalRow.heap - warmed.heap;
    check(heapGrowth < 24 * 1024 * 1024, "heap growth " + Math.round(heapGrowth / 1048576) + "MB");
    check(report.soak.realtime.clips >= 2, "realtime clips " + report.soak.realtime.clips);
    check(report.soak.realtime.totalFrames > 0, "no realtime frames");
    console.log("1x frame drops: " + report.soak.realtime.droppedFrames + " / " + report.soak.realtime.totalFrames + " across " + report.soak.realtime.clips + " clips");
    await soakContext.close();
  } finally {
    await browser.close();
  }
  return report;
}

scheduleTests();
if (failures.length) {
  console.log(JSON.stringify({ ok: false, failures: failures }, null, 2));
  process.exit(1);
}

const control = { failMedia: false };
const server = await startServer(control);
const base = "http://127.0.0.1:" + server.address().port;
let report;
try {
  report = await browserTests(base, control);
} finally {
  server.close();
}

const ok = failures.length === 0;
console.log(JSON.stringify({ ok: ok, failures: failures, report: report }, null, 2));
process.exit(ok ? 0 : 1);
