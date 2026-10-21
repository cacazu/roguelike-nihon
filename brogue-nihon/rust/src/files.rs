//! Brogue-owned save files. Browser persistence never accepts arbitrary paths.
pub const MAX_CONTAINER_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_FILES: usize = 64;
pub const MAX_FILE_BYTES: usize = 8 * 1024 * 1024;
pub fn validate_capacity(container_bytes: usize, file_count: usize) -> Result<(), &'static str> {
    if container_bytes > MAX_CONTAINER_BYTES {
        return Err("Saved files exceed the storage limit");
    }
    if file_count > MAX_FILES {
        return Err("Too many Brogue saved files");
    }
    Ok(())
}
pub fn validate_file_size(bytes: usize) -> Result<(), &'static str> {
    if bytes > MAX_FILE_BYTES {
        return Err("A Brogue save file exceeds the storage limit");
    }
    Ok(())
}
fn basename(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && !name.contains(['/', '\\', '\0'])
        && name != "."
        && name != ".."
}
pub fn saved_game_filename(name: &str) -> bool {
    basename(name) && name.ends_with(".broguesave")
}
pub fn persisted_filename(name: &str) -> bool {
    basename(name)
        && (name.ends_with(".broguesave")
            || name.ends_with(".broguerec")
            || [
                "BrogueHighScores.txt",
                "BrogueRunHistory.txt",
                "RapidBrogueHighScores.txt",
                "RapidBrogueRunHistory.txt",
                "BulletBrogueHighScores.txt",
                "BulletBrogueRunHistory.txt",
            ]
            .contains(&name))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistence_and_restore_share_capacity_boundaries() {
        assert!(validate_capacity(MAX_CONTAINER_BYTES, MAX_FILES).is_ok());
        assert!(validate_capacity(MAX_CONTAINER_BYTES + 1, 0).is_err());
        assert!(validate_capacity(0, MAX_FILES + 1).is_err());
        assert!(validate_file_size(MAX_FILE_BYTES).is_ok());
        assert!(validate_file_size(MAX_FILE_BYTES + 1).is_err());
    }
    #[test]
    fn every_variant_retains_scores_and_history_without_accepting_arbitrary_text() {
        for variant in ["Brogue", "RapidBrogue", "BulletBrogue"] {
            for kind in ["HighScores", "RunHistory"] {
                let name = format!("{variant}{kind}.txt");
                assert!(persisted_filename(&name));
                assert!(!saved_game_filename(&name));
            }
        }
        for name in [
            "arbitrary.txt",
            "../BrogueRunHistory.txt",
            "/BrogueHighScores.txt",
            "a\\file.broguesave",
            "x\0.broguerec",
        ] {
            assert!(!persisted_filename(name));
        }
        assert!(persisted_filename("LastGame.broguesave"));
        assert!(persisted_filename("run.broguerec"));
        assert!(saved_game_filename("LastGame.broguesave"));
    }
}
