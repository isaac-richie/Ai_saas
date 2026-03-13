export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            projects: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    description: string | null
                    aspect_ratio: string
                    created_at: string
                    updated_at: string
                    status: string
                }
                Insert: {
                    id?: string
                    user_id?: string
                    name: string
                    description?: string | null
                    aspect_ratio?: string
                    created_at?: string
                    updated_at?: string
                    status?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    aspect_ratio?: string
                    created_at?: string
                    updated_at?: string
                    status?: string
                }
            }
            scenes: {
                Row: {
                    id: string
                    project_id: string
                    name: string
                    description: string | null
                    script_content: string | null
                    sequence_order: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    name: string
                    description?: string | null
                    script_content?: string | null
                    sequence_order?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    name?: string
                    description?: string | null
                    script_content?: string | null
                    sequence_order?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            shots: {
                Row: {
                    id: string
                    scene_id: string
                    camera_id: string | null
                    lens_id: string | null
                    name: string
                    description: string | null
                    shot_type: string | null
                    camera_movement: string | null
                    sequence_order: number
                    estimated_duration: number | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    scene_id: string
                    camera_id?: string | null
                    lens_id?: string | null
                    name: string
                    description?: string | null
                    shot_type?: string | null
                    camera_movement?: string | null
                    sequence_order?: number
                    estimated_duration?: number | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    scene_id?: string
                    camera_id?: string | null
                    lens_id?: string | null
                    name?: string
                    description?: string | null
                    shot_type?: string | null
                    camera_movement?: string | null
                    sequence_order?: number
                    estimated_duration?: number | null
                    created_at?: string
                    updated_at?: string
                }
            }
            cameras: {
                Row: {
                    id: string
                    project_id: string
                    name: string
                    sensor_size: string | null
                    lens_mount: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    name: string
                    sensor_size?: string | null
                    lens_mount?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    name?: string
                    sensor_size?: string | null
                    lens_mount?: string | null
                    created_at?: string
                }
            }
            lenses: {
                Row: {
                    id: string
                    project_id: string
                    name: string
                    focal_length: number
                    aperture: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    name: string
                    focal_length: number
                    aperture?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    name?: string
                    focal_length?: number
                    aperture?: string | null
                    created_at?: string
                }
            }
            providers: {
                Row: {
                    id: string
                    name: string
                    slug: string
                    base_url: string | null
                    is_active: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    slug: string
                    base_url?: string | null
                    is_active?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    slug?: string
                    base_url?: string | null
                    is_active?: boolean
                    created_at?: string
                }
            }
            user_api_keys: {
                Row: {
                    id: string
                    user_id: string
                    provider_id: string
                    encrypted_key: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    provider_id: string
                    encrypted_key: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    provider_id?: string
                    encrypted_key?: string
                    created_at?: string
                }
            }
            user_preferences: {
                Row: {
                    user_id: string
                    preferred_provider_slug: string | null
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    preferred_provider_slug?: string | null
                    updated_at?: string
                }
                Update: {
                    user_id?: string
                    preferred_provider_slug?: string | null
                    updated_at?: string
                }
            }
            shot_options: {
                Row: {
                    id: string
                    shot_id: string
                    provider_id: string | null
                    prompt: string
                    negative_prompt: string | null
                    seed: number | null
                    cfg_scale: number | null
                    steps: number | null
                    model_version: string | null
                    status: string
                    output_url: string | null
                    parameters: Json | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    shot_id: string
                    provider_id?: string | null
                    prompt: string
                    negative_prompt?: string | null
                    seed?: number | null
                    cfg_scale?: number | null
                    steps?: number | null
                    model_version?: string | null
                    status?: string
                    output_url?: string | null
                    parameters?: Json | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    shot_id?: string
                    provider_id?: string | null
                    prompt?: string
                    negative_prompt?: string | null
                    seed?: number | null
                    cfg_scale?: number | null
                    steps?: number | null
                    model_version?: string | null
                    status?: string
                    output_url?: string | null
                    parameters?: Json | null
                    created_at?: string
                }
            }
            elements: {
                Row: {
                    id: string
                    project_id: string
                    name: string
                    type: string
                    image_url: string | null
                    description: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    name: string
                    type: string
                    image_url?: string | null
                    description?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    name?: string
                    type?: string
                    image_url?: string | null
                    description?: string | null
                    created_at?: string
                }
            }
            shot_elements: {
                Row: {
                    shot_id: string
                    element_id: string
                }
                Insert: {
                    shot_id: string
                    element_id: string
                }
                Update: {
                    shot_id?: string
                    element_id?: string
                }
            }
            shot_presets: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    description: string | null
                    data: Json
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    description?: string | null
                    data?: Json
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    data?: Json
                    created_at?: string
                }
            }
            shot_references: {
                Row: {
                    id: string
                    shot_id: string
                    url: string
                    type: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    shot_id: string
                    url: string
                    type?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    shot_id?: string
                    url?: string
                    type?: string | null
                    created_at?: string
                }
            }
            video_sequences: {
                Row: {
                    id: string
                    project_id: string
                    scene_id: string
                    name: string
                    status: string
                    output_url: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    scene_id: string
                    name: string
                    status?: string
                    output_url?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    scene_id?: string
                    name?: string
                    status?: string
                    output_url?: string | null
                    created_at?: string
                }
            }
            sequence_shots: {
                Row: {
                    id: string
                    sequence_id: string
                    shot_id: string
                    order_index: number
                    duration_seconds: number | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    sequence_id: string
                    shot_id: string
                    order_index: number
                    duration_seconds?: number | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    sequence_id?: string
                    shot_id?: string
                    order_index?: number
                    duration_seconds?: number | null
                    created_at?: string
                }
            }
        }
    }
}
