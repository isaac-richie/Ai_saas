import { BaseProvider } from "../base.provider";
import { GenerationRequest, GenerationResult } from "../types";
import OpenAI from "openai";

export class OpenAIProvider extends BaseProvider {
    private client: OpenAI;

    constructor(config: { apiKey: string }) {
        super(config);
        this.client = new OpenAI({
            apiKey: config.apiKey,
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
                response_format: "url",
                stream: false,
            };

            // OpenAI image quality accepts only standard|hd for image generation.
            if (quality) {
                payload.quality = quality;
            }

            const response = await this.client.images.generate(payload);

            const url = response?.data?.[0]?.url;

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
                error: message,
            };
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
