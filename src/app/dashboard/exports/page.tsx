import { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight, Images } from "lucide-react"
import { listExportJobs } from "@/core/actions/exports"
import { ExportJobsPanel } from "@/interface/components/exports/ExportJobsPanel"
import { WorkspaceHeading } from "@/interface/components/layout/WorkspaceHeading"
import { ErrorStatePanel } from "@/interface/components/ui/state-panels"

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
        <div className="workspace-page workspace-exports">
            <WorkspaceHeading
                label="05 / THE FINAL CUT"
                title="Ready for the big screen."
                description="Track queued renders, retry failed jobs, and collect your finished exports."
                actions={
                    <>
                        <Link href="/dashboard/gallery" className="workspace-secondary-link">
                            <Images size={16} /> Gallery
                        </Link>
                        <Link href="/dashboard/fast-video" className="workspace-primary-link">
                            Create a video <ArrowUpRight size={17} />
                        </Link>
                    </>
                }
            />
            <section className="lux-rise space-y-3">
                {result.error ? (
                    <ErrorStatePanel
                        compact
                        title="Unable to load export jobs"
                        description="Refresh the page to try again. Your renders have not been changed."
                    />
                ) : (
                    <ExportJobsPanel jobs={jobs} />
                )}
            </section>
        </div>
    )
}
