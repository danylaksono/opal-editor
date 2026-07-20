import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";

const ZOTERO_BASE = "https://api.zotero.org";

export type ZoteroConnectionMode = "desktop" | "cloud";

export interface ZoteroCredentials {
  mode: ZoteroConnectionMode;
  apiKey: string | null;
  userID: string;
  username: string;
}

export type ZoteroConnection =
  | {
      mode: "desktop";
      userID: "0";
    }
  | {
      mode: "cloud";
      apiKey: string;
      userID: string;
    };

export interface ZoteroCollection {
  key: string;
  name: string;
  parentKey: string | false;
  itemCount: number;
}

/** Result of importing a collection */
export interface CollectionImportResult {
  bibtex: string;
  libraryVersion: number;
  keyMap: Record<string, string>;
  totalItems: number;
}

/** Result of an incremental sync */
export interface CollectionSyncResult {
  updatedEntries: { key: string; citekey: string; bibtex: string }[];
  deletedKeys: string[];
  libraryVersion: number;
}

// ─── OAuth Flow (via Tauri Rust backend) ───

export async function startOAuth(): Promise<void> {
  const result = await invoke<{ authorize_url: string }>("zotero_start_oauth");
  await open(result.authorize_url);
}

export async function completeOAuth(): Promise<ZoteroCredentials> {
  const result = await invoke<{
    api_key: string;
    user_id: string;
    username: string;
  }>("zotero_complete_oauth");
  return {
    mode: "cloud",
    apiKey: result.api_key,
    userID: result.user_id,
    username: result.username,
  };
}

export async function cancelOAuth(): Promise<void> {
  await invoke("zotero_cancel_oauth");
}

// ─── Zotero Web API v3 ───

interface ZoteroLocalResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

async function zoteroFetch(
  connection: ZoteroConnection,
  path: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const response =
    connection.mode === "desktop"
      ? await invoke<ZoteroLocalResponse>("zotero_local_request", {
          path,
        }).then(
          (result) =>
            new Response(result.body, {
              status: result.status,
              headers: result.headers,
            }),
        )
      : await fetch(`${ZOTERO_BASE}${path}`, {
          headers: {
            "Zotero-API-Key": connection.apiKey,
            "Zotero-API-Version": "3",
            ...headers,
          },
        });
  if (!response.ok) {
    if (response.status === 304) return response;
    if (response.status === 403) {
      if (connection.mode === "desktop") {
        throw new Error(
          "Local access is disabled in Zotero. Enable “Allow other applications on this computer to communicate with Zotero” in Settings → Advanced.",
        );
      }
      throw new Error("Invalid or expired Zotero API key");
    }
    throw new Error(`Zotero API error: ${response.status}`);
  }
  return response;
}

function extractCitekey(bibtex: string): string {
  const match = bibtex.match(/@\w+\{([^,\s]+)/);
  return match ? match[1] : "";
}

export async function validateApiKey(
  apiKey: string,
): Promise<ZoteroCredentials> {
  const connection: ZoteroConnection = {
    mode: "cloud",
    apiKey,
    userID: "",
  };
  const response = await zoteroFetch(connection, "/keys/current");
  const data = await response.json();
  return {
    mode: "cloud",
    apiKey,
    userID: String(data.userID),
    username: data.username ?? "",
  };
}

export async function validateDesktop(): Promise<ZoteroCredentials> {
  await zoteroFetch(
    { mode: "desktop", userID: "0" },
    "/users/0/collections?limit=1",
  );
  return {
    mode: "desktop",
    apiKey: null,
    userID: "0",
    username: "Zotero Desktop",
  };
}

// ─── Collections ───

export async function fetchCollections(
  connection: ZoteroConnection,
): Promise<ZoteroCollection[]> {
  const response = await zoteroFetch(
    connection,
    `/users/${connection.userID}/collections?format=json`,
  );
  const data = (await response.json()) as {
    key: string;
    data: { key: string; name: string; parentCollection: string | false };
    meta: { numItems: number };
  }[];
  return data.map((c) => ({
    key: c.key,
    name: c.data.name,
    parentKey: c.data.parentCollection,
    itemCount: c.meta.numItems,
  }));
}

// ─── Collection Import (full download) ───

/**
 * Import all items from a specific collection.
 * Pass collectionKey = null to import the entire "My Library" (all top-level items).
 */
export async function importCollection(
  connection: ZoteroConnection,
  collectionKey: string | null,
  onProgress?: (loaded: number, total: number) => void,
): Promise<CollectionImportResult> {
  const basePath = collectionKey
    ? `/users/${connection.userID}/collections/${collectionKey}/items/top`
    : `/users/${connection.userID}/items/top`;

  let allBibtex = "";
  const keyMap: Record<string, string> = {};
  let start = 0;
  const limit = 100;
  let total = 0;
  let libraryVersion = 0;

  while (true) {
    const params = new URLSearchParams({
      format: "json",
      include: "bibtex",
      limit: String(limit),
      start: String(start),
    });
    const response = await zoteroFetch(connection, `${basePath}?${params}`);

    if (start === 0) {
      total = Number(response.headers.get("Total-Results") ?? 0);
      libraryVersion = Number(
        response.headers.get("Last-Modified-Version") ?? 0,
      );
    }

    const items = (await response.json()) as { key: string; bibtex?: string }[];
    if (items.length === 0) break;

    for (const item of items) {
      const bibtex = item.bibtex ?? "";
      if (!bibtex.trim()) continue;
      const citekey = extractCitekey(bibtex);
      if (citekey) keyMap[item.key] = citekey;
      allBibtex += (allBibtex ? "\n\n" : "") + bibtex;
    }

    start += limit;
    onProgress?.(Math.min(start, total), total);
    if (start >= total) break;
  }

  return { bibtex: allBibtex, libraryVersion, keyMap, totalItems: total };
}

// ─── Incremental Sync ───

/**
 * Sync changes for a specific collection since lastVersion.
 * collectionKey = null syncs the entire library.
 *
 * Note: Zotero's `since` param works at the library level (not per-collection),
 * so for collection sync we re-fetch all collection items and diff locally.
 */
export async function syncCollection(
  connection: ZoteroConnection,
  collectionKey: string | null,
  lastVersion: number,
  onProgress?: (loaded: number, total: number) => void,
): Promise<CollectionSyncResult> {
  // For "My Library" (all items), we can use the `since` param
  if (!collectionKey) {
    return syncFullLibrary(connection, lastVersion, onProgress);
  }

  // For a specific collection, re-fetch all items and diff against keyMap
  // (Zotero API doesn't support `since` scoped to a collection)
  const result = await importCollection(connection, collectionKey, onProgress);

  return {
    updatedEntries: Object.entries(result.keyMap).map(([key, citekey]) => {
      // Extract the bibtex for this citekey from the full bibtex string
      const bibtexEntries = result.bibtex.split(/\n(?=@)/);
      const entry =
        bibtexEntries.find((e) => extractCitekey(e) === citekey) ?? "";
      return { key, citekey, bibtex: entry };
    }),
    deletedKeys: [],
    libraryVersion: result.libraryVersion,
  };
}

async function syncFullLibrary(
  connection: ZoteroConnection,
  lastVersion: number,
  onProgress?: (loaded: number, total: number) => void,
): Promise<CollectionSyncResult> {
  const updatedEntries: CollectionSyncResult["updatedEntries"] = [];
  let start = 0;
  const limit = 100;
  let total = 0;
  let newVersion = lastVersion;

  while (true) {
    const params = new URLSearchParams({
      since: String(lastVersion),
      format: "json",
      include: "bibtex",
      limit: String(limit),
      start: String(start),
    });
    const response = await zoteroFetch(
      connection,
      `/users/${connection.userID}/items/top?${params}`,
    );

    if (start === 0) {
      total = Number(response.headers.get("Total-Results") ?? 0);
      newVersion = Number(
        response.headers.get("Last-Modified-Version") ?? lastVersion,
      );
    }

    const items = (await response.json()) as { key: string; bibtex?: string }[];
    if (items.length === 0) break;

    for (const item of items) {
      const bibtex = item.bibtex ?? "";
      if (!bibtex.trim()) continue;
      const citekey = extractCitekey(bibtex);
      updatedEntries.push({ key: item.key, citekey, bibtex });
    }

    start += limit;
    onProgress?.(Math.min(start, total), total);
    if (start >= total) break;
  }

  // Fetch deleted items
  const deletedResponse = await zoteroFetch(
    connection,
    `/users/${connection.userID}/deleted?since=${lastVersion}`,
  );
  const deleted = (await deletedResponse.json()) as { items?: string[] };
  const deletedKeys = deleted.items ?? [];

  if (!newVersion || newVersion === lastVersion) {
    newVersion = Number(
      deletedResponse.headers.get("Last-Modified-Version") ?? lastVersion,
    );
  }

  return { updatedEntries, deletedKeys, libraryVersion: newVersion };
}
