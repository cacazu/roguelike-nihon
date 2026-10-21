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
            WaitKind::Command => true,
            WaitKind::Text => [10, 127].contains(&key) || self.keys.contains(&key),
            WaitKind::Target => {
                "hjklyubn".chars().any(|c| c as i32 == key)
                    || [63232, 63233, 63234, 63235, 9, 10, 27].contains(&key)
                    || self.keys.contains(&key)
            }
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

pub type InputEvent = [i32; 5];
pub fn key_event(key: i32, control: bool, shift: bool) -> InputEvent {
    [0, key, 0, i32::from(control), i32::from(shift)]
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
}
