use std::env;
use std::fs;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

fn read_json_string(document: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let after_key = &document[document.find(&needle)? + needle.len()..];
    let after_colon = after_key.trim_start().strip_prefix(':')?.trim_start();
    let body = after_colon.strip_prefix('"')?;
    let mut value = String::new();
    let mut characters = body.chars();
    while let Some(character) = characters.next() {
        match character {
            '"' => return Some(value),
            '\\' => value.push(characters.next()?),
            other => value.push(other),
        }
    }
    None
}

fn client_patched(home: &Path) -> bool {
    let client_directory = home.join(".local/share/spotify-launcher/install/usr/share/spotify");
    let state_file = home.join(".local/share/spotify-launcher/state.json");
    let stamp_file = home.join(".local/share/spotify-debloat/patched.stamp");

    let Ok(state) = fs::read_to_string(&state_file) else {
        return false;
    };
    let Some(client_version) = read_json_string(&state, "version") else {
        return false;
    };
    let Ok(stamp) = fs::read_to_string(&stamp_file) else {
        return false;
    };
    stamp.strip_suffix('\n').unwrap_or(&stamp) == client_version
        && !client_directory.join("Apps/xpui.spa").exists()
        && client_directory.join("Apps/xpui/index.html").is_file()
}

fn main() -> ExitCode {
    let Some(home) = env::var_os("HOME").map(PathBuf::from) else {
        return ExitCode::FAILURE;
    };
    let arguments: Vec<String> = env::args().skip(1).collect();
    let mode = arguments.first().map(String::as_str).unwrap_or("auto");

    if mode == "auto" && client_patched(&home) {
        return ExitCode::SUCCESS;
    }

    let script = home.join(".local/share/spotify-debloat/apply.sh");
    let error = Command::new(script).args(&arguments).exec();
    eprintln!("spotify-debloat-check: {error}");
    ExitCode::FAILURE
}
