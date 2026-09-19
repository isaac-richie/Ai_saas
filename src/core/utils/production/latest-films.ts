type FilmRevision = { id: string; parent_job_id?: string | null; revision_number?: number | null }

export function latestFilms<T extends FilmRevision>(jobs: T[]): T[] {
  const films = new Map<string, T>()
  for (const job of jobs) {
    const root = job.parent_job_id || job.id
    const previous = films.get(root)
    if (!previous || (job.revision_number || 1) > (previous.revision_number || 1)) films.set(root, job)
  }
  return [...films.values()]
}
