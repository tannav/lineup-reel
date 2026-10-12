#!/usr/bin/env node
// The daily Reel, end to end: today's props from the worker, the day's track, the render, and the
// upload. The worker stores the MP4, serves it to Instagram and posts it once a day.
//
//   node scripts/daily.mjs            render, upload, post: once the 1 PM card has run, once a day
//   node scripts/daily.mjs --dry      render and upload, but don't post
//   node scripts/daily.mjs --local    render only, to out/<date>.mp4
//   node scripts/daily.mjs --force    post now, even before the card or a second time
//   node scripts/daily.mjs --check    print due=true|false and stop (needs no npm packages)
//
// Env: SLATE_CARD_URL (defaults to the worker), SLATE_CARD_REEL_SECRET (the worker's REEL_SECRET).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUES } from '../src/cues.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.SLATE_CARD_URL || 'https://slate-card.thelineup-is.workers.dev').replace(/\/$/, '');
const flags = new Set(process.argv.slice(2));
const local = flags.has('--local');
const dry = flags.has('--dry');
const force = flags.has('--force');
const check = flags.has('--check');

// Async on purpose: spawnSync blocks the event loop through the render, so fetch's pool never
// retires the props request's idle socket, the server closes it, and the upload dies on it
// (ECONNRESET).
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' })
      .on('error', reject)
      .on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} exited ${code}`))));
  });
}

// Instagram fetches the video by URL and wants the index (moov) ahead of the media (mdat).
function moovFirst(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i + 8 <= bytes.length;) {
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (type === 'moov') return true;
    if (type === 'mdat') return false;
    const size = view.getUint32(i);
    i += size === 1 ? Number(view.getBigUint64(i + 8)) : size || bytes.length;
  }
  return false;
}

// The Reel follows the 1 PM card and animates the model the card posted (props.source 'card').
function reasonToSkip(p) {
  if (p.state === 'empty' || !p.rows?.length) return `${p.dateStr}: a quiet day, no Reel.`;
  if (local || dry || force) return null;
  if (p.posted) return `${p.dateStr}: today's Reel is already up.`;
  if (p.source !== 'card') return `${p.dateStr}: the 1 PM card hasn't run yet; the Reel follows it.`;
  return null;
}

const res = await fetch(`${BASE}/reel/props.json`);
if (!res.ok) throw new Error(`props: HTTP ${res.status}`);
const props = await res.json();
const skip = reasonToSkip(props);
if (check) {
  console.log(`due=${!skip}`);
  console.error(skip || `${props.dateStr}: due`);
  process.exit(0);
}
if (skip) {
  console.log(skip);
  process.exit(0);
}

const tracks = JSON.parse(readFileSync(join(ROOT, 'src/tracks.json'), 'utf8'));
const day = tracks.days[props.weekday] || tracks.days.monday;
const rows = Math.min(props.rows.length, 5);
const track = `music/${props.weekday}-${rows}.wav`;
if (!existsSync(join(ROOT, 'public', track))) await run('python3', ['scripts/music.py', props.weekday, String(rows)]);

mkdirSync(join(ROOT, 'out'), { recursive: true });
const propsFile = join(ROOT, 'out', `props-${props.dateStr}.json`);
const video = join(ROOT, 'out', `${props.dateStr}.mp4`);
writeFileSync(propsFile, JSON.stringify({ ...props, track }));
console.log(`${props.dateStr}: ${props.headline.plain} (${props.source} model, ${props.weekday} at ${day.bpm} bpm)`);
await run('npx', ['remotion', 'render', 'src/index.js', 'DailyCard', video, `--props=${propsFile}`,
  '--codec=h264', '--crf=18', '--pixel-format=yuv420p', '--audio-codec=aac', '--audio-bitrate=128k', '--log=error']);

const bytes = new Uint8Array(readFileSync(video));
if (!moovFirst(bytes)) throw new Error('the render put moov after mdat; Instagram needs it first');
console.log(`rendered ${video} (${(bytes.length / 1e6).toFixed(1)} MB)`);
if (local) process.exit(0);

const secret = process.env.SLATE_CARD_REEL_SECRET;
if (!secret) throw new Error('SLATE_CARD_REEL_SECRET is not set');
const cover = Math.round((CUES.cover * 60 / day.bpm) * 1000);
const query = new URLSearchParams({ date: props.dateStr, thumb: String(cover), ...(dry ? { dry: '1' } : {}), ...(force ? { force: '1' } : {}) });
const up = await fetch(`${BASE}/reel?${query}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'video/mp4', 'X-Reel-Caption': encodeURIComponent(props.caption || '') },
  body: bytes,
  signal: AbortSignal.timeout(8 * 60e3),
});
const text = await up.text();
console.log(`upload: HTTP ${up.status}\n${text}`);
if (!up.ok) process.exit(1);
