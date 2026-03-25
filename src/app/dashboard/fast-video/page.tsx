import { Metadata } from "next"
import { Badge } from "@/interface/components/ui/badge"
import { FastVideoStudio } from "@/interface/components/fast-video/FastVideoStudio"
import { getProjects } from "@/core/actions/projects"
import { getScenes } from "@/core/actions/scenes"

export const metadata: Metadata = {
  title: "Fast Video | AI Cinematography Dashboard",
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
    <div className="mx-auto w-full max-w-7xl space-y-5 py-2 md:py-3">
      <section data-reveal="hero" className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 text-white shadow-[0_24px_50px_-38px_rgba(0,0,0,0.95)] md:p-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-14 h-60 w-60 rounded-full bg-[#d9a066]/15 blur-[80px]" />
          <div className="absolute -right-20 top-1/3 h-60 w-60 rounded-full bg-[#6e8a8f]/10 blur-[90px]" />
          <div className="data-grid-bg absolute inset-0 opacity-[0.22]" />
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Direct-to-Video</Badge>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Fast Track Video Studio</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/50 md:text-base">
              Select style and motion presets, enter your subject, and generate a 5-second cinematic clip with minimal setup.
            </p>
          </div>
        </div>
      </section>

      {projectsWithScenes.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-[#0f1012] p-4 text-sm text-white/60">
          No project/scene yet. You can still generate in Fast Video now; create a scene later to promote clips into Studio.
        </section>
      ) : null}

      <section data-reveal="card">
        <FastVideoStudio projects={projectsWithScenes} />
      </section>
    </div>
  )
}
