//! LanguageTool proxy: the check request runs in Rust because the WebView's
//! CSP `connect-src` allowlist cannot cover a user-configurable server URL.

#[tauri::command]
pub async fn languagetool_check(
    server_url: String,
    data: String,
    language: String,
    level: String,
) -> Result<String, String> {
    let base = server_url.trim().trim_end_matches('/');
    if !base.starts_with("http://") && !base.starts_with("https://") {
        return Err("The LanguageTool server URL must start with http:// or https://".into());
    }
    let url = format!("{}/v2/check", base);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let params = [
        ("data", data.as_str()),
        ("language", language.as_str()),
        ("level", level.as_str()),
    ];
    let response = client
        .post(&url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Could not reach the LanguageTool server: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read LanguageTool response: {}", e))?;
    if !status.is_success() {
        let detail: String = body.chars().take(200).collect();
        return Err(format!(
            "LanguageTool request failed ({}): {}",
            status, detail
        ));
    }
    Ok(body)
}
