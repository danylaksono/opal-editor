import { useRef, useState, type CSSProperties } from "react";

interface ResizableDialogOptions {
  /** localStorage key holding the persisted width for this dialog. */
  storageKey: string;
  /** Smallest width the user can drag down to. */
  minWidth?: number;
}

function loadStoredWidth(storageKey: string, minWidth: number): number | null {
  try {
    const parsed = Number(localStorage.getItem(storageKey));
    return Number.isFinite(parsed) && parsed >= minWidth ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * User-adjustable width for a centered DialogContent, persisted per dialog.
 *
 * Returns a `style` to spread onto DialogContent and a `handle` element to
 * render as its child — a slim grab area on the right edge. Drag to resize
 * (the dialog grows symmetrically around its center), double-click to reset
 * to the dialog's default CSS width.
 */
export function useResizableDialog({
  storageKey,
  minWidth = 480,
}: ResizableDialogOptions) {
  const [customWidth, setCustomWidth] = useState<number | null>(() =>
    loadStoredWidth(storageKey, minWidth),
  );
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  const style: CSSProperties | undefined = customWidth
    ? { width: customWidth, maxWidth: "calc(100vw - 2rem)" }
    : undefined;

  const handle = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize dialog"
      title="Drag to resize · double-click to reset"
      className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize touch-none rounded-full transition-colors hover:bg-primary/40"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const dialogWidth =
          event.currentTarget.parentElement?.getBoundingClientRect().width ??
          640;
        resizeStartRef.current = { x: event.clientX, width: dialogWidth };
      }}
      onPointerMove={(event) => {
        const start = resizeStartRef.current;
        if (!start) return;
        // The dialog is centered, so the width grows twice as fast as the
        // right edge moves to keep the handle under the pointer
        const next = Math.round(start.width + (event.clientX - start.x) * 2);
        setCustomWidth(
          Math.max(minWidth, Math.min(next, window.innerWidth - 32)),
        );
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        resizeStartRef.current = null;
        setCustomWidth((width) => {
          try {
            if (width) localStorage.setItem(storageKey, String(width));
          } catch {}
          return width;
        });
      }}
      onDoubleClick={() => {
        setCustomWidth(null);
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      }}
    />
  );

  return { style, handle };
}
