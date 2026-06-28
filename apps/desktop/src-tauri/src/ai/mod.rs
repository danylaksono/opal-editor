pub mod providers;
pub mod registry;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

// ─── Message Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<AiContentBlock>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<AiToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AiContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
    #[serde(rename = "thinking")]
    Thinking {
        thinking: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        signature: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: AiFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiFunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AiUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

// ─── Request Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRequest {
    pub tab_id: String,
    pub project_path: String,
    pub prompt: String,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub messages: Vec<AiMessage>,
    pub context: Option<AiContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiContext {
    pub scope: String,
    pub files: Vec<String>,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostics: Option<Vec<AiDiagnostic>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDiagnostic {
    pub file: String,
    pub line: u32,
    pub col: u32,
    pub message: String,
    pub severity: String,
}

// ─── Provider Status ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderInfo {
    pub id: String,
    pub name: String,
    pub ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// ─── Session Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSessionInfo {
    pub session_id: String,
    pub title: String,
    pub last_modified: i64,
}

// ─── Event Payloads ───

#[derive(Clone, Serialize)]
pub struct AiOutputEvent {
    pub tab_id: String,
    pub data: String,
    pub provider: String,
}

#[derive(Clone, Serialize)]
pub struct AiCompleteEvent {
    pub tab_id: String,
    pub success: bool,
    pub provider: String,
}

#[derive(Clone, Serialize)]
pub struct AiErrorEvent {
    pub tab_id: String,
    pub data: String,
    pub provider: String,
}

// ─── Provider Trait ───

#[async_trait]
#[allow(dead_code)]
pub trait AiProvider: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;

    async fn check_status(&self) -> AiProviderInfo;

    async fn execute(
        &self,
        window: WebviewWindow,
        request: AiRequest,
    ) -> Result<(), String>;

    async fn cancel(
        &self,
        window: &WebviewWindow,
        tab_id: &str,
    ) -> Result<(), String>;

    async fn list_sessions(
        &self,
        project_path: &str,
    ) -> Result<Vec<AiSessionInfo>, String>;

    async fn load_session(
        &self,
        project_path: &str,
        session_id: &str,
    ) -> Result<Vec<AiMessage>, String>;
}
