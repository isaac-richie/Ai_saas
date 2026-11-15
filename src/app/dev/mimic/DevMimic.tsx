'use client';

import { useMemo } from 'react';
import { MimicStudio, type MimicActions } from '@/interface/components/mimic/MimicStudio';
import type { MimicTaskView } from '@/core/actions/mimic';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function sampleTasks(): MimicTaskView[] {
  const source = { origin: 'recorded' as const, url: '/landing-720.mp4', durationMs: 12_000, width: 1280, height: 720, hasAudio: true };
  return [
    {
      id: id(1), status: 'ready', title: 'Kitchen monologue', source, trimStartMs: 1_000, trimEndMs: 9_000,
      assignments: [
        { id: id(11), label: 'Sam', targetType: 'person', target: 'the man at the counter, grey hoodie', referenceUrls: ['/studio-plate-1.jpg', '/studio-plate-2.jpg'], instructions: '' },
        { id: id(12), label: 'My product', targetType: 'object', target: 'the mug in his hand', referenceUrls: ['/director.png'], instructions: 'Keep the steam' },
      ],
      instructions: '', audioPolicy: 'keep_source', resolution: '720p', costUnits: null, resultUrl: null, errorMessage: null, parentTaskId: null, submittedAt: null, createdAt: minutesAgo(3),
    },
    {
      id: id(2), status: 'completed', title: 'Street walk', source: { ...source, origin: 'uploaded' }, trimStartMs: 0, trimEndMs: 8_000,
      assignments: [{ id: id(21), label: 'Anna', targetType: 'person', target: 'the woman walking', referenceUrls: ['/studio-plate-3.jpg'], instructions: '' }],
      instructions: 'Evening light', audioPolicy: 'keep_source', resolution: '1080p', costUnits: 1, resultUrl: '/landing.mp4', errorMessage: null, parentTaskId: null, submittedAt: minutesAgo(30), createdAt: minutesAgo(40),
    },
    {
      id: id(3), status: 'generating', title: 'Product hero', source, trimStartMs: 0, trimEndMs: 6_000,
      assignments: [{ id: id(31), label: 'Bottle', targetType: 'object', target: 'the bottle', referenceUrls: ['/studio-plate-4.jpg'], instructions: '' }],
      instructions: '', audioPolicy: 'mute', resolution: '720p', costUnits: 1, resultUrl: null, errorMessage: null, parentTaskId: id(2), submittedAt: minutesAgo(0.05), createdAt: minutesAgo(2),
    },
  ];
}

/** Stand-ins that keep everything in the browser, so the page can be looked at without a backend. */
export function DevMimic() {
  const actions = useMemo<MimicActions>(() => {
    // A plain holder the stand-ins share; the studio keeps its own React state.
    const store = { tasks: sampleTasks() };
    const update = (taskId: string, patch: Partial<MimicTaskView>) => {
      store.tasks = store.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
      return store.tasks.find((t) => t.id === taskId)!;
    };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    return {
      list: (async () => ({ data: { tasks: store.tasks, multiSubject: true, available: true } })) as MimicActions['list'],
      create: (async (input: unknown) => {
        const { url, name, origin } = input as { url: string; name: string; origin: MimicTaskView['source']['origin'] };
        await wait(900);
        const task: MimicTaskView = {
          id: crypto.randomUUID(), status: 'ready', title: name.replace(/\.[a-z0-9]+$/i, ''), source: { origin, url, durationMs: 9_000, width: 1280, height: 720, hasAudio: true },
          trimStartMs: 0, trimEndMs: 9_000, assignments: [], instructions: '', audioPolicy: 'keep_source', resolution: '720p', costUnits: null, resultUrl: null,
          errorMessage: null, parentTaskId: null, submittedAt: null, createdAt: new Date().toISOString(),
        };
        store.tasks = [task, ...store.tasks];
        return { data: task };
      }) as MimicActions['create'],
      save: (async (input: unknown) => {
        const { taskId, ...rest } = input as { taskId: string } & Partial<MimicTaskView>;
        await wait(300);
        return { data: update(taskId, rest) };
      }) as MimicActions['save'],
      generate: (async (input: unknown) => {
        await wait(700);
        return { data: update((input as { taskId: string }).taskId, { status: 'generating', submittedAt: new Date().toISOString(), costUnits: 1 }) };
      }) as MimicActions['generate'],
      refresh: (async (input: unknown) => {
        const task = store.tasks.find((t) => t.id === (input as { taskId: string }).taskId)!;
        // The sample finishes about 20 seconds after it was submitted.
        if (task.status === 'generating' && task.submittedAt && Date.now() - Date.parse(task.submittedAt) > 20_000) return { data: update(task.id, { status: 'completed', resultUrl: '/landing.mp4' }) };
        return { data: task };
      }) as MimicActions['refresh'],
      duplicate: (async (input: unknown) => {
        const from = store.tasks.find((t) => t.id === (input as { taskId: string }).taskId)!;
        const copy: MimicTaskView = { ...from, id: crypto.randomUUID(), status: 'ready', resultUrl: null, costUnits: null, submittedAt: null, parentTaskId: from.id, createdAt: new Date().toISOString() };
        store.tasks = [copy, ...store.tasks];
        return { data: copy };
      }) as MimicActions['duplicate'],
      release: (async (input: unknown) => ({ data: update((input as { taskId: string }).taskId, { status: 'ready' }) })) as MimicActions['release'],
      remove: (async (input: unknown) => {
        const taskId = (input as { taskId: string }).taskId;
        store.tasks = store.tasks.filter((t) => t.id !== taskId);
        return { data: { id: taskId } };
      }) as MimicActions['remove'],
      saveToVideos: (async (input: unknown) => ({ data: { id: (input as { taskId: string }).taskId } })) as MimicActions['saveToVideos'],
      uploadFile: async (file: File) => { await wait(400); return URL.createObjectURL(file); },
      libraryVideos: async () => [
        { id: 'lib-1', url: '/landing-720.mp4', name: 'Opening shot' },
        { id: 'lib-2', url: '/landing.mp4', name: 'Rooftop take' },
      ],
    };
  }, []);

  return (
    <div className="studio-workspace min-h-dvh overflow-y-auto px-4 py-8 md:px-10">
      <div className="workspace-page space-y-6">
        <header>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80">Mimic · Beta · preview data</p>
          <h1 className="mt-1 text-3xl text-white">Perform it. <em className="text-gold-100">Transform it.</em></h1>
        </header>
        <MimicStudio actions={actions} />
      </div>
    </div>
  );
}
