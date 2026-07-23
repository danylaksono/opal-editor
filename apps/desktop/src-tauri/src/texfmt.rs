use std::path::PathBuf;
use tex_fmt::args::{Args, OptionArgs};
use tex_fmt::format::format_file;
use tex_fmt::logging::Log;

/// Format LaTeX source with tex-fmt. Wrapping is disabled on purpose: the
/// formatter then only normalizes indentation and environment layout, and
/// never reflows prose (which would create noisy diffs in version history).
#[tauri::command]
pub async fn format_latex(source: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let opt = OptionArgs {
            wrap: Some(false),
            ..OptionArgs::default()
        };
        let mut args = Args::from(opt);
        args.stdin = true;
        let mut logs = Vec::<Log>::new();
        args.resolve(&mut logs);

        let formatted = format_file(&source, &PathBuf::from("input.tex"), &args, &mut logs);

        if let Some(error) = logs
            .iter()
            .find(|log| log.level == log::Level::Error)
            .map(|log| log.message.clone())
        {
            return Err(format!("LaTeX could not be formatted: {error}"));
        }

        // tex-fmt joins lines with \r\n on Windows builds; the editor and the
        // on-disk files use \n throughout.
        Ok(formatted.replace("\r\n", "\n"))
    })
    .await
    .map_err(|error| format!("Format task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indents_environments_without_wrapping_prose() {
        let input = concat!(
            "\\begin{itemize}\n",
            "\\item one\n",
            "\\item a very long line that would be wrapped at eighty characters if wrapping were enabled here\n",
            "\\end{itemize}\n",
        );
        let output = tauri::async_runtime::block_on(format_latex(input.to_string())).unwrap();
        assert!(output.contains("\n  \\item one\n"));
        // No wrapping: the long line stays intact.
        assert!(output.contains("wrapping were enabled here\n"));
        assert!(!output.contains('\r'));
    }
}
