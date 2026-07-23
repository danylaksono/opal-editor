/**
 * Helpers for the paste-image-to-figure flow: clipboard detection and
 * filename generation/sanitisation for images pasted into the editor.
 */

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|webp|svg)$/i;

export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime.toLowerCase()] ?? "png";
}

/** Timestamped default such as `pasted-20260723-141530.png`. */
export function defaultPastedImageName(mime: string, now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `pasted-${stamp}.${extensionForMime(mime)}`;
}

/**
 * Normalise a user-supplied filename for a pasted image: strip path
 * separators and Windows-illegal characters, replace whitespace with
 * dashes (spaces break \includegraphics), and guarantee an image
 * extension matching the clipboard mime type.
 */
export function sanitizePastedImageName(input: string, mime: string): string {
  let name = input
    .trim()
    .replace(/[/\\<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .replace(/\s+/g, "-");
  if (!name.replace(/\.+$/, "")) return defaultPastedImageName(mime);
  if (!IMAGE_EXTENSION_PATTERN.test(name)) {
    name = `${name.replace(/\.+$/, "")}.${extensionForMime(mime)}`;
  }
  return name;
}

/** Read a File's bytes, falling back to FileReader where Blob.arrayBuffer
 *  is unavailable (e.g. jsdom in tests). */
export async function fileToBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the pasted image"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Return the clipboard's image file when the paste should be intercepted.
 * Mixed content keeps its default behaviour: anything carrying text/plain
 * (Word, Excel, web pages) pastes as text, so only image-only clipboards
 * (screenshots, copied image files) trigger the figure flow.
 */
export function clipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  const types: readonly string[] = data.types ?? [];
  if (types.includes("text/plain")) return null;
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}
