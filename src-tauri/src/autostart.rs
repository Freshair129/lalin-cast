//! "Start with Windows": adds/removes Lalin Cast from the current user's
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` registry key via
//! `reg.exe` (never PowerShell, never a raw registry API) with a fixed,
//! constant argument list — nothing from the page or any other caller ever
//! reaches the command line beyond the executable's own path. See the Wave
//! 5 plan's `startWithWindows` contract; `settings::settings_set` is the
//! only caller.

#[cfg(windows)]
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::sync::mpsc;
#[cfg(windows)]
use std::thread;
#[cfg(windows)]
use std::time::Duration;

#[cfg(windows)]
const REG_TIMEOUT: Duration = Duration::from_secs(5);
const RUN_KEY_PATH: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "Lalin Cast";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegOp {
    Add,
    Delete,
    /// `reg.exe query … /v "Lalin Cast"`: exits 0 only when the value
    /// exists — the "is there anything to remove?" check [`set_enabled`]
    /// runs before a delete.
    Query,
}

impl RegOp {
    fn verb(self) -> &'static str {
        match self {
            RegOp::Add => "add",
            RegOp::Delete => "delete",
            RegOp::Query => "query",
        }
    }
}

/// Quotes an executable path for the registry `Run` value, rejecting a path
/// that could not be represented as a single, unambiguous quoted command
/// line: one containing a `"` (would break out of the quoting) or any
/// control character (never legitimate in a filesystem path, and never
/// something to let ride into a "runs on every sign-in" registry value).
/// The returned value never carries any argument — just the quoted path —
/// matching the contract exactly.
pub fn run_value(path: &str) -> Result<String, String> {
    if path.chars().any(|ch| ch == '"' || ch.is_control()) {
        return Err("executable path contains an invalid character".to_owned());
    }
    Ok(format!("\"{path}\""))
}

/// The fixed argument list for one `reg.exe` invocation — every element a
/// compile-time or already-validated ([`run_value`]) string, never a raw
/// caller-supplied one. `value` is only meaningful (and only used) for
/// [`RegOp::Add`].
pub fn reg_args(op: RegOp, value: Option<&str>) -> Vec<String> {
    match op {
        RegOp::Add => vec![
            "add".to_owned(),
            RUN_KEY_PATH.to_owned(),
            "/v".to_owned(),
            VALUE_NAME.to_owned(),
            "/t".to_owned(),
            "REG_SZ".to_owned(),
            "/d".to_owned(),
            value.unwrap_or_default().to_owned(),
            "/f".to_owned(),
        ],
        RegOp::Delete => vec![
            "delete".to_owned(),
            RUN_KEY_PATH.to_owned(),
            "/v".to_owned(),
            VALUE_NAME.to_owned(),
            "/f".to_owned(),
        ],
        RegOp::Query => vec![
            "query".to_owned(),
            RUN_KEY_PATH.to_owned(),
            "/v".to_owned(),
            VALUE_NAME.to_owned(),
        ],
    }
}

/// Runs `reg.exe` with `args`, `stdin`/`stdout`/`stderr` all null (so its
/// output — including any error text — never reaches Lalin Cast's own
/// logs), `CREATE_NO_WINDOW` (no console flash), and a 5-second bound via a
/// worker thread + `mpsc::recv_timeout` — the same pattern
/// `network::detect_network_profile` uses for its PowerShell call, so a
/// hung or slow `reg.exe` can never block the settings window.
#[cfg(windows)]
fn run_reg_exe(args: Vec<String>) -> Result<std::process::ExitStatus, String> {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let (tx, rx) = mpsc::channel();
    let spawned = thread::Builder::new()
        .name("lalin-cast-autostart-reg".to_owned())
        .spawn(move || {
            let result = Command::new("reg.exe")
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .status();
            let _ = tx.send(result);
        });
    if spawned.is_err() {
        return Err("could not start the registry helper".to_owned());
    }

    match rx.recv_timeout(REG_TIMEOUT) {
        Ok(Ok(status)) => Ok(status),
        Ok(Err(error)) => Err(format!("reg.exe could not run: {error}")),
        Err(_) => Err("reg.exe timed out".to_owned()),
    }
}

/// Runs one `reg.exe` operation and interprets its exit status. `stdin`/
/// `stdout`/`stderr` are all null (see [`run_reg_exe`]), so the exit status
/// is the only signal there is: `add` and `delete` must exit 0 (`Ok(true)`),
/// while `query` exits 0 only when the value exists (`Ok(false)` when it
/// does not) — which is exactly the "is there anything to remove?" question
/// [`set_enabled`] asks *before* a delete, so the contract's "not found
/// counts as success" never has to be approximated by ignoring a delete's
/// exit status, and a delete that genuinely fails still surfaces as `Err`.
#[cfg(windows)]
fn run_reg(op: RegOp, args: Vec<String>) -> Result<bool, String> {
    let status = run_reg_exe(args)?;
    match op {
        RegOp::Query => Ok(status.success()),
        RegOp::Add | RegOp::Delete => {
            if status.success() {
                Ok(true)
            } else {
                Err(format!("reg.exe {} exited with {status}", op.verb()))
            }
        }
    }
}

/// Adds or removes Lalin Cast from the current user's Run key, matching the
/// `startWithWindows` setting: `true` re-adds (idempotent — always writes
/// the current `std::env::current_exe()` path, so it stays correct across
/// an update even if the setting itself never changed), `false` removes it.
/// Only ever called from `settings::settings_set` (after validating the
/// setting is a bool) and from the startup reconcile in `lib.rs`'s `setup`
/// hook.
#[cfg(windows)]
pub fn set_enabled(enabled: bool) -> Result<(), String> {
    if enabled {
        let exe = std::env::current_exe()
            .map_err(|error| format!("could not resolve the executable path: {error}"))?;
        let exe_str = exe
            .to_str()
            .ok_or_else(|| "executable path is not valid UTF-8".to_owned())?;
        let value = run_value(exe_str)?;
        run_reg(RegOp::Add, reg_args(RegOp::Add, Some(&value))).map(|_| ())
    } else {
        // "Not found" counts as success per the contract — checked
        // explicitly with `query` rather than by ignoring `delete`'s exit
        // status, so a delete that genuinely fails is still an `Err`.
        if !run_reg(RegOp::Query, reg_args(RegOp::Query, None))? {
            return Ok(());
        }
        run_reg(RegOp::Delete, reg_args(RegOp::Delete, None)).map(|_| ())
    }
}

#[cfg(not(windows))]
pub fn set_enabled(_enabled: bool) -> Result<(), String> {
    Err("unsupported".to_owned())
}

#[cfg(test)]
mod tests {
    use super::{reg_args, run_value, RegOp, RUN_KEY_PATH, VALUE_NAME};

    #[test]
    fn run_value_quotes_a_plain_path_with_no_arguments() {
        assert_eq!(
            run_value(r"C:\Program Files\Lalin Cast\lalin-cast.exe"),
            Ok(r#""C:\Program Files\Lalin Cast\lalin-cast.exe""#.to_owned())
        );
    }

    #[test]
    fn run_value_rejects_a_path_containing_a_quote() {
        assert!(run_value(r#"C:\evil"" /c calc.exe"#).is_err());
    }

    #[test]
    fn run_value_rejects_a_path_containing_a_control_character() {
        assert!(run_value("C:\\evil\r\npath.exe").is_err());
        assert!(run_value("C:\\evil\tpath.exe").is_err());
    }

    #[test]
    fn reg_args_add_matches_the_fixed_contract_list() {
        let value = run_value(r"C:\Lalin Cast\lalin-cast.exe").unwrap();
        let args = reg_args(RegOp::Add, Some(&value));
        assert_eq!(
            args,
            vec![
                "add".to_owned(),
                RUN_KEY_PATH.to_owned(),
                "/v".to_owned(),
                VALUE_NAME.to_owned(),
                "/t".to_owned(),
                "REG_SZ".to_owned(),
                "/d".to_owned(),
                r#""C:\Lalin Cast\lalin-cast.exe""#.to_owned(),
                "/f".to_owned(),
            ]
        );
    }

    #[test]
    fn reg_args_delete_matches_the_fixed_contract_list_and_ignores_a_value() {
        let args = reg_args(RegOp::Delete, Some("ignored"));
        assert_eq!(
            args,
            vec![
                "delete".to_owned(),
                RUN_KEY_PATH.to_owned(),
                "/v".to_owned(),
                VALUE_NAME.to_owned(),
                "/f".to_owned(),
            ]
        );
    }

    #[test]
    fn reg_args_query_matches_the_fixed_contract_list_and_never_forces() {
        let args = reg_args(RegOp::Query, None);
        assert_eq!(
            args,
            vec![
                "query".to_owned(),
                RUN_KEY_PATH.to_owned(),
                "/v".to_owned(),
                VALUE_NAME.to_owned(),
            ]
        );
        assert!(!args.iter().any(|arg| arg == "/f"));
    }

    #[test]
    fn run_key_path_and_value_name_match_the_documented_constants() {
        assert_eq!(
            RUN_KEY_PATH,
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
        );
        assert_eq!(VALUE_NAME, "Lalin Cast");
    }
}
