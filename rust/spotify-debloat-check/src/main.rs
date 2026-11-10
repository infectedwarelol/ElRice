use std::env;
use std::os::unix::process::CommandExt;
use std::process::{Command, ExitCode};

use spotify_debloat_check::{apply_script, client_patched, home_directory};

fn main() -> ExitCode {
    let Some(home) = home_directory() else {
        return ExitCode::FAILURE;
    };
    let arguments: Vec<String> = env::args().skip(1).collect();
    let mode = arguments.first().map(String::as_str).unwrap_or("auto");

    if mode == "auto" && client_patched(&home) {
        return ExitCode::SUCCESS;
    }

    let error = Command::new(apply_script(&home)).args(&arguments).exec();
    eprintln!("spotify-debloat-check: {error}");
    ExitCode::FAILURE
}
