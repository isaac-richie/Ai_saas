/** One-tap first cuts: each style is a complete brief for the AI editor. */

export const AUTO_EDIT_STYLES = [
  {
    id: 'trailer',
    label: 'Movie trailer',
    hint: 'Tense build, quick cuts, big ending',
    brief:
      'Cut this as a cinematic movie trailer. Open on the most intriguing shot, build tension with progressively quicker cuts, and save the most powerful shot for the end. Use the trailer pacing profile, a dramatic cinematic grade, mostly hard cuts with one or two fades through black at turning points, and end with a fade to black.',
  },
  {
    id: 'story',
    label: 'Story',
    hint: 'Calm, clear, emotional',
    brief:
      'Cut this as a clear, emotional short film. Keep the story in a logical order from setup to resolution, with an unhurried rhythm that lets moments breathe. Use gentle crossfades between scenes and hard cuts within a scene, a natural or warm grade that suits the mood, and end with a fade to black.',
  },
  {
    id: 'social',
    label: 'Social short',
    hint: 'Hook fast, about 15 seconds',
    brief:
      'Cut this as a social media short of about 15 seconds. Open on the most eye-catching shot as a hook within the first second, keep every shot short and punchy, cut out anything slow, use a vivid grade, hard cuts only, and end cleanly on a strong image with a quick fade to black.',
  },
  {
    id: 'music',
    label: 'Music video',
    hint: 'Every cut on the beat',
    brief:
      'Cut this as a music video. Order shots for energy and visual contrast, use a bold stylised grade, hard cuts, and time every cut to the beat of the music. End with a fade to black.',
  },
] as const;

export type AutoEditStyle = (typeof AUTO_EDIT_STYLES)[number]['id'];

export function isAutoEditStyle(value: unknown): value is AutoEditStyle {
  return AUTO_EDIT_STYLES.some((s) => s.id === value);
}

/** The full instruction for the AI editor: the style brief plus what every good first cut needs. */
export function autoEditInstruction(style: AutoEditStyle, hasMusic: boolean): string {
  const brief = AUTO_EDIT_STYLES.find((s) => s.id === style)!.brief;
  return [
    brief,
    'This is a complete first cut, so make every decision: order, length of each shot, transitions, the look, and the ending (set a fade on the last shot).',
    hasMusic
      ? 'There is music: finish by re-timing the cuts to its beat.'
      : 'There is no music, so do not try to sync to a beat.',
    'Use what each shot shows to decide its place. Never make a shot longer than it can be.',
  ].join(' ');
}

/** An opening title from the project name, or null when the name isn't worth showing. */
export function openingTitle(projectName: string | null | undefined): string | null {
  const name = (projectName || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || /^(untitled|new project|project)\b/i.test(name)) return null;
  return name.slice(0, 60);
}
