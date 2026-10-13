function toBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
}

// Open for the public test period. Set NEXT_PUBLIC_STUDIO_ENABLED=false to lock it again.
export const STUDIO_ENABLED = toBool(process.env.NEXT_PUBLIC_STUDIO_ENABLED, true)
