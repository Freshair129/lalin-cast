mod dial;
mod i18n;
mod network;
mod setup;
mod status;
mod surface;
mod tray;
mod updater;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::{Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

pub(crate) const MEDIA_LABEL: &str = "media";
const MEDIA_TITLE: &str = "Lalin Cast";
const WINDOW_TITLE_SEPARATOR: &str = " — ";
const WINDOW_TITLE_MAX_CHARS: usize = 120;
const LEANBACK_URL: &str = "https://www.youtube.com/tv";
const USER_AGENT: &str = concat!(
    "Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; LalinCast/",
    env!("CARGO_PKG_VERSION")
);
const INJECTED_SCRIPT: &str = include_str!("../injected.js");

/// Builds the "Lalin Cast — {document title}" window title, capped at
/// [`WINDOW_TITLE_MAX_CHARS`] characters (counted, not bytes, so a capped
/// Thai title never splits a multi-byte character). An empty/whitespace-only
/// document title falls back to the bare app name.
fn window_title(document_title: &str) -> String {
    let trimmed = document_title.trim();
    if trimmed.is_empty() {
        return MEDIA_TITLE.to_owned();
    }
    let full = format!("{MEDIA_TITLE}{WINDOW_TITLE_SEPARATOR}{trimmed}");
    if full.chars().count() <= WINDOW_TITLE_MAX_CHARS {
        full
    } else {
        full.chars().take(WINDOW_TITLE_MAX_CHARS).collect()
    }
}

pub(crate) fn focus_media(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MEDIA_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn seed_settings(app: &tauri::AppHandle) {
    let Ok(store) = app.store("media-settings.json") else {
        eprintln!("Lalin Cast: settings store unavailable; using defaults for this run");
        return;
    };

    if store.get("fullscreen").is_none() {
        store.set("fullscreen", false);
    }
    if store.get("keepOnTop").is_none() {
        store.set("keepOnTop", false);
    }
    // adFilterMode was seeded by earlier builds but never implemented; drop the
    // stale key so upgraded installs do not keep a setting that does nothing.
    if store.get("adFilterMode").is_some() {
        store.delete("adFilterMode");
    }

    if let Err(error) = store.save() {
        eprintln!("Lalin Cast: settings store could not be saved: {error}");
    }
}

fn read_bool_setting(app: &tauri::AppHandle, key: &str) -> bool {
    app.store("media-settings.json")
        .ok()
        .and_then(|store| store.get(key).and_then(|value| value.as_bool()))
        .unwrap_or(false)
}

fn write_bool_setting(app: &tauri::AppHandle, key: &str, value: bool) {
    if let Ok(store) = app.store("media-settings.json") {
        store.set(key, value);
        let _ = store.save();
    }
}

/// Builds the media window's menu, localized to `lang`. Reused both at
/// window creation and when the language toggle rebuilds the menu in place.
fn build_menu<R: Runtime>(app: &tauri::AppHandle<R>, lang: i18n::Lang) -> tauri::Result<Menu<R>> {
    let fullscreen_item = MenuItemBuilder::with_id(
        "toggle-fullscreen",
        i18n::t(lang, i18n::Key::ToggleFullscreen),
    )
    .build(app)?;
    let keep_on_top_item =
        MenuItemBuilder::with_id("toggle-on-top", i18n::t(lang, i18n::Key::ToggleOnTop))
            .build(app)?;
    let reload_item =
        MenuItemBuilder::with_id("reload", i18n::t(lang, i18n::Key::Reload)).build(app)?;
    let update_item =
        MenuItemBuilder::with_id("check-updates", i18n::t(lang, i18n::Key::CheckUpdates))
            .build(app)?;
    let network_setup_item =
        MenuItemBuilder::with_id("network-setup", i18n::t(lang, i18n::Key::NetworkSetup))
            .build(app)?;
    let language_item =
        MenuItemBuilder::with_id("toggle-language", i18n::t(lang, i18n::Key::ToggleLanguage))
            .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", i18n::t(lang, i18n::Key::Quit)).build(app)?;

    MenuBuilder::new(app)
        .items(&[
            &fullscreen_item,
            &keep_on_top_item,
            &reload_item,
            &update_item,
            &network_setup_item,
            &language_item,
            &quit_item,
        ])
        .build()
}

fn build_media_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if app.get_webview_window(MEDIA_LABEL).is_some() {
        focus_media(app);
        return Ok(());
    }

    let url = tauri::Url::parse(LEANBACK_URL).expect("LEANBACK_URL must be valid");
    let fullscreen = read_bool_setting(app, "fullscreen");
    let keep_on_top = read_bool_setting(app, "keepOnTop");
    let lang = i18n::load(app);
    let menu = build_menu(app, lang)?;

    let window = WebviewWindowBuilder::new(app, MEDIA_LABEL, WebviewUrl::External(url))
        .title(MEDIA_TITLE)
        .inner_size(1200.0, 675.0)
        .min_inner_size(720.0, 405.0)
        .resizable(true)
        .fullscreen(fullscreen)
        .always_on_top(keep_on_top)
        .menu(menu)
        .on_menu_event(|window, event| match event.id().as_ref() {
            "toggle-fullscreen" => {
                if let Ok(current) = window.is_fullscreen() {
                    let next = !current;
                    let _ = window.set_fullscreen(next);
                    write_bool_setting(window.app_handle(), "fullscreen", next);
                }
            }
            "toggle-on-top" => {
                if let Ok(current) = window.is_always_on_top() {
                    let next = !current;
                    let _ = window.set_always_on_top(next);
                    write_bool_setting(window.app_handle(), "keepOnTop", next);
                }
            }
            "reload" => {
                if let Some(webview) = window.app_handle().get_webview_window(MEDIA_LABEL) {
                    let _ = webview.reload();
                }
            }
            "check-updates" => {
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    updater::run_check(&app_handle, true).await;
                });
            }
            "network-setup" => setup::open_setup_window(window.app_handle()),
            "toggle-language" => {
                let app_handle = window.app_handle().clone();
                let next = i18n::load(&app_handle).other();
                i18n::save(&app_handle, next);
                match build_menu(&app_handle, next) {
                    Ok(menu) => {
                        let _ = window.set_menu(menu);
                    }
                    Err(error) => {
                        eprintln!("Lalin Cast: could not rebuild the menu: {error}");
                    }
                }
                tray::rebuild_menu(&app_handle, next);
            }
            "quit" => window.app_handle().exit(0),
            _ => {}
        })
        .user_agent(USER_AGENT)
        .initialization_script(INJECTED_SCRIPT)
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&window_title(&title));
        })
        .build()?;

    // Closing the media window means quitting Lalin Cast even while a helper
    // window (update/setup/status) is still open; Tauri would otherwise keep
    // the process alive with only the tray icon and that helper window.
    let exit_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            exit_app.exit(0);
        }
    });

    window.show()?;
    updater::schedule_startup_check(app);
    setup::schedule_auto_open(app);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_media(app);
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            seed_settings(app.handle());
            // Built before `dial::start` so the tray's dial-status listener
            // is already registered when the very first
            // `lalin-cast-dial-status` event fires.
            if let Err(error) = tray::build(app.handle()) {
                eprintln!("Lalin Cast: could not build the tray icon: {error}");
            }
            match dial::start(app.handle()) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(error) => {
                    eprintln!("Lalin Cast: DIAL is unavailable: {error}");
                    app.manage(dial::disabled_state(app.handle(), error));
                }
            }
            surface::register_surface_listener(app.handle());
            status::schedule_startup_probe(app.handle());
            build_media_window(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dial::dial_get_info,
            dial::dial_respond,
            dial::dial_set_device_id,
            updater::cast_update_install,
            setup::setup_refresh,
            setup::setup_open_network_settings,
            setup::setup_complete,
            status::status_retry,
            status::status_quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lalin Cast");
}

#[cfg(test)]
mod tests {
    use super::window_title;

    #[test]
    fn falls_back_to_bare_app_name_for_empty_or_whitespace_title() {
        assert_eq!(window_title(""), "Lalin Cast");
        assert_eq!(window_title("   "), "Lalin Cast");
    }

    #[test]
    fn prefixes_a_non_empty_document_title() {
        assert_eq!(
            window_title("Some Video - YouTube"),
            "Lalin Cast — Some Video - YouTube"
        );
    }

    #[test]
    fn caps_the_combined_title_at_120_characters_without_splitting_utf8() {
        let long_title = "ก".repeat(200);
        let title = window_title(&long_title);
        assert_eq!(title.chars().count(), 120);
        assert!(title.starts_with("Lalin Cast — "));
    }

    #[test]
    fn user_agent_and_app_agent_carry_the_current_cargo_version_and_no_vacuumtube() {
        let version = env!("CARGO_PKG_VERSION");
        assert!(super::USER_AGENT.contains(&format!("LalinCast/{version}")));
        assert!(!super::USER_AGENT.to_lowercase().contains("vacuumtube"));
    }
}
