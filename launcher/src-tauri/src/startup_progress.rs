//! Private desktop startup evidence. A changing timestamp is not readiness or progress.
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}, time::{Duration,SystemTime,UNIX_EPOCH}};
use super::same_path;

#[derive(Clone, Debug)]
pub struct Identity {
    pub pid: u32, pub attempt: String, pub version: String,
    pub database: PathBuf, pub node: PathBuf, pub entry: PathBuf, pub origin: String, pub created:u64,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Activity { pub created: u64, pub cpu: u64, pub io: u64 }
#[derive(Clone, Debug)]
pub struct Status { pub stage: String, pub artifact: Option<PathBuf>, pub message: String, pub stage_age:Duration, pub attempt_age:Duration }

pub fn validate(record: &Value, expected: &Identity) -> Option<Status> {
    let stage=record["stage"].as_str()?;
    if record["schema"]!=1 || record["pid"].as_u64()!=Some(expected.pid as u64)
        || record["attempt"].as_str()!=Some(expected.attempt.as_str())
        || record["version"].as_str()!=Some(expected.version.as_str())
        || record["origin"].as_str()!=Some(expected.origin.as_str())
        || !same_path(Path::new(record["databasePath"].as_str()?), &expected.database)
        || !same_path(Path::new(record["nodeExecutable"].as_str()?), &expected.node)
        || !same_path(Path::new(record["entryPath"].as_str()?), &expected.entry)
        || !matches!(stage,"opening-database"|"snapshot"|"snapshot-verify"|"archive"|"archive-verify"|"migration-9"|"migration-10"|"migration-11"|"listening"|"ready"|"failed") {
        return None;
    }
    let artifact=record["artifactPath"].as_str().filter(|s|!s.is_empty()).map(PathBuf::from);
    if let Some(file)=&artifact {
        let prefix=format!("{}.pre-",expected.database.file_name()?.to_string_lossy());
        if !same_path(file.parent()?,expected.database.parent()?)
            || !file.file_name()?.to_string_lossy().starts_with(&prefix) {return None;}
    }
    let now=SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
    let age=|key:&str|record[key].as_u64().map(|at|Duration::from_millis(now.saturating_sub(at))).unwrap_or_default();
    Some(Status {stage:stage.into(),artifact,message:record["message"].as_str().unwrap_or("").chars().take(400).collect(),stage_age:age("stageStartedAt"),attempt_age:age("startedAt")})
}
pub fn read_status(state: &Path, expected: &Identity) -> Option<Status> {
    let file=state.join("desktop-startup.json");
    if fs::metadata(&file).ok()?.len()>32768 {return None;}
    validate(&serde_json::from_slice::<Value>(&fs::read(file).ok()?).ok()?,expected)
}
pub fn artifact_size(status: &Status) -> u64 {status.artifact.as_ref().and_then(|p|fs::metadata(p).ok()).map(|m|m.len()).unwrap_or(0)}

pub struct Watch {
    normal_limit: Duration, stage: String, stage_at: Duration, last_activity: Duration,
    activity: Activity, bytes: u64, migrated: bool,
}
impl Watch {
    pub fn new(normal_seconds:u64) -> Self {Self {normal_limit:Duration::from_secs(normal_seconds),stage:String::new(),stage_at:Duration::ZERO,last_activity:Duration::ZERO,activity:Activity::default(),bytes:0,migrated:false}}
    pub fn stage(&self)->&str {if self.stage.is_empty(){"starting-service"}else{&self.stage}}
    pub fn observe(&mut self,elapsed:Duration,status:Option<&Status>,activity:Activity,bytes:u64)->Result<bool,String> {
        let mut changed=false;
        if let Some(status)=status {
            if status.stage=="failed" {return Err(format!("Local account startup failed at {}. {} See server.stderr.log; saved data was retained.",self.stage(),status.message));}
            if status.stage!=self.stage {self.stage=status.stage.clone();self.stage_at=elapsed;self.last_activity=elapsed;self.bytes=0;changed=true;}
        }
        let heavy=matches!(self.stage.as_str(),"snapshot"|"snapshot-verify"|"archive"|"archive-verify");
        let applying=matches!(self.stage.as_str(),"migration-9"|"migration-10"|"migration-11");
        self.migrated|=heavy||applying;
        if activity.cpu>self.activity.cpu || activity.io>self.activity.io || bytes>self.bytes {self.last_activity=elapsed;}
        // A temporary marker read failure must not reset counters and turn an
        // unchanged sample into invented progress on the next poll.
        self.activity.cpu=self.activity.cpu.max(activity.cpu);
        self.activity.io=self.activity.io.max(activity.io);
        self.activity.created=activity.created;self.bytes=self.bytes.max(bytes);
        let stage_limit=if heavy {Duration::from_secs(900)} else if applying {Duration::from_secs(120)} else {self.normal_limit};
        if let Some(status)=status {if status.stage_age>stage_limit || status.attempt_age>Duration::from_secs(4200) {return Err(format!("Existing local account startup exceeded its bounded {} stage; see server.stderr.log. The existing process was left untouched.",self.stage()));}}
        if !self.migrated && elapsed>self.normal_limit {return Err(format!("Local account service did not become healthy within {} seconds ({}); see server.stderr.log.",self.normal_limit.as_secs(),self.stage()));}
        if elapsed.saturating_sub(self.stage_at)>stage_limit {return Err(format!("Local account startup exceeded the bounded {} stage limit ({} seconds); see server.stderr.log. Saved data was retained.",self.stage(),stage_limit.as_secs()));}
        if (heavy||applying) && elapsed.saturating_sub(self.last_activity)>Duration::from_secs(60) {return Err(format!("Local account startup stalled at {}: no process CPU, I/O, artifact growth or stage progress for 60 seconds; see server.stderr.log. Saved data was retained.",self.stage()));}
        if elapsed>Duration::from_secs(4200) {return Err(format!("Local account startup exceeded its bounded migration attempt at {}; see server.stderr.log.",self.stage()));}
        Ok(changed)
    }
}

#[cfg(windows)]
pub fn process_activity(pid:u32,node:&Path)->Option<Activity> {
    use std::ffi::c_void;
    #[repr(C)] #[derive(Default)] struct FileTime {low:u32,high:u32}
    #[repr(C)] #[derive(Default)] struct IoCounters {read_ops:u64,write_ops:u64,other_ops:u64,read:u64,write:u64,other:u64}
    #[link(name="kernel32")] extern "system" {
        fn OpenProcess(access:u32,inherit:i32,pid:u32)->*mut c_void;
        fn CloseHandle(handle:*mut c_void)->i32;
        fn GetProcessTimes(handle:*mut c_void,creation:*mut FileTime,exit:*mut FileTime,kernel:*mut FileTime,user:*mut FileTime)->i32;
        fn GetProcessIoCounters(handle:*mut c_void,counters:*mut IoCounters)->i32;
        fn GetExitCodeProcess(handle:*mut c_void,code:*mut u32)->i32;
        fn QueryFullProcessImageNameW(handle:*mut c_void,flags:u32,name:*mut u16,size:*mut u32)->i32;
    }
    let handle=unsafe{OpenProcess(0x1000,0,pid)};if handle.is_null(){return None;}
    let result=(||{
        let mut code=0;let mut name=vec![0u16;32768];let mut len=name.len() as u32;
        if unsafe{GetExitCodeProcess(handle,&mut code)}==0 || code!=259
            || unsafe{QueryFullProcessImageNameW(handle,0,name.as_mut_ptr(),&mut len)}==0
            || !same_path(Path::new(&String::from_utf16_lossy(&name[..len as usize])),node) {return None;}
        let (mut created,mut exit,mut kernel,mut user,mut io)=(FileTime::default(),FileTime::default(),FileTime::default(),FileTime::default(),IoCounters::default());
        if unsafe{GetProcessTimes(handle,&mut created,&mut exit,&mut kernel,&mut user)}==0 || unsafe{GetProcessIoCounters(handle,&mut io)}==0 {return None;}
        let value=|v:FileTime|((v.high as u64)<<32)|v.low as u64;
        Some(Activity {created:value(created),cpu:value(kernel).saturating_add(value(user)),io:io.read.saturating_add(io.write).saturating_add(io.other)})
    })();unsafe{CloseHandle(handle)};result
}
#[cfg(not(windows))]
pub fn process_activity(_pid:u32,_node:&Path)->Option<Activity> {None}

#[cfg(test)] mod tests {
    use super::*;use serde_json::json;
    fn status(stage:&str)->Status {Status{stage:stage.into(),artifact:None,message:String::new(),stage_age:Duration::ZERO,attempt_age:Duration::ZERO}}
    #[test] fn real_migration_activity_survives_normal_deadline_but_never_becomes_ready() {
        let mut watch=Watch::new(15);let backup=status("snapshot");
        for second in 0..80 {watch.observe(Duration::from_secs(second),Some(&backup),Activity{cpu:second+1,io:second*1024,created:1},second*1024).unwrap();}
        assert_eq!(watch.stage(),"snapshot");
        let ready=status("ready");assert!(watch.observe(Duration::from_secs(80),Some(&ready),Activity{cpu:80,io:8096,created:1},0).unwrap());
    }
    #[test] fn silence_and_stage_cap_report_the_actual_stage() {
        let mut watch=Watch::new(15);let s=status("snapshot-verify");watch.observe(Duration::ZERO,Some(&s),Activity::default(),0).unwrap();
        assert!(watch.observe(Duration::from_secs(61),Some(&s),Activity::default(),0).unwrap_err().contains("snapshot-verify"));
        let mut watch=Watch::new(15);let s=status("archive");
        for second in 0..901 {watch.observe(Duration::from_secs(second),Some(&s),Activity{cpu:second+1,..Activity::default()},second).unwrap();}
        assert!(watch.observe(Duration::from_secs(901),Some(&s),Activity{cpu:9999,..Activity::default()},9999).unwrap_err().contains("bounded archive"));
        assert!(Watch::new(15).observe(Duration::from_secs(16),None,Activity::default(),0).is_err());
    }
    #[test] fn timestamps_cannot_fake_progress_and_retry_has_a_fresh_bound() {
        let mut watch=Watch::new(15);let s=status("migration-9");watch.observe(Duration::ZERO,Some(&s),Activity::default(),0).unwrap();
        assert!(watch.observe(Duration::from_secs(61),Some(&s),Activity::default(),0).is_err());
        assert!(Watch::new(15).observe(Duration::from_secs(1),Some(&s),Activity::default(),0).is_ok());
        let mut expired=status("snapshot");expired.stage_age=Duration::from_secs(901);
        assert!(Watch::new(15).observe(Duration::ZERO,Some(&expired),Activity{cpu:99,..Activity::default()},0).unwrap_err().contains("Existing"));
    }
    #[test] fn schema11_reset_requires_verified_progress_and_keeps_the_migration_bound() {
        let mut watch=Watch::new(15);let reset=status("migration-11");
        for second in 0..121 {watch.observe(Duration::from_secs(second),Some(&reset),Activity{cpu:second+1,..Activity::default()},0).unwrap();}
        assert_eq!(watch.stage(),"migration-11");
        assert!(watch.observe(Duration::from_secs(121),Some(&reset),Activity{cpu:999,..Activity::default()},0).unwrap_err().contains("bounded migration-11"));
        let mut silent=Watch::new(15);silent.observe(Duration::ZERO,Some(&reset),Activity::default(),0).unwrap();
        assert!(silent.observe(Duration::from_secs(61),Some(&reset),Activity::default(),0).unwrap_err().contains("migration-11"));
    }
    #[test] fn marker_requires_the_exact_attempt_process_paths_database_and_release() {
        let base=std::env::temp_dir().join("sar-progress-test");let id=Identity{pid:42,attempt:"a".repeat(32),version:"1.13.0".into(),database:base.join("data/world.sqlite"),node:base.join("node.exe"),entry:base.join("server/desktop-service.cjs"),origin:"http://127.0.0.1:8803".into(),created:1};
        let good=json!({"schema":1,"pid":id.pid,"attempt":id.attempt,"version":id.version,"databasePath":id.database,"nodeExecutable":id.node,"entryPath":id.entry,"origin":id.origin,"stage":"snapshot","artifactPath":base.join("data/world.sqlite.pre-schema8-proof.sqlite")});assert!(validate(&good,&id).is_some());
        let mut reset=good.clone();reset["stage"]=json!("migration-11");assert!(validate(&reset,&id).is_some());reset["stage"]=json!("migration-999");assert!(validate(&reset,&id).is_none());
        for (key,value) in [("pid",json!(43)),("attempt",json!("b".repeat(32))),("version",json!("1.8.0")),("databasePath",json!(base.join("other.sqlite"))),("nodeExecutable",json!(base.join("other.exe"))),("entryPath",json!(base.join("other.cjs"))),("origin",json!("http://127.0.0.1:8804")),("artifactPath",json!(base.join("outside/pre-schema.sqlite")))] {let mut bad=good.clone();bad[key]=value;assert!(validate(&bad,&id).is_none(),"{key}");}
    }
    #[cfg(windows)]
    #[test] fn real_windows_cpu_and_io_counters_require_the_exact_executable() {
        let exe=std::env::current_exe().unwrap();let pid=std::process::id();
        let before=process_activity(pid,&exe).expect("Native process query is available");assert!(before.created>0);
        assert!(process_activity(pid,&exe.with_file_name("unrelated.exe")).is_none());
        let start=std::time::Instant::now();let mut value=1u64;
        while start.elapsed()<Duration::from_millis(150) {value=value.wrapping_mul(1664525).wrapping_add(1013904223);std::hint::black_box(value);}
        let file=std::env::temp_dir().join(format!("sar-native-activity-{}.tmp",uuid::Uuid::new_v4()));
        fs::write(&file,vec![7u8;131072]).unwrap();fs::read(&file).unwrap();fs::remove_file(&file).unwrap();
        let after=process_activity(pid,&exe).unwrap();assert_eq!(after.created,before.created);assert!(after.cpu>before.cpu);assert!(after.io>before.io);
    }
}
