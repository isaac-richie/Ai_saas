import { GenerationRequest, GenerationResult, ProviderConfig } from "./types";

export abstract class BaseProvider {
    protected config: ProviderConfig;

    constructor(config: ProviderConfig) {
        this.config = config;
    }

    abstract generate(request: GenerationRequest): Promise<GenerationResult>;
    
    /** 
     * Perform a lightweight connectivity and authentication test.
     * Should NOT consume credits if possible.
     */
    abstract ping(): Promise<{ ok: boolean; message?: string }>;

    // Optional: Check status for async providers (like Runway/Midjourney)
    abstract checkStatus?(id: string): Promise<GenerationResult>;
}
