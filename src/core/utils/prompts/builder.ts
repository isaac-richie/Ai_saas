export const PROMPT_ORDER = [
    "shot",
    "angle",
    "camera",
    "lens",
    "movement",
    "lighting",
    "timeOfDay",
    "colorGrade",
    "depthOfField",
    "aspectRatio",
    "genreMood",
] as const;

export type PromptCategory = typeof PROMPT_ORDER[number];

export type PromptPreset = {
    key: string;
    label: string;
    descriptor: string;
};

export interface PromptSelections {
    subject: string;
    selections: Partial<Record<PromptCategory, PromptPreset>>;
}

export function assemblePrompt({ subject, selections }: PromptSelections): string {
    const segments: string[] = [];

    if (subject && subject.trim()) {
        segments.push(subject.trim());
    }

    for (const category of PROMPT_ORDER) {
        const preset = selections[category];
        if (preset?.descriptor) {
            segments.push(preset.descriptor);
        }
    }

    return segments.join(", ");
}

// Backwards-compatible helper for legacy calls
export function generatePrompt(params: { description: string }): string {
    return assemblePrompt({ subject: params.description, selections: {} });
}
