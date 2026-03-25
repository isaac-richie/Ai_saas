"use client"

import { Project } from "@/core/actions/projects"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Badge } from "@/interface/components/ui/badge"
import { Input } from "@/interface/components/ui/input"
import Link from "next/link"
import Image from "next/image"
import { Clock4, Folder, Layers, Film, Search } from "lucide-react"
import { useMemo, useState } from "react"

interface ProjectListProps {
    projects: Project[]
}

export function ProjectList({ projects }: ProjectListProps) {
    const [query, setQuery] = useState("")
    const [sortBy, setSortBy] = useState<"updated_desc" | "created_desc" | "name_asc" | "name_desc" | "shots_desc">("updated_desc")

    const filteredProjects = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        const base = normalizedQuery
            ? projects.filter((project) =>
                [project.name, project.description || "", project.status || ""]
                    .join(" ")
                    .toLowerCase()
                    .includes(normalizedQuery)
            )
            : [...projects]

        const sorted = [...base]
        sorted.sort((a, b) => {
            if (sortBy === "name_asc") return a.name.localeCompare(b.name)
            if (sortBy === "name_desc") return b.name.localeCompare(a.name)
            if (sortBy === "created_desc") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            if (sortBy === "shots_desc") return (b.shot_count ?? 0) - (a.shot_count ?? 0)

            const aDate = new Date(a.updated_at || a.created_at).getTime()
            const bDate = new Date(b.updated_at || b.created_at).getTime()
            return bDate - aDate
        })

        return sorted
    }, [projects, query, sortBy])

    if (projects.length === 0) {
        return (
            <div data-reveal="card" className="flex h-60 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-[#0f1012] text-center text-white">
                <div className="grid size-12 place-items-center rounded-2xl bg-white/10 text-white/55">
                    <Folder className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
                <p className="mb-2 mt-2 max-w-sm text-sm text-white/55">Create your first project to start structuring scenes and generating visuals.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1012] px-4 py-3">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search projects..."
                        className="h-9 rounded-xl border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/35"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.16em] text-white/45">Sort</span>
                    <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                        className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white"
                    >
                        <option value="updated_desc" className="bg-[#0f1012]">Last Modified</option>
                        <option value="created_desc" className="bg-[#0f1012]">Newest First</option>
                        <option value="name_asc" className="bg-[#0f1012]">Name (A-Z)</option>
                        <option value="name_desc" className="bg-[#0f1012]">Name (Z-A)</option>
                        <option value="shots_desc" className="bg-[#0f1012]">Most Shots</option>
                    </select>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
                    Showing {filteredProjects.length}
                </span>
            </div>

            {filteredProjects.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#0f1012] text-center text-white/60">
                    <p className="text-sm">No projects match this search.</p>
                    <p className="mt-1 text-xs text-white/45">Try another keyword or change sort.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredProjects.map((project) => (
                <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="group block h-full" data-reveal="card">
                    <Card className="h-full overflow-hidden rounded-3xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                        <div className="relative aspect-[16/8] overflow-hidden border-b border-white/10 bg-white/[0.03]">
                            {project.thumbnail_url ? (
                                project.thumbnail_url.endsWith(".mp4") ? (
                                    <video
                                        src={`/api/media/proxy?url=${encodeURIComponent(project.thumbnail_url)}`}
                                        className="h-full w-full object-cover"
                                        muted
                                        loop
                                        playsInline
                                        autoPlay
                                        preload="metadata"
                                    />
                                ) : (
                                    <Image
                                        src={project.thumbnail_url}
                                        alt={project.name}
                                        fill
                                        sizes="(max-width: 1280px) 100vw, 33vw"
                                        className="object-cover"
                                        loading="lazy"
                                    />
                                )
                            ) : (
                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/10" />
                            )}
                            <div className="absolute inset-0 flex items-end justify-between p-4">
                                <Badge className={project.status === "active" ? "border border-emerald-400/35 bg-emerald-500/15 capitalize text-emerald-100" : "border border-white/10 bg-black/35 capitalize text-white/80"}>
                                    {project.status}
                                </Badge>
                                <span className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/70">
                                    Shots {project.shot_count ?? 0}
                                </span>
                            </div>
                        </div>
                        <CardHeader className="pb-1">
                            <CardTitle className="line-clamp-1 text-lg">{project.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                            <p className="line-clamp-2 text-sm text-white/55">
                                {project.description || "No description provided yet."}
                            </p>
                        </CardContent>
                        <CardFooter className="flex flex-wrap items-center gap-3 text-xs text-white/45">
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                <Layers className="h-3.5 w-3.5" />
                                Scenes {project.scene_count ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                <Film className="h-3.5 w-3.5" />
                                Shots {project.shot_count ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Clock4 className="h-3.5 w-3.5" />
                                Updated {(() => {
                                    const timestamp = project.updated_at || project.created_at;
                                    return timestamp ? new Date(timestamp).toLocaleDateString() : "Unknown";
                                })()}
                            </span>
                        </CardFooter>
                    </Card>
                </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
