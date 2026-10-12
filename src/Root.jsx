import React from 'react';
import { Composition } from 'remotion';
import { DailyCard, FPS, timeline } from './DailyCard.jsx';

// Sample props for the studio (`npm run studio`); the daily render passes the worker's
// /reel/props.json plus the track scripts/music.py made for the day.
const sample = {
  dateStr: '20261012', weekday: 'monday', total: 78, dateLine: 'Monday, October 12', track: 'music/monday-3.wav', mesh: '',
  headline: { lead: '78 games today. Here are the best ', accent: 'three', trail: '.' },
  rows: [
    { rank: 1, matchup: 'Dodgers at Brewers', awayMonogram: 'LAD', homeMonogram: 'MIL', capsule: { text: '5:00 PM ET · Fox', live: false }, why: 'The Brewers won the last two meetings, including a 6-2 result over the Dodgers.' },
    { rank: 2, matchup: 'Guardians at Rays', awayMonogram: 'CLE', homeMonogram: 'TB', capsule: { text: '8:00 PM ET · TBS', live: false }, why: 'Rays open the ALCS after shutting out the Guardians in their last two meetings.' },
    { rank: 3, matchup: 'Bills at Rams', awayMonogram: 'BUF', homeMonogram: 'LAR', capsule: { text: 'On now · ESPN', live: true }, why: 'Monday Night Football.' },
  ],
};

export const Root = () => (
  <Composition
    id="DailyCard"
    component={DailyCard}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={timeline(sample.weekday).duration}
    defaultProps={sample}
    calculateMetadata={({ props }) => ({ durationInFrames: timeline(props.weekday).duration })}
  />
);
