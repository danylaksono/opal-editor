// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Hidden CLI mode: when invoked with `--tectonic-compile <work_dir> <main_file>`,
    // run tectonic in this subprocess and exit. This isolates tectonic's global C state
    // so that a failed compilation doesn't poison the font cache for subsequent runs.
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 4 && args[1] == "--tectonic-compile" {
        let work_dir = std::path::Path::new(&args[2]);
        let main_file = &args[3];
        let single_pass = args.iter().any(|a| a == "--single-pass");
        match tectonic_editor_desktop_lib::tectonic_compile_subprocess(
            work_dir, main_file, single_pass,
        ) {
            Ok(()) => std::process::exit(0),
            Err(e) => {
                eprintln!("{}", e);
                std::process::exit(1);
            }
        }
    }

    tectonic_editor_desktop_lib::run()
}
