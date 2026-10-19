import { BaseProvider } from "../base.provider";
import { GenerationRequest, GenerationResult } from "../types";
import OpenAI from "openai";
import { normalizeGenerationError } from "@/core/utils/ai/error-normalization";

export class OpenAIProvider extends BaseProvider {
    private client: OpenAI;

    constructor(config: { apiKey: string }) {
        super(config);
        // Fail fast: a quota error must not be retried until the server function times out.
        this.client = new OpenAI({
            apiKey: config.apiKey,
            maxRetries: 0,
            timeout: 90_000,
        });
    }

    /** GPT Image quality: low | medium | high. Older "standard"/"hd" values map onto it. */
    private normalizeImageQuality(raw?: string): "medium" | "high" | undefined {
        if (!raw) return undefined;
        const value = raw.trim().toLowerCase();
        if (value === "hd" || value === "high") return "high";
        if (value === "standard" || value === "medium" || value === "low") return "medium";
        return undefined;
    }

    /**
     * OpenAI retired DALL·E 3; GPT Image 1.5 is the current image model. A model name meant for
     * another provider (a Kie slug when OpenAI is the fallback) is never sent here.
     */
    static resolveModel(requested?: string): string {
        const model = requested?.trim() || "";
        return /^gpt-image-\d/.test(model) ? model : "gpt-image-1.5";
    }

    async generate(request: GenerationRequest): Promise<GenerationResult> {
        try {
            const ratio = request.aspect_ratio || "1:1";
            const [w, h] = ratio.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/)?.slice(1).map(Number) ?? [1, 1];
            // GPT Image makes square, 3:2 landscape and 2:3 portrait.
            const size = Math.abs(w / h - 1) < 0.15 ? "1024x1024" : w > h ? "1536x1024" : "1024x1536";

            const model = OpenAIProvider.resolveModel(request.model);
            const quality = this.normalizeImageQuality(request.quality);
            const payload: OpenAI.Images.ImageGenerateParamsNonStreaming = {
                model,
                prompt: request.prompt,
                n: 1,
                size,
            };
            // No response_format: OpenAI now rejects it. Results may come back as a URL or base64.

            if (quality) {
                payload.quality = quality;
            }

            const response = await this.client.images.generate(payload);

            const first = response?.data?.[0];
            const url = first?.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : undefined);

            if (!url) {
                throw new Error("No image URL returned from OpenAI");
            }

            return {
                url: url,
                content_type: "image",
                status: "completed",
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error occurred";
            if (process.env.NODE_ENV !== "production") {
                console.error("OpenAI Generation Error:", error);
            }
            return {
                content_type: "image",
                status: "failed",
                error: normalizeGenerationError(message, "OpenAI request failed"),
            };
        }
    }

    async ping(): Promise<{ ok: boolean; message?: string }> {
        try {
            await this.client.models.list();
            return { ok: true };
        } catch (error: unknown) {
            return { ok: false, message: error instanceof Error ? error.message : "OpenAI ping failed" };
        }
    }

    async checkStatus(id: string): Promise<GenerationResult> {
        return {
            id,
            content_type: "image",
            status: "completed",
        };
    }
}
