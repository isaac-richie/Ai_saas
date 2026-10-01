"use client"

import { Project } from "@/core/actions/projects"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Badge } from "@/interface/components/ui/badge"
import { Input } from "@/interface/components/ui/input"
import Link from "next/link"
import Image from "next/image"
import { Clock4, Folder, Layers, Film, Search } from "lucide-react"
import { useMemo, useState } from "react"
import type * as React from "react"

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
            <div className="lux-rise flex h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-gold-400/20 [background:radial-gradient(70%_120%_at_50%_0%,rgba(217,192,138,0.07),transparent_60%),#0f110f] text-center text-white">
                <div className="grid size-14 place-items-center rounded-2xl border border-gold-400/20 bg-gold-400/[0.06] text-gold-300 shadow-[0_0_40px_-12px_rgba(217,192,138,0.6)]">
                    <Folder className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <h3 className="mt-5 text-xl font-light tracking-tight">Your first <span className="lux-serif text-gold-300">production</span> awaits</h3>
                <p className="mb-2 mt-2 max-w-sm text-sm text-[#a3a59a]">Create your first project to start structuring scenes and generating visuals.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="lux-glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
                <div className="relative min-w-0 basis-56 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gold-400/70" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search projects..."
                        aria-label="Search projects"
                        className="h-9 rounded-xl border-gold-400/[0.12] bg-white/5 pl-9 text-white placeholder:text-white/35"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#8f9086]">Sort</span>
                    <select
                        value={sortBy}
                        aria-label="Sort projects"
                        onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                        className="h-9 rounded-xl border border-gold-400/[0.12] bg-white/5 px-3 text-xs text-white"
                    >
                        <option value="updated_desc" className="bg-obsidian-900">Last Modified</option>
                        <option value="created_desc" className="bg-obsidian-900">Newest First</option>
                        <option value="name_asc" className="bg-obsidian-900">Name (A-Z)</option>
                        <option value="name_desc" className="bg-obsidian-900">Name (Z-A)</option>
                        <option value="shots_desc" className="bg-obsidian-900">Most Shots</option>
                    </select>
                </div>
                <span className="rounded-full border border-gold-400/15 bg-gold-400/[0.05] px-3 py-1 text-xs text-gold-200/80">
                    Showing {filteredProjects.length}
                </span>
            </div>

            {filteredProjects.length === 0 ? (
                <div className="lux-fade flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-gold-400/15 bg-[#0f110f] text-center text-[#a3a59a]">
                    <p className="text-sm">No projects match this search.</p>
                    <p className="mt-1 text-xs text-white/45">Try another keyword or change sort.</p>
                </div>
            ) : (
                <div className="lux-stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredProjects.map((project, index) => (
                <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="group block h-full rounded-3xl" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
                    <Card className="lux-lift lux-spotlight h-full gap-5 overflow-hidden rounded-3xl text-white">
                        <div className="relative aspect-[16/8] overflow-hidden border-b border-gold-400/10 bg-white/[0.02]">
                            {project.thumbnail_url ? (
                                project.thumbnail_url.endsWith(".mp4") ? (
                                    <video
                                        src={`/api/media/proxy?url=${encodeURIComponent(project.thumbnail_url)}`}
                                        className="h-full w-full object-cover transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
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
                                        className="object-cover transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
                                        loading="lazy"
                                    />
                                )
                            ) : (
                                <div className="absolute inset-0 bg-[radial-gradient(80%_100%_at_20%_0%,rgba(217,192,138,0.14),transparent_60%),linear-gradient(160deg,#171a17,#0d0f0d)]">
                                    <Film className="absolute right-5 top-5 h-5 w-5 text-gold-400/30" strokeWidth={1.4} />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                            <div className="absolute inset-0 flex items-end justify-between p-4">
                                <Badge className={project.status === "active" ? "border border-[#b6ddd3]/35 bg-[#b6ddd3]/10 capitalize text-[#d6efe8] backdrop-blur-md" : "border border-gold-400/[0.12] bg-black/40 capitalize text-white/80 backdrop-blur-md"}>
                                    {project.status}
                                </Badge>
                                <span className="rounded-full border border-gold-400/20 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-gold-100/80 backdrop-blur-md">
                                    Shots {project.shot_count ?? 0}
                                </span>
                            </div>
                        </div>
                        <CardHeader className="pb-1">
                            <CardTitle className="line-clamp-1 text-lg font-normal transition-colors duration-300 group-hover:text-gold-100">{project.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                            <p className="line-clamp-2 text-sm leading-relaxed text-[#a3a59a]">
                                {project.description || "No description provided yet."}
                            </p>
                        </CardContent>
                        <CardFooter className="flex flex-wrap items-center gap-2.5 text-[11px] text-[#8f9086]">
                            <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-white/[0.03] px-2.5 py-1">
                                <Layers className="h-3.5 w-3.5" />
                                Scenes {project.scene_count ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-white/[0.03] px-2.5 py-1">
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
