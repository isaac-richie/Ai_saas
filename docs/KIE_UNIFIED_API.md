# Kie Unified Model Routing

This project now routes Kie generation requests through a single API pattern:

- `POST /api/v1/jobs/createTask`
- `GET /api/v1/jobs/recordInfo?taskId=...`

All model selection is done through the `model` field in the createTask payload.

## Request pattern

```json
{
  "model": "kling/v2-5-turbo-image-to-video-pro",
  "input": {
    "prompt": "cinematic alley at blue hour",
    "image_url": "https://example.com/start-frame.png",
    "duration": "5",
    "aspect_ratio": "16:9"
  }
}
```

## Current defaults

- Image default: `qwen/qwen-image`
- Video default: `kling/v2-5-turbo-image-to-video-pro`

Override with env vars:

- `KIE_DEFAULT_IMAGE_MODEL`
- `KIE_DEFAULT_VIDEO_MODEL`

Optional callback:

- `KIE_AI_CALLBACK_URL`

## Notes

- Shot Builder model field can pass any valid Kie model slug.
- Fast Video now accepts optional `settings.model`.
- Some Kie families (like Veo dedicated APIs) may use separate endpoints in Kie docs. Market-style models use the unified jobs flow above.

