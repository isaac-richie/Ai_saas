import { createClient } from "@/infrastructure/supabase/server";
import { SequenceBuilder } from "@/interface/components/sequences/SequenceBuilder";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sequence Builder | AI Cinematography Dashboard",
};

interface SequencePageProps {
    params: Promise<{
        sequenceId: string;
    }>;
}

type SequenceShotRow = {
    id: string;
    order_index: number;
    duration_seconds: number | null;
    shots: {
        id: string;
        name: string;
        description: string | null;
        shot_type: string | null;
        camera_movement: string | null;
        options?: {
            id: string;
            output_url: string | null;
            status: string;
            created_at: string;
        }[];
    } | null;
};

export default async function SequencePage(props: SequencePageProps) {
    const params = await props.params;
    const supabase = await createClient();

    const { data: sequence } = await supabase
        .from("video_sequences")
        .select("id, name, status, output_url, project_id, scene_id")
        .eq("id", params.sequenceId)
        .single();

    if (!sequence) {
        return (
            <div className="mx-auto w-full max-w-4xl py-10">
                <div className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-6 text-white">
                    Sequence not found.
                </div>
            </div>
        );
    }

    const { data: sequenceShots } = await supabase
        .from("sequence_shots")
        .select(`
            id,
            order_index,
            duration_seconds,
            shots (
                id,
                name,
                description,
                shot_type,
                camera_movement,
                options:shot_generations (
                    id,
                    output_url,
                    status,
                    created_at
                )
            )
        `)
        .eq("sequence_id", params.sequenceId)
        .order("order_index", { ascending: true });

    const items = (sequenceShots as SequenceShotRow[] | null || []).map((row) => {
        const shot = row.shots;
        const options = shot?.options || [];
        const approved = options.find((opt) => opt.status === "approved" && opt.output_url);
        const fallback = options
            .filter((opt) => opt.output_url)
            .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0];

        return {
            id: row.id,
            order_index: row.order_index,
            duration_seconds: row.duration_seconds,
            preview_url: approved?.output_url || fallback?.output_url || null,
            shot: {
                id: shot?.id || "",
                name: shot?.name || "Untitled Shot",
                description: shot?.description || null,
                shot_type: shot?.shot_type || null,
                camera_movement: shot?.camera_movement || null,
            },
        };
    });

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 py-2 md:py-3">
            <SequenceBuilder sequence={sequence} items={items} />
        </div>
    );
}
