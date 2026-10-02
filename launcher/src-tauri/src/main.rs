#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
mod backend;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    server_origin: String,
    resume_game: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            server_origin: "http://127.0.0.1:8803".into(),
            resume_game: false,
        }
    }
}
struct LauncherState {
    settings: Mutex<Settings>,
    busy: AtomicBool,
    checkpoint: Mutex<Option<CheckpointReply>>,
    backend: backend::BackendRuntime,
}
struct CheckpointReply {
    token: String,
    reply: tokio::sync::oneshot::Sender<Result<(), String>>,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn require_launcher(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Native launcher actions are restricted to the bundled launcher.".into())
    }
}

fn checked_origin(input: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(input.trim()).map_err(err)?;
    let loopback = matches!(
        url.host_str(),
        Some("localhost") | Some("127.0.0.1") | Some("[::1]")
    );
    if !(url.scheme() == "https" || url.scheme() == "http" && loopback) {
        return Err(
            "Use HTTPS for a public server, or HTTP for a loopback development server.".into(),
        );
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("Enter only the server origin, for example https://arena.example.com.".into());
    }
    Ok(url)
}
fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(backend::data_root(app)?.join("launcher-settings.json"))
}
fn store_settings(app: &tauri::AppHandle, value: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(err)?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(value).map_err(err)?).map_err(err)?;
    // Config contains no credentials or game progress. Account cookies remain in WebView's persistent data.
    if path.exists() {
        fs::remove_file(&path).map_err(err)?;
    }
    fs::rename(temporary, path).map_err(err)
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(err)
}
fn origin(app: &tauri::AppHandle) -> Result<reqwest::Url, String> {
    let state = app.state::<LauncherState>();
    let value = state.settings.lock().map_err(err)?.server_origin.clone();
    checked_origin(&value)
}
fn verify_manifest(bytes: &[u8], signature_b64: &str) -> Result<Value, String> {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).map_err(err)?;
    let public = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .ok_or("Missing updater public key")?;
    let public_text =
        String::from_utf8(STANDARD.decode(public.trim()).map_err(err)?).map_err(err)?;
    let sig_text =
        String::from_utf8(STANDARD.decode(signature_b64.trim()).map_err(err)?).map_err(err)?;
    let public_key = minisign_verify::PublicKey::decode(&public_text).map_err(err)?;
    let signature = minisign_verify::Signature::decode(&sig_text).map_err(err)?;
    public_key
        .verify(bytes, &signature, true)
        .map_err(|_| "Update manifest signature could not be verified.".to_string())?;
    serde_json::from_slice(bytes).map_err(err)
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
async fn verified_update(
    app: &tauri::AppHandle,
    verify_current: bool,
) -> Result<Option<(Update, Value, String)>, String> {
    let base = origin(app)?;
    let endpoint = base.join("api/launcher/update").map_err(err)?;
    let response = client()?.get(endpoint.clone()).send().await.map_err(err)?;
    if response.status() == reqwest::StatusCode::NO_CONTENT {
        return Ok(None);
    }
    let bytes = response
        .error_for_status()
        .map_err(err)?
        .bytes()
        .await
        .map_err(err)?;
    if bytes.len() > 256_000 {
        return Err("Update manifest is too large.".into());
    }
    let signature = client()?
        .get(base.join("api/launcher/update.sig").map_err(err)?)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .text()
        .await
        .map_err(err)?;
    let manifest = verify_manifest(&bytes, &signature)?;
    let mut builder = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(err)?
        .timeout(Duration::from_secs(20));
    // Diagnostic download verifies an already-current package, without offering or installing a downgrade.
    if verify_current {
        builder = builder.version_comparator(|_, _| true);
    }
    let updater = builder.build().map_err(err)?;
    let Some(update) = updater.check().await.map_err(err)? else {
        return Ok(None);
    };
    if update.raw_json != manifest {
        return Err("The update manifest changed during verification. Check again.".into());
    }
    checked_origin(&format!(
        "{}://{}{}",
        update.download_url.scheme(),
        update.download_url.host_str().unwrap_or(""),
        update
            .download_url
            .port()
            .map(|p| format!(":{p}"))
            .unwrap_or_default()
    ))?;
    let details = manifest
        .get("platforms")
        .and_then(|p| p.get("windows-x86_64"))
        .unwrap_or(&manifest);
    if details["size"].as_u64().unwrap_or(0) == 0
        || details["sha256"].as_str().map(|s| s.len()) != Some(64)
    {
        return Err(
            "The signed manifest must include the download size and SHA-256 checksum.".into(),
        );
    }
    Ok(Some((update, details.clone(), digest(&bytes))))
}
#[tauri::command]
fn launcher_settings(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    require_launcher(&window)?;
    let settings = app
        .state::<LauncherState>()
        .settings
        .lock()
        .map_err(err)?
        .clone();
    Ok(
        json!({"serverOrigin": settings.server_origin, "launcherVersion": app.package_info().version.to_string()}),
    )
}
#[tauri::command]
fn save_server(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    server_origin: String,
) -> Result<(), String> {
    require_launcher(&window)?;
    let url = checked_origin(&server_origin)?;
    let state = app.state::<LauncherState>();
    if state.busy.load(Ordering::SeqCst) {
        return Err("Wait for the update to finish.".into());
    }
    if app.get_webview_window("game").is_some() {
        return Err("Close the game window before switching servers.".into());
    }
    let mut settings = state.settings.lock().map_err(err)?;
    settings.server_origin = url.as_str().trim_end_matches('/').to_string();
    store_settings(&app, &settings)
}
#[tauri::command]
async fn server_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Value, String> {
    require_launcher(&window)?;
    let base = origin(&app)?;
    let preparation = match backend::prepare(&app).await {
        Ok(value) => value,
        Err(error) => { backend::log(&app, &format!("BACKEND PREPARATION FAILED: {error}")); json!({"online":false,"startupError":error}) },
    };
    if preparation["online"] != true {
        return Ok(json!({"online":false,"mode":preparation["mode"],"startupError":preparation["startupError"],"serverOrigin":base.as_str().trim_end_matches('/'),"canPlayCached":true}));
    }
    let status: Value = client()?
        .get(base.join("api/status").map_err(err)?)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;
    let version: Value = client()?
        .get(base.join("api/version").map_err(err)?)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;
    Ok(
        json!({"online": status["ok"] == true, "gameVersion": status["version"], "news": version["notes"],
        "channel": version["channel"], "serverOrigin": base.as_str().trim_end_matches('/'), "mode": preparation["mode"]}),
    )
}
#[tauri::command]
async fn check_launcher_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Value, String> {
    require_launcher(&window)?;
    match verified_update(&app, false).await? {
        Some((update, details, hash)) => Ok(json!({"available": true, "version": update.version,
            "notes": update.body, "size": details["size"], "sha256": details["sha256"], "manifestDigest": hash})),
        None => Ok(json!({"available": false})),
    }
}
fn game_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("game") {
        return window.set_focus().map_err(err);
    }
    // Keep the native entry outside immutable game-shell caches. Older releases
    // cached desktop-launch.html with an inline bootstrap that cannot be repaired
    // by updating its external script. This path always gets the installed entry.
    let url = origin(app)?.join("desktop-entry.html?launcher=1").map_err(err)?;
    let account_data = backend::data_root(app)?.join("account-webview");
    fs::create_dir_all(&account_data).map_err(err)?;
    tauri::WebviewWindowBuilder::new(app, "game", tauri::WebviewUrl::External(url))
        .title("Skirmish Arena")
        .inner_size(1440.0, 900.0)
        .min_inner_size(800.0, 520.0)
        .fullscreen(true)
        .focused(true)
        .initialization_script(&game_initialization(app.package_info().version.to_string().as_str())?)
        .data_directory(account_data)
        .build()
        .map_err(err)?;
    Ok(())
}
fn game_initialization(version: &str) -> Result<String, String> {
    let expected = serde_json::to_string(version).map_err(err)?;
    let release:Value=serde_json::from_str(include_str!("../../../version.json")).map_err(err)?;
    let release=serde_json::to_string(release["updateName"].as_str().unwrap_or("FIELDCRAFT")).map_err(err)?;
    Ok(format!(r#"
window.__SAR_NATIVE_GAME__=true;
window.__SAR_EXPECTED_VERSION__={expected};
window.__SAR_EXPECTED_RELEASE__={release};
(()=>{{
  if(location.pathname.endsWith('/desktop-entry.html')||location.pathname.endsWith('/desktop-launch.html'))return;
  let checked=false;
  const expected=window.__SAR_EXPECTED_VERSION__;
  function mismatch(actual){{
    checked=true;window.__SAR_VERSION_MISMATCH__={{expected,actual}};
    const show=()=>{{
      if(document.getElementById('sar-native-version-error'))return;
      const root=document.createElement('section');root.id='sar-native-version-error';
      root.setAttribute('role','alert');root.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#0d171b;color:#e4eee8;display:grid;place-content:center;padding:32px;font:16px system-ui;gap:16px';
      const title=document.createElement('h1');title.textContent='Game version mismatch';title.style.fontSize='22px';
      const detail=document.createElement('p');detail.textContent='Desktop '+expected+' loaded game '+(actual||'unknown')+'. Reopen the updated game to activate the installed release. Your account and saves remain intact.';detail.style.maxWidth='42rem';detail.style.lineHeight='1.6';
      const retry=document.createElement('button');retry.textContent='Reload installed game';retry.style.cssText='justify-self:start;padding:10px 16px;font:inherit;color:inherit;background:#213b30;border:1px solid #487159;border-radius:4px';retry.onclick=()=>location.replace('./desktop-entry.html?launcher=1');
      root.append(title,detail,retry);document.body.append(root);document.exitPointerLock?.();
      window.SAR?.prepareReload?.();
    }};
    if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{{once:true}});
  }}
  function poll(){{
    if(checked)return;
    let actual;try{{actual=window.SAR?.getVersion?.();actual=typeof actual==='string'?actual:actual?.version;}}catch{{}}
    if(actual){{checked=true;if(actual!==expected)mismatch(String(actual));else window.__SAR_RUNTIME_VERIFIED__=true;return;}}
    // Authentication is allowed to wait for the player. The stage-aware boot
    // controller owns initialization timeouts; only an actual wrong bundle is
    // a version mismatch, not an unfinished login or slow first asset load.
    if(window.SARBoot?.getState?.().failed)return;
    setTimeout(poll,100);
  }}
  poll();
}})();
"#))
}
#[tauri::command]
async fn play(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    require_launcher(&window)?;
    if app.state::<LauncherState>().busy.load(Ordering::SeqCst) {
        return Err("Wait for the update to finish.".into());
    }
    // Wait for the local service before the game executes authentication/bootstrap.
    // A previously authenticated cached world can still enter when service startup fails.
    if let Err(error) = backend::prepare(&app).await { backend::log(&app, &format!("Play continuing with cached shell: {error}")); }
    game_window(&app)
}
fn require_game(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "game" || window.url().map_err(err)?.origin() != origin(app)?.origin() {
        return Err("Fullscreen is restricted to the current game window.".into());
    }
    Ok(())
}
#[tauri::command]
async fn check_local_backend(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    require_game(&app, &window)?;
    backend::prepare(&app).await
}
#[tauri::command]
async fn offline_local_api(app: tauri::AppHandle, window: tauri::WebviewWindow, account_id: String, path: String, method: String, body: Value) -> Result<Value, String> {
    require_game(&app, &window)?;
    backend::offline_request(app, account_id, path, method, body).await
}
#[tauri::command]
fn game_fullscreen_state(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    require_game(&app, &window)?;
    Ok(json!({"fullscreen": window.is_fullscreen().map_err(err)?}))
}
#[tauri::command]
fn set_game_fullscreen(app: tauri::AppHandle, window: tauri::WebviewWindow, fullscreen: bool) -> Result<Value, String> {
    require_game(&app, &window)?;
    window.set_fullscreen(fullscreen).map_err(err)?;
    window.set_focus().map_err(err)?;
    Ok(json!({"fullscreen": window.is_fullscreen().map_err(err)?}))
}
#[tauri::command]
fn finish_game_checkpoint(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    token: String,
    ok: bool,
    message: String,
) -> Result<(), String> {
    if window.label() != "game" || window.url().map_err(err)?.origin() != origin(&app)?.origin() {
        return Err("Checkpoint acknowledgements are restricted to the current game.".into());
    }
    let state = app.state::<LauncherState>();
    let mut waiting = state.checkpoint.lock().map_err(err)?;
    if waiting.as_ref().map(|request| request.token.as_str()) != Some(token.as_str()) {
        return Err("There is no matching update checkpoint.".into());
    }
    let request = waiting.take().unwrap();
    let result = if ok {
        Ok(())
    } else {
        Err(message.chars().take(300).collect())
    };
    request
        .reply
        .send(result)
        .map_err(|_| "The update checkpoint has expired.".to_string())
}
async fn checkpoint_game(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("game") else {
        return Ok(());
    };
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let token = uuid::Uuid::new_v4().to_string();
    *app.state::<LauncherState>()
        .checkpoint
        .lock()
        .map_err(err)? = Some(CheckpointReply {
        token: token.clone(),
        reply: sender,
    });
    let script = format!(
        r#"(async()=>{{const token={};try{{if(!window.SARCloud?.checkpoint)throw new Error('The game cannot save an update checkpoint. Close the game and check again.');window.__SARLauncherResume=await window.SARCloud.checkpoint();await window.__TAURI__.core.invoke('finish_game_checkpoint',{{token,ok:true,message:''}});}}catch(error){{try{{await window.__TAURI__.core.invoke('finish_game_checkpoint',{{token,ok:false,message:String(error.message||error)}});}}catch(_){{window.__SARLauncherResume?.();}}}}}})()"#,
        serde_json::to_string(&token).map_err(err)?
    );
    if let Err(error) = window.eval(&script) {
        app.state::<LauncherState>()
            .checkpoint
            .lock()
            .map_err(err)?
            .take();
        return Err(err(error));
    }
    let result = match tokio::time::timeout(Duration::from_secs(60), receiver).await {
        Ok(Ok(result)) => result,
        _ => Err(
            "The game did not confirm that its account save is safe. Update was cancelled.".into(),
        ),
    };
    app.state::<LauncherState>()
        .checkpoint
        .lock()
        .map_err(err)?
        .take();
    result
}
#[tauri::command]
async fn install_launcher_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    manifest_digest: String,
) -> Result<(), String> {
    require_launcher(&window)?;
    let state = app.state::<LauncherState>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("An update is already in progress.".into());
    }
    let result = async {
        let (update, details, hash) = verified_update(&app, false).await?.ok_or("No launcher update is available.")?;
        if hash != manifest_digest { return Err("A different update is now available. Check again.".into()); }
        let expected_size = details["size"].as_u64().ok_or("Missing update size")?;
        let checksum = details["sha256"].as_str().ok_or("Missing update checksum")?;
        let mut downloaded = 0_u64;
        let bytes = update.download(|chunk, total| {
            downloaded += chunk as u64;
            let _ = app.emit("launcher-update-progress", json!({"downloaded": downloaded, "total": total.unwrap_or(expected_size), "phase": "Downloading"}));
        }, || {}).await.map_err(err)?;
        if bytes.len() as u64 != expected_size || digest(&bytes) != checksum.to_ascii_lowercase() {
            return Err("The downloaded update did not match its signed size or checksum.".into());
        }
        let _ = app.emit("launcher-update-progress", json!({"downloaded": expected_size, "total": expected_size, "phase": "Verified — installing"}));
        let _ = app.emit("launcher-update-progress", json!({"downloaded": expected_size, "total": expected_size, "phase": "Saving account world"}));
        checkpoint_game(&app).await?;
        {
            let mut settings = state.settings.lock().map_err(err)?;
            settings.resume_game = app.get_webview_window("game").is_some();
            store_settings(&app, &settings)?;
        }
        backend::prepare_update(&app).await?;
        update.install(bytes).map_err(err)?;
        #[cfg(not(windows))] app.restart();
        Ok(())
    }.await;
    state.busy.store(false, Ordering::SeqCst);
    if result.is_err() {
        if let Err(error) = backend::prepare(&app).await { backend::log(&app, &format!("Update recovery: {error}")); }
        if let Some(game) = app.get_webview_window("game") {
            let _ = game.eval("window.__SARLauncherResume?.(); delete window.__SARLauncherResume;");
        }
    }
    result
}
fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    let diagnostic = if arguments.get(1).map(String::as_str) == Some("--verify-update") {
        arguments
            .get(2)
            .zip(arguments.get(3))
            .map(|(server, output)| (server.clone(), PathBuf::from(output)))
    } else {
        None
    };
    let startup_diagnostic = if arguments.get(1).map(String::as_str) == Some("--verify-startup") {
        arguments.get(2).zip(arguments.get(3)).map(|(server, output)| (server.clone(), PathBuf::from(output)))
    } else { None };
    tauri::Builder::default().plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            backend::pin_existing_paths(app.handle())?;
            let mut settings = settings_path(app.handle()).ok().and_then(|p| fs::read(p).ok())
                .and_then(|bytes| serde_json::from_slice::<Settings>(&bytes).ok())
                .filter(|s| checked_origin(&s.server_origin).is_ok()).unwrap_or_default();
            let resume = diagnostic.is_none() && startup_diagnostic.is_none() && settings.resume_game;
            if let Some((server, _)) = &diagnostic { settings.server_origin = checked_origin(server)?.as_str().trim_end_matches('/').into(); }
            if let Some((server, _)) = &startup_diagnostic { settings.server_origin = checked_origin(server)?.as_str().trim_end_matches('/').into(); }
            app.manage(LauncherState { settings: Mutex::new(Settings { resume_game: false, ..settings }), busy: AtomicBool::new(false), checkpoint: Mutex::new(None), backend: backend::BackendRuntime::default() });
            if resume {
                let persisted = app.state::<LauncherState>().settings.lock().map_err(err)?.clone();
                store_settings(app.handle(), &persisted)?;
            }
            if let Some((_, output)) = diagnostic.clone() {
                if let Some(window) = app.get_webview_window("main") { window.hide()?; }
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let result: Result<Value, String> = async {
                        let (update, details, hash) = verified_update(&handle, true).await?.ok_or("No release manifest is published.")?;
                        let bytes = update.download(|_, _| {}, || {}).await.map_err(err)?;
                        if bytes.len() as u64 != details["size"].as_u64().unwrap_or(0) || digest(&bytes) != details["sha256"].as_str().unwrap_or("") {
                            return Err("Package size or checksum mismatch".into());
                        }
                        Ok(json!({"ok": true, "version": update.version, "size": bytes.len(), "sha256": digest(&bytes), "manifestDigest": hash,
                            "manifestSignatureVerified": true, "artifactSignatureVerified": true, "signedVersionVerified": true, "installed": false}))
                    }.await;
                    let exit_code = if result.is_ok() { 0 } else { 1 };
                    let record = match result { Ok(value) => value, Err(error) => json!({"ok": false, "error": error, "installed": false}) };
                    let _ = fs::write(output, serde_json::to_vec_pretty(&record).unwrap());
                    handle.exit(exit_code);
                });
            }
            if let Some((_, output)) = startup_diagnostic.clone() {
                if let Some(window) = app.get_webview_window("main") { window.hide()?; }
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let result = backend::prepare(&handle).await;
                    let mut record = match result { Ok(value) => value, Err(error) => json!({"online":false,"error":error}) };
                    record["databasePath"] = json!(backend::database_path(&handle).ok());
                    record["accountDataPath"] = json!(backend::data_root(&handle).ok().map(|p| p.join("account-webview")));
                    record["logPath"] = json!(backend::service_root(&handle).ok().map(|p| p.join("startup.log")));
                    record["serverOrigin"] = json!(origin(&handle).ok().map(|url| url.as_str().trim_end_matches('/').to_string()));
                    let _ = fs::write(output, serde_json::to_vec_pretty(&record).unwrap());
                    handle.exit(0);
                });
            } else if diagnostic.is_none() {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move { if let Err(error) = backend::prepare(&handle).await { backend::log(&handle, &format!("Startup backend preparation failed: {error}")); } });
            }
            if resume {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move { let _ = backend::prepare(&handle).await; let _ = game_window(&handle); });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![launcher_settings, save_server, server_status, check_launcher_update, play, install_launcher_update, finish_game_checkpoint, game_fullscreen_state, set_game_fullscreen, check_local_backend, offline_local_api])
        .run(tauri::generate_context!()).expect("Could not start Skirmish launcher");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origin_validation() {
        assert!(checked_origin("http://127.0.0.1:8803").is_ok());
        assert!(checked_origin("https://arena.example.com").is_ok());
        assert!(checked_origin("http://public.example.com").is_err());
        assert!(checked_origin("https://user:pass@arena.example.com").is_err());
        assert!(checked_origin("file:///c:/secret").is_err());
        assert!(checked_origin("https://arena.example.com/game").is_err());
    }
    #[test]
    fn bad_signature_rejected() {
        assert!(verify_manifest(b"{}", "untrusted").is_err());
    }
    #[test]
    fn signed_manifest_and_tamper_rejection() {
        let bytes = include_bytes!("../../fixtures/signed-manifest.json");
        let signature = include_str!("../../fixtures/signed-manifest.json.sig");
        let verified = verify_manifest(bytes, signature).unwrap();
        assert_eq!(verified["version"], "1.5.0");
        let changed = String::from_utf8(bytes.to_vec())
            .unwrap()
            .replace("1.5.0", "9.9.9");
        assert!(verify_manifest(changed.as_bytes(), signature).is_err());
    }
}
