import { toast } from "sonner";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("render-limits");

/** Maximum pixels a single page render may produce (width × height at the
 * requested DPI). ~9 MP ≈ A4 at 300 DPI ≈ 36 MB of RGBA. Beyond this, high
 * zoom × devicePixelRatio ratchets the WASM heap (which never shrinks) and
 * canvas memory toward a renderer OOM crash. */
const MAX_RENDER_PIXELS = 9_000_000;

/** Tighter budget for the lightweight-preview setting (~A4 at 210 DPI). */
export const SIMPLE_MAX_RENDER_PIXELS = 4_500_000;

let capNotified = false;

/** Cap the render DPI so the resulting bitmap stays under the pixel budget.
 * The canvas is upscaled via CSS beyond the cap, trading sharpness at extreme
 * zoom for stability. Notifies the user once per session when the cap engages. */
export function capRenderDpi(
  dpi: number,
  pageWidthPt: number,
  pageHeightPt: number,
  maxPixels: number = MAX_RENDER_PIXELS,
): number {
  const pixels = (pageWidthPt / 72) * dpi * ((pageHeightPt / 72) * dpi);
  if (pixels <= maxPixels) return dpi;
  const capped = dpi * Math.sqrt(maxPixels / pixels);
  // Only notify for the default budget — in lightweight-preview mode the
  // lower cap is the user's own choice, not a surprise.
  if (!capNotified && maxPixels === MAX_RENDER_PIXELS) {
    capNotified = true;
    log.warn("Render DPI capped to conserve memory", {
      requestedDpi: Math.round(dpi),
      cappedDpi: Math.round(capped),
    });
    toast.info("Preview sharpness limited", {
      id: "render-dpi-cap",
      description:
        "This zoom level would need too much memory — pages are rendered at a reduced resolution to keep the app stable.",
    });
  }
  return capped;
}
