import { BaseProvider } from "../base.provider";
import { GenerationRequest, GenerationResult } from "../types";
import {
    DEFAULT_KIE_IMAGE_MODEL,
    DEFAULT_KIE_VIDEO_MODEL,
    inferKieOutputType,
} from "./kie.models";

export class KieProvider extends BaseProvider {
    private baseUrl = "https://api.kie.ai/api/v1";
    private createTaskPath = "/jobs/createTask";
    private getTaskPath = "/jobs/recordInfo";

    private clampDuration(seconds?: number): number {
        if (typeof seconds !== "number" || Number.isNaN(seconds)) return 5;
        return Math.max(5, Math.min(15, Math.floor(seconds)));
    }

    private resolveModel(request: GenerationRequest): string {
        const explicitModel = request.model?.trim();
        if (explicitModel) return explicitModel;

        const requestedType =
            request.output_type
            || (request.image_prompt ? "video" : undefined)
            || "image";

        return requestedType === "video" ? DEFAULT_KIE_VIDEO_MODEL : DEFAULT_KIE_IMAGE_MODEL;
    }

    private resolveOutputType(request: GenerationRequest, model: string): "image" | "video" {
        const inferred = inferKieOutputType(model);
        if (request.output_type) return request.output_type;
        if (inferred) return inferred;
        return request.image_prompt ? "video" : "image";
    }

    private buildMarketInput(request: GenerationRequest, model: string): Record<string, unknown> {
        const input: Record<string, unknown> = {
            prompt: request.prompt,
        };

        if (request.negative_prompt) input.negative_prompt = request.negative_prompt;
        if (request.aspect_ratio) input.aspect_ratio = request.aspect_ratio;
        if (typeof request.seed === "number") input.seed = request.seed;
        if (typeof request.steps === "number") input.steps = request.steps;
        if (typeof request.cfg_scale === "number") input.cfg_scale = request.cfg_scale;

        if (request.image_prompt) {
            if (model.toLowerCase().includes("kling-3.0")) {
                input.image_urls = [request.image_prompt];
            } else {
                input.image_url = request.image_prompt;
            }
        }

        if (
            request.output_type === "video"
            || model.toLowerCase().includes("video")
            || model.toLowerCase().includes("veo")
            || model.toLowerCase().includes("kling")
            || model.toLowerCase().includes("runway")
        ) {
            input.duration = String(this.clampDuration(request.duration_seconds));
        }

        return input;
    }

    private extractMediaUrl(payload: unknown): string | undefined {
        const seen = new Set<unknown>();
        const queue: unknown[] = [payload];
        const keyPriority = [
            "url",
            "videoUrl",
            "imageUrl",
            "resultUrl",
            "result_url",
            "output_url",
            "fileUrl",
            "file_url",
        ];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || seen.has(current)) continue;
            seen.add(current);

            if (typeof current === "string" && /^https?:\/\//i.test(current)) {
                return current;
            }

            if (Array.isArray(current)) {
                current.forEach((item) => queue.push(item));
                continue;
            }

            if (typeof current === "object") {
                const obj = current as Record<string, unknown>;
                for (const key of keyPriority) {
                    const value = obj[key];
                    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
                        return value;
                    }
                }
                Object.values(obj).forEach((value) => queue.push(value));
            }
        }

        return undefined;
    }

    async generate(request: GenerationRequest): Promise<GenerationResult> {
        try {
            const model = this.resolveModel(request);
            const outputType = this.resolveOutputType(request, model);
            const body: Record<string, unknown> = {
                model,
                input: this.buildMarketInput(request, model),
            };

            if (process.env.KIE_AI_CALLBACK_URL) {
                body.callBackUrl = process.env.KIE_AI_CALLBACK_URL;
            }

            const res = await fetch(`${this.baseUrl}${this.createTaskPath}`, {
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
            const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.id;

            // Check if API returned a logical error within a 200 OK wrapper
            if (data.code !== 200 && data.code !== 0 && !taskId && data.msg) {
                throw new Error(data.msg);
            }

            return {
                id: taskId || `kie-${Date.now()}`,
                content_type: outputType,
                status: "processing",
                provider_check_id: taskId,
            };

        } catch (error: unknown) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Kie.ai Provider Exception:", error);
            }
            const message = error instanceof Error ? error.message : "Kie.ai request failed";
            return {
                content_type: request.output_type || "image",
                status: "failed",
                error: message
            };
        }
    }

    async checkStatus(taskId: string): Promise<GenerationResult> {
        try {
            const res = await fetch(`${this.baseUrl}${this.getTaskPath}?taskId=${encodeURIComponent(taskId)}`, {
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
                return { content_type: "video", status: "failed", error: data.msg || data.message || "Unknown Kie error" };
            }

            const taskData = data?.data || {};
            const stateRaw = taskData?.state || taskData?.status || data?.status || "processing";
            const state = String(stateRaw).toLowerCase();
            const mediaUrl = this.extractMediaUrl(taskData) || this.extractMediaUrl(data);
            const outputType = inferKieOutputType(String(taskData?.model || "")) || (mediaUrl?.endsWith(".mp4") ? "video" : "image");

            if (state === "success" || state === "succeeded" || state === "completed") {
                return {
                    id: taskId,
                    content_type: outputType,
                    status: "completed",
                    url: mediaUrl,
                    provider_check_id: taskId
                };
            } else if (state === "failed" || state === "error" || state === "fail") {
                return {
                    id: taskId,
                    content_type: outputType,
                    status: "failed",
                    error: taskData?.failMsg || taskData?.error || data?.msg || "Generation failed",
                    provider_check_id: taskId
                };
            }

            return {
                id: taskId,
                content_type: outputType,
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
