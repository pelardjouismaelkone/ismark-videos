// Free auto-publisher for Instagram + Facebook (Meta Graph API).
// Reads publisher/schedule.json, publishes every item whose time has come,
// records results in publisher/state.json. Run every 10 min by GitHub Actions.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const V = 'v23.0';
const G = `https://graph.facebook.com/${V}`;
const TOKEN = process.env.META_PAGE_TOKEN;
const PAGE_ID = process.env.FB_PAGE_ID || '1402761492922542'; // Page IsMark Digital
const DRY = process.env.DRY_RUN === '1';
const GRACE_H = Number(process.env.GRACE_HOURS || 6); // skip items older than this
const now = new Date(process.env.NOW || Date.now());

const schedule = JSON.parse(fs.readFileSync(path.join(DIR, 'schedule.json'), 'utf8'));
const statePath = path.join(DIR, 'state.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, endpoint, params = {}, opts = {}) {
  if (DRY) { console.log('  DRY', method, endpoint, JSON.stringify(params).slice(0, 160)); return { id: 'dry_' + Math.random().toString(36).slice(2, 8), status_code: 'FINISHED', upload_url: 'https://dry', video_id: 'dryv' }; }
  const url = endpoint.startsWith('http') ? new URL(endpoint) : new URL(G + endpoint);
  const init = { method, headers: { ...(opts.headers || {}) } };
  if (method === 'GET') { for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v); url.searchParams.set('access_token', TOKEN); }
  else if (!opts.headers) { const body = new URLSearchParams(); for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); body.set('access_token', TOKEN); init.body = body; }
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`${method} ${endpoint}: ${res.status} ${JSON.stringify(json.error || json).slice(0, 400)}`);
  return json;
}

let igId;
async function igUser() {
  if (igId) return igId;
  if (process.env.IG_USER_ID) return (igId = process.env.IG_USER_ID);
  const r = await api('GET', `/${PAGE_ID}`, { fields: 'instagram_business_account' });
  return (igId = DRY ? 'dry_ig' : r.instagram_business_account.id);
}
const isVideo = u => /\.(mp4|mov)(\?|$)/i.test(u);

async function igWait(container) {
  for (let i = 0; i < 40; i++) {
    const r = await api('GET', `/${container}`, { fields: 'status_code' });
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new Error('IG container ' + r.status_code);
    await sleep(10000);
  }
  throw new Error('IG container timeout');
}
async function igContainer(params) { const ig = await igUser(); const c = await api('POST', `/${ig}/media`, params); await igWait(c.id); return c.id; }
async function igPublish(creation_id) { const ig = await igUser(); return (await api('POST', `/${ig}/media_publish`, { creation_id })).id; }

async function publishInstagram(it) {
  const m = it.media;
  let id;
  if (it.type === 'story') {
    id = await igPublish(await igContainer(isVideo(m[0]) ? { media_type: 'STORIES', video_url: m[0] } : { media_type: 'STORIES', image_url: m[0] }));
  } else if (it.type === 'reel') {
    id = await igPublish(await igContainer({ media_type: 'REELS', video_url: m[0], caption: it.caption || '', share_to_feed: 'true' }));
  } else if (m.length > 1) {
    const children = [];
    for (const u of m) children.push(await igContainer(isVideo(u) ? { media_type: 'VIDEO', video_url: u, is_carousel_item: 'true' } : { image_url: u, is_carousel_item: 'true' }));
    id = await igPublish(await igContainer({ media_type: 'CAROUSEL', children: children.join(','), caption: it.caption || '' }));
  } else {
    id = await igPublish(await igContainer({ image_url: m[0], caption: it.caption || '' }));
  }
  if (it.first_comment) await api('POST', `/${id}/comments`, { message: it.first_comment });
  return id;
}

async function fbVideoUpload(kind, fileUrl, finishParams) {
  const start = await api('POST', `/${PAGE_ID}/${kind}`, { upload_phase: 'start' });
  await api('POST', start.upload_url || `https://rupload.facebook.com/video-upload/${V}/${start.video_id}`, {}, { headers: { Authorization: `OAuth ${TOKEN}`, file_url: fileUrl } });
  const fin = await api('POST', `/${PAGE_ID}/${kind}`, { upload_phase: 'finish', video_id: start.video_id, ...finishParams });
  return fin.post_id || start.video_id;
}

async function publishFacebook(it) {
  const m = it.media;
  let id;
  if (it.type === 'story') {
    if (isVideo(m[0])) id = await fbVideoUpload('video_stories', m[0], {});
    else { const p = await api('POST', `/${PAGE_ID}/photos`, { url: m[0], published: 'false' }); id = (await api('POST', `/${PAGE_ID}/photo_stories`, { photo_id: p.id })).post_id; }
  } else if (it.type === 'reel') {
    id = await fbVideoUpload('video_reels', m[0], { video_state: 'PUBLISHED', description: it.caption || '', ...(it.title ? { title: it.title } : {}) });
  } else if (m.length > 1) {
    const att = {};
    for (let i = 0; i < m.length; i++) att[`attached_media[${i}]`] = { media_fbid: (await api('POST', `/${PAGE_ID}/photos`, { url: m[i], published: 'false' })).id };
    id = (await api('POST', `/${PAGE_ID}/feed`, { message: it.caption || '', ...att })).id;
  } else {
    const r = await api('POST', `/${PAGE_ID}/photos`, { url: m[0], message: it.caption || '' });
    id = r.post_id || r.id;
  }
  if (it.first_comment && it.type !== 'story') await api('POST', `/${id}/comments`, { message: it.first_comment });
  return id;
}

const due = schedule
  .filter(it => !state[it.id]?.ok)
  .filter(it => { const t = new Date(it.at); return t <= now && now - t <= GRACE_H * 3600e3; })
  .sort((a, b) => new Date(a.at) - new Date(b.at));

console.log(`${now.toISOString()} : ${due.length} due / ${schedule.length} scheduled${DRY ? ' (dry run)' : ''}`);
if (!DRY && due.length && !TOKEN) { console.error('Missing META_PAGE_TOKEN secret'); process.exit(1); }
let failed = 0;
for (const it of due) {
  const tries = (state[it.id]?.tries || 0) + 1;
  try {
    const id = it.network === 'instagram' ? await publishInstagram(it) : await publishFacebook(it);
    state[it.id] = { ok: true, id, at: new Date().toISOString(), tries };
    console.log('OK  ', it.id, it.network, it.type, '->', id);
  } catch (e) {
    failed++;
    state[it.id] = { ok: false, error: String(e.message).slice(0, 500), at: new Date().toISOString(), tries };
    console.error('FAIL', it.id, e.message);
    if (tries >= 3) state[it.id].ok = 'gave_up';
  }
  if (!DRY) save();
}
if (failed) process.exitCode = 1;
