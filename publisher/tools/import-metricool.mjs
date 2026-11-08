// Convert a Metricool getScheduledPosts "data" array into publisher/schedule.json entries.
// Usage: node import-metricool.mjs posts.json [--from ISO]
// Downloads media into publisher/media/<date>/ (PNG -> JPG, required by Instagram).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = 'https://raw.githubusercontent.com/pelardjouismaelkone/ismark-videos/main/publisher/media';
const [, , input, , fromArg] = process.argv;
const from = new Date(fromArg || Date.now());
const posts = JSON.parse(fs.readFileSync(input, 'utf8'));
const schedPath = path.join(PUB, 'schedule.json');
const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));
const have = new Set(sched.map(s => s.id));
let added = 0;

for (const p of posts) {
  if (p.draft) continue;
  const prov = p.providers?.[0]?.network;
  if (prov !== 'instagram' && prov !== 'facebook') continue;
  if (p.providers[0].status && p.providers[0].status !== 'PENDING') continue;
  const at = new Date(p.publicationDate.dateTime + 'Z'); // Africa/Abidjan = UTC
  if (at < from) continue;
  const id = `mc-${prov}-${p.uuid}`;
  if (have.has(id)) continue;
  const t = (prov === 'instagram' ? p.instagramData?.type : p.facebookData?.type) || 'POST';
  const type = t === 'STORY' ? 'story' : t === 'REEL' ? 'reel' : 'post';
  const day = p.publicationDate.dateTime.slice(0, 10);
  const dir = path.join(PUB, 'media', day);
  fs.mkdirSync(dir, { recursive: true });
  const media = p.media.map((u, i) => {
    const vid = /\.(mp4|mov)$/i.test(u);
    const name = `${prov.slice(0, 2)}-${p.uuid.replace('-', 'm')}-${i}.${vid ? 'mp4' : 'jpg'}`;
    const out = path.join(dir, name);
    if (!fs.existsSync(out)) {
      const tmp = out + '.src';
      execFileSync('curl', ['-sSfL', '-o', tmp, u]);
      if (vid) fs.renameSync(tmp, out);
      else { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-q:v', '2', out]); fs.unlinkSync(tmp); }
    }
    return `${RAW}/${day}/${name}`;
  });
  sched.push({ id, at: at.toISOString(), network: prov, type, media,
    caption: type === 'story' ? '' : (p.text || ''), first_comment: p.firstCommentText || '',
    ...(p.facebookData?.title ? { title: p.facebookData.title } : {}), metricool_id: p.id });
  have.add(id); added++;
}
sched.sort((a, b) => a.at.localeCompare(b.at));
fs.writeFileSync(schedPath, JSON.stringify(sched, null, 1) + '\n');
console.log(`added ${added}, total ${sched.length}`);
