export type TrackType = 'video' | 'audio' | 'caption' | 'sfx';
export type ClipType = 'video' | 'audio' | 'caption' | 'image' | 'sfx';
export type TransitionType =
  | 'cut'
  | 'crossfade'
  | 'fade_black'
  | 'fade_white'
  | 'wipe_left'
  | 'wipe_right'
  | 'dissolve';

export type EditSource = 'user' | 'ai_agent' | 'system';

export interface TimelineProject {
  id: string;
  project_id: string;
  name: string;
  fps: number;
  resolution: string;
  duration_ms: number;
  color_grade_id: string;
  /** How footage of another shape fills the frame: 'blur' | 'fill' | 'fit'. Missing on old rows. */
  frame_fit?: string;
  created_at: string;
  updated_at: string;
}

export interface TimelineTrack {
  id: string;
  timeline_id: string;
  name: string;
  track_type: TrackType;
  order_index: number;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  created_at: string;
}

export interface TimelineClip {
  id: string;
  track_id: string;
  take_id: string | null;
  asset_url: string | null;
  clip_type: ClipType;
  start_ms: number;
  end_ms: number;
  trim_start_ms: number;
  trim_end_ms: number | null;
  volume: number;
  opacity: number;
  transition_in: TransitionType | null;
  transition_in_ms: number;
  transition_out: TransitionType | null;
  transition_out_ms: number;
  color_grade_id: string | null;
  metadata: Record<string, unknown>;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface EditCommand {
  id: string;
  timeline_id: string;
  command_type: string;
  parameters: Record<string, unknown>;
  applied_at: string;
  undone: boolean;
  source: EditSource;
}

export interface TimelineState {
  timeline: TimelineProject | null;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playhead_ms: number;
  zoom: number;
  selected_clip_id: string | null;
  is_playing: boolean;
}
