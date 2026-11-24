#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::{redirect::Policy, Client, Method, Url};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{fs, time::Duration};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: usize = 16 * 1024 * 1024;
const BLANK: &str = r#"{"version":1,"next":1,"actions":[]}"#;
const LOCAL_ERROR: &str = "Could not access the local SQLite register.";

fn read_local(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    let directory = app.path().app_local_data_dir().map_err(|_| LOCAL_ERROR)?;
    fs::create_dir_all(&directory).map_err(|_| LOCAL_ERROR)?;
    let db = Connection::open(directory.join("action-review.sqlite")).map_err(|_| LOCAL_ERROR)?;
    access_local(&db, payload)
}

fn access_local(db: &Connection, payload: Option<Value>) -> Result<Value, String> {
    db.busy_timeout(Duration::from_secs(5)).map_err(|_| LOCAL_ERROR)?;
    db.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS action_review_register (
             id INTEGER PRIMARY KEY CHECK (id = 1),
             revision INTEGER NOT NULL,
             register TEXT NOT NULL
         );",
    ).map_err(|_| LOCAL_ERROR)?;
    db.execute("INSERT OR IGNORE INTO action_review_register VALUES (1, 0, ?1)", [BLANK])
        .map_err(|_| LOCAL_ERROR)?;

    if let Some(payload) = payload {
        let revision = payload["revision"].as_i64()
            .filter(|&number| (0..i32::MAX as i64).contains(&number))
            .ok_or("Invalid register revision.")?;
        let register = &payload["register"];
        if register["version"].as_u64() != Some(1) || !register["actions"].is_array() ||
            register["next"].as_u64().is_none() {
            return Err("Invalid register payload.".into());
        }
        let register = register.to_string();
        if register.len() > MAX_BYTES {
            return Err("The register exceeds the 16 MB storage limit.".into());
        }
        let updated = db.execute(
            "UPDATE action_review_register SET revision = revision + 1, register = ?1 WHERE id = 1 AND revision = ?2",
            params![register, revision],
        ).map_err(|_| LOCAL_ERROR)?;
        if updated != 1 {
            return Err("Someone updated the register. Reload before saving.".into());
        }
        return Ok(json!({ "revision": revision + 1 }));
    }
    let (revision, register): (i64, String) = db.query_row(
        "SELECT revision, register FROM action_review_register WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| LOCAL_ERROR)?;
    let register: Value = serde_json::from_str(&register).map_err(|_| "The local register could not be read.")?;
    Ok(json!({ "revision": revision, "register": register }))
}

#[tauri::command]
async fn local_register(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || read_local(app, payload))
        .await.map_err(|_| LOCAL_ERROR)?
}

fn register_url(server: &str) -> Result<Url, &'static str> {
    let mut url = Url::parse(server).map_err(|_| "Enter a valid Action Review server URL.")?;
    let loopback = match url.host() {
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        Some(url::Host::Domain(name)) => name == "localhost",
        None => false,
    };
    if (url.scheme() != "https" && !(url.scheme() == "http" && loopback)) ||
        !url.username().is_empty() || url.password().is_some() ||
        url.query().is_some() || url.fragment().is_some() || url.path() != "/" {
        return Err("Use an HTTPS server origin, or HTTP on localhost.");
    }
    url.set_path("/api/register");
    Ok(url)
}

#[tauri::command]
async fn remote_register(client: State<'_, Client>, server: String, key: String, payload: Option<Value>) -> Result<Value, String> {
    let url = register_url(&server)?;
    let method = if payload.is_some() { Method::PUT } else { Method::GET };
    let mut request = client.request(method, url);
    if !key.is_empty() {
        request = request.bearer_auth(key);
    }
    if let Some(payload) = payload {
        let body = payload.to_string();
        if body.len() > MAX_BYTES {
            return Err("The register exceeds the 16 MB storage limit.".into());
        }
        request = request.header("Content-Type", "application/json").body(body);
    }
    let mut response = request.send().await.map_err(|_| "Could not reach the Action Review server.")?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Could not read the server response.")? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("The server response exceeds the 16 MB storage limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body: Value = serde_json::from_slice(&bytes).map_err(|_| "The server did not return an Action Review response.")?;
    if !status.is_success() {
        return Err(body["error"].as_str().unwrap_or("The server returned an error.").into());
    }
    Ok(body)
}

#[tauri::command]
async fn save_export(app: AppHandle, filename: String, bytes: Vec<u8>) -> Result<(), String> {
    if !filename.starts_with("action-review-") || !filename.bytes().all(|c| c.is_ascii_alphanumeric() || b"-.".contains(&c)) {
        return Err("Invalid export filename.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app.dialog().file().set_file_name(&filename).blocking_save_file() else {
            return Ok(());
        };
        let path = selected.into_path().map_err(|_| "Choose a local file.")?;
        fs::write(path, bytes).map_err(|_| "Could not save the export.".into())
    }).await.map_err(|_| "Could not save the export.")?
}

fn main() {
    let client = Client::builder().redirect(Policy::none()).timeout(Duration::from_secs(15))
        .build().expect("Could not initialise HTTPS");
    tauri::Builder::default()
        .manage(client)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![local_register, remote_register, save_export])
        .run(tauri::generate_context!())
        .expect("Could not launch Action Review");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_rejects_stale_revisions() {
        let database = Connection::open_in_memory().unwrap();
        let first = access_local(&database, None).unwrap();
        assert_eq!(first["revision"], 0);
        let write = json!({ "revision": 0, "register": first["register"] });
        assert_eq!(access_local(&database, Some(write.clone())).unwrap()["revision"], 1);
        assert!(access_local(&database, Some(write)).unwrap_err().contains("Reload"));
        assert_eq!(access_local(&database, None).unwrap()["revision"], 1);
    }

    #[test]
    fn remote_mode_accepts_https_and_loopback_http() {
        assert_eq!(register_url("https://review.example.com").unwrap().path(), "/api/register");
        assert!(register_url("http://127.0.0.1:8787").is_ok());
        assert!(register_url("http://[::1]:8787").is_ok());
        assert!(register_url("http://review.example.com").is_err());
        assert!(register_url("https://review.example.com/path").is_err());
        assert!(register_url("https://user@review.example.com/").is_err());
    }
}
