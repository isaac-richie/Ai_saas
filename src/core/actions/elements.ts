"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { revalidatePath } from "next/cache"

async function ensureSession() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { supabase, error: "Unauthorized. Please sign in.", user: null }
    return { supabase, user }
}

export async function createElement(formData: FormData) {
    const session = await ensureSession()
    if (session.error) return { error: session.error }
    const supabase = session.supabase

    const name = formData.get("name") as string
    const type = formData.get("type") as string
    const description = formData.get("description") as string
    const image_url = formData.get("image_url") as string
    const projectId = formData.get("project_id") as string // optional depending on if we tie elements globally or project-specific

    if (!name || !type || !image_url) {
        return { error: "Missing required fields" }
    }

    const { data, error } = await supabase
        .from("elements")
        .insert({
            name,
            type,
            description: description || null,
            image_url,
            project_id: projectId,
        })
        .select()
        .single()

    if (error) {
        console.error("Error creating element:", error)
        return { error: error.message }
    }

    if (projectId) {
        revalidatePath(`/dashboard/projects/${projectId}`)
    }

    return { data }
}

export async function getProjectElements(projectId: string) {
    const session = await ensureSession()
    if (session.error) return { error: session.error }
    const supabase = session.supabase

    const { data, error } = await supabase
        .from("elements")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Error fetching elements:", error)
        return { error: error.message }
    }

    return { data }
}

export async function attachElementToShot(shotId: string, elementId: string, strength: number = 1.0) {
    const session = await ensureSession()
    if (session.error) return { error: session.error }
    const supabase = session.supabase

    const { data, error } = await supabase
        .from("shot_elements")
        .insert({
            shot_id: shotId,
            element_id: elementId,
            strength,
            reference_tag: `@element_${elementId.substring(0, 4)}` // just an example tag strategy
        })
        .select()
        .single()

    if (error) {
        console.error("Error attaching element to shot:", error)
        return { error: error.message }
    }

    return { data }
}

export async function getShotElements(shotId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("shot_elements")
        .select(`
            id,
            strength,
            reference_tag,
            elements (
                id,
                name,
                type,
                reference_image_url,
                prompt_fragment
            )
        `)
        .eq("shot_id", shotId)

    if (error) {
        console.error("Error fetching shot elements:", error)
        return { error: error.message }
    }

    return { data }
}

export async function deleteElement(projectId: string, elementId: string) {
    const session = await ensureSession()
    if (session.error) return { error: session.error }
    const supabase = session.supabase

    const { error } = await supabase
        .from("elements")
        .delete()
        .eq("id", elementId)

    if (error) {
        return { error: error.message }
    }

    revalidatePath(`/dashboard/projects/${projectId}`)
    return { success: true }
}
