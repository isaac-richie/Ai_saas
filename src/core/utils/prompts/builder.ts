export interface ShotParams {
    shotSize?: string; // e.g. "Extreme Wide Shot", "Close-up"
    angle?: string; // e.g. "Low Angle", "Overhead"
    movement?: string; // e.g. "Slow Dolly In", "Handheld"
    description: string;
    camera?: string; // e.g. "Arri Alexa 35"
    lens?: string; // e.g. "35mm Anamorphic"
    lighting?: string; // e.g. "Soft moonlight", "Cyberpunk neon"
    aspectRatio?: string; // e.g. "--ar 16:9"
}

export function generatePrompt(params: ShotParams): string {
    const segments: string[] = [];

    // 1. Composition / Angle
    const composition = [params.shotSize, params.angle].filter(Boolean).join(" ");
    if (composition) {
        segments.push(composition + " of");
    }

    // 2. Subject / Description
    if (params.description) {
        segments.push(params.description);
    }

    // 3. Movement
    if (params.movement) {
        segments.push(params.movement);
    }

    // 4. Technical Gear
    const gear: string[] = [];
    if (params.camera) gear.push(`shot on ${params.camera}`);
    if (params.lens) gear.push(`with ${params.lens}`);

    if (gear.length > 0) {
        segments.push(gear.join(" "));
    }

    // 5. Lighting / Style (Could be added from params or defaults)
    if (params.lighting) {
        segments.push(params.lighting);
    }

    // 6. Aspect Ratio (usually a suffix for Midjourney)
    if (params.aspectRatio) {
        segments.push(params.aspectRatio);
    }

    // Join with commas for typical AI parser friendliness, though natural language is also fine.
    // We will use commas for distinct sections.
    return segments.join(", ");
}
