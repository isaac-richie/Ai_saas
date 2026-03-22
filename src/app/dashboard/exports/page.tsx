import { Metadata } from "next"
import { Badge } from "@/interface/components/ui/badge"
import { listExportJobs } from "@/core/actions/exports"
import { ExportJobsPanel } from "@/interface/components/exports/ExportJobsPanel"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Exports | AI Cinematography Dashboard",
}

interface ExportsPageProps {
    searchParams?: Promise<{
        projectId?: string
    }>
}

export default async function ExportsPage(props: ExportsPageProps) {
    const searchParams = await props.searchParams
    const projectId = searchParams?.projectId
    const result = await listExportJobs(projectId)
    const jobs = result.data || []

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5 py-2 md:py-3">
            <section
                data-reveal="hero"
                className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 text-white shadow-[0_24px_50px_-38px_rgba(0,0,0,0.95)] md:p-6"
            >
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -left-24 -top-14 h-60 w-60 rounded-full bg-[#d9a066]/15 blur-[80px]" />
                    <div className="absolute -right-20 top-1/3 h-60 w-60 rounded-full bg-[#6e8a8f]/10 blur-[90px]" />
                    <div className="data-grid-bg absolute inset-0 opacity-[0.22]" />
                </div>
                <div className="relative flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Exports</Badge>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Export Queue</h1>
                        <p className="mt-2 text-sm text-white/50 md:text-base">
                            Track queued renders, retry failed jobs, and review completed exports.
                        </p>
                    </div>
                </div>
            </section>

            <section data-reveal="card" className="space-y-3">
                {result.error ? (
                    <div className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-4 text-sm text-white/70">
                        Unable to load export jobs right now.
                    </div>
                ) : (
                    <ExportJobsPanel jobs={jobs} />
                )}
            </section>
        </div>
    )
}
