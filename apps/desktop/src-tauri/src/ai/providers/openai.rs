use async_trait::async_trait;
use tauri::{Emitter, WebviewWindow};

use super::super::{
    AiCompleteEvent, AiErrorEvent, AiMessage, AiOutputEvent, AiProvider, AiProviderInfo,
    AiRequest, AiSessionInfo,
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
        let model = request.model.unwrap_or_else(|| "gpt-4o".to_string());

        let mut messages: Vec<serde_json::Value> = Vec::new();

        // Add system prompt
        let system = request
            .system_prompt
            .unwrap_or_else(default_latex_system_prompt);
        messages.push(serde_json::json!({
            "role": "system",
            "content": system
        }));

        // Add conversation history
        for msg in &request.messages {
            if let Some(json) = openai_message_to_json(msg) {
                messages.push(json);
            }
        }

        // Add the new user prompt
        messages.push(serde_json::json!({
            "role": "user",
            "content": request.prompt
        }));

        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
            "max_tokens": 8192,
        });

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
        Ok(())
    }

    async fn list_sessions(
        &self,
        _project_path: &str,
    ) -> Result<Vec<AiSessionInfo>, String> {
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

fn openai_message_to_json(msg: &AiMessage) -> Option<serde_json::Value> {
    let role = match msg.role.as_str() {
        "user" | "assistant" | "system" => msg.role.as_str(),
        "tool" => "tool",
        _ => return None,
    };

    let content = msg.content.as_ref()?;
    let mut text_parts: Vec<String> = Vec::new();

    for block in content {
        match block {
            super::super::AiContentBlock::Text { text } => {
                text_parts.push(text.clone());
            }
            _ => {}
        }
    }

    let content_str = text_parts.join("\n");
    let mut json = serde_json::json!({
        "role": role,
        "content": content_str
    });

    if let Some(ref name) = msg.name {
        json["name"] = serde_json::json!(name);
    }

    if let Some(ref tool_calls) = msg.tool_calls {
        let calls: Vec<serde_json::Value> = tool_calls
            .iter()
            .map(|tc| {
                serde_json::json!({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                })
            })
            .collect();
        json["tool_calls"] = serde_json::json!(calls);
    }

    if let Some(ref tool_call_id) = msg.tool_call_id {
        json["tool_call_id"] = serde_json::json!(tool_call_id);
    }

    Some(json)
}

fn default_latex_system_prompt() -> String {
    concat!(
        "You are an AI assistant integrated into a LaTeX document editor. ",
        "Follow these rules strictly:\n",
        "1. PLANNING FIRST: Before making changes, create a step-by-step plan.\n",
        "2. INCREMENTAL EDITS: Make small, targeted changes — one step at a time.\n",
        "3. PRESERVE EXISTING CONTENT: Keep existing preamble, packages, and structure.\n",
        "4. LaTeX BEST PRACTICES: Use proper sectioning, citations, cross-references.\n",
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
