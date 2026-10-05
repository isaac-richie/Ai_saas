# Film captures

1. `node capture/login.mjs`: sign in once in the gold-banner window (session saved to `.profile/`, git-ignored).
2. `node capture/landing.mjs`, `fast-track.mjs`, `storyboard.mjs`: real app captures (dev server on :3000).
3. `scene-builder.mjs` needs a temporary page at `src/app/dashboard/zz-film-scene/page.tsx` that renders
   `ShotBuilder` with demo shots (`?stage=choose|next|video`). Create it, capture, then delete it.
4. `preset-videos.mjs`, `scene-images.mjs`: generate the demo footage with Kie (needs Kie credits).

Captures, outputs, music and renders are git-ignored. Render: `npm run render`.
