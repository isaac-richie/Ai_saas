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

    private normalizeImageQuality(raw?: string): "standard" | "hd" | undefined {
        if (!raw) return undefined;
        const value = raw.trim().toLowerCase();
        if (!value) return undefined;
        if (value === "hd") return "hd";
        if (value === "standard") return "standard";
        if (value === "high") return "hd";
        if (value === "medium" || value === "low") return "standard";
        return undefined;
    }

    async generate(request: GenerationRequest): Promise<GenerationResult> {
        try {
            const ratio = request.aspect_ratio || "1:1";
            const size =
                ratio === "16:9"
                    ? "1792x1024"
                    : ratio === "9:16"
                        ? "1024x1792"
                        : "1024x1024";

            const model = request.model || "dall-e-3";
            const quality = this.normalizeImageQuality(request.quality);
            const payload: OpenAI.Images.ImageGenerateParamsNonStreaming = {
                model,
                prompt: request.prompt,
                n: 1,
                size,
            };
            // Only DALL·E accepts response_format; newer image models always return base64.
            if (model.startsWith("dall-e")) payload.response_format = "url";

            // OpenAI image quality accepts only standard|hd for image generation.
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
