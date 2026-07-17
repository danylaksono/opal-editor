import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAiChatStore } from "@/stores/ai-chat-store";
import { createLogger } from "@/lib/debug/logger";
import {
  parseAnthropicSSE,
  parseOpenAISSE,
  createAnthropicStreamState,
  createOpenAIStreamState,
  type AnthropicStreamState,
  type OpenAIStreamState,
} from "@/lib/ai/sse-parser";

const log = createLogger("ai-event");

interface AiOutputPayload {
  tab_id: string;
  data: string;
  provider: string;
}

interface AiCompletePayload {
  tab_id: string;
  success: boolean;
  provider: string;
}

interface AiErrorPayload {
  tab_id: string;
  data: string;
  provider: string;
}

/**
 * Hook that listens to provider-agnostic `ai-output`, `ai-complete`,
 * and `ai-error` Tauri events.
 *
 * The data lines are raw SSE chunks that need provider-specific parsing
 * (Anthropic or OpenAI stream format). When a turn completes, control is
 * handed to the chat store's `_handleTurnComplete`, which either executes
 * pending tool calls and continues the conversation or finalizes the stream.
 */
export function useAiEvents() {
  const anthropicStateRef = useRef(new Map<string, AnthropicStreamState>());
  const openaiStateRef = useRef(new Map<string, OpenAIStreamState>());

  useEffect(() => {
    // listen() is async: if this effect is cleaned up before the promises
    // resolve (StrictMode double-mount, HMR), listeners registered after
    // cleanup would leak — every event then gets handled twice, duplicating
    // messages and tool calls in the transcript. Track cancellation and
    // unlisten immediately when registration resolves post-cleanup.
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const register = async (promise: Promise<UnlistenFn>) => {
      const unlisten = await promise;
      if (cancelled) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    };

    const handleOutput = (event: { payload: AiOutputPayload }) => {
      const { tab_id: tabId, data, provider } = event.payload;
      const chatStore = useAiChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab?.isStreaming) return;

      if (provider === "anthropic") {
        let state = anthropicStateRef.current.get(tabId);
        if (!state) {
          state = createAnthropicStreamState();
          anthropicStateRef.current.set(tabId, state);
        }
        for (const msg of parseAnthropicSSE(data, state)) {
          chatStore._appendMessage(tabId, msg);
        }
      } else if (provider === "openai") {
        let state = openaiStateRef.current.get(tabId);
        if (!state) {
          state = createOpenAIStreamState();
          openaiStateRef.current.set(tabId, state);
        }
        for (const msg of parseOpenAISSE(data, state)) {
          chatStore._appendMessage(tabId, msg);
        }
      }
      // Unknown provider — skip
    };

    const handleComplete = async (event: { payload: AiCompletePayload }) => {
      const { tab_id: tabId, success } = event.payload;
      const chatStore = useAiChatStore.getState();

      // Reset per-turn parser state — a tool-loop continuation starts a
      // fresh provider stream
      anthropicStateRef.current.delete(tabId);
      openaiStateRef.current.delete(tabId);

      if (!success) {
        chatStore._setStreaming(tabId, false);
        chatStore._setError(tabId, "AI request failed");
        return;
      }

      // Execute pending tool calls and continue, or finalize the stream
      await chatStore._handleTurnComplete(tabId);
    };

    const handleError = (event: { payload: AiErrorPayload }) => {
      const { tab_id: tabId, data } = event.payload;
      log.error(`[${tabId}] ${data}`);
    };

    register(listen<AiOutputPayload>("ai-output", handleOutput));
    register(listen<AiCompletePayload>("ai-complete", handleComplete));
    register(listen<AiErrorPayload>("ai-error", handleError));

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) unlisten();
      unlisteners.length = 0;
    };
  }, []);
}
