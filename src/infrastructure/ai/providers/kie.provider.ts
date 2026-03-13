import { BaseProvider } from "../base.provider";
import { GenerationRequest, GenerationResult } from "../types";

export class KieProvider extends BaseProvider {
    private baseUrl = "https://api.kie.ai/api/v1";

    async generate(request: GenerationRequest): Promise<GenerationResult> {
        try {
            const body = {
                prompt: request.prompt,
                image_url: request.image_prompt,
                duration: 5,
                ratio: "16:9",
                quality: "1080p"
            };

            const res = await fetch(`${this.baseUrl}/runway/generate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errText = await res.text();
                let errorData: Record<string, unknown> = {};
                try {
                    errorData = JSON.parse(errText);
                } catch { }

                if (process.env.NODE_ENV !== "production") {
                    console.error("Kie.ai API Error Response:", errText);
                }
                const message = (errorData as { msg?: string; message?: string }).msg
                    || (errorData as { msg?: string; message?: string }).message
                    || `Kie.ai API error: ${res.status} ${res.statusText}`;
                throw new Error(message);
            }

            const data = await res.json();

            // Check if API returned a logical error within a 200 OK wrapper
            if (data.code !== 200 && data.code !== 0 && !data.id && !data.task_id && data.msg) {
                throw new Error(data.msg);
            }

            return {
                id: data.data?.taskId || data.data?.task_id || data.id || `kie-${Date.now()}`,
                content_type: "video",
                status: "processing",
                provider_check_id: data.data?.taskId || data.data?.task_id || data.id
            };

        } catch (error: unknown) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Kie.ai Provider Exception:", error);
            }
            const message = error instanceof Error ? error.message : "Kie.ai request failed";
            return {
                content_type: "video",
                status: "failed",
                error: message
            };
        }
    }

    async checkStatus(taskId: string): Promise<GenerationResult> {
        try {
            const res = await fetch(`${this.baseUrl}/runway/record-detail?taskId=${taskId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.config.apiKey}`
                }
            });

            if (!res.ok) {
                return { content_type: "video", status: "failed", error: `API HTTP Error: ${res.status}` };
            }

            const data = await res.json();

            if (data.code !== 200) {
                return { content_type: "video", status: "failed", error: data.msg || "Unknown Kie error" };
            }

            const state = data.data?.state;

            if (state === "success") {
                return {
                    id: taskId,
                    content_type: "video",
                    status: "completed",
                    url: data.data?.videoInfo?.videoUrl || data.data?.videoInfo?.imageUrl,
                    provider_check_id: taskId
                };
            } else if (state === "failed" || state === "error") {
                return {
                    id: taskId,
                    content_type: "video",
                    status: "failed",
                    error: data.data?.failMsg || "Generation failed",
                    provider_check_id: taskId
                };
            }

            return {
                id: taskId,
                content_type: "video",
                status: "processing",
                provider_check_id: taskId
            };

        } catch (error: unknown) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Kie.ai Status Check Exception:", error);
            }
            const message = error instanceof Error ? error.message : "Kie.ai status check failed";
            return {
                content_type: "video",
                status: "failed",
                error: message
            };
        }
    }
}
