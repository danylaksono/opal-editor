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
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenComplete: UnlistenFn | undefined;
    let unlistenError: UnlistenFn | undefined;

    async function setup() {
      unlistenOutput = await listen<AiOutputPayload>("ai-output", (event) => {
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
      });

      unlistenComplete = await listen<AiCompletePayload>(
        "ai-complete",
        async (event) => {
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
        },
      );

      unlistenError = await listen<AiErrorPayload>("ai-error", (event) => {
        const { tab_id: tabId, data } = event.payload;
        log.error(`[${tabId}] ${data}`);
      });
    }

    setup();

    return () => {
      if (unlistenOutput) unlistenOutput();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };
  }, []);
}
