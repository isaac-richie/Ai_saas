/** Visual language of the film: the site's obsidian & champagne system. */
export const FPS = 30
export const WIDTH = 1920
export const HEIGHT = 1080

/** Music grid: 100 BPM → one beat every 18 frames. Cuts land on beats. */
export const BEAT = 18
export const beats = (n: number) => Math.round(n * BEAT)

export const color = {
  obsidian: "#0b0c0b",
  ink: "#060706",
  paper: "#f1ece0",
  muted: "#a9aaa3",
  gold: "#d9c08a",
  goldDeep: "#b89b5e",
  emerald: "#7fd8b4",
}

export const font = {
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  sans: "'Avenir Next', Avenir, 'Helvetica Neue', sans-serif",
}
