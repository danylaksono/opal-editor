use async_trait::async_trait;
use futures_util::StreamExt;
use tauri::{Emitter, WebviewWindow};

use super::super::{
    AiCompleteEvent, AiMessage, AiOutputEvent, AiProvider, AiProviderInfo, AiRequest,
    AiSessionInfo,
};

pub struct OpenAiProvider;

#[async_trait]
impl AiProvider for OpenAiProvider {
    fn id(&self) -> &str {
        "openai"
    }

    fn name(&self) -> &str {
        "OpenAI API"
    }

    async fn check_status(&self) -> AiProviderInfo {
        let has_key = std::env::var("OPENAI_API_KEY").is_ok();
        AiProviderInfo {
            id: "openai".to_string(),
            name: "OpenAI API".to_string(),
            ready: has_key,
            message: if has_key {
                Some("OPENAI_API_KEY is set".to_string())
            } else {
                Some("Set OPENAI_API_KEY to enable".to_string())
            },
        }
    }

    async fn execute(
        &self,
        window: WebviewWindow,
        request: AiRequest,
    ) -> Result<(), String> {
        let provider_id = self.id().to_string();
        let tab_id = request.tab_id.clone();
        let api_key = std::env::var("OPENAI_API_KEY")
            .map_err(|_| "OPENAI_API_KEY not set".to_string())?;

        let base_url = std::env::var("OPENAI_BASE_URL")
            .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());
        let model = request.model.unwrap_or_else(|| "gpt-5.1".to_string());

        let mut messages: Vec<serde_json::Value> = Vec::new();

        let system = request
            .system_prompt
            .unwrap_or_else(super::default_latex_system_prompt);
        messages.push(serde_json::json!({
            "role": "system",
            "content": system
        }));

        for msg in &request.messages {
            messages.extend(openai_messages_to_json(msg));
        }

        // Empty prompt = tool-loop continuation; the tool results are already
        // the trailing messages
        if !request.prompt.is_empty() {
            messages.push(serde_json::json!({
                "role": "user",
                "content": request.prompt
            }));
        }

        // Note: no max_tokens — newer OpenAI models reject it (they use
        // max_completion_tokens), and omitting it works across all
        // OpenAI-compatible endpoints (OpenRouter, Ollama, etc.).
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });

        if let Some(tools) = &request.tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::json!(tools
                    .iter()
                    .map(|t| serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.input_schema,
                        }
                    }))
                    .collect::<Vec<_>>());
            }
        }

        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/chat/completions", base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error {}: {}", status, text));
        }

        let provider_clone = provider_id.clone();
        let win = window.clone();
        let tid = tab_id.clone();

        tokio::spawn(async move {
            let mut stream = response.bytes_stream();
            let mut buf = String::new();
            let mut success = true;

            while let Some(chunk) = stream.next().await {
                let chunk = match chunk {
                    Ok(c) => c,
                    Err(_) => {
                        success = false;
                        break;
                    }
                };
                buf.push_str(&String::from_utf8_lossy(&chunk));

                // Emit each complete SSE data line as it arrives
                while let Some(pos) = buf.find('\n') {
                    let line = buf[..pos].trim().to_string();
                    buf.drain(..=pos);
                    if line.is_empty() || !line.starts_with("data: ") {
                        continue;
                    }
                    let data = &line[6..];
                    if data == "[DONE]" {
                        continue;
                    }
                    let _ = win.emit(
                        "ai-output",
                        AiOutputEvent {
                            tab_id: tid.clone(),
                            data: data.to_string(),
                            provider: provider_clone.clone(),
                        },
                    );
                }
            }

            let _ = win.emit(
                "ai-complete",
                AiCompleteEvent {
                    tab_id: tid.clone(),
                    success,
                    provider: provider_clone,
                },
            );
        });

        Ok(())
    }

    async fn cancel(&self, _window: &WebviewWindow, _tab_id: &str) -> Result<(), String> {
        Ok(())
    }

    async fn list_sessions(&self, _project_path: &str) -> Result<Vec<AiSessionInfo>, String> {
        Ok(Vec::new())
    }

    async fn load_session(
        &self,
        _project_path: &str,
        _session_id: &str,
    ) -> Result<Vec<AiMessage>, String> {
        Err("Session loading not supported for API providers".to_string())
    }
}

/// Convert a provider-neutral message (Anthropic-style content blocks) into
/// OpenAI chat-completions messages. One input message can expand to several
/// outputs: tool_result blocks become separate `role: "tool"` messages, and
/// assistant tool_use blocks become `tool_calls` on the assistant message.
fn openai_messages_to_json(msg: &AiMessage) -> Vec<serde_json::Value> {
    use super::super::AiContentBlock;

    let Some(content) = msg.content.as_ref() else {
        return Vec::new();
    };

    match msg.role.as_str() {
        "assistant" => {
            let mut text_parts: Vec<String> = Vec::new();
            let mut tool_calls: Vec<serde_json::Value> = Vec::new();
            for block in content {
                match block {
                    AiContentBlock::Text { text } => text_parts.push(text.clone()),
                    AiContentBlock::ToolUse { id, name, input } => {
                        tool_calls.push(serde_json::json!({
                            "id": id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": input.to_string(),
                            }
                        }));
                    }
                    _ => {}
                }
            }
            if text_parts.is_empty() && tool_calls.is_empty() {
                return Vec::new();
            }
            let mut json = serde_json::json!({
                "role": "assistant",
                "content": if text_parts.is_empty() {
                    serde_json::Value::Null
                } else {
                    serde_json::Value::String(text_parts.join("\n"))
                },
            });
            if !tool_calls.is_empty() {
                json["tool_calls"] = serde_json::json!(tool_calls);
            }
            vec![json]
        }
        "user" => {
            let mut out: Vec<serde_json::Value> = Vec::new();
            let mut text_parts: Vec<String> = Vec::new();
            for block in content {
                match block {
                    AiContentBlock::Text { text } => text_parts.push(text.clone()),
                    AiContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        ..
                    } => {
                        // Tool results answer the preceding assistant
                        // tool_calls, so they must come first
                        out.push(serde_json::json!({
                            "role": "tool",
                            "tool_call_id": tool_use_id,
                            "content": content,
                        }));
                    }
                    _ => {}
                }
            }
            if !text_parts.is_empty() {
                out.push(serde_json::json!({
                    "role": "user",
                    "content": text_parts.join("\n"),
                }));
            }
            out
        }
        _ => Vec::new(),
    }
}
