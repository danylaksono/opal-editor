import type {
  ClaudeStreamMessage,
  ContentBlock,
} from "@/stores/claude-chat-store";

/**
 * Parse an SSE event data line from the Anthropic Messages API
 * into ClaudeStreamMessage format.
 */
export function parseAnthropicSSE(
  data: string,
  state: AnthropicStreamState,
): ClaudeStreamMessage[] {
  let json: any;
  try {
    json = JSON.parse(data);
  } catch {
    return [];
  }

  const type = json.type as string;
  const messages: ClaudeStreamMessage[] = [];

  switch (type) {
    case "message_start":
      state.model = json.message?.model;
      if (json.message?.usage) {
        state.inputTokens = json.message.usage.input_tokens;
      }
      return [];

    case "content_block_start": {
      const block = json.content_block;
      if (!block) return [];
      if (block.type === "text") {
        state.currentTextBlock = { type: "text", text: "" } as ContentBlock;
      } else if (block.type === "tool_use") {
        state.currentTextBlock = {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: {},
        } as ContentBlock;
      }
      return [];
    }

    case "content_block_delta": {
      const delta = json.delta;
      if (!delta || !state.currentTextBlock) return [];
      if (
        delta.type === "text_delta" &&
        state.currentTextBlock.type === "text"
      ) {
        state.currentTextBlock.text += delta.text;
        // Emit incremental text
        messages.push({
          type: "assistant",
          model: state.model,
          message: {
            content: [{ type: "text", text: delta.text }],
          },
        });
      } else if (
        delta.type === "input_json_delta" &&
        state.currentTextBlock.type === "tool_use"
      ) {
        // Accumulate tool input JSON (not emitted incrementally)
        state.pendingToolInput += delta.partial_json;
      }
      return messages;
    }

    case "content_block_stop": {
      if (!state.currentTextBlock) return [];
      const block = state.currentTextBlock;

      if (block.type === "tool_use") {
        // Try to parse accumulated tool input
        if (state.pendingToolInput) {
          try {
            block.input = JSON.parse(state.pendingToolInput);
          } catch {
            // partial — will be completed in next deltas
          }
        }
        state.pendingToolInput = "";
      }

      // Emit the complete block
      const content = [block];
      if (state.outputTokens > 0) {
        messages.push({
          type: "assistant",
          model: state.model,
          message: {
            content,
            usage: {
              input_tokens: state.inputTokens,
              output_tokens: state.outputTokens,
            },
          },
        });
      } else {
        messages.push({
          type: "assistant",
          model: state.model,
          message: { content },
        });
      }

      state.currentTextBlock = null;
      return messages;
    }

    case "message_delta": {
      if (json.delta?.stop_reason) {
        state.stopReason = json.delta.stop_reason;
      }
      if (json.usage) {
        state.outputTokens = json.usage.output_tokens;
      }
      return [];
    }

    case "message_stop":
      return [];

    default:
      return [];
  }
}

/**
 * Parse an SSE event data line from the OpenAI Chat Completions API
 * into ClaudeStreamMessage format.
 */
export function parseOpenAISSE(
  data: string,
  state: OpenAIStreamState,
): ClaudeStreamMessage[] {
  if (data === "[DONE]") {
    return [];
  }

  let json: any;
  try {
    json = JSON.parse(data);
  } catch {
    return [];
  }

  const choice = json.choices?.[0];
  if (!choice) return [];

  const delta = choice.delta;
  if (!delta) {
    // Could be a usage-only chunk
    if (json.usage) {
      state.completionTokens = json.usage.completion_tokens ?? 0;
      state.promptTokens = json.usage.prompt_tokens ?? 0;
    }
    return [];
  }

  const messages: ClaudeStreamMessage[] = [];

  // Handle text content
  if (delta.content) {
    state.accumulatedText += delta.content;
    messages.push({
      type: "assistant",
      message: {
        content: [{ type: "text", text: delta.content }],
      },
    });
  }

  // Handle tool calls
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      if (!state.toolCalls[idx]) {
        state.toolCalls[idx] = {
          id: tc.id ?? "",
          name: "",
          arguments: "",
        };
      }
      if (tc.id) state.toolCalls[idx].id = tc.id;
      if (tc.function?.name) state.toolCalls[idx].name += tc.function.name;
      if (tc.function?.arguments)
        state.toolCalls[idx].arguments += tc.function.arguments;
    }
  }

  // Handle finish
  if (choice.finish_reason === "stop" && state.toolCalls.length > 0) {
    // Emit tool calls
    const toolBlocks: ContentBlock[] = state.toolCalls.map((tc) => ({
      type: "tool_use",
      id: tc.id,
      name: tc.name,
      input: (() => {
        try {
          return JSON.parse(tc.arguments);
        } catch {
          return {};
        }
      })(),
    }));
    messages.push({
      type: "assistant",
      message: { content: toolBlocks },
    });
    state.toolCalls = [];
  }

  if (choice.finish_reason && state.completionTokens > 0) {
    messages.push({
      type: "system",
      subtype: "usage",
      usage: {
        input_tokens: state.promptTokens,
        output_tokens: state.completionTokens,
      },
    } as ClaudeStreamMessage);
  }

  return messages;
}

// ─── Stream State ───

export interface AnthropicStreamState {
  model?: string;
  inputTokens: number;
  outputTokens: number;
  stopReason?: string;
  currentTextBlock: ContentBlock | null;
  pendingToolInput: string;
}

export function createAnthropicStreamState(): AnthropicStreamState {
  return {
    inputTokens: 0,
    outputTokens: 0,
    currentTextBlock: null,
    pendingToolInput: "",
  };
}

export interface OpenAIStreamState {
  promptTokens: number;
  completionTokens: number;
  accumulatedText: string;
  toolCalls: {
    id: string;
    name: string;
    arguments: string;
  }[];
}

export function createOpenAIStreamState(): OpenAIStreamState {
  return {
    promptTokens: 0,
    completionTokens: 0,
    accumulatedText: "",
    toolCalls: [],
  };
}
