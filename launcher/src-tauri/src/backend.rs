use crate::{err, origin, LauncherState};
use serde_json::{json, Value};
#[cfg(windows)]
use std::os::windows::{fs::OpenOptionsExt, process::CommandExt};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
#[path = "startup_progress.rs"]
mod startup_progress;

#[derive(Default)]
pub struct BackendRuntime {
    pub startup: tokio::sync::Mutex<()>,
    fallback: Mutex<Option<Arc<AtomicBool>>>,
}
pub fn local_origin(url: &reqwest::Url) -> bool {
    matches!(
        url.host_str(),
        Some("localhost") | Some("127.0.0.1") | Some("[::1]") | Some("::1")
    )
}
fn legacy_cache() -> Option<PathBuf> {
    // A previous desktop install was created from the packaged Codex process. Its
    // Windows virtualized data is a physical directory, and Explorer does not apply
    // that virtualization. Select that same directory explicitly on later launches.
    let packages = PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("Packages");
    let entries = fs::read_dir(packages).ok()?;
    for entry in entries.flatten() {
        if !entry
            .file_name()
            .to_string_lossy()
            .starts_with("OpenAI.Codex_")
        {
            continue;
        }
        let cache = entry.path().join("LocalCache");
        let config = cache.join("Roaming/com.skirmisharena.launcher");
        if config.join("launcher-settings.json").is_file()
            && config.join("account-webview").is_dir()
            && cache
                .join("Local/SkirmishArenaServer/skirmish.sqlite")
                .is_file()
        {
            return Some(cache);
        }
    }
    None
}
pub fn data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("SAR_LAUNCHER_DATA_ROOT") {
        return Ok(PathBuf::from(root));
    }
    if let Some(cache) = legacy_cache() {
        return Ok(cache.join("Roaming/com.skirmisharena.launcher"));
    }
    app.path().app_config_dir().map_err(err)
}
pub fn service_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if std::env::var_os("SAR_LAUNCHER_DATA_ROOT").is_some() {
        return Ok(data_root(app)?.join("local-service"));
    }
    if let Some(cache) = legacy_cache() {
        return Ok(cache.join("Local/SkirmishArenaServer"));
    }
    // Same durable database location used by Start-Game.ps1 in all previous builds.
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|p| p.join("SkirmishArenaServer"))
        .ok_or_else(|| "Windows local application data directory is unavailable.".into())
}
pub fn pin_existing_paths(app: &tauri::AppHandle) -> Result<(), String> {
    let config = data_root(app)?;
    fs::create_dir_all(&config).map_err(err)?;
    let selected = json!({"configPath":config,"accountDataPath":config.join("account-webview"),"databasePath":database_path(app)?,"serviceRoot":service_root(app)?});
    fs::write(
        config.join("desktop-local-paths.json"),
        serde_json::to_vec_pretty(&selected).map_err(err)?,
    )
    .map_err(err)
}
pub fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(std::env::var_os("SAR_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or(service_root(app)?.join("skirmish.sqlite")))
}
fn resources(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let packaged = app.path().resource_dir().map_err(err)?.join("backend");
    if packaged.join("node.exe").is_file() && packaged.join("server/index.cjs").is_file() {
        static VERIFIED: std::sync::OnceLock<Result<(), String>> = std::sync::OnceLock::new();
        VERIFIED.get_or_init(|| verify_resources(&packaged)).clone()?;
        return Ok(packaged);
    }
    // Development builds resolve the same staged payload; installed builds never reference Downloads.
    let staged = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend-bundle");
    #[cfg(debug_assertions)]
    if staged.join("node.exe").is_file() {
        return Ok(staged);
    }
    let _ = staged;
    Err("Bundled local backend is missing. Reinstall the desktop package; startup.log records the failure.".into())
}
fn verify_resources(root: &std::path::Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let files: std::collections::BTreeMap<String,String> = serde_json::from_str(include_str!("../../backend-bundle/desktop-integrity.json")).map_err(err)?;
    for (name, expected) in files {
        let bytes = fs::read(root.join(&name)).map_err(|_| format!("Installed release is incomplete: missing {name}. Finish the desktop update; account data was not changed."))?;
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if actual != expected { return Err(format!("Installed release integrity failed: {name} differs from desktop {}. Finish the desktop update; account data was not changed.",env!("CARGO_PKG_VERSION"))); }
    }
    Ok(())
}
pub fn log(app: &tauri::AppHandle, message: &str) {
    if let Ok(root) = service_root(app) {
        let _ = fs::create_dir_all(&root);
        if let Ok(mut output) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(root.join("startup.log"))
        {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let _ = writeln!(output, "{now} launcher={} {message}", std::process::id());
        }
    }
}
async fn startup_lock(app: &tauri::AppHandle, url: &reqwest::Url) -> Result<File, String> {
    let root = service_root(app)?;
    fs::create_dir_all(&root).map_err(err)?;
    let lock = root.join(format!(
        "backend-{}.lock",
        url.port_or_known_default().unwrap_or(8803)
    ));
    let start = Instant::now();
    let mut progress = startup_progress::Watch::new(25);
    let mut verified_attempt: Option<String> = None;
    let mut last_broadcast=Instant::now();
    loop {
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(windows)]
        options.share_mode(0);
        match options.open(&lock) {
            Ok(file) => {
                // Windows denies concurrent opens and releases this lock even after an app crash.
                #[cfg(not(windows))]
                file.lock().map_err(err)?;
                return Ok(file);
            }
            Err(error) if matches!(error.raw_os_error(), Some(32) | Some(33)) => {
                let ongoing=ongoing_startup(app,url);
                if let Some((identity,status,activity))=&ongoing {
                    if verified_attempt.as_deref()!=Some(identity.attempt.as_str()) {
                        verify_starting_process(identity)?;
                        verified_attempt=Some(identity.attempt.clone());
                    }
                    if progress.observe(start.elapsed(),Some(status),*activity,startup_progress::artifact_size(status))? {
                        report_startup(app,status);
                        last_broadcast=Instant::now();
                    } else if last_broadcast.elapsed()>Duration::from_secs(2) {
                        emit_startup(app,status);last_broadcast=Instant::now();
                    }
                } else {
                    progress.observe(start.elapsed(),None,startup_progress::Activity::default(),0)?;
                }
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
            Err(error) => return Err(format!("Could not acquire backend startup lock: {error}")),
        }
    }
}
fn ongoing_startup(app:&tauri::AppHandle,url:&reqwest::Url)->Option<(startup_progress::Identity,startup_progress::Status,startup_progress::Activity)> {
    let state=service_root(app).ok()?;let file=state.join("desktop-startup-request.json");
    if fs::metadata(&file).ok()?.len()>32768 {return None;}
    let record:Value=serde_json::from_slice(&fs::read(file).ok()?).ok()?;
    let pid=record["pid"].as_u64().filter(|p|*p>0&&*p<=u32::MAX as u64)? as u32;
    let attempt=record["attempt"].as_str()?;
    if record["schema"]!=1 || attempt.len()!=32 || !attempt.chars().all(|c|c.is_ascii_hexdigit()) {return None;}
    let root=resources(app).ok()?;
    let created=record["created"].as_str()?.parse::<u64>().ok()?;
    let identity=startup_progress::Identity {pid,attempt:attempt.into(),version:env!("CARGO_PKG_VERSION").into(),database:database_path(app).ok()?,node:root.join("node.exe"),entry:root.join("server/desktop-service.cjs"),origin:url.as_str().trim_end_matches('/').into(),created};
    let activity=startup_progress::process_activity(pid,&identity.node)?;
    if activity.created!=identity.created {return None;}
    // Apply the same path/release/origin checks to the launcher-written request.
    let mut expected=record;expected["stage"]=json!("opening-database");
    startup_progress::validate(&expected,&identity)?;
    let status=startup_progress::read_status(&state,&identity)?;
    Some((identity,status,activity))
}
#[cfg(windows)]
fn verify_starting_process(identity:&startup_progress::Identity)->Result<(),String> {
    let script=r#"
$ErrorActionPreference='Stop'
function NormalPath([string]$value) { [IO.Path]::GetFullPath($value).TrimEnd('\').ToLowerInvariant().Replace('\\?\','') }
$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$env:SAR_STARTING_PID)
if (!$p -or (NormalPath $p.ExecutablePath) -ne (NormalPath $env:SAR_STARTING_NODE)) { throw 'Pending backend executable identity changed' }
$relative='(?:^|\s|")server[\\/]desktop-service\.cjs(?:"|\s|$)'
$absolute='(?:^|\s|")'+[regex]::Escape($env:SAR_STARTING_ENTRY)+'(?:"|\s|$)'
if ($p.CommandLine -notmatch $relative -and $p.CommandLine -notmatch $absolute) { throw 'Pending backend entry point changed' }
"#;
    let mut command=Command::new("powershell.exe");command.args(["-NoProfile","-NonInteractive","-Command",script]).env("SAR_STARTING_PID",identity.pid.to_string()).env("SAR_STARTING_NODE",&identity.node).env("SAR_STARTING_ENTRY",&identity.entry).creation_flags(0x08000000);
    let output=command.output().map_err(err)?;
    if output.status.success(){Ok(())}else{Err("Pending local account migration could not verify its exact process identity. The process was left untouched.".into())}
}
#[cfg(not(windows))]
fn verify_starting_process(_identity:&startup_progress::Identity)->Result<(),String>{Ok(())}
fn report_startup(app:&tauri::AppHandle,status:&startup_progress::Status) {
    log(app,&format!("Local account startup stage: {}.",status.stage));
    emit_startup(app,status);
}
fn emit_startup(app:&tauri::AppHandle,status:&startup_progress::Status) {
    let message=match status.stage.as_str(){"snapshot"=>"Backing up your saved account before updating…","snapshot-verify"=>"Verifying your recoverable account backup…","archive"=>"Preserving retired conversation data…","archive-verify"=>"Verifying the retired-data archive…","migration-9"|"migration-10"=>"Updating saved account records…","listening"|"ready"=>"Starting the local account service…",_=>"Opening your saved account…"};
    let _=app.emit("backend-startup",json!({"stage":status.stage,"message":message}));
}
fn backend_ownership_lock(app: &tauri::AppHandle) -> Result<File, String> {
    let root = service_root(app)?;
    fs::create_dir_all(&root).map_err(err)?;
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    options.share_mode(0);
    // Preserve the installed lock identity across upgrades; the account backend
    // holds it for its full lifetime to prevent concurrent database services.
    let file = options.open(root.join("desktop-ai-owner.lock"))
        .map_err(|_| "Another desktop service owns this account database. Close that service before backend reconnect.".to_string())?;
    #[cfg(not(windows))]
    file.try_lock().map_err(err)?;
    Ok(file)
}
enum Health {
    Online(Value),
    Offline,
    Shell,
    Incompatible(String),
}
async fn health(url: &reqwest::Url) -> Health {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(value) => value,
        Err(_) => return Health::Offline,
    };
    let response = match client.get(url.join("api/status").unwrap()).send().await {
        Ok(value) => value,
        Err(_) => return Health::Offline,
    };
    let http_ok = response.status().is_success();
    let status = match response.json::<Value>().await {
        Ok(value) => value,
        Err(_) => {
            return Health::Incompatible(
                "Another service returned an invalid health response.".into(),
            )
        }
    };
    if status["localShell"] == true {
        return Health::Shell;
    }
    if http_ok
        && status["ok"] == true
        && status["databaseSchema"].as_u64().is_some()
        && status["version"].is_string()
    {
        return Health::Online(status);
    }
    Health::Incompatible(
        "The configured local port is occupied by an incompatible or unhealthy server.".into(),
    )
}
const DATABASE_SCHEMA: u64 = 10;
fn compatible(status: &Value) -> bool {
    status["version"] == env!("CARGO_PKG_VERSION") && status["databaseSchema"].as_u64() == Some(DATABASE_SCHEMA)
}
fn same_path(left: &std::path::Path, right: &std::path::Path) -> bool {
    let normalize = |path: &std::path::Path| {
        let value = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let value = value.to_string_lossy().replace('\\', "/");
        value.strip_prefix("//?/").unwrap_or(&value).to_lowercase()
    };
    normalize(left) == normalize(right)
}
fn validate_service_manifest(record: &Value, root: &std::path::Path, db: &std::path::Path, url: &reqwest::Url) -> Result<(), String> {
    let pid = record["pid"].as_u64().filter(|pid| *pid > 0 && *pid <= u32::MAX as u64);
    let token = record["controlToken"].as_str().unwrap_or("");
    let pipe = record["controlPipe"].as_str().unwrap_or("");
    let origin_ok = record["origin"].as_str().and_then(|value| reqwest::Url::parse(value).ok())
        .is_some_and(|value| local_origin(&value) && value.origin() == url.origin());
    if record["schema"] != 1 || pid.is_none() || token.len() != 64 || !token.chars().all(|value| value.is_ascii_hexdigit())
        || !pipe.starts_with(r"\\.\pipe\skirmish-arena-") || !origin_ok
        || !same_path(&PathBuf::from(record["nodeExecutable"].as_str().unwrap_or("")), &root.join("node.exe"))
        || !same_path(&PathBuf::from(record["entryPath"].as_str().unwrap_or("")), &root.join("server/desktop-service.cjs"))
        || !same_path(&PathBuf::from(record["databasePath"].as_str().unwrap_or("")), db)
    {
        return Err("The local service ownership manifest does not match this installed backend and canonical database. The process was left untouched.".into());
    }
    Ok(())
}
#[cfg(windows)]
fn verified_process(root: &std::path::Path, db: &std::path::Path, url: &reqwest::Url, pid: Option<u64>, legacy: bool, stop_creation: Option<&str>) -> Result<Value, String> {
    // Every candidate starts from the configured loopback listener PID, never
    // from enumerating or terminating node/Ollama processes by name.
    let script = r#"
$ErrorActionPreference = 'Stop'
function NormalPath([string]$value) { $full = [IO.Path]::GetFullPath($value); if ($full.StartsWith('\\?\')) { $full = $full.Substring(4) }; return $full.TrimEnd('\').ToLowerInvariant() }
$owners = @(Get-NetTCPConnection -LocalPort ([int]$env:SAR_CONTROL_PORT) -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
if ($owners.Count -ne 1) { throw 'Configured port has no unique desktop listener' }
$targetPid = [int]$owners[0]
if ($env:SAR_CONTROL_PID -and $targetPid -ne [int]$env:SAR_CONTROL_PID) { throw 'Listener PID changed; ownership cannot be verified' }
$service = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $targetPid)
if (!$service -or (NormalPath $service.ExecutablePath) -ne (NormalPath $env:SAR_CONTROL_NODE)) { throw 'Listener is not the installed Skirmish backend executable' }
$relativeEntry = '(?:^|\s|")server[\\/]desktop-service\.cjs(?:"|\s|$)'
$absoluteEntry = '(?:^|\s|")' + [regex]::Escape($env:SAR_CONTROL_ENTRY) + '(?:"|\s|$)'
if ($service.CommandLine -notmatch $relativeEntry -and $service.CommandLine -notmatch $absoluteEntry) { throw 'Listener is not the desktop service entry point' }
$created = $service.CreationDate.ToUniversalTime().ToString('o')
if ($env:SAR_CONTROL_STOP_CREATION -and $created -ne $env:SAR_CONTROL_STOP_CREATION) { throw 'Desktop process identity changed before handoff' }
if ($env:SAR_CONTROL_LEGACY -eq '1') {
  if (!(Test-Path -LiteralPath $env:SAR_CONTROL_DB -PathType Leaf)) { throw 'Canonical SQLite file is unavailable' }
  Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class SarRestartManager {
  [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public int pid; public System.Runtime.InteropServices.ComTypes.FILETIME started; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct ProcessInfo { public UniqueProcess process; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string name; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string service; public int type; public uint status; public uint session; [MarshalAs(UnmanagedType.Bool)] public bool restartable; }
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] public static extern int RmStartSession(out uint session, int flags, StringBuilder key);
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] public static extern int RmRegisterResources(uint session, uint count, string[] files, uint apps, UniqueProcess[] processes, uint services, string[] names);
  [DllImport("rstrtmgr.dll")] public static extern int RmGetList(uint session, out uint needed, ref uint count, [In,Out] ProcessInfo[] processes, ref uint reasons);
  [DllImport("rstrtmgr.dll")] public static extern int RmEndSession(uint session);
  public static bool HoldsFile(string[] files, int pid) { uint session; int result=RmStartSession(out session, 0, new StringBuilder(33)); if(result!=0) throw new Exception("Restart Manager unavailable"); try { if(RmRegisterResources(session,(uint)files.Length,files,0,null,0,null)!=0) throw new Exception("Cannot register canonical SQLite files"); uint needed=0,count=0,reasons=0; result=RmGetList(session,out needed,ref count,null,ref reasons); if(result==0 && needed==0) return false; if(result!=234) throw new Exception("Cannot inspect canonical SQLite ownership"); var entries=new ProcessInfo[needed];count=needed;if(RmGetList(session,out needed,ref count,entries,ref reasons)!=0)throw new Exception("Canonical database owner changed"); foreach(var entry in entries)if(entry.process.pid==pid)return true;return false; } finally {RmEndSession(session);} }
}
'@
  $files = @($env:SAR_CONTROL_DB, ($env:SAR_CONTROL_DB + '-wal'), ($env:SAR_CONTROL_DB + '-shm')) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
  if (![SarRestartManager]::HoldsFile([string[]]$files, $targetPid)) { throw 'Legacy listener does not hold the canonical SQLite database; it was left untouched' }
}
if ($env:SAR_CONTROL_STOP_CREATION) { Stop-Process -Id $targetPid -Force -ErrorAction Stop }
@{ pid=$targetPid; creation=$created; nodeExecutable=$service.ExecutablePath; entryPath=$env:SAR_CONTROL_ENTRY; databasePath=$env:SAR_CONTROL_DB; legacy=$env:SAR_CONTROL_LEGACY -eq '1' } | ConvertTo-Json -Compress
"#;
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("SAR_CONTROL_NODE", root.join("node.exe"))
        .env("SAR_CONTROL_ENTRY", root.join("server/desktop-service.cjs"))
        .env("SAR_CONTROL_DB", db)
        .env("SAR_CONTROL_PORT", url.port_or_known_default().unwrap_or(8803).to_string())
        .env("SAR_CONTROL_PID", pid.map(|pid| pid.to_string()).unwrap_or_default())
        .env("SAR_CONTROL_LEGACY", if legacy {"1"} else {"0"})
        .env("SAR_CONTROL_STOP_CREATION", stop_creation.unwrap_or(""))
        .creation_flags(0x08000000);
    let output = command.output().map_err(err)?;
    if !output.status.success() {
        return Err(format!("Desktop service ownership verification failed: {}", String::from_utf8_lossy(&output.stderr).chars().take(550).collect::<String>()));
    }
    serde_json::from_slice(&output.stdout).map_err(err)
}
#[cfg(not(windows))]
fn verified_process(_root: &std::path::Path, _db: &std::path::Path, _url: &reqwest::Url, _pid: Option<u64>, _legacy: bool, _stop: Option<&str>) -> Result<Value, String> {
    Err("Desktop lifecycle ownership verification requires Windows.".into())
}
#[cfg(windows)]
fn pipe_request(record: &Value, action: &str) -> Result<Value, String> {
    use std::os::windows::io::AsRawHandle;
    #[link(name="kernel32")]
    extern "system" { fn SetNamedPipeHandleState(handle: *mut std::ffi::c_void, mode: *const u32, maximum: *const u32, timeout: *const u32) -> i32; }
    let mut pipe = OpenOptions::new().read(true).write(true).open(record["controlPipe"].as_str().ok_or("Missing private control pipe")?).map_err(err)?;
    let mode = 1_u32; // PIPE_NOWAIT: a dead owned service cannot block the launcher.
    if unsafe { SetNamedPipeHandleState(pipe.as_raw_handle(), &mode, std::ptr::null(), std::ptr::null()) } == 0 {
        return Err("Could not set a bounded private lifecycle pipe read.".into());
    }
    writeln!(pipe, "{}", json!({"token":record["controlToken"],"action":action})).map_err(err)?;
    let until = Instant::now() + Duration::from_secs(4);
    let mut input = Vec::new();
    while Instant::now() < until {
        let mut bytes = [0_u8; 4096];
        match pipe.read(&mut bytes) {
            Ok(0) => std::thread::sleep(Duration::from_millis(25)),
            Ok(count) => { input.extend_from_slice(&bytes[..count]); if input.contains(&b'\n') { break; } if input.len()>8192 { return Err("Lifecycle response is too large.".into()); } },
            Err(error) if matches!(error.raw_os_error(), Some(232) | Some(535)) || error.kind()==std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(25)),
            Err(error) => return Err(err(error)),
        }
    }
    let reply: Value = serde_json::from_slice(&input).map_err(|_| "Private lifecycle control did not return a valid response.".to_string())?;
    if reply["ok"] != true { return Err("Private lifecycle request was rejected; existing process left untouched.".into()); }
    Ok(reply)
}
#[cfg(not(windows))]
fn pipe_request(_record: &Value, _action: &str) -> Result<Value, String> { Err("Windows private lifecycle control unavailable.".into()) }
#[cfg(windows)]
fn wait_owned_exit(pid: u32) -> Result<(), String> {
    #[link(name="kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
        fn WaitForSingleObject(handle: *mut std::ffi::c_void, milliseconds: u32) -> u32;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }
    let handle=unsafe { OpenProcess(0x00100000,0,pid) }; // SYNCHRONIZE only.
    if handle.is_null() {
        let error=std::io::Error::last_os_error();
        if error.raw_os_error()==Some(87) { return Ok(()); } // Already exited.
        return Err(format!("Could not wait for the verified desktop backend exit: {error}"));
    }
    let result=unsafe { WaitForSingleObject(handle,8000) };
    unsafe { CloseHandle(handle); }
    if result==0 {Ok(())} else {Err("The owned desktop backend has not finished closing its database/worker. No duplicate was started.".into())}
}
#[cfg(not(windows))]
fn wait_owned_exit(_pid: u32) -> Result<(), String> { Err("Windows process lifecycle wait unavailable.".into()) }
fn retire_legacy_owned_from(root: &std::path::Path, checkpoint_root: &std::path::Path, db: &std::path::Path, url: &reqwest::Url) -> Result<Value, String> {
    let owner = verified_process(root, db, url, None, true, None)?;
    let output = hidden_command(checkpoint_root, "server/desktop-service.cjs", db, url).arg("--checkpoint-only").output().map_err(err)?;
    if !output.status.success() || serde_json::from_slice::<Value>(&output.stdout).ok().map_or(true, |value| value["ok"] != true) {
        return Err("Legacy canonical SQLite checkpoint failed; the verified backend was left running.".into());
    }
    verified_process(root, db, url, owner["pid"].as_u64(), true, owner["creation"].as_str())?;
    Ok(owner)
}
fn retire_legacy_owned(root: &std::path::Path, db: &std::path::Path, url: &reqwest::Url) -> Result<Value, String> {
    retire_legacy_owned_from(root, root, db, url)
}
fn select_owned_legacy_root(roots: &[PathBuf], db: &std::path::Path, url: &reqwest::Url) -> Result<PathBuf, String> {
    let mut failure = "No known installed desktop service owns the canonical database.".to_string();
    for root in roots {
        match verified_process(root, db, url, None, true, None) {
            Ok(_) => return Ok(root.clone()),
            Err(error) => failure = error,
        }
    }
    Err(failure)
}
fn replaceable_runtime(status: &Value) -> Result<(), String> {
    let parse_version = |version: &str| -> Option<Vec<u64>> { version.split('.').map(|part| part.parse().ok()).collect() };
    let current = parse_version(env!("CARGO_PKG_VERSION")).ok_or("Current desktop version is invalid")?;
    let running = parse_version(status["version"].as_str().unwrap_or("")).ok_or("Running backend version is invalid; process left untouched")?;
    if running > current || status["databaseSchema"].as_u64().unwrap_or(u64::MAX)>DATABASE_SCHEMA {
        return Err("A newer local backend is running. This desktop build cannot replace or downgrade it.".into());
    }
    Ok(())
}
fn validate_private_health(record: &Value, owned: &Value, db: &std::path::Path) -> Result<(), String> {
    // Older HTTP status handlers re-read version.json after the installer has
    // replaced it. The authenticated pipe and startup manifest identify the
    // process actually running, independently of those new files on disk.
    if owned["pid"] != record["pid"] || owned["version"] != record["version"]
        || owned["databaseSchema"] != record["databaseSchema"]
        || !same_path(&PathBuf::from(owned["databasePath"].as_str().unwrap_or("")), db) {
        return Err("Private lifecycle health did not match the canonical backend. Process left untouched.".into());
    }
    replaceable_runtime(owned)
}
fn stop_owned_old_backend(app: &tauri::AppHandle, url: &reqwest::Url, status: &Value) -> Result<(), String> {
    replaceable_runtime(status)?;
    let current_root = resources(app)?;
    let db = database_path(app)?;
    let mut roots = vec![current_root.clone()];
    // A former packaged-app install has a physical, known backend folder. A
    // launcher installed by Explorer may now use the ordinary application folder.
    // Only the pinned legacy installation is eligible, with the same database.
    if std::env::var_os("SAR_LAUNCHER_DATA_ROOT").is_none() {
        if let Some(cache) = legacy_cache() {
            let legacy_db = cache.join("Local/SkirmishArenaServer/skirmish.sqlite");
            let legacy_root = cache.join("Local/Skirmish Arena Reimagined/backend");
            if same_path(&db, &legacy_db) && legacy_root.join("node.exe").is_file()
                && !same_path(&current_root, &legacy_root) {
                roots.push(legacy_root);
            }
        }
    }
    let marker = service_root(app)?.join("desktop-service.json");
    let retired_pid=if marker.is_file() {
        let record: Value = serde_json::from_slice(&fs::read(marker).map_err(err)?).map_err(err)?;
        let root = roots.iter().find(|root| validate_service_manifest(&record, root, &db, url).is_ok())
            .ok_or("The lifecycle marker does not belong to a known installed backend and canonical database. Process left untouched.")?;
        verified_process(&root, &db, url, record["pid"].as_u64(), false, None)?;
        let owned = pipe_request(&record, "health")?;
        validate_private_health(&record, &owned, &db)?;
        pipe_request(&record, "shutdown")?;
        log(app, "Requested authenticated graceful shutdown of the older owned desktop backend before starting this release.");
        record["pid"].as_u64().unwrap() as u32
    } else {
        // Legacy releases had no manifest or pipe. Exact installed-path/PID,
        // entrypoint and canonical SQLite handle ownership are all mandatory.
        let root = select_owned_legacy_root(&roots, &db, url)?;
        let owner=retire_legacy_owned_from(&root, &current_root, &db, url)?;
        log(app, "Legacy installed desktop backend identity and canonical database handle verified; checkpoint completed before one-time owned PID handoff.");
        owner["pid"].as_u64().unwrap() as u32
    };
    wait_owned_exit(retired_pid)?;
    let until = Instant::now()+Duration::from_secs(8);
    while Instant::now()<until {
        if !port_occupied(url) { return Ok(()); }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err("Owned desktop backend did not release its port after handoff. No duplicate backend was started.".into())
}
fn hidden_command(
    root: &std::path::Path,
    entry: &str,
    db: &std::path::Path,
    url: &reqwest::Url,
) -> Command {
    let mut command = Command::new(root.join("node.exe"));
    // Node's main-module resolver treats a Windows extended namespace path
    // (\\?\C:\...) as an invalid drive prefix. Resolve the entry from its own cwd.
    command
        .arg(entry)
        .current_dir(root)
        .env("SAR_DB_PATH", db)
        .env(
            "SAR_HOST",
            url.host_str()
                .unwrap_or("127.0.0.1")
                .trim_matches(['[', ']']),
        )
        .env(
            "SAR_PORT",
            url.port_or_known_default().unwrap_or(8803).to_string(),
        )
        .env(
            "SAR_LOCAL_SERVER_ORIGIN",
            url.as_str().trim_end_matches('/'),
        );
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
}
fn port_occupied(url: &reqwest::Url) -> bool {
    url.socket_addrs(|| None)
        .map(|addresses| {
            addresses.into_iter().any(|address| {
                TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok()
            })
        })
        .unwrap_or(true)
}
fn start_backend(
    app: &tauri::AppHandle,
    url: &reqwest::Url,
    ownership: File,
    attempt: &str,
) -> Result<Child, String> {
    let root = resources(app)?;
    let state = service_root(app)?;
    fs::create_dir_all(&state).map_err(err)?;
    let output = OpenOptions::new()
        .create(true)
        .append(true)
        .open(state.join("server.stdout.log"))
        .map_err(err)?;
    let errors = OpenOptions::new()
        .create(true)
        .append(true)
        .open(state.join("server.stderr.log"))
        .map_err(err)?;
    let db = database_path(app)?;
    let child = hidden_command(&root, "server/desktop-service.cjs", &db, url)
        .env("SAR_SERVICE_ROOT", &state)
        .env("SAR_STARTUP_ATTEMPT", attempt)
        // The inherited open lock follows the shared service's full process
        // lifetime, including after the launching game/launcher has closed.
        .stdin(Stdio::from(ownership))
        .stdout(output)
        .stderr(errors)
        .spawn()
        .map_err(err)?;
    log(app, &format!("Started hidden bundled backend pid={} database={}. Shared service remains available after a launcher closes; it is not killed while other game/browser clients may use it.", child.id(), db.display()));
    Ok(child)
}
fn startup_request(app:&tauri::AppHandle,url:&reqwest::Url,pid:u32,attempt:String)->Result<startup_progress::Identity,String> {
    let root=resources(app)?;let state=service_root(app)?;
    let mut identity=startup_progress::Identity {pid,attempt,version:env!("CARGO_PKG_VERSION").into(),database:database_path(app)?,node:root.join("node.exe"),entry:root.join("server/desktop-service.cjs"),origin:url.as_str().trim_end_matches('/').into(),created:0};
    identity.created=startup_progress::process_activity(pid,&identity.node).map(|a|a.created).unwrap_or_default();
    let record=json!({"schema":1,"pid":pid,"attempt":identity.attempt,"version":identity.version,"databasePath":identity.database,"nodeExecutable":identity.node,"entryPath":identity.entry,"origin":identity.origin,"created":identity.created.to_string()});
    let temporary=state.join(format!("desktop-startup-request.{pid}.tmp"));
    fs::write(&temporary,serde_json::to_vec(&record).map_err(err)?).map_err(err)?;
    fs::rename(temporary,state.join("desktop-startup-request.json")).map_err(err)?;
    Ok(identity)
}
async fn wait_existing_startup(app:&tauri::AppHandle,url:&reqwest::Url,identity:&startup_progress::Identity)->Result<Value,String> {
    verify_starting_process(identity)?;
    let state=service_root(app)?;let start=Instant::now();let mut progress=startup_progress::Watch::new(15);let mut last_broadcast=Instant::now();
    loop {
        match health(url).await {
            Health::Online(status) if compatible(&status)=>return Ok(json!({"online":true,"mode":"local","reused":true,"gameVersion":status["version"],"pid":identity.pid})),
            Health::Online(_) | Health::Incompatible(_)=>return Err("Pending local account service failed compatibility validation. The process was left untouched.".into()),
            _=>{},
        }
        let activity=startup_progress::process_activity(identity.pid,&identity.node).ok_or_else(||"Pending account migration process exited; see server.stderr.log. Retry starts a clean attempt.".to_string())?;
        if activity.created!=identity.created {return Err("Pending account migration process identity changed. The process was left untouched.".into());}
        let status=startup_progress::read_status(&state,identity);
        if progress.observe(start.elapsed(),status.as_ref(),activity,status.as_ref().map(startup_progress::artifact_size).unwrap_or(0))? {if let Some(status)=status.as_ref() {report_startup(app,status);last_broadcast=Instant::now();}} else if last_broadcast.elapsed()>Duration::from_secs(2) {if let Some(status)=status.as_ref(){emit_startup(app,status);last_broadcast=Instant::now();}}
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}
fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "webmanifest" => "application/manifest+json",
        "glb" => "model/gltf-binary",
        _ => "application/octet-stream",
    }
}
fn serve_shell(mut socket: TcpStream, root: &std::path::Path, allowed: &[String]) {
    let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = socket.set_write_timeout(Some(Duration::from_secs(3)));
    let mut request = [0_u8; 16384];
    let count = match socket.read(&mut request) {
        Ok(count) => count,
        Err(_) => return,
    };
    let text = String::from_utf8_lossy(&request[..count]);
    let mut first = text.lines().next().unwrap_or("").split_whitespace();
    let method = first.next().unwrap_or("");
    let route = first.next().unwrap_or("").split('?').next().unwrap_or("");
    let asset = if route == "/" {
        "index.html"
    } else {
        route.strip_prefix('/').unwrap_or("")
    };
    let (status, kind, body) = if route.starts_with("/api/") {
        (
            "503 Service Unavailable",
            "application/json",
            br#"{"error":"Cloud backend offline","code":"BACKEND_OFFLINE","localShell":true}"#
                .to_vec(),
        )
    } else if matches!(method, "GET" | "HEAD") && allowed.iter().any(|value| value == asset) {
        match fs::read(root.join(asset)) {
            Ok(bytes) => ("200 OK", mime(asset), bytes),
            Err(_) => (
                "404 Not Found",
                "text/plain",
                b"Game asset unavailable".to_vec(),
            ),
        }
    } else {
        ("404 Not Found", "text/plain", b"Not found".to_vec())
    };
    let header = format!("HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n", body.len());
    let _ = socket.write_all(header.as_bytes());
    if method != "HEAD" {
        let _ = socket.write_all(&body);
    }
}
fn shell_fallback(app: &tauri::AppHandle, url: &reqwest::Url) -> Result<(), String> {
    let root = resources(app)?;
    let assets: Vec<String> =
        serde_json::from_slice(&fs::read(root.join("desktop-shell.json")).map_err(err)?)
            .map_err(err)?;
    let listener = TcpListener::bind((
        url.host_str()
            .unwrap_or("127.0.0.1")
            .trim_matches(['[', ']']),
        url.port_or_known_default().unwrap_or(8803),
    ))
    .map_err(err)?;
    listener.set_nonblocking(true).map_err(err)?;
    let stop = Arc::new(AtomicBool::new(false));
    *app.state::<LauncherState>()
        .backend
        .fallback
        .lock()
        .map_err(err)? = Some(stop.clone());
    std::thread::spawn(move || {
        while !stop.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((socket, _)) => {
                    let root = root.clone();
                    let assets = assets.clone();
                    std::thread::spawn(move || serve_shell(socket, &root, &assets));
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(40))
                }
                Err(_) => break,
            }
        }
    });
    log(app, "Started static-only same-origin local game shell. API health remains offline; no account is invented.");
    Ok(())
}
pub async fn prepare(app: &tauri::AppHandle) -> Result<Value, String> {
    let url = origin(app)?;
    if !local_origin(&url) {
        let online = matches!(health(&url).await, Health::Online(_));
        return Ok(
            json!({"online": online, "mode": "remote", "serverOrigin": url.as_str().trim_end_matches('/')}),
        );
    }
    let state = app.state::<LauncherState>();
    let _serial = state.backend.startup.lock().await;
    if state.busy.load(Ordering::SeqCst) {
        return Err("The desktop update is finishing. Local services will resume with the updated app.".into());
    }
    // Validate this launch even when a healthy service can be reused.
    resources(app)?;
    let _lock = startup_lock(app, &url).await?;
    let current_health = health(&url).await;
    match current_health {
        Health::Online(status) if compatible(&status) => return Ok(json!({"online":true,"mode":"local","reused":true,"gameVersion":status["version"]})),
        Health::Online(status) => {
            // Active native sessions must acknowledge their saved world before
            // any backend release handoff, including a reconnect during play.
            crate::checkpoint_game(app).await?;
            let handle = app.clone(); let target = url.clone();
            let handed_off = tauri::async_runtime::spawn_blocking(move || stop_owned_old_backend(&handle, &target, &status)).await.map_err(err)?;
            if let Some(game) = app.get_webview_window("game") { let _ = game.eval("window.__SARLauncherResume?.(); delete window.__SARLauncherResume;"); }
            handed_off?;
        },
        Health::Incompatible(error) => return Err(error),
        Health::Shell => {
            let stop = state.backend.fallback.lock().map_err(err)?.take();
            if let Some(stop) = stop { stop.store(true, Ordering::SeqCst); tokio::time::sleep(Duration::from_millis(100)).await; }
            else { return Ok(json!({"online":false,"mode":"local","localShell":true})); }
        }
        Health::Offline => {},
    }
    let result = async {
        // A previous launcher may have closed during a legitimate migration.
        // Its child retains the database ownership lock. Reuse its exact attempt.
        if let Some((identity,_,_))=ongoing_startup(app,&url) {
            return wait_existing_startup(app,&url,&identity).await;
        }
        if port_occupied(&url) {
            return Err("The local port is occupied but its backend health is unavailable. The existing process was left untouched; continuing with the cached local world.".into());
        }
        let owner = backend_ownership_lock(app)?;
        let attempt=uuid::Uuid::new_v4().simple().to_string();
        let mut child = start_backend(app, &url, owner, &attempt)?;
        let identity=startup_request(app,&url,child.id(),attempt)?;
        let ready = async {
            let start=Instant::now();let state=service_root(app)?;let mut progress=startup_progress::Watch::new(15);let mut last_broadcast=Instant::now();
            loop {
                match health(&url).await {
                    Health::Online(status) if compatible(&status) => return Ok(json!({"online":true,"mode":"local","reused":false,"gameVersion":status["version"],"pid":child.id()})),
                    Health::Online(_) | Health::Incompatible(_) => return Err("Local server started but failed compatibility validation.".into()),
                    _ => {},
                }
                if let Some(status) = child.try_wait().map_err(err)? { return Err(format!("Bundled backend exited during startup ({status}); see server.stderr.log.")); }
                let activity=startup_progress::process_activity(child.id(),&identity.node).unwrap_or_default();
                if identity.created>0 && activity.created!=identity.created {return Err("Owned account migration process could not verify its startup identity; see server.stderr.log.".into());}
                let status=startup_progress::read_status(&state,&identity);
                if progress.observe(start.elapsed(),status.as_ref(),activity,status.as_ref().map(startup_progress::artifact_size).unwrap_or(0))? {if let Some(status)=status.as_ref() {report_startup(app,status);last_broadcast=Instant::now();}} else if last_broadcast.elapsed()>Duration::from_secs(2) {if let Some(status)=status.as_ref(){emit_startup(app,status);last_broadcast=Instant::now();}}
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
        }.await;
        if ready.is_err() && child.try_wait().map_err(err)?.is_none() {
            // Login has not begun. Do not leave an unhealthy owned child behind
            // for a later startup to duplicate; SQLite retains its recoverable WAL.
            let _ = child.kill();
            let _ = child.wait();
            log(app, "Stopped the owned backend that failed startup before allowing a later retry.");
        }
        ready
    }.await;
    match result {
        Ok(value) => {
            log(
                app,
                "Local backend healthy; account login/sync may now begin.",
            );
            Ok(value)
        }
        Err(error) => {
            log(app, &format!("BACKEND STARTUP FAILED: {error}"));
            if let Err(fallback) = shell_fallback(app, &url) {
                log(app, &format!("Static shell fallback unavailable: {fallback}. Previously cached WebView shell may still load."));
            }
            Ok(
                json!({"online":false,"mode":"local","startupError":error,"logPath":service_root(app)?.join("startup.log")}),
            )
        }
    }
}

// The installer overwrites the bundled runtime. Leaving this shared process
// alive locks node.exe on Windows and can interrupt installation halfway through.
pub async fn prepare_update(app: &tauri::AppHandle) -> Result<(), String> {
    let url = origin(app)?;
    if !local_origin(&url) { return Ok(()); }
    let state = app.state::<LauncherState>();
    let _serial = state.backend.startup.lock().await;
    let _lock = startup_lock(app, &url).await?;
    match health(&url).await {
        Health::Online(status) => {
            let handle = app.clone(); let target = url.clone();
            tauri::async_runtime::spawn_blocking(move || stop_owned_old_backend(&handle, &target, &status)).await.map_err(err)??;
        },
        Health::Incompatible(error) => return Err(error),
        Health::Shell | Health::Offline => {},
    }
    log(app, "Update checkpoint complete; owned local service has exited before installer file replacement.");
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_backend_never_classified_local() {
        for value in [
            "https://arena.example.com",
            "https://127.0.0.1.example.com",
            "https://localhost.example.com",
        ] {
            assert!(!local_origin(&reqwest::Url::parse(value).unwrap()));
        }
        for value in [
            "http://127.0.0.1:8803",
            "http://localhost:8810",
            "http://[::1]:8803",
        ] {
            assert!(local_origin(&reqwest::Url::parse(value).unwrap()));
        }
    }
    #[test]
    fn health_reuse_requires_exact_baseline_and_schema() {
        assert!(compatible(&json!({"version":env!("CARGO_PKG_VERSION"),"databaseSchema":DATABASE_SCHEMA})));
        assert!(!compatible(&json!({"version":"1.5.1","databaseSchema":DATABASE_SCHEMA})));
        assert!(!compatible(&json!({"version":env!("CARGO_PKG_VERSION"),"databaseSchema":DATABASE_SCHEMA-1})));
        assert!(!compatible(&json!({"version":env!("CARGO_PKG_VERSION"),"databaseSchema":DATABASE_SCHEMA+1})));
        assert!(!compatible(&json!({"version":env!("CARGO_PKG_VERSION"),"databaseSchema":3})));
    }
    #[test]
    fn ownership_manifest_rejects_unrelated_paths_database_and_origin() {
        let root=std::env::temp_dir().join("sar-owned-path-test/backend");
        let db=std::env::temp_dir().join("sar-owned-path-test/service/skirmish.sqlite");
        let url=reqwest::Url::parse("http://127.0.0.1:8803").unwrap();
        let valid=json!({"schema":1,"pid":42,"controlToken":"a".repeat(64),"controlPipe":r"\\.\pipe\skirmish-arena-test-42","origin":url.as_str().trim_end_matches('/'),"nodeExecutable":root.join("node.exe"),"entryPath":root.join("server/desktop-service.cjs"),"databasePath":db});
        assert!(validate_service_manifest(&valid,&root,&db,&url).is_ok());
        for (key,value) in [("nodeExecutable",json!(root.join("unexpected.exe"))),("entryPath",json!(root.join("other.cjs"))),("databasePath",json!(root.join("other.sqlite"))),("origin",json!("https://remote.example.com")),("pid",json!(0)),("controlPipe",json!("http://127.0.0.1:8803/api/shutdown")),("controlToken",json!("short"))] {
            let mut record=valid.clone();record[key]=value;assert!(validate_service_manifest(&record,&root,&db,&url).is_err(),"{key}");
        }
    }
    #[test]
    fn handoff_uses_authenticated_startup_identity_after_payload_replacement() {
        let db=std::env::temp_dir().join("sar-handoff/skirmish.sqlite");
        let record=json!({"pid":42,"version":"1.7.0","databaseSchema":4,"databasePath":db});
        // The old HTTP handler now sees the newly installed version file.
        assert!(replaceable_runtime(&json!({"version":env!("CARGO_PKG_VERSION"),"databaseSchema":4})).is_ok());
        assert!(validate_private_health(&record,&record,&db).is_ok());
        for (key,value) in [("pid",json!(43)),("version",json!("1.6.0")),("databaseSchema",json!(5)),("databasePath",json!(db.with_file_name("unrelated.sqlite")))] {
            let mut wrong=record.clone();wrong[key]=value;
            assert!(validate_private_health(&record,&wrong,&db).is_err(),"{key}");
        }
        for (version,schema) in [("99.0.0",DATABASE_SCHEMA),(env!("CARGO_PKG_VERSION"),DATABASE_SCHEMA+1)] {
            let newer=json!({"pid":42,"version":version,"databaseSchema":schema,"databasePath":db});
            assert!(validate_private_health(&newer,&newer,&db).is_err());
        }
    }
    #[cfg(windows)]
    #[test]
    fn legacy_handoff_runtime() {
        let Some(value)=std::env::var_os("SAR_LIFECYCLE_FIXTURE") else {return;};
        let fixture:Value=serde_json::from_slice(&fs::read(value).unwrap()).unwrap();
        let root=PathBuf::from(fixture["root"].as_str().unwrap());
        let db=PathBuf::from(fixture["database"].as_str().unwrap());
        let url=reqwest::Url::parse(fixture["origin"].as_str().unwrap()).unwrap();
        assert!(verified_process(&root,&db,&url,Some(fixture["pid"].as_u64().unwrap()+1),true,None).is_err());
        assert!(verified_process(&root,&db.with_file_name("unrelated.sqlite"),&url,None,true,None).is_err());
        let selected=select_owned_legacy_root(&[root.join("new-install"),root.clone()],&db,&url).unwrap();
        assert!(same_path(&selected,&root));
        let owner=retire_legacy_owned(&root,&db,&url).unwrap();
        assert_eq!(owner["pid"],fixture["pid"]);
        wait_owned_exit(owner["pid"].as_u64().unwrap() as u32).unwrap();
        let until=Instant::now()+Duration::from_secs(5);
        while port_occupied(&url)&&Instant::now()<until {std::thread::sleep(Duration::from_millis(50));}
        assert!(!port_occupied(&url));
    }
    #[cfg(windows)]
    #[test]
    fn private_control_handoff_runtime() {
        let Some(value)=std::env::var_os("SAR_PRIVATE_CONTROL_FIXTURE") else {return;};
        let fixture:Value=serde_json::from_slice(&fs::read(value).unwrap()).unwrap();
        let record:Value=serde_json::from_slice(&fs::read(fixture["marker"].as_str().unwrap()).unwrap()).unwrap();
        let root=PathBuf::from(fixture["root"].as_str().unwrap());
        let db=PathBuf::from(record["databasePath"].as_str().unwrap());
        let url=reqwest::Url::parse(record["origin"].as_str().unwrap()).unwrap();
        validate_service_manifest(&record,&root,&db,&url).unwrap();
        verified_process(&root,&db,&url,record["pid"].as_u64(),false,None).unwrap();
        let mut wrong=record.clone();wrong["controlToken"]=json!("0".repeat(64));
        assert!(pipe_request(&wrong,"shutdown").is_err());
        assert!(port_occupied(&url));
        let health=pipe_request(&record,"health").unwrap();
        assert_eq!(health["pid"],record["pid"]);
        assert!(health.get("controlToken").is_none());
        pipe_request(&record,"shutdown").unwrap();
        wait_owned_exit(record["pid"].as_u64().unwrap() as u32).unwrap();
        let until=Instant::now()+Duration::from_secs(5);
        while port_occupied(&url)&&Instant::now()<until {std::thread::sleep(Duration::from_millis(50));}
        assert!(!port_occupied(&url));
    }
    #[cfg(windows)]
    #[test]
    fn pending_startup_cim_requires_the_owned_node_and_exact_entry() {
        let node=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend-bundle/node.exe");
        if !node.is_file(){return;}
        let folder=std::env::temp_dir().join(format!("sar-pending-startup-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&folder).unwrap();let entry=folder.join("desktop-service.cjs");
        fs::write(&entry,"setInterval(()=>{},1000);\n").unwrap();
        let mut command=Command::new(&node);command.arg(&entry).creation_flags(0x08000000);
        let mut child=command.spawn().unwrap();
        let identity=startup_progress::Identity {pid:child.id(),attempt:"a".repeat(32),version:env!("CARGO_PKG_VERSION").into(),database:folder.join("isolated.sqlite"),node:node.clone(),entry:entry.clone(),origin:"http://127.0.0.1:8803".into(),created:0};
        let accepted=verify_starting_process(&identity);let mut wrong=identity.clone();wrong.entry=folder.join("unrelated.cjs");let rejected=verify_starting_process(&wrong);
        child.kill().unwrap();child.wait().unwrap();fs::remove_file(&entry).unwrap();fs::remove_dir(&folder).unwrap();
        assert!(accepted.is_ok(),"{accepted:?}");assert!(rejected.is_err());
    }
    #[cfg(windows)]
    #[test]
    fn startup_lock_is_exclusive_and_crash_safe() {
        let path =
            std::env::temp_dir().join(format!("sar-startup-lock-{}.lock", uuid::Uuid::new_v4()));
        let open = || {
            OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .share_mode(0)
                .open(&path)
        };
        let owner = open().unwrap();
        assert_eq!(open().err().unwrap().raw_os_error(), Some(32));
        drop(owner);
        assert!(open().is_ok());
        fs::remove_file(path).unwrap();
    }
}
