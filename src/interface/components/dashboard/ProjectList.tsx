"use client"

import { Project } from "@/core/actions/projects"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Badge } from "@/interface/components/ui/badge"
import Link from "next/link"
import { Clock4, Folder } from "lucide-react"

interface ProjectListProps {
    projects: Project[]
}

export function ProjectList({ projects }: ProjectListProps) {
    if (projects.length === 0) {
        return (
            <div data-reveal="card" className="flex h-60 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-[#0b0b0d] text-center text-white">
                <div className="grid size-12 place-items-center rounded-2xl bg-white/10 text-white/55">
                    <Folder className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
                <p className="mb-2 mt-2 max-w-sm text-sm text-white/55">Create your first project to start structuring scenes and generating visuals.</p>
            </div>
        )
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
                <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="group block h-full" data-reveal="card">
                    <Card className="h-full overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                        <div className="relative aspect-[16/8] overflow-hidden border-b border-white/10 bg-white/[0.03]">
                            <div className="absolute inset-0" />
                            <div className="absolute inset-0 flex items-end justify-between p-4">
                                <Badge className={project.status === "active" ? "border border-white/15 bg-white/10 capitalize text-white" : "border border-white/10 bg-white/10 capitalize text-white/80"}>
                                    {project.status}
                                </Badge>
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
                        <CardFooter className="text-xs text-white/45">
                            <Clock4 className="mr-1.5 h-3.5 w-3.5" />
                            Updated {new Date(project.updated_at || project.created_at).toLocaleDateString()}
                        </CardFooter>
                    </Card>
                </Link>
            ))}
        </div>
    )
}
