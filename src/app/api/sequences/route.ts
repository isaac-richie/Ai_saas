import { NextResponse } from "next/server";
import { createClient } from "@/infrastructure/supabase/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
        return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const { data } = await supabase.auth.signInAnonymously();
        user = data.user;
    }

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
        .from("video_sequences")
        .select("id, name, status, output_url, project_id, scene_id, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
}
