export type FitMode = "fit-width" | "fit-height" | null;

/** Per-root zoom state cache: rootFileId → { scale, fitMode }.
 *
 * Lives outside pdf-preview.tsx so that file only exports the component —
 * mixed exports break Vite's Fast Refresh for the whole preview tree. */
export const zoomCache = new Map<string, { scale: number; fitMode: FitMode }>();

/** Clear zoom cache (e.g., on project close). */
export function clearZoomCache(): void {
  zoomCache.clear();
}
