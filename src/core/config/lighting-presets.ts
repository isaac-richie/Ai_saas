/**
 * Cinematic lighting setups: one library for Create, Longer film, Studio and the editor.
 *
 * Each setup is standard film-lighting craft written for video models: `promptTokens` names the
 * setup and then describes it physically (where the key sits, how hard it is, what the shadows do,
 * the colour), because models follow physical description far better than a label alone.
 * `negativeTokens` keeps the model from washing the setup out. Keep prompt tokens under
 * LIGHTING_TOKEN_LIMIT so a lighting choice always fits beside a long idea.
 */

export type LightingGroup = "portrait" | "mood" | "edge" | "natural" | "practical" | "stylised"

export type LightingPreset = {
  id: string
  name: string
  group: LightingGroup
  /** Three or four words a creator reads at a glance. */
  mood: string
  /** One plain sentence: what it looks like. */
  description: string
  bestFor: string
  promptTokens: string
  negativeTokens: string
}

export const LIGHTING_GROUPS: { id: LightingGroup; label: string; hint: string }[] = [
  { id: "portrait", label: "Portrait", hint: "Classic setups that shape a face" },
  { id: "mood", label: "Mood", hint: "Contrast that sets the tone" },
  { id: "edge", label: "Edge", hint: "Light that separates the subject" },
  { id: "natural", label: "Natural", hint: "Sun, sky and weather" },
  { id: "practical", label: "Practical", hint: "Lamps, flames and screens in the scene" },
  { id: "stylised", label: "Stylised", hint: "Bold colour and atmosphere" },
]

export const LIGHTING_TOKEN_LIMIT = 240

export const LIGHTING_PRESETS: LightingPreset[] = [
  // ── Portrait ────────────────────────────────────────────────────────────────
  {
    id: "light_rembrandt",
    name: "Rembrandt",
    group: "portrait",
    mood: "Painterly, intimate, dramatic",
    description: "One soft key high to the side leaves a small triangle of light on the shadowed cheek.",
    bestFor: "Character close-ups, drama, interviews with gravitas",
    promptTokens: "Rembrandt lighting: one soft key light high and 45 degrees to the side, a small triangle of light on the shadowed cheek, deep gentle falloff, very little fill, painterly shadows",
    negativeTokens: "flat even lighting, overlit face, on-camera flash",
  },
  {
    id: "light_butterfly",
    name: "Butterfly",
    group: "portrait",
    mood: "Glamorous, sculpted, timeless",
    description: "Key high and straight ahead casts a small shadow under the nose and sculpts the cheekbones.",
    bestFor: "Beauty, fashion, hero portraits",
    promptTokens: "butterfly lighting: key light high and directly in front of the face, small symmetrical shadow under the nose, sculpted cheekbones, soft glamorous falloff, subtle fill from below",
    negativeTokens: "side lighting, uneven split shadows, flat lighting",
  },
  {
    id: "light_loop",
    name: "Loop",
    group: "portrait",
    mood: "Natural, flattering, warm",
    description: "A soft key just off-centre makes a small looping nose shadow; the most flattering everyday setup.",
    bestFor: "Dialogue, testimonials, everyday faces",
    promptTokens: "loop lighting: soft key light slightly above and 30 degrees to one side, small nose shadow looping toward the cheek, natural flattering modelling, soft fill keeps the shadows open",
    negativeTokens: "harsh shadows, flat frontal flash, underexposed face",
  },
  {
    id: "light_split",
    name: "Split",
    group: "portrait",
    mood: "Tense, divided, bold",
    description: "Hard light from the side lights exactly half the face; the other half falls into darkness.",
    bestFor: "Villains, inner conflict, thrillers",
    promptTokens: "split lighting: hard key light at 90 degrees to the side, exactly half the face lit and half in deep shadow, strong vertical division, no fill light",
    negativeTokens: "even lighting, fill light, flat lighting, bright background",
  },
  {
    id: "light_short",
    name: "Short light",
    group: "portrait",
    mood: "Moody, slimming, serious",
    description: "The side of the face turned away from camera catches the light, so the face reads narrow and moody.",
    bestFor: "Moody portraits, noir, character reveals",
    promptTokens: "short lighting: key light on the side of the face turned away from the camera, the near side falls into shadow, slimming moody modelling, low fill, dark background",
    negativeTokens: "broad flat lighting, bright even fill",
  },
  {
    id: "light_clamshell",
    name: "Clamshell beauty",
    group: "portrait",
    mood: "Polished, luminous, commercial",
    description: "Soft light above plus a bounce below wraps the face in an even glow with bright catchlights.",
    bestFor: "Beauty, skincare, product with a face",
    promptTokens: "clamshell beauty lighting: large soft key above the face and a bounce fill below, wrap-around even glow, bright catchlights in both eyes, minimal shadows, polished luminous skin",
    negativeTokens: "harsh shadows, dark eye sockets, grainy low light",
  },

  // ── Mood ────────────────────────────────────────────────────────────────────
  {
    id: "light_high_key",
    name: "High-key",
    group: "mood",
    mood: "Bright, airy, optimistic",
    description: "Bright and evenly lit with a pale background and almost no shadows.",
    bestFor: "Ads, comedy, lifestyle, clean product",
    promptTokens: "high-key lighting: bright evenly lit scene, soft frontal key and strong fill, pale or white background, almost no shadows, airy optimistic exposure",
    negativeTokens: "deep shadows, dark corners, low-key, moody darkness",
  },
  {
    id: "light_low_key",
    name: "Low-key",
    group: "mood",
    mood: "Dark, mysterious, tense",
    description: "One hard source; most of the frame falls into deep black and only what matters is lit.",
    bestFor: "Thrillers, horror, luxury reveals",
    promptTokens: "low-key lighting: single hard key from the side, most of the frame falls into deep black shadow, high contrast, only the essential details lit, mysterious tension",
    negativeTokens: "flat fill, bright background, lifted shadows, even exposure",
  },
  {
    id: "light_chiaroscuro",
    name: "Chiaroscuro",
    group: "mood",
    mood: "Baroque, sacred, intense",
    description: "A single warm beam carves the subject out of darkness like an old master painting.",
    bestFor: "Period drama, faith, art pieces",
    promptTokens: "chiaroscuro lighting: one warm directional source carving the subject out of darkness, dramatic baroque contrast, rich deep blacks, painterly old-master light",
    negativeTokens: "flat lighting, bright fill, washed out blacks",
  },
  {
    id: "light_noir_slats",
    name: "Noir blinds",
    group: "mood",
    mood: "Smoky, suspicious, classic",
    description: "Hard light through venetian blinds throws stripes of shadow across the subject and the wall.",
    bestFor: "Detective stories, mystery, retro",
    promptTokens: "film noir lighting: hard light through venetian blinds casting striped shadows across the subject and the wall, smoky high contrast, 1940s detective mood",
    negativeTokens: "soft even light, bright cheerful scene",
  },
  {
    id: "light_silhouette",
    name: "Silhouette",
    group: "mood",
    mood: "Graphic, emotional, anonymous",
    description: "Lit only from behind, the subject becomes a dark shape with a crisp outline.",
    bestFor: "Openings, endings, music videos",
    promptTokens: "silhouette lighting: subject fully backlit against a bright sky or window, the subject is a dark shape with a crisp outline, no front light, graphic emotional composition",
    negativeTokens: "front light on the face, visible facial detail, flat lighting",
  },
  {
    id: "light_top",
    name: "Hard top light",
    group: "mood",
    mood: "Harsh, isolated, confrontational",
    description: "One source straight overhead: deep eye shadows and a pool of light on the floor.",
    bestFor: "Interrogations, fights, crime",
    promptTokens: "hard top light: a single source directly overhead, deep eye-socket shadows, pool of light on the floor, dark surroundings, harsh confrontational intensity",
    negativeTokens: "soft frontal fill, bright background, even lighting",
  },
  {
    id: "light_under",
    name: "Under light",
    group: "mood",
    mood: "Eerie, unnatural, unsettling",
    description: "Light from below throws shadows upward across the face.",
    bestFor: "Horror, campfire stories, the uncanny",
    promptTokens: "under lighting: light from below the face throwing shadows upward, eerie unnatural modelling, dark surroundings, unsettling horror tension",
    negativeTokens: "light from above, natural daylight, cheerful lighting",
  },

  // ── Edge ────────────────────────────────────────────────────────────────────
  {
    id: "light_rim",
    name: "Rim light",
    group: "edge",
    mood: "Premium, sculpted, heroic",
    description: "A strong light behind draws a bright outline on hair and shoulders against a dark background.",
    bestFor: "Product, sports, heroes, premium ads",
    promptTokens: "rim lighting: strong backlight behind the subject tracing a bright thin outline on hair and shoulders, separating it from a dark background, low frontal fill, premium cinematic depth",
    negativeTokens: "flat frontal light, subject blending into background",
  },
  {
    id: "light_halo",
    name: "Backlit halo",
    group: "edge",
    mood: "Dreamy, romantic, soft",
    description: "Warm light behind glows through the hair with soft flare and haze.",
    bestFor: "Romance, weddings, nostalgia",
    promptTokens: "soft backlight halo: warm light behind the subject glowing through hair, gentle lens flare and haze, the face softly lit by bounce, dreamy romantic glow",
    negativeTokens: "harsh shadows, cold light, hard contrast",
  },
  {
    id: "light_kicker",
    name: "Edge kicker",
    group: "edge",
    mood: "Sleek, sharp, athletic",
    description: "A hard light from behind skims the cheek and jaw; the rest of the face stays in shadow.",
    bestFor: "Sport, fashion, car and tech ads",
    promptTokens: "edge-lit profile: hard kicker light from three-quarter behind skimming the cheek and jaw line, the rest of the face in shadow, sleek high contrast, dark background",
    negativeTokens: "flat frontal light, soft even fill",
  },

  // ── Natural ─────────────────────────────────────────────────────────────────
  {
    id: "light_golden_hour",
    name: "Golden hour",
    group: "natural",
    mood: "Warm, nostalgic, glowing",
    description: "Low sun near the horizon: long soft shadows, amber tones and glowing skin.",
    bestFor: "Lifestyle, romance, travel, endings",
    promptTokens: "golden hour sunlight: low warm sun near the horizon, long soft shadows, amber and honey tones, glowing skin, gentle lens flare",
    negativeTokens: "harsh midday sun, cold blue light, overcast",
  },
  {
    id: "light_blue_hour",
    name: "Blue hour",
    group: "natural",
    mood: "Calm, melancholic, cool",
    description: "Deep blue sky just after sunset, with warm windows and street lights starting to glow.",
    bestFor: "City moods, reflective moments",
    promptTokens: "blue hour twilight: deep blue sky just after sunset, soft shadowless ambient light, cool tones with warm practical lights beginning to glow, calm melancholy",
    negativeTokens: "bright daylight, harsh sun, warm golden sky",
  },
  {
    id: "light_overcast",
    name: "Overcast",
    group: "natural",
    mood: "Soft, honest, quiet",
    description: "A cloudy sky acts as a giant softbox: even light, muted colour, true skin tones.",
    bestFor: "Documentary, drama, realism",
    promptTokens: "overcast soft daylight: cloud-covered sky as a giant softbox, even shadowless light, muted natural colours, true skin tones, quiet realism",
    negativeTokens: "hard sun shadows, lens flare, saturated colour",
  },
  {
    id: "light_noon_sun",
    name: "Harsh noon sun",
    group: "natural",
    mood: "Hot, exposed, raw",
    description: "Hard overhead sun: short black shadows, bright highlights and saturated colour.",
    bestFor: "Westerns, deserts, summer, documentary",
    promptTokens: "harsh midday sun: hard overhead sunlight, short crisp black shadows, bright highlights, saturated colours, heat haze, raw documentary realism",
    negativeTokens: "soft light, overcast, golden hour, night",
  },
  {
    id: "light_window",
    name: "Window light",
    group: "natural",
    mood: "Calm, painterly, real",
    description: "Soft daylight from one big side window, fading gently into a darker room.",
    bestFor: "Interiors, intimate scenes, product on a table",
    promptTokens: "window light: soft daylight from one large side window, gradual falloff into a darker room, natural shadows, calm painterly interior",
    negativeTokens: "overhead fluorescent light, flash, flat even lighting",
  },
  {
    id: "light_dappled",
    name: "Dappled sun",
    group: "natural",
    mood: "Peaceful, alive, organic",
    description: "Sunlight through leaves scatters moving patches of light and shadow.",
    bestFor: "Nature, picnics, gardens, memory",
    promptTokens: "dappled sunlight through leaves: patches of light and shadow moving across the subject, warm green-gold spill, gentle breeze in the light, peaceful nature",
    negativeTokens: "flat even light, studio light, night",
  },
  {
    id: "light_moonlight",
    name: "Moonlight",
    group: "natural",
    mood: "Quiet, cool, secretive",
    description: "Cool blue-silver light from high above; deep night shadows but faces still read.",
    bestFor: "Night exteriors, romance, suspense",
    promptTokens: "moonlight: cool blue-silver key light from high and to the side, deep night shadows, low exposure but readable faces, soft sheen on wet surfaces",
    negativeTokens: "daylight, warm sunlight, bright sky, overexposed",
  },

  // ── Practical ───────────────────────────────────────────────────────────────
  {
    id: "light_candle",
    name: "Candlelight",
    group: "practical",
    mood: "Intimate, warm, historic",
    description: "Flickering flames are the only light: orange glow on faces, darkness close behind.",
    bestFor: "Period drama, romance, rituals",
    promptTokens: "candlelight: flickering candle flames as the only light source, warm orange glow on faces, fast falloff into darkness, intimate period-drama mood",
    negativeTokens: "electric light, daylight, bright even lighting, cold light",
  },
  {
    id: "light_firelight",
    name: "Firelight",
    group: "practical",
    mood: "Primal, warm, restless",
    description: "Dancing orange light from a fire, with moving shadows, embers and smoke.",
    bestFor: "Camps, survival, fantasy, gatherings",
    promptTokens: "firelight: warm dancing orange light from a nearby fire, flickering shadows across faces, drifting embers and smoke, warm light against a dark night",
    negativeTokens: "daylight, cold light, steady studio light",
  },
  {
    id: "light_lamplit",
    name: "Lamp-lit room",
    group: "practical",
    mood: "Cosy, lived-in, real",
    description: "Lamps in the shot are the light: warm pools with soft shadow between them.",
    bestFor: "Homes, bars, quiet conversations",
    promptTokens: "practical lamp-lit interior: table and floor lamps visible in frame as the light sources, warm pools of light, cosy shadows between them, lived-in realism",
    negativeTokens: "overhead fluorescent, flat bright room, daylight",
  },
  {
    id: "light_screen_glow",
    name: "Screen glow",
    group: "practical",
    mood: "Lonely, late-night, modern",
    description: "Only a phone, laptop or TV lights the face with a cool, shifting glow.",
    bestFor: "Tech, thrillers, late-night scenes",
    promptTokens: "screen glow: the subject lit only by the cool shifting light of a phone, laptop or TV screen, blue-white light on the face, dark room around, late-night isolation",
    negativeTokens: "daylight, bright room, warm lamp light",
  },
  {
    id: "light_neon",
    name: "Neon",
    group: "practical",
    mood: "Electric, urban, nocturnal",
    description: "Pink, cyan and purple signs light the scene and reflect in wet streets and skin.",
    bestFor: "City nights, music, fashion, sci-fi",
    promptTokens: "neon practical lighting: saturated pink, cyan and purple neon signs as the key light, coloured reflections on wet streets and skin, urban night energy",
    negativeTokens: "daylight, natural white light, dull colour",
  },
  {
    id: "light_headlights",
    name: "Headlights",
    group: "practical",
    mood: "Tense, exposed, nocturnal",
    description: "Hard white car beams cut through dark mist and throw long shadows.",
    bestFor: "Roadside scenes, chases, thrillers",
    promptTokens: "car headlights: hard white beams from vehicle headlights cutting through darkness and light mist, long thrown shadows, tense roadside night",
    negativeTokens: "daylight, soft even light, bright sky",
  },

  // ── Stylised ────────────────────────────────────────────────────────────────
  {
    id: "light_teal_orange",
    name: "Teal & orange",
    group: "stylised",
    mood: "Blockbuster, vivid, bold",
    description: "Warm orange light on skin against cool teal shadows and background.",
    bestFor: "Action, trailers, big commercial looks",
    promptTokens: "teal and orange lighting: warm orange key light on skin against cool teal shadows and background, strong complementary colour contrast, blockbuster look",
    negativeTokens: "monochrome, desaturated, flat colour",
  },
  {
    id: "light_bicolor",
    name: "Red & blue",
    group: "stylised",
    mood: "Charged, rhythmic, intense",
    description: "Deep red from one side, electric blue from the other; the colours meet on the face.",
    bestFor: "Music videos, clubs, thrillers",
    promptTokens: "bi-colour lighting: one side of the subject lit deep red and the other electric blue, coloured shadows meeting on the face, music-video intensity",
    negativeTokens: "white light, natural daylight, single colour",
  },
  {
    id: "light_god_rays",
    name: "God rays",
    group: "stylised",
    mood: "Epic, spiritual, awe",
    description: "Shafts of light stream through windows, trees or dust into hazy air.",
    bestFor: "Reveals, cathedrals, forests, epics",
    promptTokens: "volumetric god rays: shafts of light streaming through windows, trees or dust, visible beams in hazy air, the subject stepping into the light, epic spiritual mood",
    negativeTokens: "clear air, flat lighting, no visible beams",
  },
  {
    id: "light_haze",
    name: "Atmospheric haze",
    group: "stylised",
    mood: "Dreamy, deep, cinematic",
    description: "Soft haze fills the space; backlights bloom into glowing halos.",
    bestFor: "Concerts, dream scenes, sci-fi interiors",
    promptTokens: "atmospheric haze: soft haze filling the space, backlights blooming into glowing beams and halos, lowered contrast, dreamy cinematic depth",
    negativeTokens: "crisp clear air, flat lighting, hard contrast",
  },
  {
    id: "light_spotlight",
    name: "Stage spotlight",
    group: "stylised",
    mood: "Theatrical, lonely, focused",
    description: "One hard follow spot isolates the subject in a circle of light on black.",
    bestFor: "Performances, monologues, reveals",
    promptTokens: "stage spotlight: a single hard follow spot isolating the subject in a circle of light, black surroundings, faint haze in the beam, theatrical focus",
    negativeTokens: "bright room, even lighting, daylight",
  },
  {
    id: "light_strobe",
    name: "Club strobe",
    group: "stylised",
    mood: "Wild, kinetic, loud",
    description: "Pulsing coloured stage lights and strobes, smoke and laser beams.",
    bestFor: "Nightlife, dance, festivals",
    promptTokens: "club strobe lighting: pulsing coloured stage lights and bright strobe flashes freezing motion, smoke and laser beams, high-energy nightlife",
    negativeTokens: "daylight, calm even lighting, empty room",
  },
  {
    id: "light_fluorescent",
    name: "Fluorescent",
    group: "stylised",
    mood: "Sterile, uneasy, real",
    description: "Flat greenish-white tube light from above with a faint flicker.",
    bestFor: "Offices, hospitals, unease, satire",
    promptTokens: "fluorescent overhead lighting: flat greenish-white tube light from above, faint flicker, sterile office or hospital realism, quiet unease",
    negativeTokens: "warm golden light, candlelight, sunset",
  },
  {
    id: "light_lightning",
    name: "Lightning storm",
    group: "stylised",
    mood: "Violent, sudden, ominous",
    description: "A dark storm lit by bright white lightning flashes and hard momentary shadows.",
    bestFor: "Horror, storms, turning points",
    promptTokens: "lightning storm: dark stormy scene lit by sudden bright white lightning flashes, hard momentary shadows, rain streaks, ominous tension",
    negativeTokens: "sunny day, clear sky, soft even lighting",
  },
]

export function findLightingPreset(id: string | null | undefined): LightingPreset | undefined {
  if (!id) return undefined
  return LIGHTING_PRESETS.find((preset) => preset.id === id)
}

/** The words the video model reads for a lighting choice, or "" when there is none. */
export function lightingClause(id: string | null | undefined): string {
  return findLightingPreset(id)?.promptTokens ?? ""
}
