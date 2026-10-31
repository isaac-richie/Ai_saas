import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { alignCutsToBeats, transitionOverlapMs, applyEditCommands, rippleClips, describeTimelineForAgent, agentPlanSchema, AGENT_INSTRUCTIONS, MIN_CLIP_MS } =
  await loadTs('core/services/edit-agent.ts');

function clip(id, start, end, extra = {}) {
  return { id, start_ms: start, end_ms: end, volume: 1, transition_out: null, transition_out_ms: 0, metadata: {}, color_grade_id: null, ...extra };
}
const base = () => ({
  timeline_grade_id: 'natural',
  clips: [clip('a', 0, 5000), clip('b', 5000, 10000), clip('c', 10000, 15000)],
});
const ids = (r) => r.clips.map((c) => c.id);

describe('rippleClips', () => {
  it('closes gaps and overlaps', () => {
    const out = rippleClips([clip('a', 1000, 3000), clip('b', 2000, 6000), clip('c', 9000, 10000)]);
    assert.deepEqual(out.map((c) => [c.start_ms, c.end_ms]), [[0, 2000], [2000, 6000], [6000, 7000]]);
  });
  it('does not mutate input', () => {
    const input = [clip('a', 500, 1500)];
    rippleClips(input);
    assert.equal(input[0].start_ms, 500);
  });
});

describe('applyEditCommands', () => {
  it('trims a clip and ripples later clips', () => {
    const r = applyEditCommands(base(), [{ type: 'trim_clip', clip: 1, duration_sec: 2 }]);
    assert.deepEqual(r.clips.map((c) => [c.start_ms, c.end_ms]), [[0, 2000], [2000, 7000], [7000, 12000]]);
    assert.equal(r.duration_ms, 12000);
  });

  it('never extends a clip past its source length', () => {
    const r = applyEditCommands(base(), [{ type: 'trim_clip', clip: 2, duration_sec: 20 }]);
    assert.equal(r.clips[1].end_ms - r.clips[1].start_ms, 5000);
  });

  it('allows extending up to known source duration', () => {
    const s = base();
    s.clips[0].metadata = { source_duration_ms: 8000 };
    const r = applyEditCommands(s, [{ type: 'trim_clip', clip: 1, duration_sec: 7 }]);
    assert.equal(r.clips[0].end_ms, 7000);
  });

  it('rejects trims below the minimum length', () => {
    const r = applyEditCommands(base(), [{ type: 'trim_clip', clip: 1, duration_sec: 0.1 }]);
    assert.equal(r.applied.length, 0);
    assert.equal(r.rejected.length, 1);
    assert.equal(r.clips[0].end_ms, 5000);
    assert.ok(MIN_CLIP_MS > 0);
  });

  it('rejects NaN durations', () => {
    const r = applyEditCommands(base(), [{ type: 'trim_clip', clip: 1, duration_sec: NaN }]);
    assert.equal(r.rejected.length, 1);
  });

  it('removes a clip and ripples', () => {
    const r = applyEditCommands(base(), [{ type: 'remove_clip', clip: 2 }]);
    assert.deepEqual(ids(r), ['a', 'c']);
    assert.deepEqual(r.removed_ids, ['b']);
    assert.equal(r.clips[1].start_ms, 5000);
  });

  it('refuses to remove the last remaining clip', () => {
    const r = applyEditCommands({ timeline_grade_id: 'natural', clips: [clip('a', 0, 5000)] }, [{ type: 'remove_clip', clip: 1 }]);
    assert.equal(r.clips.length, 1);
    assert.equal(r.rejected.length, 1);
  });

  it('resolves positions against the original timeline after removals', () => {
    const r = applyEditCommands(base(), [
      { type: 'remove_clip', clip: 1 },
      { type: 'set_volume', clip: 3, volume: 0.5 },
    ]);
    assert.equal(r.clips.find((c) => c.id === 'c').volume, 0.5);
  });

  it('rejects commands on an already removed clip', () => {
    const r = applyEditCommands(base(), [
      { type: 'remove_clip', clip: 2 },
      { type: 'trim_clip', clip: 2, duration_sec: 1 },
    ]);
    assert.equal(r.rejected.length, 1);
    assert.match(r.rejected[0].reason, /already removed/);
  });

  it('rejects out of range positions', () => {
    for (const bad of [0, -1, 4, 99]) {
      const r = applyEditCommands(base(), [{ type: 'set_volume', clip: bad, volume: 1 }]);
      assert.equal(r.rejected.length, 1, `position ${bad}`);
    }
  });

  it('moves a clip to a new position', () => {
    const r = applyEditCommands(base(), [{ type: 'move_clip', clip: 3, to_position: 1 }]);
    assert.deepEqual(ids(r), ['c', 'a', 'b']);
    assert.equal(r.clips[0].start_ms, 0);
  });

  it('clamps move targets into range', () => {
    const r = applyEditCommands(base(), [{ type: 'move_clip', clip: 1, to_position: 50 }]);
    assert.deepEqual(ids(r), ['b', 'c', 'a']);
  });

  it('clamps transition duration to the spec', () => {
    const r = applyEditCommands(base(), [{ type: 'set_transition', clip: 1, transition: 'crossfade', duration_ms: 99999 }]);
    assert.equal(r.clips[0].transition_out, 'crossfade');
    assert.equal(r.clips[0].transition_out_ms, 3000);
  });

  it('grades the whole timeline when clip is null', () => {
    const r = applyEditCommands(base(), [{ type: 'set_color_grade', clip: null, grade_id: 'teal-orange' }]);
    assert.equal(r.timeline_grade_id, 'teal-orange');
    assert.ok(r.clips.every((c) => c.color_grade_id === null));
  });

  it('grades a single clip', () => {
    const r = applyEditCommands(base(), [{ type: 'set_color_grade', clip: 2, grade_id: 'cool-noir' }]);
    assert.equal(r.clips[1].color_grade_id, 'cool-noir');
    assert.equal(r.timeline_grade_id, 'natural');
  });

  it('clamps volume to 0..2', () => {
    const r = applyEditCommands(base(), [
      { type: 'set_volume', clip: 1, volume: 9 },
      { type: 'set_volume', clip: 2, volume: -3 },
    ]);
    assert.equal(r.clips[0].volume, 2);
    assert.equal(r.clips[1].volume, 0);
  });

  it('applies a trailer pacing profile', () => {
    const r = applyEditCommands(base(), [{ type: 'apply_pacing', profile_id: 'trailer' }]);
    assert.ok(r.clips.every((c) => c.end_ms - c.start_ms === 1500));
    assert.ok(r.clips.every((c) => c.transition_out === 'cut'));
    assert.equal(r.duration_ms, 4500);
  });

  it('pacing never lengthens clips beyond their source', () => {
    const r = applyEditCommands(base(), [{ type: 'apply_pacing', profile_id: 'documentary' }]);
    assert.ok(r.clips.every((c) => c.end_ms - c.start_ms === 5000));
  });

  it('sorts unsorted input by start time before numbering', () => {
    const s = { timeline_grade_id: 'natural', clips: [clip('late', 5000, 9000), clip('early', 0, 5000)] };
    const r = applyEditCommands(s, [{ type: 'remove_clip', clip: 1 }]);
    assert.deepEqual(r.removed_ids, ['early']);
  });

  it('does not mutate the input state', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    applyEditCommands(s, [{ type: 'trim_clip', clip: 1, duration_sec: 1 }, { type: 'remove_clip', clip: 2 }]);
    assert.equal(JSON.stringify(s), snapshot);
  });

  it('empty command list is a no-op', () => {
    const r = applyEditCommands(base(), []);
    assert.deepEqual(ids(r), ['a', 'b', 'c']);
    assert.equal(r.duration_ms, 15000);
  });
});

describe('agent plan schema', () => {
  it('accepts a valid plan', () => {
    const plan = agentPlanSchema.parse({ summary: 'ok', commands: [{ type: 'set_transition', clip: 1, transition: 'fade_black', duration_ms: 800 }], new_shots: [] });
    assert.equal(plan.commands.length, 1);
  });
  it('accepts a request for new footage, capped at three', () => {
    assert.equal(agentPlanSchema.parse({ summary: 'needs a shot', commands: [], new_shots: [{ clip: null, what: 'close-up' }] }).new_shots.length, 1);
    assert.throws(() => agentPlanSchema.parse({ summary: '', commands: [], new_shots: Array.from({ length: 4 }, () => ({ clip: 1, what: 'x' })) }));
  });
  it('rejects unknown transitions, grades and profiles', () => {
    assert.throws(() => agentPlanSchema.parse({ summary: '', commands: [{ type: 'set_transition', clip: 1, transition: 'explode', duration_ms: 1 }] }));
    assert.throws(() => agentPlanSchema.parse({ summary: '', commands: [{ type: 'set_color_grade', clip: null, grade_id: 'nope' }] }));
    assert.throws(() => agentPlanSchema.parse({ summary: '', commands: [{ type: 'apply_pacing', profile_id: 'nope' }] }));
  });
  it('rejects unknown command types', () => {
    assert.throws(() => agentPlanSchema.parse({ summary: '', commands: [{ type: 'delete_everything' }] }));
  });
  it('caps plans at 40 commands', () => {
    const commands = Array.from({ length: 41 }, () => ({ type: 'set_volume', clip: 1, volume: 1 }));
    assert.throws(() => agentPlanSchema.parse({ summary: '', commands }));
  });
});

describe('agent context', () => {
  it('numbers clips in time order with rounded durations', () => {
    const d = describeTimelineForAgent({ timeline_grade_id: 'natural', clips: [clip('b', 4000, 6449), clip('a', 0, 4000)] });
    assert.deepEqual(d.clips.map((c) => [c.clip, c.duration_sec]), [[1, 4], [2, 2.4]]);
    assert.equal(d.clips[0].transition_out, 'cut');
  });
  it('instructions list every transition, grade and profile', () => {
    for (const word of ['fade_black', 'teal-orange', 'social_short', 'rule of six']) {
      assert.ok(AGENT_INSTRUCTIONS.includes(word), word);
    }
  });
});

// Where each cut actually happens in the finished video, using the same overlap rule as render.
function outputCuts(clips) {
  const sorted = [...clips].sort((a, b) => a.start_ms - b.start_ms);
  const cuts = [];
  let start = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i].end_ms - sorted[i].start_ms;
    const b = sorted[i + 1].end_ms - sorted[i + 1].start_ms;
    const overlap = transitionOverlapMs(sorted[i], a, b);
    cuts.push(start + a - overlap / 2);
    start += a - overlap;
  }
  return cuts;
}

describe('beat sync', () => {
  const beats = Array.from({ length: 40 }, (_, i) => 0.23 + i * 0.5);
  const near = (ms) => Math.min(...beats.map((b) => Math.abs(b * 1000 - ms)));

  it('puts every hard cut on a beat in the finished video', () => {
    const clips = [clip('a', 0, 2100), clip('b', 2100, 4000), clip('c', 4000, 6000), clip('d', 6000, 9000)];
    const out = alignCutsToBeats(clips, beats);
    for (const cut of outputCuts(out)) assert.ok(near(cut) <= 1, `cut at ${cut}ms is ${near(cut)}ms off the beat`);
  });

  it('accounts for crossfade overlaps', () => {
    const clips = [
      clip('a', 0, 3000, { transition_out: 'crossfade', transition_out_ms: 800 }),
      clip('b', 3000, 6000, { transition_out: 'fade_black', transition_out_ms: 600 }),
      clip('c', 6000, 9000),
    ];
    const out = alignCutsToBeats(clips, beats);
    for (const cut of outputCuts(out)) assert.ok(near(cut) <= 1, `cut at ${cut}ms`);
  });

  it('never stretches a clip past its footage', () => {
    const clips = [clip('a', 0, 2000), clip('b', 2000, 4000)];
    const out = alignCutsToBeats(clips, beats);
    assert.ok(out.every((c) => c.end_ms - c.start_ms <= 2000));
  });

  it('may lengthen when the footage is longer', () => {
    const clips = [clip('a', 0, 1900, { metadata: { source_duration_ms: 5000 } }), clip('b', 1900, 4000)];
    const out = alignCutsToBeats(clips, [0, 1, 2, 3, 4, 5, 6]);
    assert.ok(out[0].end_ms > 1900, 'first clip was lengthened');
    assert.equal(outputCuts(out)[0], 2000);
  });

  it('leaves clips alone without enough beats', () => {
    const clips = [clip('a', 0, 2000)];
    assert.deepEqual(alignCutsToBeats(clips, [1]), clips);
  });

  it('agent command rejects when there is no music', () => {
    const r = applyEditCommands(base(), [{ type: 'sync_to_music' }]);
    assert.equal(r.rejected.length, 1);
    assert.match(r.rejected[0].reason, /music/);
  });

  it('agent command syncs when beats are known', () => {
    const r = applyEditCommands({ ...base(), beats }, [{ type: 'sync_to_music' }]);
    assert.equal(r.applied.length, 1);
    for (const cut of outputCuts(r.clips)) assert.ok(near(cut) <= 1);
  });
});

describe('the plan format OpenAI is asked to follow', () => {
  it('uses no oneOf, which OpenAI structured outputs reject', async () => {
    const { zodTextFormat } = await import('openai/helpers/zod');
    const format = zodTextFormat(agentPlanSchema, 'edit_plan');
    assert.ok(!JSON.stringify(format.schema).includes('"oneOf"'));
    assert.ok(JSON.stringify(format.schema).includes('"anyOf"'));
  });
});
