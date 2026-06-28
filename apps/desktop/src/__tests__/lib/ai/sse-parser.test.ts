import { describe, it, expect } from "vitest";
import {
  parseAnthropicSSE,
  parseOpenAISSE,
  createAnthropicStreamState,
  createOpenAIStreamState,
} from "@/lib/ai/sse-parser";

describe("parseAnthropicSSE", () => {
  it("parses text deltas into incremental messages", () => {
    const state = createAnthropicStreamState();

    // message_start
    const start = parseAnthropicSSE(
      JSON.stringify({
        type: "message_start",
        message: {
          model: "claude-sonnet-4-20250514",
          usage: { input_tokens: 50 },
        },
      }),
      state,
    );
    expect(start).toEqual([]);

    // content_block_start (text)
    const blockStart = parseAnthropicSSE(
      JSON.stringify({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      state,
    );
    expect(blockStart).toEqual([]);

    // content_block_delta
    const delta = parseAnthropicSSE(
      JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      }),
      state,
    );
    expect(delta).toHaveLength(1);
    expect(delta[0].type).toBe("assistant");
    expect(delta[0].message?.content?.[0]).toEqual({
      type: "text",
      text: "Hello",
    });

    // Another delta
    const delta2 = parseAnthropicSSE(
      JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: " world" },
      }),
      state,
    );
    expect(delta2[0].message?.content?.[0].text).toBe(" world");

    // content_block_stop
    const stop = parseAnthropicSSE(
      JSON.stringify({ type: "content_block_stop", index: 0 }),
      state,
    );
    expect(stop).toHaveLength(1);
    expect(stop[0].type).toBe("assistant");
    expect(stop[0].message?.content?.[0]).toEqual({
      type: "text",
      text: "Hello world",
    });
  });

  it("parses tool use blocks", () => {
    const state = createAnthropicStreamState();

    parseAnthropicSSE(
      JSON.stringify({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "tool_001", name: "read_file" },
      }),
      state,
    );

    parseAnthropicSSE(
      JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"file_path":"main' },
      }),
      state,
    );

    parseAnthropicSSE(
      JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '.tex"}' },
      }),
      state,
    );

    const stop = parseAnthropicSSE(
      JSON.stringify({ type: "content_block_stop", index: 0 }),
      state,
    );
    expect(stop).toHaveLength(1);
    expect(stop[0].message?.content?.[0]).toMatchObject({
      type: "tool_use",
      id: "tool_001",
      name: "read_file",
      input: { file_path: "main.tex" },
    });
  });

  it("handles usage in message_delta", () => {
    const state = createAnthropicStreamState();

    parseAnthropicSSE(
      JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 120 },
      }),
      state,
    );

    expect(state.outputTokens).toBe(120);
    expect(state.stopReason).toBe("end_turn");
  });

  it("ignores unknown event types", () => {
    const state = createAnthropicStreamState();
    const result = parseAnthropicSSE(JSON.stringify({ type: "ping" }), state);
    expect(result).toEqual([]);
  });
});

describe("parseOpenAISSE", () => {
  it("parses text deltas", () => {
    const state = createOpenAIStreamState();

    const delta = parseOpenAISSE(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion.chunk",
        choices: [
          { index: 0, delta: { content: "Hello" }, finish_reason: null },
        ],
      }),
      state,
    );
    expect(delta).toHaveLength(1);
    expect(delta[0].message?.content?.[0]).toEqual({
      type: "text",
      text: "Hello",
    });

    const delta2 = parseOpenAISSE(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion.chunk",
        choices: [
          { index: 0, delta: { content: " world" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      state,
    );
    expect(delta2[0].message?.content?.[0].text).toBe(" world");
  });

  it("handles [DONE] gracefully", () => {
    const state = createOpenAIStreamState();
    const result = parseOpenAISSE("[DONE]", state);
    expect(result).toEqual([]);
  });

  it("parses tool calls", () => {
    const state = createOpenAIStreamState();

    const tc1 = parseOpenAISSE(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_001",
                  function: { name: "read", arguments: "" },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      state,
    );
    expect(tc1).toEqual([]);

    const tc2 = parseOpenAISSE(
      JSON.stringify({
        id: "chatcmpl-123",
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"file":"main.tex"}' },
                },
              ],
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      state,
    );
    // Should contain tool_use block
    const toolBlocks = tc2.filter((m) =>
      m.message?.content?.some((b) => b.type === "tool_use"),
    );
    expect(toolBlocks).toHaveLength(1);
    expect(toolBlocks[0].message?.content?.[0]).toMatchObject({
      type: "tool_use",
      id: "call_001",
      name: "read",
      input: { file: "main.tex" },
    });
  });
});
