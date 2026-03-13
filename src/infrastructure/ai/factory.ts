import { BaseProvider } from "./base.provider";
import { OpenAIProvider } from "./providers/openai.provider";
import { RunwayProvider } from "./providers/runway.provider";
import { HyperealProvider } from "./providers/hypereal.provider";
import { KieProvider } from "./providers/kie.provider";

export class ProviderFactory {
    static create(slug: string, config: { apiKey: string }): BaseProvider {
        switch (slug.toLowerCase()) {
            case "openai":
            case "dall-e-3":
                return new OpenAIProvider(config);
            case "runway":
            case "gen-3":
                return new RunwayProvider(config);
            case "hypereal":
            case "sora-2-i2v":
                return new HyperealProvider(config);
            case "kie":
            case "kie-runway":
                return new KieProvider(config);
            default:
                throw new Error(`Provider ${slug} is not supported yet.`);
        }
    }
}
