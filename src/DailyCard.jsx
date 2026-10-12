// Today's card as a Reel, cut to the day's soundtrack (scripts/music.py, same tempo table): the
// game count runs up over the intro bar, the games land on the beats of bar 2 (one chime each),
// bars 3 and 4 hold the card, and bar 5 is the App Store card. The motion is the same every day;
// the colours, the games, the tempo and the music change. Everything sits inside the Reels safe
// area: the caption, the audio line and the buttons cover the bottom quarter and the lower right.
import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import tracks from './tracks.json';
import { CUES } from './cues.js';

export const FPS = 30;
const PAD_X = 72;
const TOP = 236;
const SAFE_BOTTOM = 440;
const WHITE = '#FFFFFF';
const CREAM = '#F3D9B8';
const LIVE = '#E0412F';
// Inter comes from Google Fonts. The serif is The Lineup Is's own typeface, loaded from the
// website at render time; it is not part of this repository.
const { fontFamily: SANS } = loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
const SERIF = 'PP Editorial New';
loadFont({ family: SERIF, url: 'https://www.thelineup.is/fonts/PPEditorialNew-Italic.otf', style: 'italic', weight: '400' });

// Frames for every beat-locked moment (cues.js); music.py schedules the same beats.
export function timeline(weekday) {
  const day = tracks.days[String(weekday || '').toLowerCase()] || tracks.days.monday;
  const beat = (60 / day.bpm) * FPS;
  const at = (beats) => Math.round(beats * beat);
  return {
    beat,
    duration: Math.ceil(CUES.length * beat + tracks.tail * FPS),
    line1: 2, line2: at(CUES.line2), accent: at(CUES.accent), date: at(CUES.date), pane: at(CUES.pane),
    row: (i) => at(CUES.firstRow + i),
    cover: at(CUES.cover),
    end: at(CUES.end),
  };
}

// The card's sizes at 9:16, grown for fewer games; five rows keep a one-line read, and with one
// or two games the matchup may take two lines instead of an ellipsis. `whyChars` trims a read at
// a word; `lines` is the hard cap, because capitals run wider than a character count expects and
// an uncapped read can push the pane into the band Instagram covers.
const sizeFor = (n) => ({
  5: { disc: 76, rank: 66, matchup: 38, capsule: 23, why: 25, whyChars: 48, lines: 2, pad: 12 },
  4: { disc: 84, rank: 72, matchup: 41, capsule: 24, why: 27, whyChars: 88, lines: 3, pad: 14 },
  3: { disc: 100, rank: 82, matchup: 46, capsule: 26, why: 29, whyChars: 110, lines: 4, pad: 16 },
  2: { disc: 112, rank: 92, matchup: 50, capsule: 28, why: 32, whyChars: 150, lines: 5, pad: 20, wrap: true },
  1: { disc: 124, rank: 100, matchup: 54, capsule: 30, why: 36, whyChars: 220, lines: 8, pad: 0, wrap: true },
}[Math.max(1, Math.min(5, n))]);

const clamp = (t, max) => {
  t = (t || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const w = cut.lastIndexOf(' ');
  return (w > max * 0.6 ? cut.slice(0, w) : cut).replace(/[,;:\s]+$/, '') + '…';
};

const hold = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

function useArrive(at, config = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 18, mass: 0.9, ...config } });
}

const Disc = ({ src, mono, size }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 11px 22px rgba(0,0,0,.14)', flex: 'none' }}>
    {src
      ? <Img src={src} style={{ width: size * 0.74, height: size * 0.74, objectFit: 'contain' }} />
      : <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: size * 0.3, color: '#3B2A1F', letterSpacing: -0.5 }}>{mono}</span>}
  </div>
);

const Pair = ({ row, size }) => (row.isEvent || !row.awayMonogram
  ? <Disc src={row.homeLogo || row.awayLogo} mono={row.homeMonogram || row.awayMonogram} size={size} />
  : (
    <div style={{ display: 'flex', flex: 'none' }}>
      <Disc src={row.awayLogo} mono={row.awayMonogram} size={size} />
      <div style={{ marginLeft: -Math.round(size * 0.28) }}><Disc src={row.homeLogo} mono={row.homeMonogram} size={size} /></div>
    </div>
  ));

// The live capsule's dot pulses on the beat.
const Capsule = ({ capsule, size, beat }) => {
  const frame = useCurrentFrame();
  const phase = (frame % beat) / beat;
  const pulse = 1 + 0.45 * Math.exp(-phase * 5);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', padding: '7px 16px', borderRadius: 999, background: capsule.live ? LIVE : 'rgba(255,255,255,.16)', border: `1px solid rgba(255,255,255,${capsule.live ? 0.25 : 0.22})`, fontFamily: SANS, fontWeight: 500, fontSize: size, color: WHITE, lineHeight: 1.2 }}>
      {capsule.live ? <span style={{ width: 12, height: 12, borderRadius: 6, background: WHITE, transform: `scale(${pulse})` }} /> : null}
      <span>{capsule.text}</span>
    </div>
  );
};

const Row = ({ row, s, at, first, beat }) => {
  const frame = useCurrentFrame();
  const p = useArrive(at);
  const read = interpolate(frame, [at + 5, at + 14], [0, 1], hold);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: `${s.pad}px 0`, borderTop: first ? 'none' : '2px solid rgba(255,255,255,.18)', opacity: p, transform: `translateY(${(1 - p) * 44}px)` }}>
      <div style={{ width: Math.round(s.rank * 0.82), textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: s.rank, lineHeight: 1.15, color: CREAM, flex: 'none' }}>{row.rank}</div>
      <Pair row={row} size={s.disc} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: s.matchup, lineHeight: 1.15, color: WHITE, ...(s.wrap ? { textWrap: 'balance' } : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>{row.matchup}</div>
        <Capsule capsule={row.capsule} size={s.capsule} beat={beat} />
        {row.why ? <div style={{ fontFamily: SANS, fontSize: s.why, lineHeight: 1.3, color: 'rgba(255,255,255,.88)', opacity: read, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: s.lines, overflow: 'hidden' }}>{clamp(row.why, s.whyChars)}</div> : null}
      </div>
    </div>
  );
};

// "108 games today. Here are the best " + "three" + "." → the count on line one, the rest on two.
function splitHeadline(h) {
  const i = h.lead.indexOf('. ');
  return i > 0 ? { first: h.lead.slice(0, i + 1), rest: h.lead.slice(i + 2) } : { first: '', rest: h.lead };
}

const Headline = ({ headline, total, tl }) => {
  const frame = useCurrentFrame();
  const { first, rest } = splitHeadline(headline);
  const l1 = useArrive(tl.line1);
  const l2 = useArrive(tl.line2);
  const accent = useArrive(tl.accent, { damping: 12, mass: 0.7 });
  const run = interpolate(frame, [tl.line1, tl.line2 + 4], [0, 1], { ...hold, easing: Easing.out(Easing.cubic) });
  const counted = first.replace(/^\d[\d,]*/, (n) => Math.round(Number(n.replace(/,/g, '')) * run).toLocaleString('en-US'));
  const tuck = /^[.,;:!?]/.test(headline.trail);
  return (
    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 64, lineHeight: 1.22, letterSpacing: -0.8, color: WHITE }}>
      {first ? <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 50}px)`, fontVariantNumeric: 'tabular-nums' }}>{counted}</div> : null}
      <div style={{ opacity: l2, transform: `translateY(${(1 - l2) * 50}px)`, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span style={{ whiteSpace: 'pre' }}>{rest}</span>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 82, lineHeight: 1.2, letterSpacing: 0, display: 'inline-block', opacity: accent, transform: `scale(${0.82 + 0.18 * accent})`, transformOrigin: '50% 80%' }}>{headline.accent}</span>
        <span style={{ marginLeft: tuck ? -2 : 14, opacity: accent }}>{headline.trail.trim()}</span>
      </div>
    </div>
  );
};

const Card = (props) => {
  const frame = useCurrentFrame();
  const { tl } = props;
  const rows = (props.rows || []).slice(0, 5);
  const s = sizeFor(rows.length);
  const date = interpolate(frame, [tl.date, tl.date + 10], [0, 1], hold);
  const pane = useArrive(tl.pane, { damping: 22 });
  const away = interpolate(frame, [tl.end - 2, tl.end + 10], [0, 1], hold);
  return (
    <AbsoluteFill style={{ padding: `${TOP}px ${PAD_X}px ${SAFE_BOTTOM}px`, display: 'flex', flexDirection: 'column', filter: away ? `blur(${away * 16}px)` : undefined, opacity: 1 - 0.35 * away }}>
      <Headline headline={props.headline} total={props.total} tl={tl} />
      <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 30, color: 'rgba(255,255,255,.86)', marginTop: 14, opacity: date }}>{props.dateLine}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', marginTop: 40, padding: '14px 44px', borderRadius: 60, background: 'linear-gradient(180deg, rgba(28,18,12,.62), rgba(28,18,12,.40))', border: '2px solid rgba(255,255,255,.16)', boxShadow: '0 27px 55px rgba(0,0,0,.14)', opacity: pane, transform: `translateY(${(1 - pane) * 40}px) scale(${0.975 + 0.025 * pane})` }}>
        {rows.map((r, i) => <Row key={r.rank} row={r} s={s} at={tl.row(i)} first={i === 0} beat={tl.beat} />)}
      </div>
    </AbsoluteFill>
  );
};

const EndCard = ({ tl }) => {
  const frame = useCurrentFrame();
  const dim = interpolate(frame, [tl.end - 2, tl.end + 10], [0, 1], hold);
  const icon = useArrive(tl.end, { damping: 13 });
  const words = useArrive(tl.end + 5);
  const store = useArrive(tl.end + 10);
  if (frame < tl.end - 2) return null;
  return (
    <AbsoluteFill style={{ background: `rgba(28,18,12,${0.5 * dim})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 34, paddingBottom: SAFE_BOTTOM - TOP }}>
      <Img src={staticFile('icon.png')} style={{ width: 220, height: 220, borderRadius: 50, opacity: icon, transform: `scale(${0.7 + 0.3 * icon})`, boxShadow: '0 30px 60px rgba(0,0,0,.3)' }} />
      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 112, lineHeight: 1.25, color: CREAM, opacity: words, transform: `translateY(${(1 - words) * 30}px)` }}>The Lineup Is</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, opacity: store, transform: `translateY(${(1 - store) * 30}px)` }}>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 46, color: WHITE }}>Free on the App Store</div>
        <Img src={staticFile('badge.svg')} style={{ width: 360, height: 'auto' }} />
      </div>
    </AbsoluteFill>
  );
};

export const DailyCard = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const tl = timeline(props.weekday);
  const push = interpolate(frame, [0, durationInFrames], [1, 1.07]);
  return (
    <AbsoluteFill style={{ background: '#2C2825' }}>
      {props.mesh ? <Img src={props.mesh} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: `scale(${push})` }} /> : null}
      <Card {...props} tl={tl} />
      <EndCard tl={tl} />
      {props.track ? <Audio src={staticFile(props.track)} /> : null}
    </AbsoluteFill>
  );
};
