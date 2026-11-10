use std::env;
use std::os::unix::process::CommandExt;
use std::process::{Command, ExitCode};

use spotify_debloat_check::{apply_script, ensure_patched, home_directory};

fn main() -> ExitCode {
    let Some(home) = home_directory() else {
        return ExitCode::FAILURE;
    };
    let arguments: Vec<String> = env::args().skip(1).collect();

    if arguments.first().map(String::as_str) == Some("--update") {
        let updated = Command::new("spotify-launcher")
            .args(["--check-update", "--no-exec"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        if !updated {
            return ExitCode::FAILURE;
        }
        let error = Command::new(apply_script(&home)).exec();
        eprintln!("spotify-lite: {error}");
        return ExitCode::FAILURE;
    }

    if !ensure_patched(&home) {
        eprintln!("spotify-debloat: patch failed, launching anyway");
    }
    let error = Command::new("spotify-launcher").arg("--skip-update").args(&arguments).exec();
    eprintln!("spotify-lite: {error}");
    ExitCode::FAILURE
}
