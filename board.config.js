// Single playlist for the New Year's office TV.
// The countdown clock is America/New_York, even when the TV is set to another zone.
// January 1 and January 2 greet. Every other moment counts down to the next
// January 1 at 12:00 AM Eastern. Clip filenames stay put (ny08.mp4 can be
// replaced later). When the bytes change, change that line's ?v= text to the
// first 10 hex characters of the new SHA-256.
(function (root) {
  var CONFIG = {
    timeZone: "America/New_York",
    label: "NEW YEAR'S DAY",
    greeting: "HAPPY NEW YEAR!",
    anchor: { month: 1, day: 1 },
    greetingDays: [1, 2],
    clips: [
      "clips/ny01.mp4?v=42e4bfbbe9",
      "clips/ny02.mp4?v=43bb63152a",
      "clips/ny03.mp4?v=369f0c75f3",
      "clips/ny04.mp4?v=c913dbb110",
      "clips/ny05.mp4?v=adb77b2915",
      "clips/ny06.mp4?v=e9e4458242",
      "clips/ny07.mp4?v=fddf94ea16",
      "clips/ny08.mp4?v=19657f0c84",
      "clips/ny09.mp4?v=2dbc2353e9",
      "clips/ny10.mp4?v=73365cecf0"
    ]
  };

  function padKey(y, m, d) {
    return y * 10000 + m * 100 + d;
  }

  function daysBetween(y1, m1, d1, y2, m2, d2) {
    var a = Date.UTC(y1, m1 - 1, d1);
    var b = Date.UTC(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000);
  }

  function clipPath(src) {
    return String(src || "").split("?")[0];
  }

  // Fisher-Yates. `avoid` is a clip path that must not land first when there is
  // another choice, so a reshuffle does not repeat the clip that just played.
  function shuffleClips(list, avoid) {
    var arr = list.slice();
    for (var n = arr.length - 1; n > 0; n--) {
      var j = Math.floor(Math.random() * (n + 1));
      var swap = arr[n];
      arr[n] = arr[j];
      arr[j] = swap;
    }
    var avoidPath = clipPath(avoid);
    if (avoidPath && arr.length > 1 && clipPath(arr[0]) === avoidPath) {
      var k = 1 + Math.floor(Math.random() * (arr.length - 1));
      var first = arr[0];
      arr[0] = arr[k];
      arr[k] = first;
    }
    return arr;
  }

  function rotateTo(list, srcPath) {
    var want = clipPath(srcPath);
    if (!want) return list.slice();
    var i = -1;
    for (var n = 0; n < list.length; n++) {
      if (clipPath(list[n]) === want) {
        i = n;
        break;
      }
    }
    if (i <= 0) return list.slice();
    return list.slice(i).concat(list.slice(0, i));
  }

  function parseISODate(raw) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw || "");
    if (!match) return null;
    var y = Number(match[1]);
    var m = Number(match[2]);
    var d = Number(match[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: m, d: d };
  }

  var wallFormatter = null;
  var targetKey = "";
  var targetMs = 0;

  function formatter() {
    if (wallFormatter) return wallFormatter;
    try {
      wallFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: CONFIG.timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch (e) {
      wallFormatter = null;
    }
    return wallFormatter;
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function readWall(date) {
    var fmt = formatter();
    if (!fmt) {
      return {
        y: date.getUTCFullYear(),
        m: date.getUTCMonth() + 1,
        d: date.getUTCDate(),
        hh: date.getUTCHours(),
        mm: date.getUTCMinutes(),
        ss: date.getUTCSeconds()
      };
    }
    var bits = fmt.formatToParts(date);
    var out = { y: 0, m: 0, d: 0, hh: 0, mm: 0, ss: 0 };
    var map = { year: "y", month: "m", day: "d", hour: "hh", minute: "mm", second: "ss" };
    for (var n = 0; n < bits.length; n++) {
      var key = map[bits[n].type];
      if (key) out[key] = Number(bits[n].value);
    }
    if (out.hh === 24) out.hh = 0;
    return out;
  }

  // Wall clock in America/New_York as a UTC millisecond instant. January 1 is
  // always Eastern Standard Time. The loop corrects DST on every other date,
  // so the TV's own timezone is never consulted.
  function wallClockUtc(y, m, d, hh, mm, ss) {
    var want = Date.UTC(y, m - 1, d, hh, mm, ss);
    if (!formatter()) return want + 5 * 3600000;
    var utc = want;
    for (var n = 0; n < 4; n++) {
      var gotParts = readWall(new Date(utc));
      var got = Date.UTC(gotParts.y, gotParts.m - 1, gotParts.d, gotParts.hh, gotParts.mm, gotParts.ss);
      var delta = got - want;
      if (delta === 0) return utc;
      utc -= delta;
    }
    return utc;
  }

  function isGreetingDay(m, d) {
    var greet = CONFIG.greetingDays;
    for (var i = 0; i < greet.length; i++) {
      if (m === 1 && d === greet[i]) return true;
    }
    return false;
  }

  function nextTarget(y) {
    var key = String(y);
    if (key !== targetKey) {
      targetKey = key;
      targetMs = wallClockUtc(y, CONFIG.anchor.month, CONFIG.anchor.day, 0, 0, 0);
    }
    return targetMs;
  }

  // Live remaining time until the next Jan 1, 12:00 AM America/New_York.
  // Jan 1 and Jan 2 keep the greeting. Jan 3 rolls the count to the year after.
  function messageAt(ms) {
    var wall = readWall(new Date(ms));
    if (isGreetingDay(wall.m, wall.d)) {
      return { mode: "greeting", days: 0, hours: 0, minutes: 0, seconds: 0, message: CONFIG.greeting };
    }
    var left = nextTarget(wall.y + 1) - ms;
    if (left < 0) left = 0;
    var total = Math.floor(left / 1000);
    var days = Math.floor(total / 86400);
    var hours = Math.floor((total % 86400) / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = total % 60;
    return {
      mode: "countdown",
      days: days,
      hours: hours,
      minutes: minutes,
      seconds: seconds,
      message: days + "D " + pad2(hours) + "H " + pad2(minutes) + "M " + pad2(seconds) + "S UNTIL NEW YEAR'S"
    };
  }

  // A calendar day with no clock time is 12:00 AM Eastern that day.
  function messageFor(parts) {
    var hh = parts.hh == null ? 0 : parts.hh;
    var mm = parts.mm == null ? 0 : parts.mm;
    var ss = parts.ss == null ? 0 : parts.ss;
    return messageAt(wallClockUtc(parts.y, parts.m, parts.d, hh, mm, ss));
  }

  var api = {
    CONFIG: CONFIG,
    messageFor: messageFor,
    messageAt: messageAt,
    wallClockUtc: wallClockUtc,
    parseISODate: parseISODate,
    shuffleClips: shuffleClips,
    rotateTo: rotateTo,
    clipPath: clipPath,
    daysBetween: daysBetween,
    padKey: padKey
  };

  root.NEW_YEAR_CONFIG = CONFIG;
  root.NewYearBoard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
