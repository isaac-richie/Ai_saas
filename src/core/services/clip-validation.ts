const MAX_METADATA_BYTES = 64 * 1024;

/** Metadata must be a plain object of modest size; footage links must be https. */
export function validClipValue(key: string, value: unknown): boolean {
  if (key === 'metadata') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      return JSON.stringify(value).length <= MAX_METADATA_BYTES;
    } catch {
      return false;
    }
  }
  if (key === 'asset_url') {
    if (value === null) return true;
    if (typeof value !== 'string' || value.length > 2000) return false;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }
  return true;
}
