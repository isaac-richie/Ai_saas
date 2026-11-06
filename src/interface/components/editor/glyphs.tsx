'use client';

import type * as React from 'react';

/**
 * Visiowave's own icon set for the editor and the lighting library. Each glyph draws the thing it
 * stands for (a clip with trim handles, a frame inside a frame, a face lit Rembrandt-style), in two
 * tones: the outline in the current colour and one accent shape filled softly.
 */
export type GlyphProps = { size?: number; strokeWidth?: number; className?: string };
export type Glyph = (props: GlyphProps) => React.ReactElement;

function Svg({ size = 20, strokeWidth = 1.6, className = '', children }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

const accent = { fill: 'currentColor', fillOpacity: 0.28, stroke: 'none' } as const;

/** Adjust: a clip on the timeline with its two trim handles. */
export const AdjustGlyph: Glyph = (p) => (
  <Svg {...p}>
    <rect x="6.5" y="7" width="11" height="10" rx="1.6" {...accent} />
    <rect x="6.5" y="7" width="11" height="10" rx="1.6" />
    <path d="M9.5 7v10M14.5 7v10" strokeOpacity={0.45} />
    <path d="M3.5 8.5v7M20.5 8.5v7" strokeWidth={2.4} />
  </Svg>
);

/** Look: three overlapping colour discs, like grading wheels. */
export const LookGlyph: Glyph = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="10" r="5" {...accent} />
    <circle cx="9" cy="10" r="5" />
    <circle cx="15" cy="10" r="5" />
    <circle cx="12" cy="15" r="5" strokeOpacity={0.7} />
  </Svg>
);

/** Format: a vertical frame inside a widescreen frame. */
export const FormatGlyph: Glyph = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="1.6" />
    <rect x="9" y="3.5" width="6" height="17" rx="1.2" {...accent} />
    <rect x="9" y="3.5" width="6" height="17" rx="1.2" strokeDasharray="2 2" />
  </Svg>
);

/** Music: a waveform with one beat marked. */
export const MusicGlyph: Glyph = (p) => (
  <Svg {...p}>
    <path d="M3.5 11v2M6.5 8.5v7M9.5 6v12M12.5 9v6M15.5 5v14M18.5 9.5v5M21 11.5v1" />
    <circle cx="15.5" cy="21" r="1.2" {...accent} fillOpacity={1} />
  </Svg>
);

/** Text: a title letter over a caption bar. */
export const TextGlyph: Glyph = (p) => (
  <Svg {...p}>
    <path d="M7 4.5h10M12 4.5v9" />
    <rect x="3.5" y="16.5" width="17" height="4" rx="2" {...accent} />
    <path d="M7 18.5h6" strokeOpacity={0.8} />
  </Svg>
);

/** Light: a sphere lit from the top-left, with the key light's rays coming in. */
export const LightGlyph: Glyph = (p) => (
  <Svg {...p}>
    <circle cx="14" cy="14" r="6.5" />
    <path d="M14 7.5a6.5 6.5 0 0 0 0 13a3.6 6.5 0 0 1 0-13z" {...accent} fillOpacity={0.75} />
    <path d="M3.5 3.5l2.8 2.8M2.5 9h3M9 2.5v3" />
  </Svg>
);

// ── Lighting groups ──────────────────────────────────────────────────────────

/** Portrait: a face lit from one side, with the Rembrandt triangle on the shadow cheek. */
export const PortraitLightGlyph: Glyph = (p) => (
  <Svg {...p}>
    <ellipse cx="12" cy="12" rx="6" ry="8" />
    <path d="M12 4a6 8 0 0 0 0 16z" {...accent} fillOpacity={0.55} />
    <path d="M14.2 11.2l2.2 1.3-2.2 1.2z" fill="currentColor" stroke="none" />
  </Svg>
);

/** Mood: a moon of light swallowed by shadow. */
export const MoodLightGlyph: Glyph = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16a5.5 8 0 0 0 0-16z" {...accent} fillOpacity={0.7} />
  </Svg>
);

/** Edge: a dark form with a bright rim along one side. */
export const EdgeLightGlyph: Glyph = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" strokeOpacity={0.35} />
    <path d="M12 4.5a7.5 7.5 0 0 1 0 15" strokeWidth={2.6} />
  </Svg>
);

/** Natural: a low sun on the horizon. */
export const NaturalLightGlyph: Glyph = (p) => (
  <Svg {...p}>
    <path d="M2.5 16.5h19" />
    <path d="M7 16.5a5 5 0 0 1 10 0z" {...accent} fillOpacity={0.55} />
    <path d="M7 16.5a5 5 0 0 1 10 0" />
    <path d="M12 6.5v2M5.5 9l1.4 1.4M18.5 9l-1.4 1.4M4.5 20h3M16.5 20h3" />
  </Svg>
);

/** Practical: a lamp in the scene throwing its pool of light. */
export const PracticalLightGlyph: Glyph = (p) => (
  <Svg {...p}>
    <path d="M8.5 4h7l2.5 6h-12z" />
    <path d="M6 10l-2 6h16l-2-6z" {...accent} fillOpacity={0.45} />
    <path d="M12 10v8M9 20.5h6" />
  </Svg>
);

/** Stylised: a prism splitting light into colour. */
export const StylisedLightGlyph: Glyph = (p) => (
  <Svg {...p}>
    <path d="M10 4.5l6 13H4z" {...accent} />
    <path d="M10 4.5l6 13H4z" />
    <path d="M1.5 12.5l5.5-1" />
    <path d="M13.5 11l8-2.5M14 12.5l7.5 0.5M14.5 14l7 3" strokeOpacity={0.75} />
  </Svg>
);

export const LIGHTING_GROUP_GLYPHS: Record<string, Glyph> = {
  portrait: PortraitLightGlyph,
  mood: MoodLightGlyph,
  edge: EdgeLightGlyph,
  natural: NaturalLightGlyph,
  practical: PracticalLightGlyph,
  stylised: StylisedLightGlyph,
};
