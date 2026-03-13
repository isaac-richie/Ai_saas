import { z } from "zod";

export const createProjectSchema = z.object({
    name: z.string().min(1, "Project name is required").max(100),
    description: z.string().optional(),
});

export const createSceneSchema = z.object({
    name: z.string().min(1, "Scene name is required").max(100),
    description: z.string().optional(),
    sequence_order: z.number().int().min(1).default(1),
});

export const createShotSchema = z.object({
    name: z.string().min(1, "Shot name is required").max(100),
    description: z.string().optional(),
    shot_type: z.string().optional(),
    camera_movement: z.string().optional(),
    estimated_duration: z.number().int().min(0).default(0),
    camera_id: z.string().uuid().optional().nullable(),
    lens_id: z.string().uuid().optional().nullable(),
});
