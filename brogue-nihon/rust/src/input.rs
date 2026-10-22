#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WaitKind {
    Command,
    Target,
    Item,
    Confirm,
    Text,
    Menu,
    Acknowledge,
    Title,
    AnyKey,
    Cursor,
    Playback,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Wait {
    pub kind: WaitKind,
    pub max_length: usize,
    pub cancel: bool,
    pub keys: Vec<i32>,
}
impl Default for Wait {
    fn default() -> Self {
        Self {
            kind: WaitKind::Command,
            max_length: 0,
            cancel: true,
            keys: vec![],
        }
    }
}
impl Wait {
    pub fn from_descriptor(values: &[i32]) -> Result<Self, &'static str> {
        if values.len() < 4
            || values[1] < 0
            || values[3] < 0
            || values.len() != 4 + values[3] as usize
        {
            return Err("Invalid Brogue input descriptor");
        }
        let kind = match values[0] {
            0 => WaitKind::Command,
            1 => WaitKind::Target,
            2 => WaitKind::Item,
            3 => WaitKind::Confirm,
            4 => WaitKind::Text,
            5 => WaitKind::Menu,
            6 => WaitKind::Acknowledge,
            7 => WaitKind::Title,
            8 => WaitKind::AnyKey,
            9 => WaitKind::Cursor,
            10 => WaitKind::Playback,
            _ => return Err("Unknown Brogue input wait"),
        };
        Ok(Self {
            kind,
            max_length: values[1] as usize,
            cancel: values[2] != 0,
            keys: values[4..].to_vec(),
        })
    }
    pub fn allows(&self, key: i32) -> bool {
        if key == 27 && self.cancel {
            return true;
        }
        match self.kind {
            WaitKind::Command | WaitKind::Cursor | WaitKind::AnyKey | WaitKind::Playback => true,
            WaitKind::Text => [10, 127].contains(&key) || self.keys.contains(&key),
            _ => self.keys.contains(&key),
        }
    }
}

/// SDL-compatible Brogue key values. Keyboard layout text is retained verbatim.
pub fn keycode(key: &str, shift: bool) -> Option<i32> {
    Some(match key {
        "ArrowUp" => 63232,
        "ArrowDown" => 63233,
        "ArrowLeft" => 63234,
        "ArrowRight" => 63235,
        "Enter" => 10,
        "Escape" => 27,
        "Backspace" | "Delete" => 127,
        "Tab" => {
            if shift {
                25
            } else {
                9
            }
        }
        "PageUp" => 63276,
        "PageDown" => 63277,
        "F2" => 2000,
        "PrintScreen" => 44,
        _ => {
            let mut chars = key.chars();
            let c = chars.next()?;
            if chars.next().is_some() {
                return None;
            }
            c as i32
        }
    })
}

/// Keypad identity is stable when Num Lock turns a digit into Home/End/etc.
/// Text fields retain their normal editing key semantics in the browser host.
pub fn physical_keycode(key: &str, code: &str, shift: bool) -> Option<i32> {
    if let Some(digit) = code.strip_prefix("Numpad").filter(|value| value.len() == 1) {
        let digit = digit.as_bytes()[0];
        if digit.is_ascii_digit() {
            return Some(i32::from(digit));
        }
    }
    keycode(key, shift)
}

pub type InputEvent = [i32; 5];
pub fn key_event(key: i32, control: bool, shift: bool) -> InputEvent {
    [0, key, 0, i32::from(control), i32::from(shift)]
}

/// Command buttons represent keyboard letters. Native SDL delivers the shifted
/// letter itself (e.g. T for rethrow), in addition to its modifier flags. Modal
/// buttons instead represent the literal candidates published by their owner.
pub fn touch_key_event(kind: WaitKind, key: i32, control: bool, shift: bool) -> InputEvent {
    // Match the existing physical-key path's native Shift-Tab alias. The
    // original cursor accepts both aliases; playback distinguishes them.
    let key = if shift
        && key == 9
        && matches!(
            kind,
            WaitKind::Command | WaitKind::Cursor | WaitKind::Target | WaitKind::Playback
        ) {
        25
    } else if matches!(kind, WaitKind::Command | WaitKind::Cursor)
        && shift
        && (97..=122).contains(&key)
    {
        key - 32
    } else {
        key
    };
    key_event(key, control, shift || (65..=90).contains(&key))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn physical_keys_preserve_shifted_commands_and_special_keys() {
        assert_eq!(keycode("S", true), Some('S' as i32));
        assert_eq!(keycode("ArrowUp", false), Some(63232));
        assert_eq!(keycode("Tab", true), Some(25));
        assert_eq!(keycode("Shift", true), None);
        assert_eq!(physical_keycode("End", "Numpad1", false), Some(49));
        assert_eq!(physical_keycode("Home", "Numpad7", true), Some(55));
        assert_eq!(keycode("End", false), None);
    }
    #[test]
    fn candidates_reject_out_of_context_keys() {
        let item = Wait::from_descriptor(&[2, 0, 1, 2, 97, 99]).unwrap();
        assert!(item.allows(97));
        assert!(!item.allows(98));
        assert!(!item.allows(83));
        assert!(item.allows(27));
        let confirm = Wait::from_descriptor(&[3, 0, 0, 2, 121, 110]).unwrap();
        assert!(confirm.allows(121));
        assert!(!confirm.allows(32));
        assert!(!confirm.allows(27));
        assert!(Wait::from_descriptor(&[2, 0, 1, 3, 97]).is_err());
        let text = Wait::from_descriptor(&[4, 12, 1, 3, 48, 49, 50]).unwrap();
        assert!(text.allows(48));
        assert!(text.allows(127));
        assert!(!text.allows('日' as i32));
        assert!(!text.allows('a' as i32));
    }
    #[test]
    fn touch_shift_uses_original_command_letters_and_preserves_run_modifiers() {
        for kind in [WaitKind::Command, WaitKind::Cursor] {
            // Native dispatch distinguishes rethrow, save, auto-rest,
            // discoveries, feats and relabel from their lowercase commands.
            for (plain, command) in [
                ('t', 'T'),
                ('s', 'S'),
                ('z', 'Z'),
                ('d', 'D'),
                ('f', 'F'),
                ('r', 'R'),
            ] {
                assert_eq!(
                    touch_key_event(kind, plain as i32, false, true),
                    [0, command as i32, 0, 0, 1]
                );
            }
            // C strips the uppercase movement alias, then uses either modifier
            // to run. Ctrl+Shift+S remains Save, rather than Ctrl+s search.
            assert_eq!(
                touch_key_event(kind, 'h' as i32, true, true),
                [0, 72, 0, 1, 1]
            );
            assert_eq!(
                touch_key_event(kind, 's' as i32, true, true),
                [0, 83, 0, 1, 1]
            );
            assert_eq!(
                touch_key_event(kind, 's' as i32, true, false),
                [0, 115, 0, 1, 0]
            );
            assert_eq!(
                touch_key_event(kind, 'T' as i32, false, false),
                [0, 84, 0, 0, 1]
            );
            for key in [46, 54, 60, 62, 63232, 2000] {
                assert_eq!(touch_key_event(kind, key, true, true), [0, key, 0, 1, 1]);
            }
        }
    }
    #[test]
    fn touch_shift_tab_matches_physical_identity_without_rewriting_modal_candidates() {
        for kind in [
            WaitKind::Command,
            WaitKind::Cursor,
            WaitKind::Target,
            WaitKind::Playback,
        ] {
            assert_eq!(touch_key_event(kind, 9, false, false), [0, 9, 0, 0, 0]);
            assert_eq!(touch_key_event(kind, 9, true, true), [0, 25, 0, 1, 1]);
            assert_eq!(touch_key_event(kind, 25, false, true), [0, 25, 0, 0, 1]);
        }
        for kind in [
            WaitKind::Item,
            WaitKind::Confirm,
            WaitKind::Text,
            WaitKind::Menu,
            WaitKind::Acknowledge,
            WaitKind::Title,
            WaitKind::AnyKey,
        ] {
            assert_eq!(touch_key_event(kind, 9, false, true), [0, 9, 0, 0, 1]);
        }
    }
    #[test]
    fn touch_modal_candidates_keep_their_literal_letter() {
        for kind in [
            WaitKind::Target,
            WaitKind::Item,
            WaitKind::Confirm,
            WaitKind::Text,
            WaitKind::Menu,
            WaitKind::Acknowledge,
            WaitKind::Title,
            WaitKind::AnyKey,
            WaitKind::Playback,
        ] {
            assert_eq!(
                touch_key_event(kind, 't' as i32, true, true),
                [0, 116, 0, 1, 1]
            );
            assert_eq!(
                touch_key_event(kind, 'a' as i32, false, false),
                [0, 97, 0, 0, 0]
            );
            assert_eq!(
                touch_key_event(kind, 'R' as i32, false, false),
                [0, 82, 0, 0, 1]
            );
        }
    }
}
