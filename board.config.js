// Single playlist for the New Year's office TV.
// Dates are calendar days in America/New_York.
// Clip filenames stay put (ny08.mp4 can be replaced later). When the bytes change,
// change that line's ?v= text to the first 10 hex characters of the new SHA-256.
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

  // Jan 1 and Jan 2 greet. Every other calendar day counts down to the next Jan 1.
  function messageFor(parts) {
    var y = parts.y;
    var m = parts.m;
    var d = parts.d;
    var greet = CONFIG.greetingDays;
    for (var i = 0; i < greet.length; i++) {
      if (m === 1 && d === greet[i]) {
        return { mode: "greeting", days: 0, message: CONFIG.greeting };
      }
    }
    var left = daysBetween(y, m, d, y + 1, CONFIG.anchor.month, CONFIG.anchor.day);
    var message = left === 1
      ? "1 DAY UNTIL " + CONFIG.label
      : left + " DAYS UNTIL " + CONFIG.label;
    return { mode: "countdown", days: left, message: message };
  }

  var api = {
    CONFIG: CONFIG,
    messageFor: messageFor,
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
