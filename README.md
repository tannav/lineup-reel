# lineup-reel

Renders the daily Instagram Reel for [The Lineup Is](https://www.thelineup.is): the day's card building itself to a soundtrack generated from scratch. It lives in a public repository because public repositories get free GitHub Actions minutes. Nothing secret is in it.

**How a day goes.** At 1 PM Eastern the slate-card worker posts the day's card and keeps the games it posted. At 1:05 PM the workflow here fetches those games from the worker, makes the day's soundtrack, renders a 9:16 video with [Remotion](https://www.remotion.dev) and uploads it. The worker posts it to the Reels tab.

## The pieces

- `src/DailyCard.jsx`: the video, in five bars:
  - Bar 1: the game count runs up.
  - Bar 2: the games land on its beats, a chime each.
  - Bars 3 and 4: the card holds.
  - Bar 5: the App Store card.

  Everything stays inside the Reels safe area, clear of the caption and the buttons.
- `scripts/music.py`: the soundtrack, one piece per weekday. It uses the standard library only, so there's nothing to license. Tempo, key and chords come from `src/tracks.json`, which the video reads too, so the cuts land on the music.
- `scripts/daily.mjs`: fetch, render, upload. `--check` says whether a run is due without installing anything.

## Run it

```
npm ci
npm run studio                    # preview with sample data
node scripts/daily.mjs --local    # render today's Reel to out/<date>.mp4
python3 scripts/music.py          # all seven soundtracks, to public/music/
```

The workflow needs one secret, `SLATE_CARD_REEL_SECRET`, which the worker checks on upload. You can run it by hand from the Actions tab: `dry` renders and stores without posting, and `force` posts now. To stop the Reels, disable the workflow here or set `INSTAGRAM_REELS = "false"` on the worker. If GitHub ever pauses the schedule for inactivity, re-enable it from the Actions tab.

The serif is The Lineup Is's own typeface. It is loaded from the website at render time and is not part of this repository. Inter comes from Google Fonts.

Remotion is used under its free license, which covers companies of up to three people.

© 2026 The Lineup Is LLC. All rights reserved.
