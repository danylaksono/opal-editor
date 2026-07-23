import { toast } from "sonner";
import { createLogger } from "@/lib/debug/logger";
import { useSettingsStore } from "@/stores/settings-store";

const log = createLogger("memory-guard");

/** JS heap usage (bytes) above which the preview auto-degrades. The renderer
 * OOMs somewhere past ~2-4 GB depending on WASM/canvas residency, so degrade
 * well before that while there is still headroom to recover. */
const HEAP_PRESSURE_BYTES = 1200 * 1024 * 1024;

/** Also degrade when usage approaches the engine's own ceiling, whichever
 * comes first — jsHeapSizeLimit varies per machine. */
const HEAP_LIMIT_RATIO = 0.6;

const CHECK_INTERVAL_MS = 10_000;
/** Throttle repeated high-memory log entries. */
const LOG_THROTTLE_MS = 60_000;

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function readHeap(): PerformanceMemory | null {
  const memory = (performance as Performance & { memory?: PerformanceMemory })
    .memory;
  return memory && memory.usedJSHeapSize > 0 ? memory : null;
}

let started = false;
let autoDegradedThisSession = false;
let lastHighLogAt = 0;

/** Start the background memory monitor (idempotent). When JS heap usage
 * crosses the pressure threshold, enables Lightweight PDF preview once per
 * session and tells the user — a safety net against renderer OOM crashes. */
export function startMemoryGuard(): void {
  if (started) return;
  started = true;

  const memory = readHeap();
  if (!memory) {
    log.debug("performance.memory unavailable — memory guard disabled");
    return;
  }

  setInterval(() => {
    const heap = readHeap();
    if (!heap) return;

    const used = heap.usedJSHeapSize;
    const pressured =
      used > HEAP_PRESSURE_BYTES ||
      used > heap.jsHeapSizeLimit * HEAP_LIMIT_RATIO;
    if (!pressured) return;

    const usedMb = Math.round(used / (1024 * 1024));
    const now = Date.now();
    if (now - lastHighLogAt > LOG_THROTTLE_MS) {
      lastHighLogAt = now;
      log.warn("High JS heap usage", {
        usedMb,
        limitMb: Math.round(heap.jsHeapSizeLimit / (1024 * 1024)),
      });
    }

    const settings = useSettingsStore.getState();
    if (settings.simplePdfPreview || autoDegradedThisSession) return;

    autoDegradedThisSession = true;
    settings.setSimplePdfPreview(true);
    log.warn("Auto-enabled Lightweight PDF preview due to memory pressure", {
      usedMb,
    });
    toast.warning("Switched to Lightweight PDF preview", {
      id: "memory-guard-degrade",
      duration: 10_000,
      description: `Memory use was getting high (${usedMb} MB) — the preview now renders in lightweight mode to prevent a crash. You can turn this off in Settings.`,
    });
  }, CHECK_INTERVAL_MS);
}
