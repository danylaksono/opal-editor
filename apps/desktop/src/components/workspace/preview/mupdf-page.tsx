import { useEffect, useRef, useState, useCallback, memo } from "react";
import { getMupdfClient } from "@/lib/mupdf/mupdf-client";
import { capRenderDpi } from "@/lib/mupdf/render-limits";
import { createLogger } from "@/lib/debug/logger";
import { APP_VISIBILITY_RESTORED } from "@/lib/debug/log-store";
import type { StructuredTextData, LinkData } from "@/lib/mupdf/types";
import { MessageSquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveReviewHighlightColor } from "@/lib/review-colors";

const log = createLogger("mupdf-page");

export interface MupdfReviewAnnotation {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "text" | "point";
  /** Highlights render as a clickable wash without the comment bubble. */
  annotationKind: "comment" | "highlight";
  status: "open" | "resolved";
  /** Highlight colour token; falls back to yellow. */
  color?: string;
}

interface MupdfPageProps {
  docId: number;
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  isVisible: boolean;
  highlight?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  reviewAnnotations?: MupdfReviewAnnotation[];
  selectedReviewAnnotationId?: string | null;
  onSelectReviewAnnotation?: (id: string) => void;
}

/** Check if a canvas appears blank (GPU context was silently invalidated).
 *  Uses a single getImageData call covering a small center region. */
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  if (canvas.width === 0 || canvas.height === 0) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return true; // context fully lost
  // Sample a 2x2 region from the center in one GPU readback
  const cx = Math.max(0, Math.floor(canvas.width / 2) - 1);
  const cy = Math.max(0, Math.floor(canvas.height / 2) - 1);
  const data = ctx.getImageData(cx, cy, 2, 2).data;
  // If all sampled pixels have zero alpha, canvas is blank
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

export const MupdfPage = memo(function MupdfPage({
  docId,
  pageIndex,
  scale,
  pageWidth,
  pageHeight,
  isVisible,
  highlight,
  reviewAnnotations = [],
  selectedReviewAnnotationId,
  onSelectReviewAnnotation,
}: MupdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [textData, setTextData] = useState<StructuredTextData | null>(null);
  const [links, setLinks] = useState<LinkData[]>([]);
  const renderGenRef = useRef(0);

  const cssW = pageWidth * scale;
  const cssH = pageHeight * scale;

  /** Re-render the page onto the canvas via MuPDF worker. */
  const renderPage = useCallback(() => {
    if (!isVisible || docId <= 0) return;

    const gen = ++renderGenRef.current;
    const client = getMupdfClient();
    const dpr = window.devicePixelRatio || 1;
    const dpi = capRenderDpi(scale * 72 * dpr, pageWidth, pageHeight);

    client
      .drawPage(docId, pageIndex, dpi)
      .then(async (imageData) => {
        if (gen !== renderGenRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const bitmap = await createImageBitmap(imageData);
        if (gen !== renderGenRef.current) {
          bitmap.close();
          return;
        }
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      })
      .catch((err) => {
        if (gen !== renderGenRef.current) return;
        log.error(`Render error page ${pageIndex}`, { error: String(err) });
      });
  }, [docId, pageIndex, scale, isVisible, pageWidth, pageHeight]);

  // Release the canvas backing store when the page scrolls far out of view
  // (beyond the IntersectionObserver margin). Without this, every visited page
  // keeps a full-resolution bitmap (~10-30 MB at typical zoom × DPR) alive for
  // the whole session — scrolling through a long document accumulates
  // gigabytes and can OOM the renderer process. The CSS size is set separately
  // in style, so layout is unaffected; re-entering the margin re-renders.
  useEffect(() => {
    if (isVisible) return;
    renderGenRef.current++; // cancel any in-flight render
    const canvas = canvasRef.current;
    if (canvas && canvas.width > 0) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }, [isVisible]);

  // Initial render and re-render on dependency changes
  useEffect(() => {
    if (!isVisible || docId <= 0) return;

    renderPage();

    const client = getMupdfClient();
    const gen = renderGenRef.current;

    client
      .getPageText(docId, pageIndex)
      .then((data) => {
        if (gen !== renderGenRef.current) return;
        setTextData(data);
      })
      .catch(() => {});

    client
      .getPageLinks(docId, pageIndex)
      .then((data) => {
        if (gen !== renderGenRef.current) return;
        setLinks(data);
      })
      .catch(() => {});
  }, [docId, pageIndex, scale, isVisible, renderPage]);

  // Re-render canvas when returning from background if content was lost
  useEffect(() => {
    const handleVisibilityRestored = () => {
      const canvas = canvasRef.current;
      if (!canvas || !isVisible || docId <= 0) return;
      if (isCanvasBlank(canvas)) {
        log.warn(
          `Canvas blank after visibility restore, re-rendering page ${pageIndex}`,
        );
        renderPage();
      }
    };

    window.addEventListener(APP_VISIBILITY_RESTORED, handleVisibilityRestored);
    return () =>
      window.removeEventListener(
        APP_VISIBILITY_RESTORED,
        handleVisibilityRestored,
      );
  }, [docId, pageIndex, scale, isVisible, renderPage]);

  return (
    <div
      className="mupdf-page relative"
      data-page-number={pageIndex + 1}
      style={{ width: cssW, height: cssH }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: cssW, height: cssH, display: "block" }}
      />

      {/* Text layer for selection */}
      {textData && (
        <svg
          className="mupdf-text-layer"
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          preserveAspectRatio="none"
          style={{ width: cssW, height: cssH }}
        >
          {textData.blocks.map(
            (block, bi) =>
              block.type === "text" &&
              block.lines.map((line, li) => (
                <text
                  key={`${bi}-${li}`}
                  x={line.bbox.x}
                  y={line.y}
                  fontSize={line.font.size}
                  fontFamily={line.font.family || line.font.name || "serif"}
                  textLength={line.bbox.w > 0 ? line.bbox.w : undefined}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {line.text}
                </text>
              )),
          )}
        </svg>
      )}

      {/* Link layer */}
      {links.length > 0 && (
        <div className="mupdf-link-layer">
          {links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              data-external={link.isExternal ? "true" : undefined}
              style={{
                left: `${(link.x / pageWidth) * 100}%`,
                top: `${(link.y / pageHeight) * 100}%`,
                width: `${(link.w / pageWidth) * 100}%`,
                height: `${(link.h / pageHeight) * 100}%`,
              }}
            >
              <span className="sr-only">Link</span>
            </a>
          ))}
        </div>
      )}

      {highlight && (
        <div
          className="synctex-highlight pointer-events-none absolute z-[3] rounded-sm border-2 border-blue-500 bg-blue-400/20 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]"
          style={{
            left: highlight.x * scale,
            top: highlight.y * scale,
            width: Math.max(12, highlight.width * scale),
            height: Math.max(12, highlight.height * scale),
          }}
          aria-hidden="true"
        />
      )}

      {reviewAnnotations.map((annotation) => (
        <div key={annotation.id}>
          {annotation.kind === "text" &&
            (annotation.annotationKind === "highlight" ? (
              // Highlights are directly clickable — there is no bubble marker.
              <button
                type="button"
                className={cn(
                  "absolute z-[3] cursor-pointer rounded-sm",
                  annotation.status === "resolved"
                    ? "bg-slate-300/25 hover:bg-slate-300/40"
                    : resolveReviewHighlightColor(annotation.color).wash,
                  selectedReviewAnnotationId === annotation.id &&
                    "ring-2 ring-blue-500/60",
                )}
                style={{
                  left: annotation.x * scale,
                  top: annotation.y * scale,
                  width: Math.max(10, annotation.width * scale),
                  height: Math.max(10, annotation.height * scale),
                }}
                aria-label={`Open highlight on page ${annotation.page}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectReviewAnnotation?.(annotation.id);
                }}
              />
            ) : (
              <div
                className={cn(
                  "pointer-events-none absolute z-[3] rounded-sm border",
                  annotation.status === "resolved"
                    ? "border-slate-400/50 bg-slate-300/15"
                    : "border-amber-500/50 bg-amber-300/25",
                  selectedReviewAnnotationId === annotation.id &&
                    "ring-2 ring-blue-500/60",
                )}
                style={{
                  left: annotation.x * scale,
                  top: annotation.y * scale,
                  width: Math.max(10, annotation.width * scale),
                  height: Math.max(10, annotation.height * scale),
                }}
                aria-hidden="true"
              />
            ))}
          {annotation.annotationKind === "comment" && (
            <button
              type="button"
              className={cn(
                "absolute z-[4] flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-transform hover:scale-110",
                annotation.status === "resolved"
                  ? "border-slate-400 bg-slate-100 text-slate-500"
                  : "border-amber-500 bg-amber-300 text-amber-950",
                selectedReviewAnnotationId === annotation.id &&
                  "ring-2 ring-blue-500 ring-offset-1",
              )}
              style={{
                left:
                  (annotation.x +
                    (annotation.kind === "text" ? annotation.width : 0)) *
                  scale,
                top: annotation.y * scale,
              }}
              aria-label={`Open review comment on page ${annotation.page}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectReviewAnnotation?.(annotation.id);
              }}
            >
              <MessageSquareIcon className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
});
