use async_trait::async_trait;
use tauri::{Emitter, WebviewWindow};

use super::super::{
    AiCompleteEvent, AiErrorEvent, AiMessage, AiOutputEvent, AiProvider, AiProviderInfo,
    AiRequest, AiSessionInfo,
};

pub struct AnthropicProvider;

#[async_trait]
impl AiProvider for AnthropicProvider {
    fn id(&self) -> &str {
        "anthropic"
    }

    fn name(&self) -> &str {
        "Anthropic API"
    }

    async fn check_status(&self) -> AiProviderInfo {
        let has_key = std::env::var("ANTHROPIC_API_KEY").is_ok();
        AiProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic API".to_string(),
            ready: has_key,
            message: if has_key {
                Some("ANTHROPIC_API_KEY is set".to_string())
            } else {
                Some("Set ANTHROPIC_API_KEY to enable".to_string())
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
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| "ANTHROPIC_API_KEY not set".to_string())?;

        let model = request.model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string());

        // Build messages from conversation history + new prompt
        let mut messages: Vec<serde_json::Value> = request
            .messages
            .iter()
            .filter_map(|m| anthropic_message_to_json(m))
            .collect();
        messages.push(serde_json::json!({
            "role": "user",
            "content": request.prompt
        }));

        let body = serde_json::json!({
            "model": model,
            "max_tokens": 8192,
            "messages": messages,
            "stream": true,
            "system": request.system_prompt.unwrap_or_else(|| default_latex_system_prompt()),
        });

        let client = reqwest::Client::new();
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", "output-128k-2025-02-19")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error {}: {}", status, text));
        }

        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;

        let provider_clone = provider_id.clone();
        let win = window.clone();
        let tid = tab_id.clone();

        tokio::spawn(async move {
            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(bytes) => {
                        let text = String::from_utf8_lossy(&bytes);
                        for line in text.lines() {
                            let line = line.trim();
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
                    Err(e) => {
                        let _ = win.emit(
                            "ai-error",
                            AiErrorEvent {
                                tab_id: tid.clone(),
                                data: format!("Stream error: {}", e),
                                provider: provider_clone.clone(),
                            },
                        );
                        break;
                    }
                }
            }
            let _ = win.emit(
                "ai-complete",
                AiCompleteEvent {
                    tab_id: tid.clone(),
                    success: true,
                    provider: provider_clone,
                },
            );
        });

        Ok(())
    }

    async fn cancel(
        &self,
        _window: &WebviewWindow,
        _tab_id: &str,
    ) -> Result<(), String> {
        // HTTP-based providers can't cancel mid-stream easily.
        // The frontend will simply ignore further events.
        Ok(())
    }

    async fn list_sessions(
        &self,
        _project_path: &str,
    ) -> Result<Vec<AiSessionInfo>, String> {
        // API-based providers don't have persistent sessions on disk
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

fn anthropic_message_to_json(msg: &AiMessage) -> Option<serde_json::Value> {
    let role = match msg.role.as_str() {
        "user" | "assistant" => msg.role.as_str(),
        _ => return None,
    };

    let content = msg.content.as_ref()?;
    let mut blocks: Vec<serde_json::Value> = Vec::new();

    for block in content {
        match block {
            super::super::AiContentBlock::Text { text } => {
                blocks.push(serde_json::json!({"type": "text", "text": text}));
            }
            super::super::AiContentBlock::ToolUse { id, name, input } => {
                blocks.push(serde_json::json!({
                    "type": "tool_use",
                    "id": id,
                    "name": name,
                    "input": input
                }));
            }
            super::super::AiContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                blocks.push(serde_json::json!({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": content,
                    "is_error": is_error.unwrap_or(false)
                }));
            }
            _ => {}
        }
    }

    Some(serde_json::json!({
        "role": role,
        "content": blocks
    }))
}

fn default_latex_system_prompt() -> String {
    concat!(
        "You are an AI assistant integrated into a LaTeX document editor. ",
        "Follow these rules strictly:\n",
        "1. PLANNING FIRST: Before making changes, create a step-by-step plan. ",
        "Break large tasks into small, incremental steps.\n",
        "2. INCREMENTAL EDITS: Make small, targeted changes — one step at a time. ",
        "NEVER rewrite an entire file at once.\n",
        "3. PRESERVE EXISTING CONTENT: Always read the file first. Keep the existing ",
        "preamble, packages, and structure intact.\n",
        "4. LaTeX BEST PRACTICES: Use proper sectioning, citations, cross-references, ",
        "and BibTeX for bibliographies.\n",
        "5. OUTPUT FORMAT: When editing files, use this format:\n",
        "   ```edit:path/to/file.tex\n",
        "   <<<<<<< SEARCH\n",
        "   old content\n",
        "   =======\n",
        "   new content\n",
        "   >>>>>>> REPLACE\n",
        "   ```"
    ).to_string()
}
