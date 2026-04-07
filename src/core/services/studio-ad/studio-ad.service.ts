import OpenAI from 'openai';
import {
  type StudioAdPacket,
  type StudioAdRequest,
  studioAdPacketSchema,
} from '@/core/validation/studio-ad';

const MODEL = process.env.STUDIO_AD_MODEL || 'gpt-4.1-mini';
const REFINER_MODEL = process.env.STUDIO_AD_REFINER_MODEL || MODEL;

function buildSystemPrompt(): string {
  return [
    'You are Studio AD, a senior assistant director and cinematography strategist.',
    'Return ONLY valid JSON with no markdown fences and no extra commentary.',
    'Output must be practical for image/video generation pipelines.',
    'Avoid contradictions in camera movement and framing.',
    'Preserve continuity anchors when provided.',
    'Use concrete cinematic language and avoid vague adjectives.',
  ].join(' ');
}

function buildCriticSystemPrompt(): string {
  return [
    'You are Studio AD Quality Critic.',
    'Return ONLY valid JSON with no markdown fences and no extra commentary.',
    'Your role is to repair contradictions and ambiguity while preserving creative intent.',
    'Do not reduce cinematic quality.',
    'Ensure the final packet is technically coherent and production-ready.',
  ].join(' ');
}

function buildUserPrompt(input: StudioAdRequest): string {
  const anchors = input.projectBible?.continuityAnchors || [];

  return JSON.stringify(
    {
      task: 'Create a production-ready prompt packet for this shot.',
      input,
      outputContract: {
        strategy: 'short strategy name',
        shotStrategy: {
          framing: 'specific framing',
          lens: 'specific lens recommendation',
          movement: 'camera movement',
          lighting: 'lighting setup',
          mood: 'emotion/mood',
          composition: 'composition guidance',
        },
        masterPrompt:
          'single high-quality prompt combining subject, environment, camera, lighting, texture, mood and technical constraints',
        negativePrompt: 'comma-separated prompt negatives relevant to the scene',
        technicalMetadata: {
          aspectRatio: input.projectBible?.aspectRatio || '16:9',
          fps: input.outputType === 'video' ? 24 : null,
          durationSeconds: input.outputType === 'video' ? 6 : null,
          cameraLanguage: 'short technical camera line',
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
        'Return a complete packet with the same schema.',
      ],
    },
    null,
    2
  );
}

function detectPacketIssues(packet: StudioAdPacket): string[] {
  const issues: string[] = [];
  const move = packet.shotStrategy.movement.toLowerCase();
  const framing = packet.shotStrategy.framing.toLowerCase();
  const lens = packet.shotStrategy.lens.toLowerCase();
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

  if (packet.score.productionReadiness < 80) {
    issues.push(`Production readiness is below target (${packet.score.productionReadiness} < 80).`);
  }

  if (packet.masterPrompt.trim().split(/\s+/).length < 20) {
    issues.push('Master prompt is too short for reliable production output.');
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
    const completion = await this.client.chat.completions.create({
      model,
      temperature: 0.4,
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

    try {
      return JSON.parse(content);
    } catch {
      throw new Error('Studio AD returned non-JSON output.');
    }
  }

  async directShot(input: StudioAdRequest): Promise<StudioAdPacket> {
    const firstPassRaw = await this.runJsonCompletion(MODEL, buildSystemPrompt(), buildUserPrompt(input));
    let packet = studioAdPacketSchema.parse(firstPassRaw);

    const issues = detectPacketIssues(packet);
    if (issues.length > 0) {
      const refinedRaw = await this.runJsonCompletion(
        REFINER_MODEL,
        buildCriticSystemPrompt(),
        buildCriticUserPrompt(input, packet, issues)
      );
      packet = studioAdPacketSchema.parse(refinedRaw);
    }

    return packet;
  }
}
