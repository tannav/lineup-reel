// The beat-locked moments, in beats from the first frame. The video (DailyCard.jsx) cuts on them,
// the uploader (scripts/daily.mjs) picks the cover from them, and scripts/music.py writes the same
// form: a one-bar intro, the games on the beats of bar 2, bars 3 and 4 held, bar 5 the App Store card.
export const CUES = { line2: 1.25, accent: 2, date: 2.5, pane: 3, firstRow: 4, cover: 12, end: 16, length: 20 };
