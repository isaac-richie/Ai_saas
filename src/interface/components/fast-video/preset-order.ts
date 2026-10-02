/**
 * Orders presets for display: pinned first, then recently used, then the rest.
 * The collapsed view shows `limit` items but always keeps the selected preset
 * visible, and a search shows every match.
 */
export function orderPresets<T extends { id: string }>(presets: T[], options: {
  pinnedIds: string[]
  recentIds: string[]
  selectedId: string
  expanded: boolean
  searching: boolean
  limit?: number
}): T[] {
  const { pinnedIds, recentIds, selectedId, expanded, searching, limit = 5 } = options
  const pinned = pinnedIds.map((id) => presets.find((preset) => preset.id === id)).filter((preset): preset is T => Boolean(preset))
  const recent = recentIds.map((id) => presets.find((preset) => preset.id === id)).filter((preset): preset is T => Boolean(preset) && !pinnedIds.includes(preset!.id))
  const rest = presets.filter((preset) => !pinnedIds.includes(preset.id) && !recentIds.includes(preset.id))
  const ordered = [...pinned, ...recent, ...rest]
  if (expanded || searching || ordered.length <= limit) return ordered
  const visible = ordered.slice(0, limit)
  const selected = ordered.find((preset) => preset.id === selectedId)
  if (selected && !visible.includes(selected)) visible[visible.length - 1] = selected
  return visible
}
