import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { AiProviderInfo, AiRequest } from "@/lib/ai/types";
import { AI_PROVIDERS } from "@/lib/ai/types";
import type { AiProviderId } from "@/lib/ai/types";

interface AiProviderState {
  activeProviderId: AiProviderId;
  providers: AiProviderInfo[];
  providersLoaded: boolean;
  checkingStatus: boolean;
  providerStatus: Record<string, AiProviderInfo>;

  setActiveProvider: (id: AiProviderId) => Promise<void>;
  loadProviders: () => Promise<void>;
  checkStatus: (providerId?: string) => Promise<AiProviderInfo | null>;

  execute: (request: AiRequest) => Promise<void>;
  cancel: (tabId: string) => Promise<void>;
  listSessions: (
    projectPath: string,
  ) => Promise<{ session_id: string; title: string; last_modified: number }[]>;
  loadSession: (
    projectPath: string,
    sessionId: string,
  ) => Promise<AiRequest["messages"]>;
}

export const useAiProviderStore = create<AiProviderState>()((set, get) => ({
  activeProviderId: AI_PROVIDERS.NONE,
  providers: [],
  providersLoaded: false,
  checkingStatus: false,
  providerStatus: {},

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

  listSessions: async (projectPath) => {
    try {
      return await invoke("ai_list_sessions", { projectPath });
    } catch {
      return [];
    }
  },

  loadSession: async (projectPath, sessionId) => {
    try {
      return await invoke("ai_load_session", { projectPath, sessionId });
    } catch {
      return [];
    }
  },
}));
