export const activeProductionStatuses = new Set(["queued", "preparing", "submitted", "generating", "downloading", "processing"])

export function needsProductionTake(shot: {
  approved_take_id: string | null
  shot_generations: { status: string; output_url: string | null }[]
  generation_jobs: { status: string }[]
}) {
  return !shot.approved_take_id
    && !shot.shot_generations.some(take => take.status === "completed" && Boolean(take.output_url))
    && !shot.generation_jobs.some(job => activeProductionStatuses.has(job.status))
}
