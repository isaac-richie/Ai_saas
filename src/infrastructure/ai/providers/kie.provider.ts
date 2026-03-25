import { BaseProvider } from "../base.provider";
import { GenerationRequest, GenerationResult } from "../types";
import {
    DEFAULT_KIE_IMAGE_MODEL,
    DEFAULT_KIE_VIDEO_MODEL_I2V,
    DEFAULT_KIE_VIDEO_MODEL_T2V,
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

    private nearestAllowedDuration(value: number, allowed: number[]): number {
        return allowed.reduce((best, current) => {
            const currentDistance = Math.abs(current - value);
            const bestDistance = Math.abs(best - value);
            return currentDistance < bestDistance ? current : best;
        }, allowed[0]);
    }

    private resolveDurationForModel(seconds: number | undefined, model: string): string | null {
        const duration = this.clampDuration(seconds);
        const normalizedModel = model.toLowerCase();

        // Kie model families often accept only discrete durations.
        if (normalizedModel.includes("kling/v2-5")) {
            return String(this.nearestAllowedDuration(duration, [5, 10]));
        }

        if (normalizedModel.includes("kling/v2-1")) {
            return "5";
        }

        if (normalizedModel.includes("runway/")) {
            return String(this.nearestAllowedDuration(duration, [5, 10]));
        }

        if (normalizedModel.includes("veo/")) {
            return String(this.nearestAllowedDuration(duration, [5, 8]));
        }

        return String(duration);
    }

    private resolveModel(request: GenerationRequest): string {
        const explicitModel = request.model?.trim();
        if (explicitModel) return explicitModel;

        const requestedType =
            request.output_type
            || (request.image_prompt ? "video" : undefined)
            || "image";

        if (requestedType !== "video") return DEFAULT_KIE_IMAGE_MODEL;
        return request.image_prompt ? DEFAULT_KIE_VIDEO_MODEL_I2V : DEFAULT_KIE_VIDEO_MODEL_T2V;
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
        if (request.quality) input.quality = request.quality;
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
            const resolvedDuration = this.resolveDurationForModel(request.duration_seconds, model);
            if (resolvedDuration) {
                input.duration = resolvedDuration;
            }
        }

        return input;
    }

    private extractMediaCandidates(payload: unknown): Array<{ url: string; key: string }> {
        const seen = new Set<unknown>();
        const queue: Array<{ value: unknown; key: string }> = [{ value: payload, key: "root" }];
        const results: Array<{ url: string; key: string }> = [];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current?.value || seen.has(current.value)) continue;
            seen.add(current.value);

            if (typeof current.value === "string" && /^https?:\/\//i.test(current.value)) {
                results.push({ url: current.value, key: current.key });
                continue;
            }

            if (Array.isArray(current.value)) {
                current.value.forEach((item, index) => queue.push({ value: item, key: `${current.key}[${index}]` }));
                continue;
            }

            if (typeof current.value === "object") {
                const obj = current.value as Record<string, unknown>;
                Object.entries(obj).forEach(([key, value]) => queue.push({ value, key: `${current.key}.${key}` }));
            }
        }

        return results;
    }

    private parseJsonIfString(value: unknown): unknown {
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
        try {
            return JSON.parse(trimmed);
        } catch {
            return value;
        }
    }

    private isVideoUrl(url: string): boolean {
        return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
    }

    private isImageLikeUrl(url: string): boolean {
        return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
    }

    private chooseBestMediaUrl(candidates: Array<{ url: string; key: string }>, preferred: "video" | "image"): string | undefined {
        if (!candidates.length) return undefined;

        const nonPosterCandidates = candidates.filter((item) => !/thumbnail|poster|cover|preview|frame/i.test(item.key));
        const effective = nonPosterCandidates.length ? nonPosterCandidates : candidates;

        if (preferred === "video") {
            const byExt = effective.find((item) => this.isVideoUrl(item.url));
            if (byExt) return byExt.url;

            const byKey = effective.find((item) => /video|playback|download|media|file|output/i.test(item.key));
            if (byKey) return byKey.url;
        } else {
            const byExt = effective.find((item) => this.isImageLikeUrl(item.url));
            if (byExt) return byExt.url;

            const byKey = effective.find((item) => /image|thumbnail|preview|poster|cover|output/i.test(item.key));
            if (byKey) return byKey.url;
        }

        return effective[0]?.url;
    }

    private normalizeTaskIdCandidates(taskId?: string | null): string[] {
        if (!taskId) return [];
        const trimmed = taskId.trim();
        if (!trimmed) return [];
        const candidates = new Set<string>([trimmed]);
        if (!trimmed.startsWith("task_")) {
            candidates.add(`task_${trimmed}`);
        }
        if (trimmed.startsWith("task_")) {
            candidates.add(trimmed.replace(/^task_/, ""));
        }
        return Array.from(candidates);
    }

    private extractTaskId(data: Record<string, unknown>): { taskId: string | undefined; source: string } {
        const candidates: Array<{ value: unknown; source: string }> = [
            { value: data?.data && (data.data as Record<string, unknown>)?.taskId, source: "data.taskId" },
            { value: data?.data && (data.data as Record<string, unknown>)?.task_id, source: "data.task_id" },
            { value: data?.data && (data.data as Record<string, unknown>)?.id, source: "data.id" },
            { value: data?.taskId, source: "taskId" },
            { value: data?.task_id, source: "task_id" },
            { value: data?.id, source: "id" },
        ];

        for (const item of candidates) {
            if (typeof item.value === "string" && item.value.trim()) {
                return { taskId: item.value.trim(), source: item.source };
            }
        }

        return { taskId: undefined, source: "none" };
    }

    private async fetchRecordInfo(taskId: string): Promise<Response> {
        return fetch(`${this.baseUrl}${this.getTaskPath}?taskId=${encodeURIComponent(taskId)}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${this.config.apiKey}`
            }
        });
    }

    private isTransientRecordInfoMessage(message: string): boolean {
        const normalized = message.toLowerCase();
        return (
            normalized.includes("recordinfo is null")
            || normalized.includes("record info is null")
            || normalized.includes("record not found")
            || normalized.includes("task not found")
            || normalized.includes("not ready")
            || normalized.includes("still processing")
        );
    }

    async generate(request: GenerationRequest): Promise<GenerationResult> {
        try {
            const model = this.resolveModel(request);
            const outputType = this.resolveOutputType(request, model);
            const normalizedModel = model.toLowerCase();
            const looksImageToVideoModel =
                normalizedModel.includes("image-to-video")
                || normalizedModel.includes("_image")
                || normalizedModel.endsWith("-image");

            if (outputType === "video" && looksImageToVideoModel && !request.image_prompt) {
                return {
                    content_type: "video",
                    status: "failed",
                    error: "Selected Kie model requires image_url. Add a reference image or choose a text-to-video model.",
                };
            }

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
            const { taskId, source: taskIdSource } = this.extractTaskId(data as Record<string, unknown>);

            // Check if API returned a logical error within a 200 OK wrapper
            if (data.code !== 200 && data.code !== 0 && !taskId && data.msg) {
                throw new Error(data.msg);
            }

            return {
                id: taskId || `kie-${Date.now()}`,
                content_type: outputType,
                status: "processing",
                provider_check_id: taskId,
                debug: {
                    model,
                    outputType,
                    hasImagePrompt: Boolean(request.image_prompt),
                    taskIdSource,
                },
            };

        } catch (error: unknown) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Kie.ai Provider Exception:", error);
            }
            const message = error instanceof Error ? error.message : "Kie.ai request failed";
            return {
                content_type: request.output_type || "image",
                status: "failed",
                error: message,
                debug: {
                    stage: "generate",
                },
            };
        }
    }

    async checkStatus(taskId: string): Promise<GenerationResult> {
        try {
            const taskIdCandidates = this.normalizeTaskIdCandidates(taskId);
            if (!taskIdCandidates.length) {
                return { content_type: "video", status: "failed", error: "Missing task id for polling" };
            }

            let lastTransportError: string | null = null;
            let lastProcessingDebug: Record<string, unknown> | undefined;

            for (const pollId of taskIdCandidates) {
                let res: Response;
                try {
                    res = await this.fetchRecordInfo(pollId);
                } catch (error: unknown) {
                    const firstError = error instanceof Error ? error.message : "Network error while polling";
                    lastTransportError = firstError;
                    try {
                        res = await this.fetchRecordInfo(pollId);
                    } catch (retryError: unknown) {
                        lastTransportError = retryError instanceof Error ? retryError.message : firstError;
                        continue;
                    }
                }

                if (!res.ok) {
                    lastTransportError = `API HTTP Error: ${res.status}`;
                    continue;
                }

                const data = await res.json();

                if (data.code !== 200 && data.code !== 0) {
                    const message = String(data.msg || data.message || "Unknown Kie error");
                    if (this.isTransientRecordInfoMessage(message)) {
                        lastProcessingDebug = {
                            polledTaskId: pollId,
                            originalTaskId: taskId,
                            stateRaw: "recordInfo_pending",
                            normalizedState: "processing",
                            candidateCount: 0,
                            selectedUrl: null,
                            transientMessage: message,
                        };
                        continue;
                    }
                    return {
                        content_type: "video",
                        status: "failed",
                        error: message,
                        debug: {
                            polledTaskId: pollId,
                            originalTaskId: taskId,
                        },
                    };
                }

                const taskData = data?.data || data?.result || data || {};
                const stateRaw = taskData?.state || taskData?.status || data?.status || "processing";
                const state = String(stateRaw).toLowerCase().replace(/[\s_-]+/g, "");
                const modelFromTask = String(taskData?.model || "");
                const inferredOutputType = inferKieOutputType(modelFromTask) || "video";
                const taskResultJson = this.parseJsonIfString(taskData?.resultJson ?? taskData?.result_json);
                const rootResultJson = this.parseJsonIfString(data?.resultJson ?? data?.result_json);
                const taskParamJson = this.parseJsonIfString(taskData?.param);
                const rootParamJson = this.parseJsonIfString(data?.param);

                const taskCandidates = this.extractMediaCandidates(taskData);
                const rootCandidates = this.extractMediaCandidates(data);
                const taskResultCandidates = this.extractMediaCandidates(taskResultJson);
                const rootResultCandidates = this.extractMediaCandidates(rootResultJson);
                const taskParamCandidates = this.extractMediaCandidates(taskParamJson);
                const rootParamCandidates = this.extractMediaCandidates(rootParamJson);

                const allCandidates = [
                    ...taskCandidates,
                    ...rootCandidates,
                    ...taskResultCandidates,
                    ...rootResultCandidates,
                    ...taskParamCandidates,
                    ...rootParamCandidates,
                ];
                const mediaUrl = this.chooseBestMediaUrl(allCandidates, inferredOutputType);
                const outputType =
                    inferKieOutputType(modelFromTask)
                    || (mediaUrl && this.isVideoUrl(mediaUrl) ? "video" : "image");

                const isSuccessState =
                    state.includes("success")
                    || state.includes("succeed")
                    || state.includes("complete")
                    || state.includes("finish")
                    || state.includes("done");
                const isFailedState =
                    state.includes("fail")
                    || state.includes("error")
                    || state.includes("cancel")
                    || state.includes("reject")
                    || state.includes("timeout");

                const debugPayload = {
                    polledTaskId: pollId,
                    originalTaskId: taskId,
                    stateRaw,
                    normalizedState: state,
                    model: modelFromTask || null,
                    candidateCount: allCandidates.length,
                    taskResultCandidateCount: taskResultCandidates.length,
                    rootResultCandidateCount: rootResultCandidates.length,
                    hasTaskResultJson: Boolean(taskData?.resultJson || taskData?.result_json),
                    hasRootResultJson: Boolean(data?.resultJson || data?.result_json),
                    selectedUrl: mediaUrl || null,
                };

                if (isSuccessState || (mediaUrl && !isFailedState)) {
                    return {
                        id: pollId,
                        content_type: outputType,
                        status: "completed",
                        url: mediaUrl,
                        provider_check_id: pollId,
                        debug: debugPayload,
                    };
                }

                if (isFailedState) {
                    return {
                        id: pollId,
                        content_type: outputType,
                        status: "failed",
                        error: taskData?.failMsg || taskData?.error || data?.msg || "Generation failed",
                        provider_check_id: pollId,
                        debug: debugPayload,
                    };
                }

                lastProcessingDebug = debugPayload;
            }

            if (lastTransportError && !lastProcessingDebug) {
                return {
                    content_type: "video",
                    status: "failed",
                    error: lastTransportError,
                    debug: {
                        originalTaskId: taskId,
                        attemptedTaskIds: taskIdCandidates,
                    },
                };
            }

            return {
                id: taskId,
                content_type: "video",
                status: "processing",
                provider_check_id: taskId,
                debug: {
                    ...(lastProcessingDebug || {}),
                    attemptedTaskIds: taskIdCandidates,
                },
            };

        } catch (error: unknown) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Kie.ai Status Check Exception:", error);
            }
            const message = error instanceof Error ? error.message : "Kie.ai status check failed";
            return {
                content_type: "video",
                status: "failed",
                error: message,
                debug: {
                    stage: "checkStatus",
                },
            };
        }
    }
}
