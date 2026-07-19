import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AiOutputEvent, AiCompleteEvent, AiErrorEvent } from "./types";
import type { AiRequest } from "./types";
import {
  parseAnthropicSSE,
  parseOpenAISSE,
  createAnthropicStreamState,
  createOpenAIStreamState,
} from "./sse-parser";
import { useAiChatStore } from "@/stores/ai-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("ai-one-shot");

export interface OneShotOptions {
  prompt: string;
  systemPrompt?: string;
  /** Called with the accumulated text on every streamed chunk. */
  onDelta?: (accumulated: string) => void;
  timeoutMs?: number;
}

export interface OneShotHandle {
  /** Resolves with the full response text; rejects on provider error. */
  result: Promise<string>;
  cancel: () => void;
}

/**
 * Run a single tool-free AI request outside the chat transcript.
 *
 * Uses a synthetic tab id so the shared `ai-output` / `ai-complete` events
 * are ignored by the chat store (it only handles known streaming tabs) and
 * consumed here instead.
 */
export function runOneShotPrompt(options: OneShotOptions): OneShotHandle {
  const { prompt, systemPrompt, onDelta, timeoutMs = 90_000 } = options;
  const tabId = `oneshot-${crypto.randomUUID()}`;
  const projectPath = useDocumentStore.getState().projectRoot;
  const model = useAiChatStore.getState().selectedModel;

  const unlisteners: UnlistenFn[] = [];
  let settled = false;

  const cleanup = () => {
    for (const unlisten of unlisteners) unlisten();
    unlisteners.length = 0;
  };

  let cancelFn: () => void = () => {};

  const result = new Promise<string>((resolve, reject) => {
    if (!projectPath) {
      reject(new Error("No project open"));
      return;
    }

    const anthropicState = createAnthropicStreamState();
    const openaiState = createOpenAIStreamState();
    // Streamed deltas (live display) vs complete blocks (authoritative result)
    let deltaText = "";
    const finalTexts: string[] = [];

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        invoke("ai_cancel", { tabId }).catch(() => {});
        reject(new Error("AI request timed out"));
      });
    }, timeoutMs);

    cancelFn = () =>
      settle(() => {
        invoke("ai_cancel", { tabId }).catch(() => {});
        reject(new Error("Cancelled"));
      });

    const handleOutput = (event: { payload: AiOutputEvent }) => {
      const { tab_id, data, provider } = event.payload;
      if (tab_id !== tabId) return;
      const parsed =
        provider === "anthropic"
          ? parseAnthropicSSE(data, anthropicState)
          : provider === "openai"
            ? parseOpenAISSE(data, openaiState)
            : [];
      for (const msg of parsed) {
        if (msg.type !== "assistant") continue;
        for (const block of msg.message?.content ?? []) {
          if (block.type !== "text") continue;
          if (msg.subtype === "delta") {
            deltaText += block.text ?? "";
            onDelta?.(finalTexts.join("") + deltaText);
          } else {
            // Complete block replaces its streamed deltas
            finalTexts.push(block.text ?? "");
            deltaText = "";
          }
        }
      }
    };

    const handleComplete = (event: { payload: AiCompleteEvent }) => {
      if (event.payload.tab_id !== tabId) return;
      settle(() => {
        const text = finalTexts.join("") || deltaText;
        if (event.payload.success && text) {
          resolve(text);
        } else if (event.payload.success) {
          reject(new Error("AI returned an empty response"));
        } else {
          reject(new Error("AI request failed"));
        }
      });
    };

    const handleError = (event: { payload: AiErrorEvent }) => {
      if (event.payload.tab_id !== tabId) return;
      log.error(`[${tabId}] ${event.payload.data}`);
      settle(() => reject(new Error(event.payload.data)));
    };

    const register = async (promise: Promise<UnlistenFn>) => {
      const unlisten = await promise;
      // Registration resolved after settle — release immediately
      if (settled) unlisten();
      else unlisteners.push(unlisten);
    };

    Promise.all([
      register(listen<AiOutputEvent>("ai-output", handleOutput)),
      register(listen<AiCompleteEvent>("ai-complete", handleComplete)),
      register(listen<AiErrorEvent>("ai-error", handleError)),
    ])
      .then(() => {
        if (settled) return;
        const request: AiRequest = {
          tabId,
          projectPath,
          prompt,
          model,
          systemPrompt,
          messages: [],
        };
        return invoke("ai_execute", { request });
      })
      .catch((err) => {
        settle(() =>
          reject(err instanceof Error ? err : new Error(String(err))),
        );
      });
  });

  // Swallow unhandled rejection when callers only use onDelta + cancel
  result.catch(() => {});

  return { result, cancel: () => cancelFn() };
}
