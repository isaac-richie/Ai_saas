import Link from "next/link";
import { Metadata } from "next";
import { Badge } from "@/interface/components/ui/badge";
import { MediaGallery } from "@/interface/components/media/MediaGallery";
import { getGalleryAssets } from "@/core/actions/gallery";
import { getProjects } from "@/core/actions/projects";
import { EmptyStatePanel, ErrorStatePanel } from "@/interface/components/ui/state-panels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Gallery | AI Cinematography Dashboard",
};

interface GalleryPageProps {
    searchParams?: Promise<{
        projectId?: string;
    }>;
}

export default async function GalleryPage(props: GalleryPageProps) {
    const searchParams = await props.searchParams;
    const projectId = searchParams?.projectId;
    const result = await getGalleryAssets(projectId);
    const assets = result.data || [];
    const hasError = typeof result.error === "string";
    const projectLabel = projectId ? assets[0]?.projectName || "Selected Project" : null;
    const projectsResult = await getProjects();
    const projectOptions = (projectsResult.data || []).map((project) => ({ id: project.id, name: project.name }));

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5 py-2 md:py-3">
            <section data-reveal="hero" className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 text-white shadow-[0_24px_50px_-38px_rgba(0,0,0,0.95)] md:p-6">
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -left-24 -top-14 h-60 w-60 rounded-full bg-[#d9a066]/15 blur-[80px]" />
                    <div className="absolute -right-20 top-1/3 h-60 w-60 rounded-full bg-[#6e8a8f]/10 blur-[90px]" />
                    <div className="data-grid-bg absolute inset-0 opacity-[0.22]" />
                </div>
                <div className="relative flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Gallery</Badge>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Generated Outputs</h1>
                        <p className="mt-2 text-sm text-white/50 md:text-base">
                            Review generated frames across projects and open the corresponding scene quickly.
                        </p>
                        {projectLabel && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
                                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
                                    Filtering: {projectLabel}
                                </span>
                                <Link
                                    href="/dashboard/gallery"
                                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70 hover:bg-white/10"
                                >
                                    Clear filter
                                </Link>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/dashboard/exports" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10">
                            Open Exports
                        </Link>
                        <Link href="/dashboard/studio" className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
                            Open Studio
                        </Link>
                    </div>
                </div>
            </section>

            {hasError ? (
                <ErrorStatePanel
                    compact
                    title="Unable to load gallery"
                    description="Try refreshing the page. If this persists, confirm your session and provider keys."
                />
            ) : (
                <section data-reveal="card" className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-white">Asset Library ({assets.length})</h2>
                    </div>
                    <MediaGallery assets={assets} projectOptions={projectOptions} />
                </section>
            )}

            {!hasError && assets.length === 0 ? (
                <EmptyStatePanel
                    compact
                    title="No generated media yet"
                    description="Create or open a scene in Studio and generate the first frame to populate your gallery."
                    action={
                        <Link href="/dashboard/studio" className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
                            Open Studio
                        </Link>
                    }
                />
            ) : null}
        </div>
    );
}
