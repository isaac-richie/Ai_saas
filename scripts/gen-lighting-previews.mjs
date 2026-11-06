// Makes the example photo for every lighting setup: one base portrait, relit once per setup with
// Nano Banana Pro on Kie, so the person and framing stay the same and only the light changes.
//
// Usage:
//   node scripts/gen-lighting-previews.mjs base            # the base portrait only (prints credits used)
//   node scripts/gen-lighting-previews.mjs all             # every setup that has no preview yet
//   node scripts/gen-lighting-previews.mjs light_neon ...  # just these (re-makes them even if present)
//
// Needs KIE_AI_API_KEY in .env.local. Output: public/lighting/<id>.webp (640x800). Raw PNGs and the base
// image's URL are kept in LIGHTING_WORK_DIR (default: .lighting-work/, git-ignored) for re-runs.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadTs } from './load-ts.mjs';

const root = new URL('..', import.meta.url).pathname;
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const headers = { Authorization: `Bearer ${env.KIE_AI_API_KEY}`, 'Content-Type': 'application/json' };
const OUT = path.join(root, 'public/lighting');
const WORK = process.env.LIGHTING_WORK_DIR || path.join(root, '.lighting-work');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const STATE = path.join(WORK, 'state.json');
const state = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {});
const save = (patch) => fs.writeFileSync(STATE, JSON.stringify({ ...state(), ...patch }, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function credits() {
  const r = await fetch('https://api.kie.ai/api/v1/chat/credit', { headers });
  return (await r.json()).data;
}

/** Runs one Nano Banana Pro task and returns the result URL. */
async function nano(prompt, imageInput) {
  const input = { prompt, aspect_ratio: '4:5', resolution: '1K', output_format: 'png', ...(imageInput ? { image_input: [imageInput] } : {}) };
  const created = await (await fetch('https://api.kie.ai/api/v1/jobs/createTask', { method: 'POST', headers, body: JSON.stringify({ model: 'nano-banana-pro', input }) })).json();
  const id = created?.data?.taskId;
  if (!id) throw new Error(`create failed: ${JSON.stringify(created).slice(0, 200)}`);
  for (let i = 0; i < 90; i++) {
    await sleep(6000);
    let s;
    try { s = await (await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${id}`, { headers })).json(); } catch { continue; }
    if (s.data?.state === 'success') return JSON.parse(s.data.resultJson).resultUrls[0];
    if (s.data?.state === 'fail') throw new Error(s.data.failMsg || 'failed');
  }
  throw new Error('timed out');
}

async function keep(url, id) {
  const png = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
  fs.writeFileSync(path.join(WORK, `${id}.png`), png);
  // The base portrait is only an input; it stays in the work folder and never ships.
  const dest = id === 'base' ? path.join(WORK, 'base.webp') : path.join(OUT, `${id}.webp`);
  await sharp(png).resize(640, 800, { fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toFile(dest);
}

const BASE_PROMPT = [
  'Cinematic portrait photograph of a woman in her early thirties with shoulder-length dark curly hair and warm brown skin,',
  'wearing a plain charcoal knit sweater, body turned slightly to her left, face in three-quarter view looking just past the camera,',
  'calm thoughtful expression. Medium close-up from mid-chest up, 50mm lens, shallow depth of field.',
  'She is in a simple room in front of a plain, softly textured wall. Soft, even, neutral lighting with no strong shadows,',
  'so every feature is clearly visible. Photorealistic, natural skin texture, true colours. No text, no watermark.',
].join(' ');

// Portrait setups differ by small shadow shapes, so the example photos spell the shape out plainly.
// These lines only shape the example images; the presets' own wording is unchanged.
const EMPHASIS = {
  light_butterfly: 'The key light is straight in front of her face and high above the camera, pointing down. Both cheeks are evenly lit, there is a small clear butterfly-shaped shadow directly under her nose, soft shadows under the cheekbones and chin, and the background falls dark.',
  light_high_key: 'Everything is bright: the wall behind her glows white, her face is fully and evenly lit from the front, an airy bright exposure with almost no shadows anywhere.',
  light_loop: 'One soft light above and a little to the side of her face. Her nose casts a small shadow that falls down and to the side onto her cheek; the far side of her face is gently shaded and the background is darker than her face.',
  light_rembrandt: 'One light only, high and to the side. The side of her face away from the light is in deep shadow except for a small bright triangle of light on that shadowed cheek just under the eye. The room behind her is dark.',
  light_split: 'One hard light from exactly 90 degrees to her side. Precisely half of her face, divided down the line of her nose, is bright and the other half is completely black. The room is dark.',
  light_short: 'The light falls on the side of her face that is turned away from the camera; the side of her face nearest the camera is in shadow. The room is dark.',
  light_under: 'The only light comes from below her chin pointing up, like a torch held at her chest: the underside of her chin, nose and brows are bright and shadows climb upward onto her forehead. The room is dark.',
  light_clamshell: 'Bright, even beauty light on her face from above with a soft bounce from below, bright catchlights in both eyes, smooth soft grey background.',
  light_noon_sun: 'She is now outdoors at midday under a clear blue sky. Hard sun from almost directly overhead: crisp dark shadows under her brows, nose and chin, bright hot highlights on her hair and shoulders, saturated colours.',
  light_overcast: 'She is now outdoors under a flat grey cloudy sky. Completely soft, shadowless daylight from above, muted natural colours, a soft grey sky and distant trees softly out of focus behind her.',
  light_haze: 'The air is filled with visible soft haze. A strong light behind her blooms through the haze into a glowing halo and soft beams; everything has lowered contrast and a dreamy glow.',
  light_kicker: 'The background is black. A hard light from behind her, to one side, skims only the edge of her cheek, jaw line and hair; the front of her face stays mostly in shadow.',
};

const relightPrompt = (preset) => [
  'Relight this exact photograph.',
  'Keep the same woman, her face, hair, expression, pose, sweater, camera angle and framing exactly as they are.',
  'Change only the light, and let the surroundings show where the light comes from when the setup needs it.',
  `New lighting: ${preset.promptTokens}.`,
  EMPHASIS[preset.id] ?? '',
  'Do not show any lamps on stands, reflectors, softboxes or film equipment in the frame.',
  'Photorealistic cinematic film still, natural skin texture, no text, no watermark, no other people.',
].filter(Boolean).join(' ');

const { LIGHTING_PRESETS } = await loadTs('core/config/lighting-presets.ts');
const args = process.argv.slice(2);
if (!args.length) { console.log('Say "base", "all" or preset ids.'); process.exit(1); }

const before = await credits();
console.log(`Kie credits: ${before}`);

if (args[0] === 'base') {
  const url = await nano(BASE_PROMPT);
  await keep(url, 'base');
  save({ baseUrl: url, baseAt: new Date().toISOString() });
  console.log(`base: ${url}`);
} else {
  const baseUrl = state().baseUrl;
  if (!baseUrl) throw new Error('Make the base portrait first: node scripts/gen-lighting-previews.mjs base');
  const targets = args[0] === 'all'
    ? LIGHTING_PRESETS.filter((p) => !fs.existsSync(path.join(OUT, `${p.id}.webp`)))
    : LIGHTING_PRESETS.filter((p) => args.includes(p.id));
  console.log(`making ${targets.length}: ${targets.map((p) => p.id).join(', ')}`);
  const queue = [...targets];
  const failed = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let preset = queue.shift(); preset; preset = queue.shift()) {
      try {
        await keep(await nano(relightPrompt(preset), baseUrl), preset.id);
        console.log(`✓ ${preset.id}`);
      } catch (error) {
        failed.push(preset.id);
        console.log(`✗ ${preset.id}: ${error.message}`);
      }
    }
  }));
  if (failed.length) console.log(`failed: ${failed.join(' ')}`);
}

const after = await credits();
console.log(`credits used: ${before - after} (left ${after})`);
