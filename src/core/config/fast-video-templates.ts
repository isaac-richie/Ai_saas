/**
 * One-click starting points for Fast Track. A template fills the prompt and
 * suggests a matching style and motion preset; every part stays editable.
 */
export type PromptTemplate = {
  id: string
  label: string
  category: string
  prompt: string
  stylePresetId?: string
  motionPresetId?: string
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "neo-noir",
    label: "Neo-noir alley",
    category: "Drama",
    prompt: "A lone detective walks through a rain-soaked neon alley at night, cinematic realism, subtle fog, reflective asphalt, slow dolly tracking shot",
    stylePresetId: "style_cyberpunk_neon",
    motionPresetId: "motion_dolly_in",
  },
  {
    id: "fashion-commercial",
    label: "Fashion commercial",
    category: "Commercial",
    prompt: "A high-end fashion model exits a black car in golden-hour city light, elegant camera glide, premium ad look, clean depth and polished textures",
    stylePresetId: "style_golden_hour_film",
    motionPresetId: "motion_dolly_in",
  },
  {
    id: "documentary-intro",
    label: "Documentary intro",
    category: "Documentary",
    prompt: "A confident founder steps onto a rooftop at sunrise, medium close-up, natural wind movement, grounded documentary tone, smooth cinematic motion",
    stylePresetId: "style_golden_hour_film",
    motionPresetId: "motion_handheld_gentle",
  },
  {
    id: "product-hero",
    label: "Product hero",
    category: "Commercial",
    prompt: "A matte black wristwatch rests on a slowly rotating plinth, crisp studio key light carving the bezel, controlled reflections, seamless dark backdrop",
    stylePresetId: "style_hyperreal_studio",
    motionPresetId: "motion_static_tripod",
  },
  {
    id: "anime-chase",
    label: "Anime rooftop chase",
    category: "Action",
    prompt: "A young courier sprints across city rooftops at dusk and leaps a wide gap, wind tearing at her jacket, dynamic framing, speed lines and bold colour",
    stylePresetId: "style_anime_action",
    motionPresetId: "motion_fast_action_tracking",
  },
  {
    id: "retro-road-trip",
    label: "70s road trip",
    category: "Drama",
    prompt: "A vintage convertible cruises a desert highway at golden hour, two friends laughing, warm film grain, sun flares across the windshield",
    stylePresetId: "style_retro_70s",
    motionPresetId: "motion_slow_drone_pan",
  },
  {
    id: "fantasy-reveal",
    label: "Fantasy reveal",
    category: "Fantasy",
    prompt: "A cloaked traveller reaches a cliff edge as morning mist parts to reveal a glowing crystal city below, soft bloom, drifting light motes",
    stylePresetId: "style_fantasy_ethereal",
    motionPresetId: "motion_vertigo_tilt",
  },
  {
    id: "found-footage",
    label: "Found-footage thriller",
    category: "Thriller",
    prompt: "A hooded figure walks the length of an empty office corridor at 3am, security camera angle, flickering fluorescent light, timestamp overlay",
    stylePresetId: "style_lofi_security",
    motionPresetId: "motion_static_tripod",
  },
  {
    id: "wasteland-scout",
    label: "Wasteland scout",
    category: "Sci-fi",
    prompt: "A lone scout in patched armour surveys a ruined city from a dune ridge, dust blowing across the frame, harsh low sun, vast scale",
    stylePresetId: "style_post_apocalypse",
    motionPresetId: "motion_slow_drone_pan",
  },
]
