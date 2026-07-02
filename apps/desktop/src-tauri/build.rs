fn main() {
    // Embed ZOTERO credentials at compile time from .env file or system env
    let _ = dotenvy::dotenv(); // load .env if present (local dev)
    for key in ["ZOTERO_CONSUMER_KEY", "ZOTERO_CONSUMER_SECRET"] {
        if let Ok(val) = std::env::var(key) {
            println!("cargo:rustc-env={key}={val}");
        }
    }

    // On Linux, apply a version script to hide statically linked ICU/HarfBuzz/
    // FreeType/Fontconfig symbols from the dynamic symbol table.  This prevents
    // symbol collisions with the system copies loaded by WebKit2GTK (segfault).
    // See: https://github.com/danylaksono/tectonic-editor/issues/100
    #[cfg(target_os = "linux")]
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        println!(
            "cargo:rustc-link-arg=-Wl,--version-script={}/symbols.map",
            manifest_dir
        );
        println!("cargo:rerun-if-changed=symbols.map");
    }

    tauri_build::build()
}
