import { Metadata } from "next"
import { FastVideoStudio } from "@/interface/components/fast-video/FastVideoStudio"
import { getProjects } from "@/core/actions/projects"
import { getScenes } from "@/core/actions/scenes"
import { Film, Zap } from "lucide-react"

export const metadata: Metadata = {
  title: "Fast Track | Visiowave Studios",
}

export default async function FastVideoPage() {
  const projectsResult = await getProjects()
  const projects = projectsResult.data || []

  const projectsWithScenes = await Promise.all(
    projects.map(async (project) => {
      const scenesResult = await getScenes(project.id)
      return {
        id: project.id,
        name: project.name,
        scenes: (scenesResult.data || []).map((scene) => ({ id: scene.id, name: scene.name })),
      }
    })
  )

  return (
    <div className="mx-auto w-full space-y-6">
      {/* Page Header — minimal, lets the studio breathe */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0c0c0e]/80 p-6 text-white backdrop-blur-sm md:p-8">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-12 h-56 w-56 rounded-full bg-cyan-400/[0.06] blur-[100px]" />
          <div className="absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-violet-400/[0.04] blur-[90px]" />
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cyan-300/80">
              <Zap className="h-3 w-3" />
              Direct-to-Video
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Fast Track
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/40">
              Prompt → generate → ship. No project setup required.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-xs text-white/45">
              <Film className="h-3.5 w-3.5 text-cyan-300/50" />
              <span>Kling 2.5</span>
              <span className="text-white/15">·</span>
              <span>Seedance</span>
              <span className="text-white/15">·</span>
              <span>Sora 2</span>
            </div>
          </div>
        </div>
      </section>

      {projectsWithScenes.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0c0c0e]/60 p-5 text-sm text-white/45">
          No project or scene yet. Generate in Fast Track now — create a project later to organize clips into Studio.
        </section>
      ) : null}

      <section>
        <FastVideoStudio projects={projectsWithScenes} />
      </section>
    </div>
  )
}
