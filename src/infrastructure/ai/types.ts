export interface GenerationRequest {
    prompt: string;
    negative_prompt?: string;
    image_prompt?: string; // Used for image-to-video as starting frame or reference
    output_type?: 'image' | 'video';
    width?: number;
    height?: number;
    aspect_ratio?: string;
    seed?: number;
    model?: string;
    duration_seconds?: number;
    steps?: number;
    cfg_scale?: number;
    variations?: number;
    quality?: string;
    is_generate_audio?: boolean;
}

export interface GenerationResult {
    id?: string;
    url?: string;
    content_type: 'image' | 'video';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string;
    provider_check_id?: string; // ID to poll status if async
    debug?: Record<string, unknown>;
}

export interface ProviderConfig {
    apiKey: string;
    baseUrl?: string;
}
