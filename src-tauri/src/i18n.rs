//! Minimal Thai/English UI string table for Lalin Cast's native window chrome
//! (menu labels and the update window title). Detection defaults to the
//! Windows UI language; a store value always wins once one has been saved.

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[cfg(windows)]
use windows_sys::Win32::Globalization::GetUserDefaultUILanguage;

/// Primary language id (low 10 bits of a Windows LANGID) for Thai.
/// See: https://learn.microsoft.com/windows/win32/intl/language-identifier-constants-and-strings
const LANG_THAI_PRIMARY: u16 = 0x1E;
const PRIMARY_LANGID_MASK: u16 = 0x3FF;

pub const STORE_KEY: &str = "language";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    Th,
    En,
}

impl Lang {
    pub fn store_value(self) -> &'static str {
        match self {
            Lang::Th => "th",
            Lang::En => "en",
        }
    }

    pub fn other(self) -> Lang {
        match self {
            Lang::Th => Lang::En,
            Lang::En => Lang::Th,
        }
    }

    /// `pub(crate)` so `settings.rs` can turn a validated `language` store
    /// value back into a [`Lang`] after `apply_setting` has already
    /// confirmed it is `"th"` or `"en"`.
    pub(crate) fn from_store_value(value: &str) -> Option<Lang> {
        match value {
            "th" => Some(Lang::Th),
            "en" => Some(Lang::En),
            _ => None,
        }
    }
}

/// Extracts the primary language id from a Windows LANGID and maps it to a
/// [`Lang`]. Kept separate from the FFI call so it is unit-testable without
/// a real Windows session.
fn lang_from_langid(langid: u16) -> Lang {
    if langid & PRIMARY_LANGID_MASK == LANG_THAI_PRIMARY {
        Lang::Th
    } else {
        Lang::En
    }
}

/// Detects the OS default UI language via `GetUserDefaultUILanguage`.
/// Falls back to English on non-Windows targets or when the call cannot be
/// resolved; Lalin Cast ships for Windows only, so the `cfg(windows)` arm is
/// the one that matters at runtime.
#[cfg(windows)]
pub fn detect_default() -> Lang {
    // SAFETY: GetUserDefaultUILanguage takes no arguments and only reads
    // process/OS locale state; it cannot fail in a way that is unsafe to
    // observe from Rust.
    let langid = unsafe { GetUserDefaultUILanguage() };
    lang_from_langid(langid)
}

#[cfg(not(windows))]
pub fn detect_default() -> Lang {
    Lang::En
}

/// Loads the saved language preference, falling back to OS detection when
/// unset or invalid.
pub fn load(app: &AppHandle) -> Lang {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| store.get(STORE_KEY))
        .and_then(|value| value.as_str().and_then(Lang::from_store_value))
        .unwrap_or_else(detect_default)
}

/// Persists the language preference (best-effort; matches the rest of the
/// settings store's failure handling).
pub fn save(app: &AppHandle, lang: Lang) {
    if let Ok(store) = app.store("media-settings.json") {
        store.set(STORE_KEY, lang.store_value());
        let _ = store.save();
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Key {
    ToggleFullscreen,
    ToggleOnTop,
    Reload,
    CheckUpdates,
    /// Label offered for the toggle itself: it names the *other* language,
    /// since selecting it switches to that language.
    ToggleLanguage,
    Quit,
    UpdateWindowTitle,
    /// Tray menu: focuses/shows the `media` window.
    TrayShow,
    /// Tray menu item `tray-setup` and the media window's `network-setup`
    /// menu item — both open the same setup window, so they share a label.
    NetworkSetup,
    SetupWindowTitle,
    /// Shared label for the media window's `settings` menu item and the
    /// tray's `tray-settings` item — both open the same settings window,
    /// so they share a label (mirrors [`NetworkSetup`](Key::NetworkSetup)).
    OpenSettings,
    SettingsWindowTitle,
    StatusWindowTitle,
    /// Shown in the `status` window when the startup connectivity probe
    /// fails.
    StatusOfflineMessage,
    /// Shown in the `status` window when a `lalin-cast-surface` event
    /// (redirected or blocked Leanback UI) opens it.
    StatusBlockedSurfaceMessage,
}

pub fn t(lang: Lang, key: Key) -> &'static str {
    use Key::*;
    use Lang::*;
    match (lang, key) {
        (Th, ToggleFullscreen) => "เต็มหน้าจอ",
        (En, ToggleFullscreen) => "Fullscreen",
        (Th, ToggleOnTop) => "อยู่ด้านบนเสมอ",
        (En, ToggleOnTop) => "Always on top",
        (Th, Reload) => "โหลดใหม่",
        (En, Reload) => "Reload",
        (Th, CheckUpdates) => "ตรวจสอบการอัปเดต",
        (En, CheckUpdates) => "Check for updates",
        (Th, ToggleLanguage) => "English",
        (En, ToggleLanguage) => "ภาษาไทย",
        (Th, Quit) => "ออกจาก Lalin Cast",
        (En, Quit) => "Quit Lalin Cast",
        (Th, UpdateWindowTitle) => "อัปเดต Lalin Cast",
        (En, UpdateWindowTitle) => "Lalin Cast Update",
        (Th, TrayShow) => "แสดง Lalin Cast",
        (En, TrayShow) => "Show Lalin Cast",
        (Th, NetworkSetup) => "เครือข่ายและ DIAL",
        (En, NetworkSetup) => "Network & DIAL",
        (Th, SetupWindowTitle) => "ตั้งค่า Lalin Cast",
        (En, SetupWindowTitle) => "Lalin Cast Setup",
        (Th, OpenSettings) => "ตั้งค่า",
        (En, OpenSettings) => "Settings",
        (Th, SettingsWindowTitle) => "การตั้งค่า Lalin Cast",
        (En, SettingsWindowTitle) => "Lalin Cast Settings",
        (Th, StatusWindowTitle) => "สถานะ Lalin Cast",
        (En, StatusWindowTitle) => "Lalin Cast Status",
        (Th, StatusOfflineMessage) => "ไม่พบการเชื่อมต่ออินเทอร์เน็ต — ตรวจสอบเครือข่ายแล้วลองอีกครั้ง",
        (En, StatusOfflineMessage) => "No internet connection — check your network and try again.",
        (Th, StatusBlockedSurfaceMessage) => {
            "YouTube ไม่ได้แสดงหน้าทีวี — ลองโหลดใหม่หรืออัปเดต Lalin Cast"
        }
        (En, StatusBlockedSurfaceMessage) => {
            "YouTube isn't showing the TV interface — try reloading or updating Lalin Cast."
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{lang_from_langid, Key, Lang, LANG_THAI_PRIMARY};

    #[test]
    fn maps_thai_primary_langid_to_thai() {
        // 0x041E is the full Thai (Thailand) LANGID; only the primary id
        // (low 10 bits, 0x1E) should matter for the mapping.
        assert_eq!(lang_from_langid(0x041E), Lang::Th);
        assert_eq!(lang_from_langid(LANG_THAI_PRIMARY), Lang::Th);
    }

    #[test]
    fn falls_back_to_english_for_unknown_or_zero_langid() {
        // 0x0409 is US English; 0 means "unable to determine" per the
        // Win32 API docs. Both must fall back to English, never panic.
        assert_eq!(lang_from_langid(0x0409), Lang::En);
        assert_eq!(lang_from_langid(0), Lang::En);
    }

    #[test]
    fn store_value_round_trips_through_from_store_value() {
        assert_eq!(Lang::from_store_value("th"), Some(Lang::Th));
        assert_eq!(Lang::from_store_value("en"), Some(Lang::En));
        assert_eq!(
            Lang::from_store_value(Lang::Th.store_value()),
            Some(Lang::Th)
        );
        assert_eq!(
            Lang::from_store_value(Lang::En.store_value()),
            Some(Lang::En)
        );
    }

    #[test]
    fn unknown_store_value_has_no_mapping_so_callers_fall_back() {
        assert_eq!(Lang::from_store_value(""), None);
        assert_eq!(Lang::from_store_value("thai"), None);
        assert_eq!(Lang::from_store_value("EN"), None);
    }

    #[test]
    fn toggle_switches_between_languages_and_back() {
        assert_eq!(Lang::Th.other(), Lang::En);
        assert_eq!(Lang::En.other(), Lang::Th);
        assert_eq!(Lang::Th.other().other(), Lang::Th);
    }

    #[test]
    fn toggle_language_label_names_the_other_language() {
        // Selecting the menu item switches away from the current language,
        // so its label must name the language you would switch *to*.
        assert_eq!(super::t(Lang::Th, Key::ToggleLanguage), "English");
        assert_eq!(super::t(Lang::En, Key::ToggleLanguage), "ภาษาไทย");
    }

    #[test]
    fn every_key_has_distinct_thai_and_english_text() {
        let keys = [
            Key::ToggleFullscreen,
            Key::ToggleOnTop,
            Key::Reload,
            Key::CheckUpdates,
            Key::ToggleLanguage,
            Key::Quit,
            Key::UpdateWindowTitle,
            Key::TrayShow,
            Key::NetworkSetup,
            Key::SetupWindowTitle,
            Key::OpenSettings,
            Key::SettingsWindowTitle,
            Key::StatusWindowTitle,
            Key::StatusOfflineMessage,
            Key::StatusBlockedSurfaceMessage,
        ];
        for key in keys {
            let th = super::t(Lang::Th, key);
            let en = super::t(Lang::En, key);
            assert_ne!(th, en, "{key:?} should differ between th and en");
            assert!(!th.is_empty());
            assert!(!en.is_empty());
        }
    }
}
