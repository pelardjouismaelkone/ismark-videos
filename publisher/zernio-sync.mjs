// Sends every item of publisher/schedule.json to Zernio as a scheduled post (free plan: 2 accounts, unlimited posts).
// Idempotent: items already sent are recorded in publisher/state.json. Zernio itself publishes at the exact time.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const API = 'https://zernio.com/api/v1';
const KEY = process.env.ZERNIO_API_KEY;
const DRY = process.env.DRY_RUN === '1';
const schedule = JSON.parse(fs.readFileSync(path.join(DIR, 'schedule.json'), 'utf8'));
const statePath = path.join(DIR, 'state.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n');

async function z(method, p, body, extra = {}) {
  if (DRY) { console.log('  DRY', method, p, JSON.stringify(body || {}).slice(0, 300)); return { accounts: [{ _id: 'dry_ig', platform: 'instagram' }, { _id: 'dry_fb', platform: 'facebook' }], post: { _id: 'dry', status: 'scheduled' } }; }
  const res = await fetch(API + p, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 207) throw new Error(`${method} ${p}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

if (!KEY && !DRY) { console.error('Missing ZERNIO_API_KEY secret'); process.exit(1); }
const accs = (await z('GET', '/accounts?status=connected')).accounts || [];
const acc = { instagram: accs.find(a => a.platform === 'instagram')?._id, facebook: accs.find(a => a.platform === 'facebook')?._id };
console.log('accounts', JSON.stringify(acc));

const now = Date.now();
let failed = 0, sent = 0;
for (const it of schedule) {
  if (state[it.id]?.ok) continue;
  if (new Date(it.at).getTime() < now - 15 * 60e3) { state[it.id] = { ok: 'skipped_past' }; continue; } // never publish old items late
  if (!acc[it.network]) { console.error('No connected account for', it.network); failed++; continue; }
  const psd = {};
  if (it.type === 'story') psd.contentType = 'story';
  if (it.type === 'reel' && it.network === 'facebook') { psd.contentType = 'reel'; if (it.title) psd.title = it.title; }
  if (it.type === 'reel' && it.network === 'instagram') psd.shareToFeed = true;
  if (it.first_comment && it.type !== 'story') psd.firstComment = it.first_comment;
  const body = {
    content: it.type === 'story' ? '' : (it.caption || ''),
    mediaItems: it.media.map(u => ({ type: /\.(mp4|mov)(\?|$)/i.test(u) ? 'video' : 'image', url: u })),
    platforms: [{ platform: it.network, accountId: acc[it.network], ...(Object.keys(psd).length ? { platformSpecificData: psd } : {}) }],
    scheduledFor: new Date(it.at).toISOString(),
    timezone: 'Africa/Abidjan',
  };
  try {
    const r = await z('POST', '/posts', body, { 'Idempotency-Key': it.id });
    state[it.id] = { ok: true, zernio_id: r.post?._id, status: r.post?.status, at: new Date().toISOString() };
    sent++; console.log('OK  ', it.at, it.network, it.type, it.id);
  } catch (e) {
    failed++; state[it.id] = { ok: false, error: String(e.message).slice(0, 400) }; console.error('FAIL', it.id, e.message);
  }
  if (!DRY) save();
  await new Promise(r => setTimeout(r, 1100)); // free plan: 60 requests/min
}
console.log(`sent ${sent}, failed ${failed}`);
if (failed) process.exitCode = 1;
