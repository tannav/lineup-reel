#!/usr/bin/env node
// The day's Reel as a YouTube Short. Runs after daily.mjs has rendered and uploaded the video,
// so the MP4 is already served by the worker at /reel/<date>.mp4.
//
// YouTube locks every upload from an unaudited API project to Private, and a locked video can't
// be made public. Until our own project passes the audit, uploads go through a Make.com scenario
// that uses Make's own YouTube connection: a webhook receives {video_url, title, description}, an
// HTTP module fetches the file, and YouTube "Upload a Video" posts it Public. See the README.
//
//   node scripts/youtube.mjs          send today's Short (skips quietly without the webhook)
//   node scripts/youtube.mjs --print  print the title and description, send nothing
//
// Env: MAKE_YOUTUBE_WEBHOOK (secret; never printed), SLATE_CARD_URL (defaults to the worker).
const BASE = (process.env.SLATE_CARD_URL || 'https://slate-card.thelineup-is.workers.dev').replace(/\/$/, '');
const SITE = 'https://www.thelineup.is';
const APP = 'https://apps.apple.com/us/app/the-lineup-is/id6760086098';
const print = process.argv.includes('--print');

export function shortDate(dateStr) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(dateStr.slice(4, 6)) - 1]} ${Number(dateStr.slice(6, 8))}`;
}

// The title is the question people search ("best games to watch tonight"), the date, and the
// top game, which is the part that makes one day's Short different from the next.
export function shortMeta(p) {
  const rows = (p.rows || []).slice(0, 5);
  const top = rows[0]?.matchup || '';
  let title = `Best games to watch tonight, ${shortDate(p.dateStr)}${top ? `: ${top}` : ''} #Shorts`;
  if (title.length > 100) title = `Best games to watch tonight, ${shortDate(p.dateStr)} #Shorts`;
  const lines = rows.map((r) => {
    const when = r.capsule?.text ? ` · ${r.capsule.text}` : '';
    return `${r.rank}. ${r.matchup}${when}${r.why ? `\n${r.why}` : ''}`;
  });
  const description = [
    p.headline?.plain || '',
    lines.join('\n\n'),
    `Every game tonight, ranked: ${SITE}/tonight`,
    `The Lineup Is ranks every game by whether it's worth watching and tells you why. Free on iPhone: ${APP}`,
    '#Shorts',
  ].filter(Boolean).join('\n\n');
  return { title, description: description.slice(0, 4900) };
}

async function main() {
  const res = await fetch(`${BASE}/reel/props.json`);
  if (!res.ok) throw new Error(`props: HTTP ${res.status}`);
  const p = await res.json();
  if (p.state === 'empty' || !p.rows?.length) { console.log(`${p.dateStr}: a quiet day, no Short.`); return; }
  const meta = shortMeta(p);
  if (print) { console.log(`${meta.title}\n\n${meta.description}`); return; }
  const hook = process.env.MAKE_YOUTUBE_WEBHOOK;
  if (!hook) { console.log('MAKE_YOUTUBE_WEBHOOK is not set; skipping the Short.'); return; }
  const video_url = `${BASE}/reel/${p.dateStr}.mp4`;
  const head = await fetch(video_url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`the Reel isn't served yet: HTTP ${head.status}`);
  const r = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: p.dateStr, video_url, ...meta }),
    signal: AbortSignal.timeout(60e3),
  });
  // Only the status: the response and the URL could identify the scenario.
  console.log(`${p.dateStr}: Short sent to the uploader, HTTP ${r.status}`);
  if (!r.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
