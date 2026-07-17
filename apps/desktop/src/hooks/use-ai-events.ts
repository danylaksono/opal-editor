import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAiChatStore } from "@/stores/ai-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  compileLatex,
  resolveCompileTarget,
  formatCompileError,
} from "@/lib/latex-compiler";
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
 * (Anthropic or OpenAI stream format).
 */
export function useAiEvents() {
  const hasTexChangesRef = useRef(new Map<string, boolean>());
  const msgCountRef = useRef(new Map<string, number>());
  const streamStartTimeRef = useRef(new Map<string, number>());
  const lastMsgTimeRef = useRef(new Map<string, number>());
  const anthropicStateRef = useRef(new Map<string, AnthropicStreamState>());
  const openaiStateRef = useRef(new Map<string, OpenAIStreamState>());

  const tabs = useAiChatStore((s) => s.tabs);
  useEffect(() => {
    for (const tab of tabs) {
      if (tab.isStreaming && !msgCountRef.current.has(tab.id)) {
        hasTexChangesRef.current.set(tab.id, false);
        msgCountRef.current.set(tab.id, 0);
        streamStartTimeRef.current.delete(tab.id);
        lastMsgTimeRef.current.delete(tab.id);
      } else if (!tab.isStreaming) {
        msgCountRef.current.delete(tab.id);
        streamStartTimeRef.current.delete(tab.id);
        lastMsgTimeRef.current.delete(tab.id);
      }
    }
  }, [tabs]);

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

        const count = (msgCountRef.current.get(tabId) ?? 0) + 1;
        msgCountRef.current.set(tabId, count);
        const now = performance.now();
        if (count === 1) streamStartTimeRef.current.set(tabId, now);
        lastMsgTimeRef.current.set(tabId, now);

        if (provider === "anthropic") {
          // Parse Anthropic SSE events
          let state = anthropicStateRef.current.get(tabId);
          if (!state) {
            state = createAnthropicStreamState();
            anthropicStateRef.current.set(tabId, state);
          }
          const messages = parseAnthropicSSE(data, state);
          for (const msg of messages) {
            chatStore._appendMessage(tabId, msg);
            if (msg.message?.content?.some((b: any) => b.type === "tool_use")) {
              hasTexChangesRef.current.set(tabId, true);
            }
          }
        } else if (provider === "openai") {
          // Parse OpenAI SSE events
          let state = openaiStateRef.current.get(tabId);
          if (!state) {
            state = createOpenAIStreamState();
            openaiStateRef.current.set(tabId, state);
          }
          const messages = parseOpenAISSE(data, state);
          for (const msg of messages) {
            chatStore._appendMessage(tabId, msg);
            if (msg.message?.content?.some((b: any) => b.type === "tool_use")) {
              hasTexChangesRef.current.set(tabId, true);
            }
          }
        } else {
          // Unknown provider — skip
        }
      });

      unlistenComplete = await listen<AiCompletePayload>(
        "ai-complete",
        async (event) => {
          const { tab_id: tabId, success } = event.payload;
          const chatStore = useAiChatStore.getState();

          chatStore._setStreaming(tabId, false);

          if (!success) {
            chatStore._setError(tabId, "AI process exited with an error");
          }

          msgCountRef.current.delete(tabId);
          streamStartTimeRef.current.delete(tabId);
          lastMsgTimeRef.current.delete(tabId);
          anthropicStateRef.current.delete(tabId);
          openaiStateRef.current.delete(tabId);

          if (hasTexChangesRef.current.get(tabId)) {
            hasTexChangesRef.current.delete(tabId);
            try {
              const docState = useDocumentStore.getState();
              const projectRoot = docState.projectRoot;
              if (projectRoot) {
                const activeFileId =
                  docState.activeFileId ??
                  docState.files.find((f) => f.type === "tex")?.id;
                const target = activeFileId
                  ? resolveCompileTarget(activeFileId, docState.files)
                  : null;
                if (target) {
                  const useTexlive =
                    useSettingsStore.getState().compilerBackend === "texlive";
                  const data = await compileLatex(
                    projectRoot,
                    target.targetPath,
                    useTexlive,
                  );
                  docState.setPdfData(data, target.rootId);
                }
              }
            } catch (error) {
              const docState = useDocumentStore.getState();
              const activeFileId =
                docState.activeFileId ??
                docState.files.find((f) => f.type === "tex")?.id;
              docState.setCompileError(formatCompileError(error), activeFileId);
            }
            try {
              await useHistoryStore
                .getState()
                .createSnapshot(
                  useDocumentStore.getState().projectRoot ?? "",
                  "[ai] After AI edit",
                );
            } catch {
              // snapshot failure is non-critical
            }
          }
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
