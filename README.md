# 3R New Year's Office TV

Static GitHub Pages board for the office TV at 3R Plumbing & Mechanical. Ten silent 15-second clips play in a loop, and a small countdown chip sits in the corner.

The TV opens <https://ross680.github.io/NewYears-Office-Board/>.

The player is the single-playlist form of the [Holiday Office Board](https://github.com/ross680/Holiday-Office-Board): one stage, one reused `<video>` element, a screen wake lock, a stall skip, and a reload so a TV left on for weeks picks up changes. Clips live in `clips/`.

## Countdown

The chip uses the calendar date in America/New_York. It is opaque, it does not animate, and it stays up while the clips play.

| When | Chip |
| --- | --- |
| January 1 and January 2 | `HAPPY NEW YEAR!` |
| December 31 | `1 DAY UNTIL NEW YEAR'S DAY` |
| Any other day | `N DAYS UNTIL NEW YEAR'S DAY`, counted to the next January 1 |

The date is read again every time the page loads, including the scheduled reload, and once a minute so midnight Eastern updates the chip on that tick. `?date=YYYY-MM-DD` pretends today is that America/New_York calendar day.

## Publish on GitHub Pages

The page is a normal static site. It does not call the GitHub API. Pages is not turned on from this repo; switch it on once in GitHub:

1. Push this folder to `main`.
2. In GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Branch: **main**. Folder: **/** (root).
5. Open <https://ross680.github.io/NewYears-Office-Board/> on the TV browser.

Pages can take a minute after the push. The TV may keep the previous `index.html` for about 10 minutes. The board reloads itself 4 hours after it was opened, after the current clip finishes, and the reload URL carries a `bust` query so the TV fetches a fresh copy. If a clip never ends, a second timer reloads at about 4 hours 15 minutes anyway. Each reload resolves the countdown again.

`.nojekyll` is in the repo so Pages serves the files as they are.

## URL options

- `?date=YYYY-MM-DD` pretends today is that America/New_York calendar day.
- `?reload=4` reloads 4 hours after the page opened (the default), after the current clip ends. `?reload=0` turns that scheduled reload, and the 4 hour 15 minute fallback, off.
- `?maxclip=60` is a hard cap per video, in seconds (default 60). A normal clip ends itself first.
- `?stall=8` skips a clip when playback time has not moved for 8 seconds (the default). The same skip happens on a media error, or on abort, emptied, or stalled once that clip is actually stuck.
- `?slide=3` starts on that clip in the shuffled list (1 is the first).
- `?fresh=1` loads a new page for every clip. Last resort for a TV that still leaks memory.
- `?debug=1` shows the clip name, countdown, uptime, page loads, and the last problem.

A clip that errors, or never produces a picture, is skipped. One bad file does not stop the board. Three failures in a row reload the page. If the network is down, the board keeps cycling whatever the service worker has cached and does not reload into a dead page. When the network comes back it tries the current clip again. A failure reload will not repeat for 3 minutes, so a bad file cannot reboot the TV in a loop.

## Controls

Right arrow or Space: next · Left arrow: previous · P: pause · M: sound on/off · F: fullscreen

Clips start muted so Chrome and TV browsers allow autoplay. M, or the sound button, turns sound on. The clips in this set are silent.

The pointer stays hidden. Move it to see the controls and the clip count (`3 / 10`). The pointer hides again after a few seconds still.

## Playlist order

The ten clips are shuffled when the board starts and again when the cycle wraps. The clip that just finished is not placed first, so the same file does not play back to back.

## Add or replace a clip

`board.config.js` is the only playlist. The board does not scan the folder. Filenames stay stable: `clips/ny01.mp4` through `clips/ny10.mp4`. A later redo of ny08 replaces that file and keeps the name `ny08.mp4`.

1. Put the new 16:9 file at the same path in `clips/`.
2. Change the `?v=` text on that line to the first 10 hex characters of the new file's SHA-256. Leave `?v=` alone when the bytes did not change, or the TV downloads the clip again for no reason.
3. Commit and push to `main`.

`app.js`, `styles.css`, and `board.config.js` are linked with `?v=20261027a`. Bump that text in `index.html` and the matching shell list in `sw.js` when you change those files so the TV does not keep an old copy.

## Keeping the picture moving

One `<video>` element in the page is reused. Each clip is detached (`pause`, clear `src`, `load()`) before the next one so the TV can free the decoder. The next file is warmed on a single off-screen video that is never added to the page. That warmer is aborted the same way before it takes another file.

If `play()` is rejected, the board mutes and tries once more, then skips. Listeners and timers are registered once for the life of the page, not once per clip.

Nothing translucent is painted over the video. The page background is black. The video uses `object-fit: contain`. The countdown chip is a small static opaque label. The screen wake lock is requested where the browser allows it, and requested again when the page becomes visible.

A service worker caches the page and the clips. After the TV has loaded them once, a network drop keeps the playlist playing from that cache. Saved resume state uses its own `nyb_` keys so it does not collide with the other office boards on the same `github.io` origin.

## Encoding

Every shipped clip is the file as delivered: 1920×1080, 24 fps, 15.0 seconds, H.264 Main profile level 4.0, yuv420p, faststart, plus a silent audio track. Playback is muted.

A lot of TVs only hardware-decode Baseline or Main. High profile with B-frames can stay black. If this TV does that, re-encode on a computer, put the new file in place of the old one, change `?v=`, and push:

```bash
ffmpeg -y -i "INPUT.mp4" \
  -c:v libx264 -profile:v main -level:v 4.0 -pix_fmt yuv420p \
  -r 24 -b:v 1800k -maxrate 2200k -bufsize 3600k -bf 0 \
  -an \
  -movflags +faststart \
  "OUTPUT.mp4"
```

If the picture is still black, use `-profile:v baseline -level:v 4.0 -bf 0` in place of the Main profile line.

## Tests

`npm test` checks the countdown (January 1–2, the days around it, and the New York midnight boundary), the `?date=` override, and a headless Chrome soak across many clip ends. The soak checks that the video element count, DOM size, listener count, and JS heap stay flat, and it prints `getVideoPlaybackQuality` dropped frames for the clips that played at 1x.
