//! System tray icon: the tooltip mirrors the current DIAL status (updated
//! live from the `lalin-cast-dial-status` event) and the menu offers quick
//! access to the media window, the network/DIAL setup wizard, and updates.
//! See the Wave 2 tray contract in docs/plans/W2_LIVING_ROOM_PLAN.md.

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager, Runtime};

use crate::dial::{self, DialStateKind, DialStatus};
use crate::i18n::{self, Key, Lang};
use crate::{focus_media, settings, setup, updater, window_mode};

pub const TRAY_ID: &str = "main-tray";

const MENU_SHOW: &str = "tray-show";
const MENU_SETUP: &str = "tray-setup";
const MENU_SETTINGS: &str = "tray-settings";
const MENU_MINI: &str = "tray-mini";
const MENU_CHECK_UPDATES: &str = "tray-check-updates";
const MENU_QUIT: &str = "tray-quit";

/// `Lalin Cast · DIAL: <state>`, with ` (<host>:<port>)` appended only for
/// the `ready` state (the other states never carry a host/port).
fn tooltip_text(status: &DialStatus) -> String {
    let state_label = match status.state {
        DialStateKind::Starting => "starting",
        DialStateKind::Ready => "ready",
        DialStateKind::Degraded => "degraded",
        DialStateKind::Disabled => "disabled",
    };
    let mut tooltip = format!("Lalin Cast · DIAL: {state_label}");
    if status.state == DialStateKind::Ready {
        if let (Some(host), Some(port)) = (status.host.as_deref(), status.port) {
            tooltip.push_str(&format!(" ({host}:{port})"));
        }
    }
    tooltip
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, lang: Lang) -> tauri::Result<Menu<R>> {
    let show_item = MenuItemBuilder::with_id(MENU_SHOW, i18n::t(lang, Key::TrayShow)).build(app)?;
    let setup_item =
        MenuItemBuilder::with_id(MENU_SETUP, i18n::t(lang, Key::NetworkSetup)).build(app)?;
    let settings_item =
        MenuItemBuilder::with_id(MENU_SETTINGS, i18n::t(lang, Key::OpenSettings)).build(app)?;
    let mini_item =
        MenuItemBuilder::with_id(MENU_MINI, i18n::t(lang, Key::MiniPlayer)).build(app)?;
    let update_item =
        MenuItemBuilder::with_id(MENU_CHECK_UPDATES, i18n::t(lang, Key::CheckUpdates))
            .build(app)?;
    let quit_item = MenuItemBuilder::with_id(MENU_QUIT, i18n::t(lang, Key::Quit)).build(app)?;

    MenuBuilder::new(app)
        .items(&[
            &show_item,
            &setup_item,
            &settings_item,
            &mini_item,
            &update_item,
            &quit_item,
        ])
        .build()
}

/// Builds the tray icon and registers its listeners. Must run before
/// `dial::start` (see `lib.rs`'s `setup` hook) so the tooltip listener is
/// already registered when the very first `lalin-cast-dial-status` event
/// fires.
pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let lang = i18n::load(app);
    let menu = build_menu(app, lang)?;
    let initial_status = DialStatus {
        state: DialStateKind::Starting,
        host: None,
        port: None,
        message: None,
    };

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip_text(&initial_status))
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_SHOW => focus_media(app),
            MENU_SETUP => setup::open_setup_window(app),
            MENU_SETTINGS => settings::open_settings_window(app),
            MENU_MINI => window_mode::toggle_mini(app),
            MENU_CHECK_UPDATES => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    updater::run_check(&app_handle, true).await;
                });
            }
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_media(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;

    let tooltip_app = app.clone();
    app.listen(dial::DIAL_STATUS_EVENT, move |event| {
        // The remote YouTube page holds `core:event:allow-emit` (for the
        // surface event) and could emit this event name too, so the payload
        // is treated as a wake-up signal only: the tooltip reads the status
        // from the managed `DialState` whenever it exists, and accepts the
        // payload only after `status_payload_is_plausible` before `manage`.
        let status = match tooltip_app.try_state::<dial::DialState>() {
            Some(state) => dial::current_status(&state),
            None => match serde_json::from_str::<DialStatus>(event.payload()) {
                Ok(status) if status_payload_is_plausible(&status) => status,
                _ => return,
            },
        };
        if let Some(tray) = tooltip_app.tray_by_id(TRAY_ID) {
            let _ = tray.set_tooltip(Some(tooltip_text(&status)));
        }
    });

    Ok(())
}

/// A status payload is only shown in the tooltip if its host is a real IPv4
/// address and its message is short; anything else is dropped.
fn status_payload_is_plausible(status: &DialStatus) -> bool {
    let host_ok = status
        .host
        .as_deref()
        .is_none_or(|host| host.parse::<std::net::Ipv4Addr>().is_ok());
    let message_ok = status
        .message
        .as_deref()
        .is_none_or(|message| message.chars().count() <= 200);
    host_ok && message_ok
}

/// Rebuilds the tray menu with the given language's labels. Called from the
/// media window's language toggle alongside its own `build_menu`.
pub fn rebuild_menu(app: &AppHandle, lang: Lang) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    match build_menu(app, lang) {
        Ok(menu) => {
            let _ = tray.set_menu(Some(menu));
        }
        Err(error) => {
            eprintln!("Lalin Cast: could not rebuild the tray menu: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{status_payload_is_plausible, tooltip_text};
    use crate::dial::{DialStateKind, DialStatus};

    #[test]
    fn tooltip_shows_bare_state_when_not_ready() {
        let starting = DialStatus {
            state: DialStateKind::Starting,
            host: None,
            port: None,
            message: None,
        };
        assert_eq!(tooltip_text(&starting), "Lalin Cast · DIAL: starting");

        let disabled = DialStatus {
            state: DialStateKind::Disabled,
            host: None,
            port: None,
            message: Some("DIAL could not start".to_owned()),
        };
        assert_eq!(tooltip_text(&disabled), "Lalin Cast · DIAL: disabled");
    }

    #[test]
    fn tooltip_appends_host_and_port_only_for_the_ready_state() {
        let ready = DialStatus {
            state: DialStateKind::Ready,
            host: Some("192.168.1.5".to_owned()),
            port: Some(51234),
            message: None,
        };
        assert_eq!(
            tooltip_text(&ready),
            "Lalin Cast · DIAL: ready (192.168.1.5:51234)"
        );

        // Degraded never carries a host/port per the DialStatus contract,
        // but even if it did, only `ready` should render it.
        let degraded = DialStatus {
            state: DialStateKind::Degraded,
            host: Some("192.168.1.5".to_owned()),
            port: Some(51234),
            message: Some("listener stopped".to_owned()),
        };
        assert_eq!(tooltip_text(&degraded), "Lalin Cast · DIAL: degraded");
    }

    #[test]
    fn implausible_status_payloads_are_rejected() {
        let forged_host = DialStatus {
            state: DialStateKind::Ready,
            host: Some("evil.example <script>".to_owned()),
            port: Some(80),
            message: None,
        };
        assert!(!status_payload_is_plausible(&forged_host));
        let long_message = DialStatus {
            state: DialStateKind::Degraded,
            host: None,
            port: None,
            message: Some("x".repeat(201)),
        };
        assert!(!status_payload_is_plausible(&long_message));
        let genuine = DialStatus {
            state: DialStateKind::Ready,
            host: Some("192.168.1.100".to_owned()),
            port: Some(51234),
            message: None,
        };
        assert!(status_payload_is_plausible(&genuine));
    }
}
