import { NextResponse } from "next/server";
import { createClient } from "@/infrastructure/supabase/server";

export async function GET() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("shot_options")
        .select("id, category, key, label, descriptor, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const grouped: Record<string, typeof data> = {};
    (data || []).forEach((item) => {
        const category = item.category || "other";
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(item);
    });

    return NextResponse.json({ data: grouped });
}
