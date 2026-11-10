use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn home_directory() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

pub fn apply_script(home: &Path) -> PathBuf {
    home.join(".local/share/spotify-debloat/apply.sh")
}

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

pub fn client_patched(home: &Path) -> bool {
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

pub fn ensure_patched(home: &Path) -> bool {
    if client_patched(home) {
        return true;
    }
    Command::new(apply_script(home))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::read_json_string;

    #[test]
    fn reads_plain_and_escaped_values() {
        assert_eq!(read_json_string(r#"{"version": "1.2.3"}"#, "version").as_deref(), Some("1.2.3"));
        assert_eq!(read_json_string(r#"{"a":1,"version":"x\"y"}"#, "version").as_deref(), Some("x\"y"));
        assert_eq!(read_json_string(r#"{"other":"1"}"#, "version"), None);
        assert_eq!(read_json_string(r#"{"version": 5}"#, "version"), None);
    }
}
