import { BaseProvider } from "../base.provider";
import { GenerationRequest, GenerationResult } from "../types";

export class HyperealProvider extends BaseProvider {
    private baseUrl = "https://api.hypereal.tech/v1";

    async generate(request: GenerationRequest): Promise<GenerationResult> {
        try {
            const body = {
                model: "sora-2-i2v",
                input: {
                    prompt: request.prompt,
                    image: request.image_prompt,
                    duration: 5
                }
                // webhook_url: "https://your-server.com/webhook" // Optional for async delivery back to dashboard in future
            };

            const res = await fetch(`${this.baseUrl}/videos/generate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errText = await res.text();
                // Attempt to parse JSON from error text if possible
                let errorData: Record<string, unknown> = {};
                try {
                    errorData = JSON.parse(errText);
                } catch { }

                if (process.env.NODE_ENV !== "production") {
                    console.error("Hypereal API Error Response:", errText);
                }
                const message = (errorData as { message?: string }).message || `Hypereal API error: ${res.status} ${res.statusText}`;
                throw new Error(message);
            }

            const data = await res.json();

            // Expected response: { "jobId": "job_abc123456", "status": "processing", ... }
            return {
                id: data.jobId || `hypereal-${Date.now()}`,
                content_type: "video",
                status: "processing", // In a real webhook setup, this would eventually flip to 'completed'
                provider_check_id: data.jobId
            };

        } catch (error: unknown) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Hypereal Provider Exception:", error);
            }
            const message = error instanceof Error ? error.message : "Hypereal request failed";
            return {
                content_type: "video",
                status: "failed",
                error: message
            };
        }
    }

    async ping(): Promise<{ ok: boolean; message?: string }> {
        return { ok: true, message: "Hypereal connection simulated" };
    }

    async checkStatus(taskId: string): Promise<GenerationResult> {
        return {
            id: taskId,
            content_type: "video",
            status: "failed",
            error: "Hypereal status polling not implemented",
            provider_check_id: taskId,
        };
    }
}
