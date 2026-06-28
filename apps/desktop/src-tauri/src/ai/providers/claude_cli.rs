use async_trait::async_trait;
use tauri::{Emitter, Manager, WebviewWindow};

use crate::claude;
use crate::claude::ClaudeProcessState;

use super::super::{
    AiCompleteEvent, AiMessage, AiProvider, AiProviderInfo, AiRequest, AiSessionInfo,
};

pub struct ClaudeCliProvider;

#[async_trait]
impl AiProvider for ClaudeCliProvider {
    fn id(&self) -> &str {
        "claude-cli"
    }

    fn name(&self) -> &str {
        "Claude Code CLI"
    }

    async fn check_status(&self) -> AiProviderInfo {
        match claude::check_claude_status().await {
            Ok(status) => {
                if status.installed && status.authenticated {
                    AiProviderInfo {
                        id: "claude-cli".to_string(),
                        name: "Claude Code CLI".to_string(),
                        ready: true,
                        message: status.version,
                    }
                } else if status.installed {
                    AiProviderInfo {
                        id: "claude-cli".to_string(),
                        name: "Claude Code CLI".to_string(),
                        ready: false,
                        message: Some("Claude CLI is installed but not authenticated".to_string()),
                    }
                } else if status.missing_git {
                    AiProviderInfo {
                        id: "claude-cli".to_string(),
                        name: "Claude Code CLI".to_string(),
                        ready: false,
                        message: Some("Git for Windows is required but not found".to_string()),
                    }
                } else {
                    AiProviderInfo {
                        id: "claude-cli".to_string(),
                        name: "Claude Code CLI".to_string(),
                        ready: false,
                        message: Some("Claude Code CLI is not installed".to_string()),
                    }
                }
            }
            Err(e) => AiProviderInfo {
                id: "claude-cli".to_string(),
                name: "Claude Code CLI".to_string(),
                ready: false,
                message: Some(e),
            },
        }
    }

    async fn execute(
        &self,
        window: WebviewWindow,
        request: AiRequest,
    ) -> Result<(), String> {
        let provider_id = self.id().to_string();

        let binary = claude::find_claude_binary_internal()?;
        let mut args = Vec::new();
        let stdin_payload = claude::build_prompt_args(&mut args, &request.prompt);
        if let Some(ref model) = request.model {
            args.push("--model".to_string());
            args.push(model.clone());
        }
        args.extend(claude::common_claude_args_internal());

        let cmd = claude::create_command_internal(
            &binary,
            args,
            &request.project_path,
            None,
        );

        spawn_provider_process(
            window,
            cmd,
            request.tab_id,
            stdin_payload,
            provider_id,
        )
        .await
    }

    async fn cancel(
        &self,
        window: &WebviewWindow,
        tab_id: &str,
    ) -> Result<(), String> {
        let window_label = window.label().to_string();
        let process_key = format!("{}:{}", window_label, tab_id);
        let claude_state = window.state::<ClaudeProcessState>();
        let mut processes = claude_state.processes.lock().await;
        if let Some(mut child) = processes.remove(&process_key) {
            let _ = child.kill().await;
            let _ = window.emit(
                "ai-complete",
                AiCompleteEvent {
                    tab_id: tab_id.to_string(),
                    success: false,
                    provider: self.id().to_string(),
                },
            );
        }
        Ok(())
    }

    async fn list_sessions(
        &self,
        project_path: &str,
    ) -> Result<Vec<AiSessionInfo>, String> {
        let sessions = claude::list_claude_sessions(project_path.to_string()).await?;
        Ok(sessions
            .into_iter()
            .map(|s| AiSessionInfo {
                session_id: s.session_id,
                title: s.title,
                last_modified: s.last_modified,
            })
            .collect())
    }

    async fn load_session(
        &self,
        project_path: &str,
        session_id: &str,
    ) -> Result<Vec<AiMessage>, String> {
        let raw = claude::load_session_history(
            project_path.to_string(),
            session_id.to_string(),
        )
        .await?;
        Ok(raw
            .into_iter()
            .filter_map(|v| serde_json::from_value(v).ok())
            .collect())
    }
}

async fn spawn_provider_process(
    window: WebviewWindow,
    cmd: tokio::process::Command,
    tab_id: String,
    stdin_payload: Option<String>,
    provider_id: String,
) -> Result<(), String> {
    claude::spawn_provider_process_internal(
        window,
        cmd,
        tab_id,
        stdin_payload,
        provider_id,
    )
    .await
}
