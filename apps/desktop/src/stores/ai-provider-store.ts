import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { AiProviderInfo, AiRequest } from "@/lib/ai/types";
import { AI_PROVIDERS } from "@/lib/ai/types";
import type { AiProviderId } from "@/lib/ai/types";
import { getModelsForProvider, type ModelInfo } from "./ai-chat-store";

export interface ConnectionTestResult {
  ok: boolean;
  modelCount?: number;
  error?: string;
}

interface AiProviderState {
  activeProviderId: AiProviderId;
  providers: AiProviderInfo[];
  providersLoaded: boolean;
  checkingStatus: boolean;
  providerStatus: Record<string, AiProviderInfo>;

  /** Models offered by the current provider — fetched from its API endpoint
   * (BYOK: works with any OpenAI-compatible endpoint), with a curated
   * fallback when the fetch fails. */
  availableModels: ModelInfo[];
  /** Provider the current `availableModels` list belongs to */
  modelsProviderId: string | null;
  /** Whether `availableModels` came from the live API or the fallback list */
  modelsSource: "api" | "fallback";

  setActiveProvider: (id: AiProviderId) => Promise<void>;
  loadProviders: () => Promise<void>;
  checkStatus: (providerId?: string) => Promise<AiProviderInfo | null>;
  loadModels: (providerId: string, force?: boolean) => Promise<void>;
  /** Make a real authenticated request to the provider (lists models).
   * Verifies key + endpoint before any tokens are spent. */
  testConnection: (providerId: string) => Promise<ConnectionTestResult>;

  execute: (request: AiRequest) => Promise<void>;
  cancel: (tabId: string) => Promise<void>;
}

/** Map raw model IDs to ModelInfo, reusing curated names/descriptions
 * where the ID matches a known model. */
function toModelInfos(ids: string[], providerId: string): ModelInfo[] {
  const curated = new Map(
    getModelsForProvider(providerId).map((m) => [m.id, m]),
  );
  return ids.map((id) => curated.get(id) ?? { id, name: id, desc: "" });
}

export const useAiProviderStore = create<AiProviderState>()((set, get) => ({
  activeProviderId: AI_PROVIDERS.NONE,
  providers: [],
  providersLoaded: false,
  checkingStatus: false,
  providerStatus: {},
  availableModels: [],
  modelsProviderId: null,
  modelsSource: "fallback",

  setActiveProvider: async (id) => {
    set({ activeProviderId: id });
    try {
      await invoke("ai_set_active_provider", {
        providerId: id === AI_PROVIDERS.NONE ? null : id,
      });
    } catch {
      // Provider setting is best-effort — the backend may not be available
    }
  },

  loadProviders: async () => {
    try {
      const providers = await invoke<AiProviderInfo[]>("ai_list_providers");
      const activeId = await invoke<string | null>("ai_get_active_provider");
      set({
        providers,
        providersLoaded: true,
        activeProviderId: (activeId as AiProviderId) ?? AI_PROVIDERS.NONE,
      });
    } catch {
      // Backend may not have the AI module yet — use defaults
      set({
        providers: [
          {
            id: AI_PROVIDERS.NONE,
            name: "No AI",
            ready: true,
            message: "Editor-only mode",
          },
        ],
        providersLoaded: true,
        activeProviderId: AI_PROVIDERS.NONE,
      });
    }
  },

  checkStatus: async (providerId) => {
    const id = providerId ?? get().activeProviderId;
    if (!id || id === AI_PROVIDERS.NONE) return null;

    set({ checkingStatus: true });
    try {
      const info = await invoke<AiProviderInfo>("ai_status", {
        providerId: id,
      });
      set((s) => ({
        providerStatus: { ...s.providerStatus, [id]: info },
        checkingStatus: false,
      }));
      return info;
    } catch {
      set({ checkingStatus: false });
      return null;
    }
  },

  loadModels: async (providerId, force = false) => {
    if (!providerId || providerId === AI_PROVIDERS.NONE) {
      set({
        availableModels: [],
        modelsProviderId: providerId,
        modelsSource: "fallback",
      });
      return;
    }
    const s = get();
    if (
      !force &&
      s.modelsProviderId === providerId &&
      s.availableModels.length > 0
    ) {
      return;
    }

    // Seed with the curated fallback so the picker is never empty while
    // (or if) the live fetch is pending/failing
    set({
      availableModels: getModelsForProvider(providerId),
      modelsProviderId: providerId,
      modelsSource: "fallback",
    });

    try {
      const ids = await invoke<string[]>("ai_list_models", { providerId });
      // Provider may have changed while the request was in flight
      if (ids.length > 0 && get().modelsProviderId === providerId) {
        set({
          availableModels: toModelInfos(ids, providerId),
          modelsSource: "api",
        });
      }
    } catch {
      // Keep the fallback list — endpoint unreachable or key missing
    }
  },

  testConnection: async (providerId) => {
    try {
      const ids = await invoke<string[]>("ai_list_models", { providerId });
      // A successful test doubles as a model-list refresh
      if (ids.length > 0) {
        set({
          availableModels: toModelInfos(ids, providerId),
          modelsProviderId: providerId,
          modelsSource: "api",
        });
      }
      return { ok: true, modelCount: ids.length };
    } catch (err: any) {
      const error =
        typeof err === "string" ? err : (err?.message ?? String(err));
      return { ok: false, error };
    }
  },

  execute: async (request) => {
    await invoke("ai_execute", { request });
  },

  cancel: async (tabId) => {
    try {
      await invoke("ai_cancel", { tabId });
    } catch {
      // Best-effort cancellation
    }
  },
}));
