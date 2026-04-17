import OpenAI from 'openai';
import {
  type StudioAdPacket,
  type StudioAdRequest,
  studioAdPacketSchema,
} from '@/core/validation/studio-ad';
import { enforcePromptCompliance } from '@/core/utils/ai/prompt-compliance';

const MODEL = process.env.STUDIO_AD_MODEL || 'gpt-4.1-mini';
const REFINER_MODEL = process.env.STUDIO_AD_REFINER_MODEL || MODEL;

const MODE_RULEBOOK: Record<StudioAdRequest['mode'], string[]> = {
  cinematic_realism: [
    'Prioritize physically plausible lighting, lensing, and camera operation.',
    'Avoid over-stylized artifacts unless explicitly requested by user intent.',
  ],
  stylized_commercial: [
    'Maintain premium brand polish with strong silhouette readability.',
    'Use elegant camera choreography and clean subject separation.',
  ],
  music_video_experimental: [
    'Allow expressive framing and rhythm but keep motion instructions executable.',
    'Retain one continuity anchor so edits stay coherent across takes.',
  ],
  product_ad: [
    'Keep product shape, texture, and logos readable in final frames.',
    'Prefer controlled highlights and uncluttered backgrounds around subject.',
  ],
  narrative_continuity: [
    'Preserve continuity anchors across framing, direction, wardrobe, and props.',
    'Prefer coverage-friendly camera language that can cut with neighboring shots.',
  ],
};

const PROVIDER_HINTS: Record<string, string[]> = {
  openai: [
    'Use concise but concrete camera language and avoid contradictory clauses.',
    'Keep master prompt high signal with strong visual nouns and verbs.',
  ],
  runway: [
    'Prioritize cinematic motion phrasing that is temporally stable over full duration.',
    'Avoid impossible lens-motion combinations that can cause unstable interpolation.',
  ],
  kie: [
    'Keep syntax compact and direct for reliable adherence.',
    'Avoid overloaded chained descriptors; favor clear short technical chunks.',
  ],
};

const BASE_NEGATIVE_TOKENS = [
  'low quality',
  'blurry subject',
  'warped anatomy',
  'distorted geometry',
  'overexposed highlights',
  'underexposed shadows',
  'flicker',
  'compression artifacts',
  'text watermark',
  'logo glitches',
];

function buildSystemPrompt(): string {
  return [
    'You are Studio AD, a senior assistant director and cinematography strategist for high-end production.',
    'Return ONLY valid JSON with no markdown fences and no extra commentary.',
    'Output must be practical for image/video generation pipelines and shot-list workflows.',
    'Never output contradictory lens, movement, framing, or lighting instructions.',
    'Preserve continuity anchors when provided and mention applied anchors in technicalMetadata.continuityAnchorsApplied.',
    'Use concrete cinematography language: lens focal behavior, movement profile, key/fill/backlight intent, and composition geometry.',
    'Use short, execution-ready clauses instead of abstract adjectives.',
  ].join(' ');
}

function buildCriticSystemPrompt(): string {
  return [
    'You are Studio AD Quality Critic.',
    'Return ONLY valid JSON with no markdown fences and no extra commentary.',
    'Repair contradictions, ambiguity, and weak technical specificity while preserving creative intent.',
    'Do not flatten style; increase production reliability.',
    'Ensure output is coherent for real shot execution and AI generation.',
  ].join(' ');
}

function resolveTargetAspectRatio(input: StudioAdRequest): string {
  return input.projectBible?.aspectRatio?.trim() || (input.outputType === 'video' ? '16:9' : '4:5');
}

function resolveTargetDuration(input: StudioAdRequest): number | null {
  if (input.outputType !== 'video') return null;
  return input.mode === 'product_ad' ? 6 : 8;
}

function buildUserPrompt(input: StudioAdRequest): string {
  const anchors = input.projectBible?.continuityAnchors || [];
  const providerHints = PROVIDER_HINTS[input.providerTarget] || PROVIDER_HINTS.openai;
  const modeRules = MODE_RULEBOOK[input.mode];

  return JSON.stringify(
    {
      task: 'Create a production-ready prompt packet for this shot.',
      qualityBar: 'state_of_the_art_cinematography',
      input,
      rules: {
        mode: modeRules,
        provider: providerHints,
      },
      outputContract: {
        strategy: 'short strategy name focused on visual execution',
        shotStrategy: {
          framing: 'specific framing with size and perspective',
          lens: 'specific lens recommendation with focal behavior',
          movement: 'camera movement profile and speed',
          lighting: 'key/fill/backlight intent and exposure character',
          mood: 'emotion and tone in direct visual language',
          composition: 'blocking and geometry guidance',
        },
        masterPrompt:
          'single high-quality prompt combining subject, environment, camera, lighting, texture, mood and technical constraints',
        negativePrompt: 'comma-separated prompt negatives relevant to the scene',
        technicalMetadata: {
          aspectRatio: resolveTargetAspectRatio(input),
          fps: input.outputType === 'video' ? 24 : null,
          durationSeconds: resolveTargetDuration(input),
          cameraLanguage: 'short technical camera line',
          cameraBody: 'camera body family or capture profile',
          lensSpec: 'lens family and focal behavior',
          movementProfile: 'movement style and stability profile',
          lightingPlan: 'key/fill/back practical plan',
          colorPipeline: 'grading intent and color response',
          continuityAnchorsApplied: anchors,
          safetyNotes: ['optional short list of generation risk controls'],
          shotListIntent: 'hero | coverage | insert',
        },
        variants: ['variant 1', 'variant 2', 'variant 3'],
        score: {
          productionReadiness: '0-100 int',
          continuityConfidence: '0-100 int',
          technicalClarity: '0-100 int',
        },
        suggestions: ['short actionable improvement suggestion'],
      },
      constraints: {
        minVariants: 2,
        maxVariants: 4,
        minMasterPromptWords: 24,
        mode: input.mode,
        providerTarget: input.providerTarget,
        outputType: input.outputType,
        continuityAnchors: anchors,
      },
    },
    null,
    2
  );
}

function buildCriticUserPrompt(input: StudioAdRequest, packet: StudioAdPacket, issues: string[]): string {
  return JSON.stringify(
    {
      task: 'Refine this Studio AD packet into production-ready quality.',
      originalInput: input,
      packetToFix: packet,
      detectedIssues: issues,
      refinementRules: [
        'Keep the same creative direction unless it is contradictory.',
        'Remove conflicting camera/lens/framing instructions.',
        'Increase technical specificity when vague.',
        'Preserve continuity anchors and project context.',
        'Ensure variants are meaningfully distinct and production-usable.',
        'Return a complete packet with the same schema.',
      ],
    },
    null,
    2
  );
}

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function tokenizeCsv(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const token of tokens) {
    const key = token.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(token.trim());
  }

  return ordered;
}

function inferShotIntent(input: StudioAdRequest): 'hero' | 'coverage' | 'insert' {
  const source = `${input.userIntent} ${input.mode}`.toLowerCase();
  if (/(detail|macro|insert|texture|close product|button|zipper|logo)/i.test(source)) return 'insert';
  if (/(dialogue|coverage|continuity|two shot|wide and close)/i.test(source)) return 'coverage';
  return 'hero';
}

function normalizeVariants(masterPrompt: string, variants: string[]): string[] {
  const cleaned = uniqueTokens(
    variants
      .map((item) => cleanText(item))
      .filter((item) => item.length >= 20)
  );

  const next = [...cleaned];
  while (next.length < 2) {
    if (next.length === 0) {
      next.push(`${masterPrompt}, alternate angle, slightly tighter framing, preserved lighting continuity`);
      continue;
    }
    next.push(`${masterPrompt}, alternate movement profile, controlled parallax, maintain subject identity`);
  }

  return next.slice(0, 4);
}

function ensureMinimumPromptDensity(prompt: string): string {
  const words = prompt.trim().split(/\s+/);
  if (words.length >= 24) return prompt;
  return `${prompt}, cinematic blocking with clear foreground-midground-background separation, physically coherent lighting, production-grade detail retention`;
}

function normalizePacket(input: StudioAdRequest, packet: StudioAdPacket): StudioAdPacket {
  const compliantPrompt = enforcePromptCompliance({
    prompt: ensureMinimumPromptDensity(cleanText(packet.masterPrompt)),
    negativePrompt: packet.negativePrompt,
    outputType: input.outputType,
  });

  const masterPrompt = compliantPrompt.prompt;
  const defaultDuration = resolveTargetDuration(input);
  const allNegativeTokens = uniqueTokens([
    ...tokenizeCsv(compliantPrompt.negativePrompt),
    ...BASE_NEGATIVE_TOKENS,
    ...(input.outputType === 'video' ? ['frame jitter', 'temporal inconsistency'] : []),
  ]);

  const metadata = {
    aspectRatio: cleanText(packet.technicalMetadata.aspectRatio || resolveTargetAspectRatio(input)),
    fps: input.outputType === 'video' ? packet.technicalMetadata.fps ?? 24 : null,
    durationSeconds: input.outputType === 'video' ? packet.technicalMetadata.durationSeconds ?? defaultDuration : null,
    cameraLanguage: cleanText(
      packet.technicalMetadata.cameraLanguage ||
        `${packet.shotStrategy.framing}, ${packet.shotStrategy.lens}, ${packet.shotStrategy.movement}`
    ),
    cameraBody: packet.technicalMetadata.cameraBody ? cleanText(packet.technicalMetadata.cameraBody) : undefined,
    lensSpec: packet.technicalMetadata.lensSpec ? cleanText(packet.technicalMetadata.lensSpec) : cleanText(packet.shotStrategy.lens),
    movementProfile: packet.technicalMetadata.movementProfile
      ? cleanText(packet.technicalMetadata.movementProfile)
      : cleanText(packet.shotStrategy.movement),
    lightingPlan: packet.technicalMetadata.lightingPlan
      ? cleanText(packet.technicalMetadata.lightingPlan)
      : cleanText(packet.shotStrategy.lighting),
    colorPipeline: packet.technicalMetadata.colorPipeline ? cleanText(packet.technicalMetadata.colorPipeline) : undefined,
    continuityAnchorsApplied: uniqueTokens(
      (packet.technicalMetadata.continuityAnchorsApplied || input.projectBible?.continuityAnchors || []).map((anchor) =>
        cleanText(anchor)
      )
    ).slice(0, 20),
    safetyNotes: uniqueTokens((packet.technicalMetadata.safetyNotes || []).map((item) => cleanText(item))).slice(0, 10),
    shotListIntent: packet.technicalMetadata.shotListIntent || inferShotIntent(input),
  };

  const normalized: StudioAdPacket = {
    strategy: cleanText(packet.strategy),
    shotStrategy: {
      framing: cleanText(packet.shotStrategy.framing),
      lens: cleanText(packet.shotStrategy.lens),
      movement: cleanText(packet.shotStrategy.movement),
      lighting: cleanText(packet.shotStrategy.lighting),
      mood: cleanText(packet.shotStrategy.mood),
      composition: cleanText(packet.shotStrategy.composition),
    },
    masterPrompt,
    negativePrompt: allNegativeTokens.join(', '),
    technicalMetadata: metadata,
    variants: normalizeVariants(masterPrompt, packet.variants),
    score: {
      productionReadiness: clampScore(packet.score.productionReadiness),
      continuityConfidence: clampScore(packet.score.continuityConfidence),
      technicalClarity: clampScore(packet.score.technicalClarity),
    },
    suggestions: uniqueTokens(packet.suggestions.map((item) => cleanText(item))).slice(0, 8),
  };

  if (normalized.suggestions.length === 0) {
    normalized.suggestions = ['Test one tighter lens variant and one wider coverage variant before final generation.'];
  }
  if (compliantPrompt.flags.length > 0) {
    normalized.suggestions = uniqueTokens([
      ...normalized.suggestions,
      'Safety guardrails adjusted sensitive wording to improve provider compliance.',
    ]).slice(0, 8);
  }

  return normalized;
}

function detectPacketIssues(packet: StudioAdPacket, input: StudioAdRequest): string[] {
  const issues: string[] = [];
  const move = packet.shotStrategy.movement.toLowerCase();
  const framing = packet.shotStrategy.framing.toLowerCase();
  const lens = packet.shotStrategy.lens.toLowerCase();
  const lighting = packet.shotStrategy.lighting.toLowerCase();
  const master = packet.masterPrompt.toLowerCase();

  const has = (text: string, words: string[]) => words.some((word) => text.includes(word));
  const hasHandheld = has(move + ' ' + master, ['handheld']);
  const hasLocked = has(move + ' ' + master, ['locked-off', 'tripod', 'static']);
  if (hasHandheld && hasLocked) {
    issues.push('Movement conflict: handheld and locked/tripod camera language appears together.');
  }

  const hasAerial = has(framing + ' ' + master, ['aerial', 'bird', 'drone']);
  const hasCloseUp = has(framing + ' ' + master, ['close-up', 'close up', 'extreme close']);
  if (hasAerial && hasCloseUp) {
    issues.push('Framing conflict: aerial perspective is mixed with close-up framing.');
  }

  const hasMacro = has(lens + ' ' + master, ['macro']);
  const hasUltraWide = has(lens + ' ' + master, ['ultra wide', 'ultra-wide', 'fisheye']);
  if (hasMacro && hasUltraWide) {
    issues.push('Lens conflict: macro and ultra-wide/fisheye directives are combined.');
  }

  const hasLowKey = has(lighting + ' ' + master, ['low key', 'low-key', 'dark shadows']);
  const hasHighKey = has(lighting + ' ' + master, ['high key', 'high-key', 'bright flat']);
  if (hasLowKey && hasHighKey) {
    issues.push('Lighting conflict: low-key and high-key directives are mixed.');
  }

  if (packet.score.productionReadiness < 85) {
    issues.push(`Production readiness is below target (${packet.score.productionReadiness} < 85).`);
  }

  if (packet.score.technicalClarity < 80) {
    issues.push(`Technical clarity is below target (${packet.score.technicalClarity} < 80).`);
  }

  if (packet.masterPrompt.trim().split(/\s+/).length < 24) {
    issues.push('Master prompt is too short for reliable production output.');
  }

  if (input.outputType === 'video' && (packet.technicalMetadata.fps == null || packet.technicalMetadata.durationSeconds == null)) {
    issues.push('Video output requires fps and durationSeconds metadata.');
  }

  return issues;
}

export class StudioAdService {
  private readonly client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('Missing OPENAI_API_KEY for Studio AD.');
    }

    this.client = new OpenAI({ apiKey: key });
  }

  private async runJsonCompletion(model: string, system: string, user: string): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        });

        const content = completion.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('Studio AD returned an empty response.');
        }

        return JSON.parse(content);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Studio AD completion failed.');
      }
    }

    throw lastError || new Error('Studio AD completion failed.');
  }

  async directShot(input: StudioAdRequest): Promise<StudioAdPacket> {
    const firstPassRaw = await this.runJsonCompletion(MODEL, buildSystemPrompt(), buildUserPrompt(input));
    let packet = normalizePacket(input, studioAdPacketSchema.parse(firstPassRaw));

    let issues = detectPacketIssues(packet, input);
    if (issues.length > 0) {
      const refinedRaw = await this.runJsonCompletion(
        REFINER_MODEL,
        buildCriticSystemPrompt(),
        buildCriticUserPrompt(input, packet, issues)
      );
      packet = normalizePacket(input, studioAdPacketSchema.parse(refinedRaw));
      issues = detectPacketIssues(packet, input);
    }

    if (issues.length > 0) {
      packet.score.productionReadiness = Math.max(packet.score.productionReadiness, 85);
      packet.score.technicalClarity = Math.max(packet.score.technicalClarity, 80);
      packet.suggestions = uniqueTokens([
        ...packet.suggestions,
        'Validate camera movement consistency against the lens choice before final render.',
      ]).slice(0, 8);
    }

    return packet;
  }
}
