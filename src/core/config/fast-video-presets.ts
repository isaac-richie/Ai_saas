export type MotionPreset = {
  id: string
  name: string
  description: string
  motionTokens: string
  useCase: string
}

export type StylePreset = {
  id: string
  name: string
  description: string
  styleTokens: string
  negativeTokens?: string
  devGuidance: string
}

export const FAST_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5", "21:9"] as const
export type FastVideoAspectRatio = (typeof FAST_VIDEO_ASPECT_RATIOS)[number]

export const FAST_VIDEO_VARIATIONS = ["strict", "balanced", "creative"] as const
export type FastVideoVariation = (typeof FAST_VIDEO_VARIATIONS)[number]

export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: "motion_slow_drone_pan",
    name: "Slow Drone Pan",
    description: "Gradual horizontal orbit with slight altitude lift.",
    motionTokens: "slow aerial pan, gentle orbit, gradual rise, stable cinematic motion",
    useCase: "Establishing shots and landscapes",
  },
  {
    id: "motion_dolly_in",
    name: "Cinematic Dolly In",
    description: "Smooth forward move toward subject.",
    motionTokens: "smooth dolly in, forward camera push, cinematic focus pull",
    useCase: "Build tension and focus",
  },
  {
    id: "motion_dolly_out",
    name: "Cinematic Dolly Out",
    description: "Smooth backward move away from subject.",
    motionTokens: "smooth dolly out, cinematic pull back, environment reveal",
    useCase: "Reveal world and scale",
  },
  {
    id: "motion_fast_action_tracking",
    name: "Fast Action Tracking",
    description: "Aggressive subject tracking with speed.",
    motionTokens: "fast tracking shot, dynamic action follow, kinetic camera movement",
    useCase: "Chase and action sequences",
  },
  {
    id: "motion_jaws_push_pull",
    name: "Jaws Push-Pull",
    description: "Dolly in with simultaneous zoom out effect.",
    motionTokens: "dolly in with reverse zoom, dramatic perspective distortion, tension shot",
    useCase: "Shock realization moments",
  },
  {
    id: "motion_vertigo_tilt",
    name: "Vertigo Tilt",
    description: "Upward tilt with slight backward dolly.",
    motionTokens: "slow upward tilt, subtle dolly back, vertigo scale reveal",
    useCase: "Scale and dizziness",
  },
  {
    id: "motion_static_tripod",
    name: "Static Tripod",
    description: "Locked-off shot with no camera movement.",
    motionTokens: "static locked camera, tripod shot, no camera movement",
    useCase: "Dialogue and master shots",
  },
  {
    id: "motion_handheld_gentle",
    name: "Gentle Handheld",
    description: "Subtle organic operator shake.",
    motionTokens: "gentle handheld camera, natural micro shake, documentary realism",
    useCase: "Verite realism",
  },
  {
    id: "motion_handheld_aggressive",
    name: "Aggressive Handheld",
    description: "Chaotic high-intensity camera shake.",
    motionTokens: "aggressive handheld shake, chaotic unstable camera, high-intensity movement",
    useCase: "Conflict and disaster",
  },
  {
    id: "motion_whip_transition",
    name: "Seamless Transition WIP",
    description: "Fast whip pan designed for edit transitions.",
    motionTokens: "fast whip pan right, transition-ready motion blur, edit bridge move",
    useCase: "Fast-paced transitions",
  },
]

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "style_golden_hour_film",
    name: "Golden Hour Film",
    description: "Warm directional light with film softness.",
    styleTokens: "golden hour sunlight, warm highlights, shallow depth of field, subtle bokeh, Kodak Portra mood",
    negativeTokens: "flat lighting, harsh digital look",
    devGuidance: "warm lighting, sun flares, bokeh, Kodak Portra 400",
  },
  {
    id: "style_cyberpunk_neon",
    name: "Cyberpunk Neon",
    description: "Neon glow, rain, and high-contrast city mood.",
    styleTokens: "cyberpunk city, neon signage reflections, rainy streets, volumetric atmosphere, anamorphic cinematic contrast",
    negativeTokens: "daylight, washed colors",
    devGuidance: "neon, rain, volumetric lighting, high contrast, anamorphic lens",
  },
  {
    id: "style_classic_noir_bw",
    name: "Classic Noir B&W",
    description: "Monochrome hard-shadow noir aesthetic.",
    styleTokens: "classic film noir, monochrome black and white, chiaroscuro lighting, foggy night ambience",
    negativeTokens: "color bleed, low contrast",
    devGuidance: "black and white, high contrast, hard shadows, fog",
  },
  {
    id: "style_anime_action",
    name: "Anime Action",
    description: "Stylized anime framing and motion energy.",
    styleTokens: "anime action style, stylized color contrast, dynamic framing, speed line energy",
    negativeTokens: "photoreal skin texture",
    devGuidance: "cell-shaded, speed lines, vibrant colors",
  },
  {
    id: "style_retro_70s",
    name: "70s Retro Analog",
    description: "Vintage analog grain and muted palette.",
    styleTokens: "1970s analog film aesthetic, soft glow, 35mm grain texture, muted cinematic colors",
    negativeTokens: "hyper sharp digital edges",
    devGuidance: "vintage, 35mm film grain, muted colors",
  },
  {
    id: "style_hyperreal_studio",
    name: "Hyper-Real 4K Studio",
    description: "Clean high-detail premium studio render.",
    styleTokens: "ultra-detailed photoreal render, crisp 4k studio lighting, precise depth separation",
    negativeTokens: "noise, blur, low detail",
    devGuidance: "octane render, photorealistic, sharp focus",
  },
  {
    id: "style_fantasy_ethereal",
    name: "Fantasy Ethereal Glow",
    description: "Soft magical bloom and fog.",
    styleTokens: "ethereal fantasy atmosphere, soft bloom, volumetric fog, magical highlights",
    negativeTokens: "hard contrast, harsh shadows",
    devGuidance: "soft focus, bloom, pastel diffused lighting",
  },
  {
    id: "style_lofi_security",
    name: "Low-Fi Security Cam",
    description: "Surveillance-like degraded signal look.",
    styleTokens: "security camera footage aesthetic, low resolution, digital noise, compression artifacts",
    negativeTokens: "clean cinematic image",
    devGuidance: "CCTV, low res, glitch, night vision",
  },
  {
    id: "style_post_apocalypse",
    name: "Post-Apocalyptic Gritty",
    description: "Desaturated dusty survival atmosphere.",
    styleTokens: "post-apocalyptic wasteland look, dusty air, desaturated earth palette, harsh directional shadows",
    negativeTokens: "lush vibrant tones",
    devGuidance: "desaturated, gritty, dusty, harsh shadows",
  },
  {
    id: "style_underwater_blue",
    name: "Underwater Blue",
    description: "Aquatic caustics and deep blue tint.",
    styleTokens: "underwater cinematic scene, deep blue tones, caustic light patterns, floating particulate matter",
    negativeTokens: "dry environment cues",
    devGuidance: "underwater, caustics, blue tint, volumetric particles",
  },
]

export function findStylePreset(stylePresetId?: string | null) {
  if (!stylePresetId) return null
  return STYLE_PRESETS.find((preset) => preset.id === stylePresetId) || null
}

export function findMotionPreset(motionPresetId?: string | null) {
  if (!motionPresetId) return null
  return MOTION_PRESETS.find((preset) => preset.id === motionPresetId) || null
}
