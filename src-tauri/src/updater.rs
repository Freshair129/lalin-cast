use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

pub const UPDATE_CHECK_REQUESTED_EVENT: &str = "lalin-cast-update-check";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CastUpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

fn to_update_info(update: &tauri_plugin_updater::Update) -> CastUpdateInfo {
    CastUpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone(),
        pub_date: update.date.map(|value| value.to_string()),
    }
}

async fn check_update(app: &AppHandle) -> Result<Option<CastUpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|error| format!("updater is unavailable: {error}"))?
        .check()
        .await
        .map_err(|error| format!("update check failed: {error}"))?;
    Ok(update.as_ref().map(to_update_info))
}

#[tauri::command]
pub async fn cast_update_check(app: AppHandle) -> Result<Option<CastUpdateInfo>, String> {
    check_update(&app).await
}

#[tauri::command]
pub async fn cast_update_install(app: AppHandle) -> Result<(), String> {
    let Some(update) = app
        .updater()
        .map_err(|error| format!("updater is unavailable: {error}"))?
        .check()
        .await
        .map_err(|error| format!("update check failed: {error}"))?
    else {
        return Ok(());
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("update install failed: {error}"))?;
    app.restart();
}
