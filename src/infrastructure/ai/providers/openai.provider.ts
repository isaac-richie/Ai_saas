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

    async generate(request: GenerationRequest): Promise<GenerationResult> {
        try {
            const response = await this.client.images.generate({
                model: "dall-e-3",
                prompt: request.prompt,
                n: 1,
                // DALL-E 3 supports 1024x1024, 1024x1792, 1792x1024. 
                // We will map generic aspect ratios or stick to default for MVP.
                size: "1024x1024",
                response_format: "url",
            });

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
