# Motion Ad Director: Phase 0 spike results

21 November 2026 · branch `claude/motion-ad-spike` · folder `motion-ads/`

## What we tested

The brief's Golden Mist ad, end to end: the storyboard from the brief, six images, a logo file and a voiceover,
rendered as a 1080p preview, a 4K final, a 9:16 version, a silent master and an audio stem.

One change from the brief, on purpose: **the AI does not write the animation code.** It returns the storyboard
JSON only (shots, times, on-screen lines, a camera move and a transition chosen from fixed lists). Our own
Remotion templates turn that JSON into the ad. Nothing the AI writes is ever executed, every ad has the same
finish, and the whole "untrusted animation page" problem in the brief disappears.

## Results (Apple M2 Pro, 12 cores, 16 GB)

| Step | Time | Peak memory | Output |
|---|---|---|---|
| Bundle the templates (once per deploy) | 1.4 s | 0.6 GB | — |
| 16 review stills at the transitions | 24 s | — | contact sheet |
| **1080p preview with voice** | **17 s** | 0.8 GB | 1920×1080, 15.21 s, 13.7 MB |
| **4K final with voice** | **62 s** | 2.9 GB | 3840×2160, 15.21 s, 37.5 MB |
| 4K silent master | 58 s | 2.9 GB | no audio track |
| 9:16 vertical | 16 s | 0.8 GB | 1080×1920, 15.21 s |

Checks from the brief, all passing: the ad matches the voice length within one frame; the 4K file is 3840×2160
with audio; the silent master has none; 9:16 renders at 1080×1920.

Peak memory is the largest single process (the renderer's Chrome), so whole-machine use is higher.

## Findings

- **No GPU needed.** The templates use no WebGL, so ordinary CPU workers render them. The brief's GPU
  requirement only applies to 3D and puppet pages, which are out of scope for v1.
- **Render cost is small.** A 15 s ad is about a minute of 4K rendering on a laptop. On Remotion Lambda that
  splits across many functions; the per-ad cost still needs measuring there (see open items).
- **9:16 works without a separate template.** Shots crop to the centre, lines centre themselves and the end card
  scales. It passes the brief's Phase 0 test, so 9:16 can be offered in the card.
- **The voice length wins, exactly.** A 15.21 s test voice re-timed the 12 s draft into five shots of 2.36 s and
  a 3.36 s end card, contiguous and frame-exact, and the plan still validates afterwards.
- **"Image too small for 4K" works.** The check uses each shot's real camera zoom. The 1920×1536 Visiowave
  images are fine at 1080p but flagged at 4K ("suits 1080p"); a 640×800 image is flagged as unsuitable even at
  1080p. Images can be enlarged up to 35% before a warning, because grain and constant motion hide that much.
- **The plan contract is enforced in code.** 22 automated tests cover it: 5 to 10 shots, contiguous times that
  add up, the last shot is the end card, every other shot transforms into the next (never a cross-dissolve),
  sentence-case lines of at most 42 characters, image prompts that ask for no text, and no invented claims
  (stats, percentages, ratings, guarantees) unless the brief supplied them. An invalid AI reply gets one retry
  with the exact errors; a second failure fails the job and charges nothing.

## The templates

- Six camera moves: drift, push, rise, slide, orbit, settle. Lateral moves all travel the same way, so direction
  never reverses, and every shot keeps moving through its transitions.
- Four transitions, none of them a dissolve: a feathered iris zoom-through, a gold light-sweep wipe, a whip with
  motion blur, and a match cut with a flash.
- Lines in sentence case, each word fading up from blur, lifting away before the transition.
- A drifting golden haze in the brand colour, a vignette, the real logo on the end card with a light sweep, and
  the Free-tier "Made with Visiowave" watermark.

## Not tested yet

- **The live planning AI.** There is no API key on this machine, so the plan step was tested with recorded replies.
  Next: call it 50+ times with varied briefs and confirm every reply validates.
- **Real Golden Mist images.** The images were Visiowave's own AI images (film sets), not perfume shots, because
  generating new ones needs Quick Show credits. The pipeline and timing don't depend on the subject.
- **A real ElevenLabs voice.** The test voice was made with macOS text-to-speech from the brief's script.
- **Remotion Lambda.** Cost per ad, cold starts and the 4K time when split across functions.
- **Watching and listening at full speed** on desktop Chrome, Safari and a phone (a person must do this).

## Decisions for Ronald

1. Approve the **JSON-plus-templates** approach instead of AI-written animation pages.
2. **Rendering:** Remotion Lambda (recommended) or our own worker. Remotion needs a paid company licence once
   the company has more than three people.
3. The brief's open questions: spec ads for other brands, regulated categories, credit prices, the beta cap,
   the Free-tier limit, and how long uploads and renders are kept.
4. The skill's licence matters less with this approach (we reuse its workflow, not its code), but please still
   confirm it.

## Run it

```
cd motion-ads && npm install
npm test             # contract, timing, image checks, plan retry
npm run spike        # full Golden Mist run with measurements → out/results.json
npm run studio       # preview the templates in Remotion Studio
```

The spike's images and voice live in `public/assets/` (git-ignored): copy six images to `image1.jpg`…`image6.jpg`,
add `logo.svg`, and a `voice.wav`.
