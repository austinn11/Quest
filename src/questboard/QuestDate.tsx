import type { Timestamp } from 'spacetimedb';

export function QuestDate({ timestamp }: { timestamp: Timestamp }) {
  const date = new Date(Number(timestamp.microsSinceUnixEpoch / 1000n));
  return <time dateTime={date.toISOString()}>{date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>;
}
