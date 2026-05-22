/** Convert unknown throw value to a short message for user-facing errors. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Sanitize a string for use as a filename.
 */
export function sanitizeFileName(name: string, dflt: string): string {
  const s = name.trim().replace(/[/\\:*?"<>|]+/g, "_");
  return s === "" ? dflt : s;
}

/** Extract the trailing filename component (basename) from a slash- or backslash-separated path. */
export function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
