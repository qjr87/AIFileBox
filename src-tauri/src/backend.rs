use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// AI 对话式整理智能体（分类 / 改名计划 → 审核 → 执行 → 撤销）。
pub mod agent;
/// 分类规则：全局「总说明.md」、文件夹「_规则.md」与 AI 生成的分类规则总览。
pub mod rules;

#[derive(Debug, Serialize, Clone)]
pub struct LibraryDto {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub purpose: String,
    pub folder_depth: i64,
    pub availability: String,
    pub profile_status: String,
    pub file_count: i64,
    /// 文件库根目录有「_规则.md」。
    pub has_rules: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct FolderNodeDto {
    pub name: String,
    pub path: String,
    pub count: u64,
    pub children: Vec<FolderNodeDto>,
    /// 这个文件夹里有「_规则.md」。
    pub has_rules: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct OperationDto {
    pub id: String,
    pub item_id: String,
    pub name: String,
    pub mode: String,
    pub state: String,
    pub source_path: String,
    pub destination_path: String,
    pub created_at: String,
    pub error: Option<String>,
    pub can_retry: bool,
    pub can_undo: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiSettingsDto {
    pub enabled: bool,
    pub protocol: String,
    pub endpoint: String,
    pub model: String,
    pub api_key: String,
    pub has_api_key: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct RecoverySummaryDto {
    pub recovered: u64,
    pub needs_attention: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiRequestLogDto {
    pub id: String,
    pub created_at: String,
    pub stage: String,
    pub endpoint: String,
    pub model: String,
    pub protocol: String,
    pub status_code: u16,
    pub ok: bool,
    pub elapsed_ms: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub total_tokens: u64,
    pub system_prompt: String,
    pub request_body: String,
    pub response_body: String,
    pub error: String,
}

static GLOBAL_DB_PATH: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: String,
}

fn now() -> String {
    format!(
        "{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    )
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("organizer.sqlite3"))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(db_path(app)?).map_err(|e| e.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|e| e.to_string())?;
    Ok(connection)
}

fn initialized_dbs() -> &'static Mutex<HashSet<PathBuf>> {
    static DBS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    DBS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let path = db_path(app)?;
    let _ = GLOBAL_DB_PATH.set(path.clone());
    let mut initialized = initialized_dbs()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if path.is_file() && initialized.contains(&path) {
        return Ok(());
    }
    let connection = open_db(app)?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS libraries (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            purpose TEXT NOT NULL DEFAULT '',
            folder_depth INTEGER NOT NULL DEFAULT 0,
            availability TEXT NOT NULL DEFAULT 'available',
            profile_status TEXT NOT NULL DEFAULT 'draft',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analysis_items (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            source_path TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            recommendation_library_id TEXT,
            recommendation_folder_path TEXT NOT NULL DEFAULT '',
            confidence TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            detail TEXT NOT NULL DEFAULT '',
            source_parent TEXT,
            source_signature TEXT NOT NULL DEFAULT '',
            size_bytes INTEGER NOT NULL DEFAULT 0,
            modified_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (recommendation_library_id) REFERENCES libraries(id)
        );
        CREATE TABLE IF NOT EXISTS archive_operations (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            state TEXT NOT NULL,
            source_path TEXT NOT NULL,
            destination_path TEXT NOT NULL,
            signature TEXT NOT NULL DEFAULT '',
            source_signature TEXT NOT NULL DEFAULT '',
            staging_path TEXT NOT NULL DEFAULT '',
            staging_signature TEXT NOT NULL DEFAULT '',
            source_retained INTEGER NOT NULL DEFAULT 1,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (item_id) REFERENCES analysis_items(id)
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ai_request_logs (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            stage TEXT NOT NULL DEFAULT '',
            endpoint TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            protocol TEXT NOT NULL DEFAULT '',
            status_code INTEGER NOT NULL DEFAULT 0,
            ok INTEGER NOT NULL DEFAULT 0,
            elapsed_ms INTEGER NOT NULL DEFAULT 0,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cached_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            system_prompt TEXT NOT NULL DEFAULT '',
            request_body TEXT NOT NULL DEFAULT '',
            response_body TEXT NOT NULL DEFAULT '',
            error TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_items_status ON analysis_items(status);
        CREATE INDEX IF NOT EXISTS idx_operations_created ON archive_operations(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created ON ai_request_logs(created_at DESC);",
        )
        .map_err(|e| e.to_string())?;
    ensure_column(
        &connection,
        "analysis_items",
        "source_signature",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        &connection,
        "libraries",
        "folder_depth",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &connection,
        "analysis_items",
        "recommendation_folder_path",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        &connection,
        "archive_operations",
        "source_signature",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        &connection,
        "archive_operations",
        "staging_path",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        &connection,
        "archive_operations",
        "staging_signature",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        &connection,
        "archive_operations",
        "source_retained",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(
        &connection,
        "archive_operations",
        "updated_at",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    agent::ensure_schema(&connection)?;
    rules::ensure_schema(&connection)?;
    rules::migrate_purposes(&connection);
    initialized.insert(path);
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?;
    for name in names {
        if name.map_err(|e| e.to_string())? == column {
            return Ok(());
        }
    }
    connection
        .execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn validate_folder_depth(folder_depth: i64) -> Result<(), String> {
    if (0..=20).contains(&folder_depth) {
        Ok(())
    } else {
        Err("目录展示深度必须是 0 到 20 之间的整数".into())
    }
}

fn normalize_path(path: PathBuf) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = raw.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

fn canonical(path: &str) -> Result<PathBuf, String> {
    let cleaned = normalize_path(PathBuf::from(path));
    fs::canonicalize(&cleaned)
        .map(normalize_path)
        .map_err(|e| format!("无法访问路径：{e}"))
}

/// 用于路径去重与查表的规范化键（Windows 文件系统不区分大小写）。
pub(super) fn path_key(path: &Path) -> String {
    let cleaned = normalize_path(path.to_path_buf());
    let text = cleaned.to_string_lossy().replace('\\', "/");
    let trimmed = text.trim_end_matches('/');
    let base = if trimmed.is_empty() { text.as_ref() } else { trimmed };
    if cfg!(windows) {
        base.to_lowercase()
    } else {
        base.to_string()
    }
}

pub(super) fn same_path(left: &Path, right: &Path) -> bool {
    path_key(left) == path_key(right)
}

/// 判断 `child` 是否等于 `parent` 或位于 `parent` 内部（Windows 上忽略大小写）。
pub(super) fn path_starts_with(child: &Path, parent: &Path) -> bool {
    let left = normalize_path(child.to_path_buf());
    let right = normalize_path(parent.to_path_buf());
    let mut left_iter = left.components();
    for right_comp in right.components() {
        let Some(left_comp) = left_iter.next() else {
            return false;
        };
        let matches = if cfg!(windows) {
            left_comp.as_os_str().to_string_lossy().to_lowercase()
                == right_comp.as_os_str().to_string_lossy().to_lowercase()
        } else {
            left_comp == right_comp
        };
        if !matches {
            return false;
        }
    }
    true
}

fn is_internal_staging_entry(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with(".aifile-") && name.ends_with(".partial"))
        .unwrap_or(false)
}

fn cleanup_staging_path(staging: &Path) {
    if !staging.as_os_str().is_empty() && staging.exists() {
        let _ = if staging.is_dir() {
            fs::remove_dir_all(staging)
        } else {
            fs::remove_file(staging)
        };
    }
}

fn safe_stats(path: &Path) -> Result<(u64, u64), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(format!("不支持符号链接或目录链接：{}", path.display()));
    }
    if metadata.is_file() {
        return Ok((metadata.len(), 1));
    }
    if !metadata.is_dir() {
        return Err(format!("不支持的文件类型：{}", path.display()));
    }
    let mut size = 0_u64;
    let mut count = 0_u64;
    for entry in
        fs::read_dir(path).map_err(|e| format!("无法读取目录 {}：{}", path.display(), e))?
    {
        // Statistics are informational only. A single symlink/junction or an
        // unreadable sub-folder deep inside a library must not mark the whole
        // library as unavailable or block registering it, so skip such entries.
        let Ok(entry) = entry else {
            continue;
        };
        let entry_path = entry.path();
        if is_internal_staging_entry(&entry_path) || rules::is_rule_file(&entry_path) {
            continue;
        }
        if let Ok((child_size, child_count)) = safe_stats(&entry_path) {
            size = size.saturating_add(child_size);
            count = count.saturating_add(child_count);
        }
    }
    Ok((size, count))
}

/// File counts are informational but expensive (full recursive walk), and
/// `list_libraries` is called after every operation. Cache them briefly and
/// invalidate explicitly whenever this app changes library contents.
const STATS_CACHE_TTL: Duration = Duration::from_secs(60);

fn stats_cache() -> &'static Mutex<HashMap<String, (Instant, u64)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Instant, u64)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn library_file_count(root: &Path) -> Result<u64, String> {
    let key = root.to_string_lossy().to_string();
    if let Ok(cache) = stats_cache().lock() {
        if let Some((cached_at, count)) = cache.get(&key) {
            if cached_at.elapsed() < STATS_CACHE_TTL {
                return Ok(*count);
            }
        }
    }
    let count = safe_stats(root)?.1;
    if let Ok(mut cache) = stats_cache().lock() {
        cache.insert(key, (Instant::now(), count));
    }
    Ok(count)
}

fn invalidate_stats_cache() {
    if let Ok(mut cache) = stats_cache().lock() {
        cache.clear();
    }
}

fn fingerprint(path: &Path) -> Result<String, String> {
    let mut hasher = Sha256::new();
    fingerprint_entry(path, Path::new(""), &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

fn fingerprint_entry(path: &Path, relative: &Path, hasher: &mut Sha256) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(format!("不支持符号链接或目录链接：{}", path.display()));
    }
    if metadata.is_file() {
        let len = metadata.len();
        hasher.update(b"file\0");
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update(len.to_le_bytes());
        let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
        const SAMPLE_CHUNK: u64 = 64 * 1024;
        if len <= SAMPLE_CHUNK * 3 {
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
                if read == 0 {
                    break;
                }
                hasher.update(&buffer[..read]);
            }
        } else {
            let mut buffer = vec![0_u8; SAMPLE_CHUNK as usize];
            let offsets = [0_u64, (len / 2).saturating_sub(SAMPLE_CHUNK / 2), len - SAMPLE_CHUNK];
            for offset in offsets {
                file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
                file.read_exact(&mut buffer).map_err(|e| e.to_string())?;
                hasher.update(&buffer);
            }
        }
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err(format!("不支持的文件类型：{}", path.display()));
    }
    hasher.update(b"dir\0");
    hasher.update(relative.to_string_lossy().as_bytes());
    let mut entries = fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
    for entry in entries {
        fingerprint_entry(&entry.path(), &relative.join(entry.file_name()), hasher)?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_libraries(app: AppHandle) -> Result<Vec<LibraryDto>, String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let mut statement = connection.prepare("SELECT id, name, root_path, purpose, folder_depth, availability, profile_status FROM libraries ORDER BY name").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(statement);
    drop(connection);
    // Count libraries in parallel; availability is always checked live (cheap)
    // so a cached count never hides a library whose folder disappeared.
    let counts: Vec<Option<u64>> = std::thread::scope(|scope| {
        let handles = rows
            .iter()
            .map(|row| {
                let root = row.2.clone();
                scope.spawn(move || {
                    let root_path = Path::new(&root);
                    let is_dir = fs::metadata(root_path)
                        .map(|metadata| metadata.is_dir())
                        .unwrap_or(false);
                    if !is_dir {
                        return None;
                    }
                    library_file_count(root_path).ok()
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .map(|handle| handle.join().ok().flatten())
            .collect()
    });
    Ok(rows
        .into_iter()
        .zip(counts)
        .map(
            |((id, name, root_path, purpose, folder_depth, availability, profile_status), count)| {
                let has_rules = count.is_some()
                    && Path::new(&root_path).join(rules::RULE_FILE_NAME).is_file();
                LibraryDto {
                    has_rules,
                    id,
                    name,
                    root_path,
                    purpose,
                    folder_depth,
                    availability: if count.is_some() {
                        availability
                    } else {
                        "unavailable".into()
                    },
                    profile_status,
                    file_count: count.unwrap_or(0) as i64,
                }
            },
        )
        .collect())
}

#[tauri::command]
pub fn create_library(
    app: AppHandle,
    name: String,
    root_path: String,
    purpose: String,
    folder_depth: i64,
) -> Result<LibraryDto, String> {
    initialize(&app)?;
    if name.trim().is_empty() {
        return Err("文件库名称不能为空".into());
    }
    validate_folder_depth(folder_depth)?;
    let root = canonical(&root_path)?;
    if !root.is_dir() {
        return Err("文件库必须是一个文件夹".into());
    }
    let stats = safe_stats(&root)?;
    let libraries = list_libraries(app.clone())?;
    if libraries
        .iter()
        .any(|lib| same_path(&PathBuf::from(&lib.root_path), &root))
    {
        return Err("这个文件夹已经登记为文件库".into());
    }
    if libraries.iter().any(|lib| {
        let lib_root = PathBuf::from(&lib.root_path);
        path_starts_with(&root, &lib_root) || path_starts_with(&lib_root, &root)
    }) {
        return Err("文件库不能互相嵌套，请选择不重叠的文件夹".into());
    }
    // The UI resolves recommendation targets by library name, so names must be unique.
    if libraries
        .iter()
        .any(|lib| lib.name.trim().to_lowercase() == name.trim().to_lowercase())
    {
        return Err("已存在同名文件库，请换一个名称".into());
    }
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    // 收录说明已由文件库根目录的「_规则.md」取代：创建时填写的说明直接写进规则文件（已有规则文件则不动）。
    let rule_file = root.join(rules::RULE_FILE_NAME);
    if !purpose.trim().is_empty() && fs::symlink_metadata(&rule_file).is_err() {
        rules::write_rule_file(
            &rule_file,
            &format!("# {}\n\n## 放什么\n\n{}\n", name.trim(), purpose.trim()),
        )?;
    }
    let has_rules = rule_file.is_file();
    let connection = open_db(&app)?;
    connection.execute("INSERT INTO libraries (id, name, root_path, purpose, folder_depth, availability, profile_status, created_at, updated_at) VALUES (?1, ?2, ?3, '', ?4, 'available', 'draft', ?5, ?5)", params![id, name.trim(), root.to_string_lossy().to_string(), folder_depth, timestamp]).map_err(|e| e.to_string())?;
    Ok(LibraryDto {
        id,
        name: name.trim().to_string(),
        root_path: root.to_string_lossy().to_string(),
        purpose: String::new(),
        folder_depth,
        availability: "available".into(),
        profile_status: "draft".into(),
        file_count: stats.1 as i64,
        has_rules,
    })
}

#[tauri::command]
pub fn update_library(
    app: AppHandle,
    library_id: String,
    name: String,
    folder_depth: i64,
    root_path: Option<String>,
) -> Result<LibraryDto, String> {
    initialize(&app)?;
    if name.trim().is_empty() {
        return Err("文件库名称不能为空".into());
    }
    validate_folder_depth(folder_depth)?;
    let resolved_root = match root_path {
        Some(raw) if !raw.trim().is_empty() => {
            let root = canonical(&raw)?;
            if !root.is_dir() {
                return Err("文件库必须是一个文件夹".into());
            }
            let libraries = list_libraries(app.clone())?;
            for lib in libraries.iter().filter(|lib| lib.id != library_id) {
                let lib_root = PathBuf::from(&lib.root_path);
                if same_path(&lib_root, &root) {
                    return Err("这个文件夹已经登记为文件库".into());
                }
                if path_starts_with(&root, &lib_root) || path_starts_with(&lib_root, &root) {
                    return Err("文件库不能互相嵌套，请选择不重叠的文件夹".into());
                }
            }
            Some(root.to_string_lossy().to_string())
        }
        _ => None,
    };
    let connection = open_db(&app)?;
    let duplicate_name: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM libraries WHERE id <> ?1 AND lower(trim(name)) = lower(?2))",
            params![library_id, name.trim()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if duplicate_name {
        return Err("已存在同名文件库，请换一个名称".into());
    }
    let changed = if let Some(new_root) = resolved_root {
        connection
            .execute(
                "UPDATE libraries SET name = ?1, folder_depth = ?2, root_path = ?3, availability = 'available', updated_at = ?4 WHERE id = ?5",
                params![name.trim(), folder_depth, new_root, now(), library_id],
            )
            .map_err(|e| e.to_string())?
    } else {
        connection
            .execute(
                "UPDATE libraries SET name = ?1, folder_depth = ?2, updated_at = ?3 WHERE id = ?4",
                params![name.trim(), folder_depth, now(), library_id],
            )
            .map_err(|e| e.to_string())?
    };
    if changed == 0 {
        return Err("文件库不存在".into());
    }
    drop(connection);
    invalidate_stats_cache();
    list_libraries(app)?
        .into_iter()
        .find(|library| library.id == library_id)
        .ok_or_else(|| "文件库不存在".into())
}

const KEYRING_SERVICE: &str = "com.aifile.organizer";
const KEYRING_USER: &str = "openai-compatible-api-key";

fn setting(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
}

fn write_setting(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection.execute("INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params![key, value, now()]).map_err(|e| e.to_string())?;
    Ok(())
}

fn credential_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("无法访问系统凭据库：{e}"))
}

fn read_api_key() -> Result<Option<String>, String> {
    match credential_entry()?.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("读取 API 密钥失败：{error}")),
    }
}

fn infer_protocol(endpoint: &str, saved: Option<&str>) -> String {
    if let Some(proto) = saved {
        if matches!(proto, "openai" | "anthropic" | "gemini" | "ollama") {
            return proto.to_string();
        }
    }
    let lower = endpoint.trim().to_ascii_lowercase();
    if lower.contains("anthropic.com") || lower.ends_with("/messages") {
        "anthropic".into()
    } else if lower.contains("generativelanguage.googleapis.com") || lower.contains(":generatecontent") {
        "gemini".into()
    } else if lower.contains(":11434") || lower.ends_with("/api/chat") {
        "ollama".into()
    } else {
        "openai".into()
    }
}

pub(super) fn resolve_api_key(settings: &AiSettingsDto) -> Result<String, String> {
    if !settings.api_key.trim().is_empty() {
        return Ok(settings.api_key.trim().to_string());
    }
    let lower = settings.endpoint.trim().to_ascii_lowercase();
    let is_local = settings.protocol == "ollama"
        || lower.starts_with("http://127.0.0.1")
        || lower.starts_with("http://localhost")
        || lower.starts_with("http://[::1]");
    if is_local {
        return Ok("ollama".into());
    }
    Err("请先填写并保存 API 密钥".into())
}

#[tauri::command]
pub fn get_ai_settings(app: AppHandle) -> Result<AiSettingsDto, String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let endpoint = setting(&connection, "ai_endpoint")?
        .unwrap_or_else(|| "https://api.openai.com/v1".into());
    let saved_protocol = setting(&connection, "ai_protocol")?;
    let protocol = infer_protocol(&endpoint, saved_protocol.as_deref());
    let stored_key = setting(&connection, "ai_api_key")?.unwrap_or_default();
    let api_key = if !stored_key.trim().is_empty() {
        stored_key
    } else {
        read_api_key().ok().flatten().unwrap_or_default()
    };
    let has_key = !api_key.trim().is_empty() || protocol == "ollama";
    Ok(AiSettingsDto {
        enabled: true,
        protocol,
        endpoint,
        model: setting(&connection, "ai_model")?.unwrap_or_else(|| "gpt-4.1-mini".into()),
        api_key,
        has_api_key: has_key,
    })
}

#[tauri::command]
pub fn save_ai_settings(
    app: AppHandle,
    enabled: bool,
    protocol: Option<String>,
    endpoint: String,
    model: String,
    api_key: Option<String>,
) -> Result<AiSettingsDto, String> {
    initialize(&app)?;
    let endpoint = endpoint.trim().trim_end_matches('/').to_string();
    let lower_endpoint = endpoint.to_ascii_lowercase();
    if enabled
        && !(lower_endpoint.starts_with("https://")
            || lower_endpoint.starts_with("http://127.0.0.1")
            || lower_endpoint.starts_with("http://localhost")
            || lower_endpoint.starts_with("http://[::1]"))
    {
        return Err("AI 地址必须使用 HTTPS；本机服务可使用 localhost 或 127.0.0.1".into());
    }
    if enabled && model.trim().is_empty() {
        return Err("启用 AI 时必须填写模型名称".into());
    }
    let resolved_protocol = infer_protocol(&endpoint, protocol.as_deref());
    let connection = open_db(&app)?;
    write_setting(
        &connection,
        "ai_enabled",
        if enabled { "true" } else { "false" },
    )?;
    write_setting(&connection, "ai_protocol", &resolved_protocol)?;
    write_setting(&connection, "ai_endpoint", &endpoint)?;
    write_setting(&connection, "ai_model", model.trim())?;
    if let Some(value) = api_key {
        let trimmed = value.trim();
        write_setting(&connection, "ai_api_key", trimmed)?;
        if let Ok(entry) = credential_entry() {
            if trimmed.is_empty() {
                let _ = entry.delete_credential();
            } else {
                let _ = entry.set_password(trimmed);
            }
        }
    }
    drop(connection);
    get_ai_settings(app)
}

fn chat_endpoint(endpoint: &str) -> String {
    if endpoint.ends_with("/chat/completions") {
        endpoint.to_string()
    } else {
        format!("{}/chat/completions", endpoint.trim_end_matches('/'))
    }
}

fn split_system_and_chat_messages(messages: &serde_json::Value) -> (String, Vec<(String, String)>) {
    let mut system_parts = Vec::new();
    let mut chat_parts = Vec::new();
    if let Some(arr) = messages.as_array() {
        for item in arr {
            let role = item.get("role").and_then(|v| v.as_str()).unwrap_or("user");
            let content = item.get("content").and_then(|v| v.as_str()).unwrap_or("");
            if role == "system" {
                if !content.trim().is_empty() {
                    system_parts.push(content.to_string());
                }
            } else {
                chat_parts.push((role.to_string(), content.to_string()));
            }
        }
    }
    (system_parts.join("\n\n"), chat_parts)
}

fn send_chat_request(
    settings: &AiSettingsDto,
    api_key: &str,
    messages: serde_json::Value,
) -> Result<String, String> {
    send_chat_request_with_usage("测试 AI 服务连接", settings, api_key, messages, 60, 0.0)
        .map(|(text, _)| text)
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub(super) struct AiTokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub total_tokens: u64,
}

#[allow(clippy::too_many_arguments)]
fn record_ai_request_log(
    stage: &str,
    endpoint: &str,
    model: &str,
    protocol: &str,
    status_code: u16,
    ok: bool,
    elapsed_ms: u64,
    usage: &AiTokenUsage,
    system_prompt: &str,
    request_body: &str,
    response_body: &str,
    error: &str,
) {
    let Some(path) = GLOBAL_DB_PATH.get() else {
        return;
    };
    let Ok(connection) = Connection::open(path) else {
        return;
    };
    let _ = connection.busy_timeout(Duration::from_secs(3));
    let _ = connection.execute(
        "INSERT INTO ai_request_logs (id, created_at, stage, endpoint, model, protocol, status_code, ok, elapsed_ms, input_tokens, output_tokens, cached_tokens, total_tokens, system_prompt, request_body, response_body, error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            Uuid::new_v4().to_string(),
            now(),
            stage,
            endpoint,
            model,
            protocol,
            status_code as i64,
            if ok { 1_i64 } else { 0_i64 },
            elapsed_ms as i64,
            usage.input_tokens as i64,
            usage.output_tokens as i64,
            usage.cached_tokens as i64,
            usage.total_tokens as i64,
            system_prompt,
            request_body,
            response_body,
            error,
        ],
    );
    let _ = connection.execute(
        "DELETE FROM ai_request_logs WHERE id NOT IN (SELECT id FROM ai_request_logs ORDER BY created_at DESC, rowid DESC LIMIT 200)",
        [],
    );
}

#[tauri::command]
pub fn list_ai_request_logs(app: AppHandle, limit: Option<i64>) -> Result<Vec<AiRequestLogDto>, String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let limit = limit.unwrap_or(100).clamp(1, 300);

    // 若日志表为空且已有历史计划日志，自动回填一次以便直接查看之前的请求。
    let existing_count: i64 = connection
        .query_row("SELECT COUNT(1) FROM ai_request_logs", [], |row| row.get(0))
        .unwrap_or(0);
    if existing_count == 0 {
        if let Ok(mut plan_stmt) = connection.prepare("SELECT created_at, ai_logs FROM agent_plans WHERE ai_logs <> '[]' ORDER BY created_at DESC LIMIT 20") {
            let plan_rows = plan_stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .ok();
            if let Some(rows) = plan_rows {
                for item in rows.flatten() {
                    let (created_at, logs_json) = item;
                    let Ok(logs) = serde_json::from_str::<Vec<agent::AgentAiLogDto>>(&logs_json) else {
                        continue;
                    };
                    for log in logs {
                        let _ = connection.execute(
                            "INSERT INTO ai_request_logs (id, created_at, stage, endpoint, model, protocol, status_code, ok, elapsed_ms, input_tokens, output_tokens, cached_tokens, total_tokens, system_prompt, request_body, response_body, error)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
                            params![
                                Uuid::new_v4().to_string(),
                                created_at,
                                log.stage,
                                "",
                                log.model,
                                "",
                                if log.ok { 200_i64 } else { 0_i64 },
                                if log.ok { 1_i64 } else { 0_i64 },
                                log.elapsed_ms as i64,
                                log.input_tokens as i64,
                                log.output_tokens as i64,
                                log.cached_tokens as i64,
                                log.total_tokens as i64,
                                log.system_prompt,
                                log.request_body,
                                log.response_body,
                                if log.ok { "" } else { log.response_body.as_str() },
                            ],
                        );
                    }
                }
            }
        }
    }

    let mut stmt = connection
        .prepare(
            "SELECT id, created_at, stage, endpoint, model, protocol, status_code, ok, elapsed_ms, input_tokens, output_tokens, cached_tokens, total_tokens, system_prompt, request_body, response_body, error
             FROM ai_request_logs
             ORDER BY CAST(created_at AS INTEGER) DESC, rowid DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(AiRequestLogDto {
                id: row.get(0)?,
                created_at: row.get(1)?,
                stage: row.get(2)?,
                endpoint: row.get(3)?,
                model: row.get(4)?,
                protocol: row.get(5)?,
                status_code: row.get::<_, i64>(6)?.max(0) as u16,
                ok: row.get::<_, i64>(7)? != 0,
                elapsed_ms: row.get::<_, i64>(8)?.max(0) as u64,
                input_tokens: row.get::<_, i64>(9)?.max(0) as u64,
                output_tokens: row.get::<_, i64>(10)?.max(0) as u64,
                cached_tokens: row.get::<_, i64>(11)?.max(0) as u64,
                total_tokens: row.get::<_, i64>(12)?.max(0) as u64,
                system_prompt: row.get(13)?,
                request_body: row.get(14)?,
                response_body: row.get(15)?,
                error: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn clear_ai_request_logs(app: AppHandle) -> Result<(), String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    connection
        .execute("DELETE FROM ai_request_logs", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_token_usage(value: &serde_json::Value) -> AiTokenUsage {
    let usage = value.get("usage").or_else(|| value.get("usageMetadata"));
    let Some(u) = usage else {
        let input = value.get("prompt_eval_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let output = value.get("eval_count").and_then(|v| v.as_u64()).unwrap_or(0);
        return AiTokenUsage {
            input_tokens: input,
            output_tokens: output,
            cached_tokens: 0,
            total_tokens: input.saturating_add(output),
        };
    };

    let input_raw = u
        .get("prompt_tokens")
        .and_then(|v| v.as_u64())
        .or_else(|| u.get("input_tokens").and_then(|v| v.as_u64()))
        .or_else(|| u.get("promptTokenCount").and_then(|v| v.as_u64()))
        .unwrap_or(0);
    let output_tokens = u
        .get("completion_tokens")
        .and_then(|v| v.as_u64())
        .or_else(|| u.get("output_tokens").and_then(|v| v.as_u64()))
        .or_else(|| u.get("candidatesTokenCount").and_then(|v| v.as_u64()))
        .unwrap_or(0);
    let cached_tokens = u
        .get("prompt_tokens_details")
        .and_then(|d| d.get("cached_tokens"))
        .and_then(|v| v.as_u64())
        .or_else(|| {
            u.get("input_tokens_details")
                .and_then(|d| d.get("cached_tokens"))
                .and_then(|v| v.as_u64())
        })
        .or_else(|| u.get("prompt_cache_hit_tokens").and_then(|v| v.as_u64()))
        .or_else(|| u.get("cache_read_input_tokens").and_then(|v| v.as_u64()))
        .or_else(|| u.get("cachedContentTokenCount").and_then(|v| v.as_u64()))
        .or_else(|| u.get("cached_tokens").and_then(|v| v.as_u64()))
        .unwrap_or(0);

    // Anthropic 的 input_tokens 不含 cache_read_input_tokens，若存在 cache_read_input_tokens 且未提供 total_tokens，合并计入总输入。
    let is_anthropic_cache = u.get("cache_read_input_tokens").is_some() && u.get("prompt_tokens").is_none();
    let input_tokens = if is_anthropic_cache {
        input_raw.saturating_add(cached_tokens)
    } else {
        input_raw
    };
    let total_tokens = u
        .get("total_tokens")
        .and_then(|v| v.as_u64())
        .or_else(|| u.get("totalTokenCount").and_then(|v| v.as_u64()))
        .unwrap_or_else(|| input_tokens.saturating_add(output_tokens));

    AiTokenUsage {
        input_tokens,
        output_tokens,
        cached_tokens,
        total_tokens,
    }
}

/// 调用配置协议对应的聊天接口（支持 OpenAI 兼容、Anthropic Claude、Google Gemini、本地 Ollama），返回回复文本。
fn send_chat_request_with_timeout(
    settings: &AiSettingsDto,
    api_key: &str,
    messages: serde_json::Value,
    timeout_secs: u64,
    temperature: f64,
) -> Result<String, String> {
    send_chat_request_with_usage("生成规则与总览", settings, api_key, messages, timeout_secs, temperature)
        .map(|(text, _)| text)
}

fn format_reqwest_error(err: reqwest::Error) -> String {
    use std::error::Error;
    let detail = err
        .source()
        .map(|s| format!("（{s}）"))
        .unwrap_or_default();
    if err.is_timeout() {
        format!("AI 服务响应超时（已等待达到超时上限），请检查本地代理或模型响应速度：{err}{detail}")
    } else if err.is_connect() {
        format!("AI 服务无法连接，请确认该地址与端口的服务已启动：{err}{detail}")
    } else {
        format!("AI 服务连接失败：{err}{detail}")
    }
}

pub(super) fn send_chat_request_with_usage(
    stage: &str,
    settings: &AiSettingsDto,
    api_key: &str,
    messages: serde_json::Value,
    timeout_secs: u64,
    temperature: f64,
) -> Result<(String, AiTokenUsage), String> {
    let started = Instant::now();
    let (system_text, chat_msgs) = split_system_and_chat_messages(&messages);
    let user_body_raw = chat_msgs
        .iter()
        .map(|(_, content)| content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let pretty_req = serde_json::from_str::<serde_json::Value>(&user_body_raw)
        .and_then(|v| serde_json::to_string_pretty(&v))
        .unwrap_or(user_body_raw);

    let lower_ep = settings.endpoint.trim().to_ascii_lowercase();
    let is_loopback = lower_ep.starts_with("http://127.0.0.1")
        || lower_ep.starts_with("http://localhost")
        || lower_ep.starts_with("http://[::1]")
        || lower_ep.starts_with("https://127.0.0.1")
        || lower_ep.starts_with("https://localhost");
    let mut builder = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs));
    if is_loopback {
        builder = builder.no_proxy();
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let protocol = infer_protocol(&settings.endpoint, Some(settings.protocol.as_str()));

    if protocol == "anthropic" {
        let base = settings.endpoint.trim_end_matches('/');
        let url = if base.ends_with("/messages") {
            base.to_string()
        } else if base.ends_with("/v1") {
            format!("{base}/messages")
        } else {
            format!("{base}/v1/messages")
        };
        let anthropic_msgs: Vec<serde_json::Value> = chat_msgs
            .into_iter()
            .map(|(role, content)| {
                let r = if role == "assistant" { "assistant" } else { "user" };
                serde_json::json!({ "role": r, "content": content })
            })
            .collect();
        let mut payload = serde_json::json!({
            "model": settings.model,
            "max_tokens": 4096,
            "temperature": temperature,
            "messages": anthropic_msgs,
        });
        if !system_text.is_empty() {
            payload["system"] = serde_json::Value::String(system_text.clone());
        }
        let response = match client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .bearer_auth(api_key)
            .json(&payload)
            .send()
        {
            Ok(resp) => resp,
            Err(err) => {
                let msg = format_reqwest_error(err);
                record_ai_request_log(
                    stage,
                    &url,
                    &settings.model,
                    &protocol,
                    0,
                    false,
                    started.elapsed().as_millis() as u64,
                    &AiTokenUsage::default(),
                    &system_text,
                    &pretty_req,
                    "",
                    &msg,
                );
                return Err(msg);
            }
        };
        let status = response.status();
        let body = response.text().map_err(|e| e.to_string())?;
        let elapsed_ms = started.elapsed().as_millis() as u64;
        if !status.is_success() {
            let summary: String = body.chars().take(240).collect();
            let err_msg = format!("AI 服务返回 {}：{}", status.as_u16(), summary);
            record_ai_request_log(
                stage,
                &url,
                &settings.model,
                &protocol,
                status.as_u16(),
                false,
                elapsed_ms,
                &AiTokenUsage::default(),
                &system_text,
                &pretty_req,
                &body,
                &err_msg,
            );
            return Err(err_msg);
        }
        let value: serde_json::Value =
            serde_json::from_str(&body).map_err(|_| "AI 服务响应不是有效的 Anthropic 格式".to_string())?;
        let usage = parse_token_usage(&value);
        let text = value
            .get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| {
                arr.iter()
                    .find_map(|block| block.get("text").and_then(|t| t.as_str()))
            })
            .ok_or_else(|| "AI 服务没有返回内容".to_string())?;
        record_ai_request_log(
            stage,
            &url,
            &settings.model,
            &protocol,
            status.as_u16(),
            true,
            elapsed_ms,
            &usage,
            &system_text,
            &pretty_req,
            text,
            "",
        );
        return Ok((text.to_string(), usage));
    }

    if protocol == "gemini" {
        let base = settings.endpoint.trim_end_matches('/');
        let url = if base.contains(":generateContent") {
            base.to_string()
        } else if base.ends_with("/v1beta") || base.ends_with("/v1") {
            format!("{base}/models/{}:generateContent", settings.model)
        } else {
            format!("{base}/v1beta/models/{}:generateContent", settings.model)
        };
        let contents: Vec<serde_json::Value> = chat_msgs
            .into_iter()
            .map(|(role, content)| {
                let r = if role == "assistant" { "model" } else { "user" };
                serde_json::json!({
                    "role": r,
                    "parts": [{ "text": content }]
                })
            })
            .collect();
        let mut payload = serde_json::json!({
            "contents": contents,
            "generationConfig": { "temperature": temperature }
        });
        if !system_text.is_empty() {
            payload["systemInstruction"] = serde_json::json!({
                "parts": [{ "text": system_text.clone() }]
            });
        }
        let response = match client
            .post(&url)
            .header("x-goog-api-key", api_key)
            .json(&payload)
            .send()
        {
            Ok(resp) => resp,
            Err(err) => {
                let msg = format_reqwest_error(err);
                record_ai_request_log(
                    stage,
                    &url,
                    &settings.model,
                    &protocol,
                    0,
                    false,
                    started.elapsed().as_millis() as u64,
                    &AiTokenUsage::default(),
                    &system_text,
                    &pretty_req,
                    "",
                    &msg,
                );
                return Err(msg);
            }
        };
        let status = response.status();
        let body = response.text().map_err(|e| e.to_string())?;
        let elapsed_ms = started.elapsed().as_millis() as u64;
        if !status.is_success() {
            let summary: String = body.chars().take(240).collect();
            let err_msg = format!("AI 服务返回 {}：{}", status.as_u16(), summary);
            record_ai_request_log(
                stage,
                &url,
                &settings.model,
                &protocol,
                status.as_u16(),
                false,
                elapsed_ms,
                &AiTokenUsage::default(),
                &system_text,
                &pretty_req,
                &body,
                &err_msg,
            );
            return Err(err_msg);
        }
        let value: serde_json::Value =
            serde_json::from_str(&body).map_err(|_| "AI 服务响应不是有效的 Gemini 格式".to_string())?;
        let usage = parse_token_usage(&value);
        let text = value
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|cand| cand.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
            .and_then(|parts| parts.iter().find_map(|p| p.get("text").and_then(|t| t.as_str())))
            .ok_or_else(|| "AI 服务没有返回内容".to_string())?;
        record_ai_request_log(
            stage,
            &url,
            &settings.model,
            &protocol,
            status.as_u16(),
            true,
            elapsed_ms,
            &usage,
            &system_text,
            &pretty_req,
            text,
            "",
        );
        return Ok((text.to_string(), usage));
    }

    let url = chat_endpoint(&settings.endpoint);
    let response = match client
        .post(&url)
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": settings.model,
            "temperature": temperature,
            "messages": messages
        }))
        .send()
    {
        Ok(resp) => resp,
        Err(err) => {
            let msg = format_reqwest_error(err);
            record_ai_request_log(
                stage,
                &url,
                &settings.model,
                &protocol,
                0,
                false,
                started.elapsed().as_millis() as u64,
                &AiTokenUsage::default(),
                &system_text,
                &pretty_req,
                "",
                &msg,
            );
            return Err(msg);
        }
    };
    let status = response.status();
    let body = response.text().map_err(|e| e.to_string())?;
    let elapsed_ms = started.elapsed().as_millis() as u64;
    if !status.is_success() {
        let summary: String = body.chars().take(240).collect();
        let err_msg = format!("AI 服务返回 {}：{}", status.as_u16(), summary);
        record_ai_request_log(
            stage,
            &url,
            &settings.model,
            &protocol,
            status.as_u16(),
            false,
            elapsed_ms,
            &AiTokenUsage::default(),
            &system_text,
            &pretty_req,
            &body,
            &err_msg,
        );
        return Err(err_msg);
    }
    let value: serde_json::Value = match serde_json::from_str(&body) {
        Ok(val) => val,
        Err(_) => {
            let err_msg = "AI 服务响应不是兼容的聊天完成格式".to_string();
            record_ai_request_log(
                stage,
                &url,
                &settings.model,
                &protocol,
                status.as_u16(),
                false,
                elapsed_ms,
                &AiTokenUsage::default(),
                &system_text,
                &pretty_req,
                &body,
                &err_msg,
            );
            return Err(err_msg);
        }
    };
    let usage = parse_token_usage(&value);
    let parsed: ChatResponse =
        serde_json::from_value(value).map_err(|_| "AI 服务响应不是兼容的聊天完成格式".to_string())?;
    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .ok_or_else(|| "AI 服务没有返回内容".to_string())?;
    record_ai_request_log(
        stage,
        &url,
        &settings.model,
        &protocol,
        status.as_u16(),
        true,
        elapsed_ms,
        &usage,
        &system_text,
        &pretty_req,
        &content,
        "",
    );
    Ok((content, usage))
}

#[tauri::command]
pub fn test_ai_connection(app: AppHandle) -> Result<String, String> {
    let settings = get_ai_settings(app)?;
    let api_key = resolve_api_key(&settings)?;
    let content = send_chat_request(
        &settings,
        &api_key,
        serde_json::json!([
            {"role": "system", "content": "Reply with the single word OK."},
            {"role": "user", "content": "connection test"}
        ]),
    )?;
    if content.trim().is_empty() {
        return Err("AI 服务响应为空".into());
    }
    Ok("AI 服务连接成功".into())
}

fn tree(
    path: &Path,
    relative: &Path,
    folder_depth: i64,
    current_depth: i64,
) -> Result<Vec<FolderNodeDto>, String> {
    tree_with_count(path, relative, folder_depth, current_depth).map(|(nodes, _)| nodes)
}

/// Builds the folder tree and the recursive file count in a single pass.
/// Previously every node ran its own full `safe_stats` walk, so a deep tree
/// was re-scanned once per ancestor level.
fn tree_with_count(
    path: &Path,
    relative: &Path,
    folder_depth: i64,
    current_depth: i64,
) -> Result<(Vec<FolderNodeDto>, u64), String> {
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut dirs = Vec::new();
    let mut file_count = 0_u64;
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let entry_path = entry.path();
        if is_internal_staging_entry(&entry_path) {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            dirs.push(entry_path);
        } else if file_type.is_file() && !rules::is_rule_file(&entry_path) {
            file_count = file_count.saturating_add(1);
        }
    }
    dirs.sort_by_key(|entry| {
        entry
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
    });
    let mut nodes = Vec::new();
    for directory in dirs {
        let name = directory
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let child_relative = relative.join(&name);
        let (children, count) = if folder_depth == 0 || current_depth < folder_depth {
            // An unreadable sub-folder should not break the whole tree.
            tree_with_count(&directory, &child_relative, folder_depth, current_depth + 1)
                .unwrap_or_default()
        } else {
            (
                Vec::new(),
                safe_stats(&directory).map(|stats| stats.1).unwrap_or(0),
            )
        };
        file_count = file_count.saturating_add(count);
        nodes.push(FolderNodeDto {
            has_rules: directory.join(rules::RULE_FILE_NAME).is_file(),
            name,
            path: child_relative.to_string_lossy().to_string(),
            count,
            children,
        });
    }
    Ok((nodes, file_count))
}

#[tauri::command]
pub fn get_library_tree(app: AppHandle, library_id: String) -> Result<Vec<FolderNodeDto>, String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let (root, folder_depth): (String, i64) = connection
        .query_row(
            "SELECT root_path, folder_depth FROM libraries WHERE id = ?1",
            params![library_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let path = canonical(&root)?;
    tree(&path, Path::new(""), folder_depth, 1)
}

#[tauri::command]
pub fn create_library_folder(
    app: AppHandle,
    library_id: String,
    parent_path: String,
    name: String,
) -> Result<Vec<FolderNodeDto>, String> {
    initialize(&app)?;
    let name = name.trim();
    agent::validate_file_name(name)?;
    let connection = open_db(&app)?;
    let (root, folder_depth): (String, i64) = connection
        .query_row("SELECT root_path, folder_depth FROM libraries WHERE id = ?1 AND availability = 'available'", params![library_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?;
    let root = canonical(&root)?;
    let relative = PathBuf::from(&parent_path);
    if relative.is_absolute() || relative.components().any(|component| matches!(component, std::path::Component::ParentDir)) {
        return Err("无效的父级目录".into());
    }
    let parent = root.join(relative);
    if !parent.is_dir() || parent.symlink_metadata().map_err(|e| e.to_string())?.file_type().is_symlink() {
        return Err("父级目录不存在或不可用".into());
    }
    let target = parent.join(name);
    if target.exists() {
        return Err("同名文件夹已存在".into());
    }
    fs::create_dir(&target).map_err(|e| format!("创建文件夹失败：{e}"))?;
    tree(&root, Path::new(""), folder_depth, 1)
}

/// 去掉推理模型（如 DeepSeek-R1、Qwen3 等）在回复开头输出的 `<think>...</think>` 思考过程。
pub(super) fn strip_thinking(content: &str) -> &str {
    let mut rest = content.trim();
    loop {
        let lower = rest.to_ascii_lowercase();
        let close_tag = if lower.starts_with("<thinking>") {
            "</thinking>"
        } else if lower.starts_with("<think>") {
            "</think>"
        } else {
            break;
        };
        let Some(end) = lower.find(close_tag) else {
            break;
        };
        rest = rest[end + close_tag.len()..].trim();
    }
    rest
}

/// 仅当整段文本被单个 Markdown 代码块包裹（内部没有提前闭合的 ```）时去掉外层围栏，
/// 避免破坏包含多个示例围栏的 Markdown 规则文档。
pub(super) fn clean_markdown_content(content: &str) -> &str {
    let trimmed = strip_thinking(content);
    let Some(inner) = trimmed
        .strip_prefix("```")
        .and_then(|value| value.strip_suffix("```"))
    else {
        return trimmed;
    };
    let body = if let Some(first_newline) = inner.find('\n') {
        let first_line = inner[..first_newline].trim();
        if first_line.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            &inner[first_newline + 1..]
        } else {
            return trimmed;
        }
    } else {
        inner
    };
    if body.lines().any(|line| line.trim().starts_with("```")) {
        return trimmed;
    }
    body.trim()
}

/// 从 AI 回复中取出 JSON：先去掉 `<think>` 思考块与代码块标记，再精确提取合法的 JSON。
fn extract_json(content: &str) -> String {
    let without_think = strip_thinking(content);
    let cleaned = clean_json_content(without_think);
    if serde_json::from_str::<serde_json::Value>(cleaned).is_ok() {
        return cleaned.to_string();
    }
    let mut cursor = without_think;
    while let Some(fence_start) = cursor.find("```") {
        let after_open = &cursor[fence_start + 3..];
        let Some(fence_end) = after_open.find("```") else {
            break;
        };
        let block = clean_json_content(&cursor[fence_start..fence_start + 3 + fence_end + 3]);
        if serde_json::from_str::<serde_json::Value>(block).is_ok() {
            return block.to_string();
        }
        cursor = &after_open[fence_end + 3..];
    }
    let starts: Vec<usize> = cleaned.match_indices('{').map(|(idx, _)| idx).collect();
    let ends: Vec<usize> = cleaned.rmatch_indices('}').map(|(idx, _)| idx).collect();
    for &start in &starts {
        for &end in &ends {
            if end <= start {
                break;
            }
            let candidate = &cleaned[start..=end];
            if serde_json::from_str::<serde_json::Value>(candidate).is_ok() {
                return candidate.to_string();
            }
        }
    }
    cleaned.to_string()
}

fn clean_json_content(content: &str) -> &str {
    let trimmed = content.trim();
    if let Some(rest) = trimmed
        .strip_prefix("```")
        .and_then(|value| value.strip_suffix("```"))
    {
        let rest = rest.trim();
        if let Some(first_newline) = rest.find('\n') {
            let first_line = rest[..first_newline].trim();
            if !first_line.is_empty() && first_line.chars().all(|c| c.is_ascii_alphanumeric()) {
                return rest[first_newline + 1..].trim();
            }
        }
        if rest.len() >= 4 && rest[..4].eq_ignore_ascii_case("json") {
            return rest[4..].trim();
        }
        return rest;
    }
    trimmed
}

fn resolve_library_target(
    connection: &Connection,
    library_id: &str,
    folder_path: &str,
) -> Result<(PathBuf, PathBuf, String), String> {
    let root_text: String = connection
        .query_row(
            "SELECT root_path FROM libraries WHERE id = ?1 AND availability = 'available'",
            params![library_id],
            |row| row.get(0),
        )
        .map_err(|_| "目标文件库不存在或不可用".to_string())?;
    let root = canonical(&root_text)?;
    if !root.is_dir() {
        return Err("目标文件库不可用".into());
    }
    let normalized_input = folder_path.replace('\\', "/");
    let relative = PathBuf::from(&normalized_input);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("目标子文件夹路径无效".into());
    }
    let target = root.join(&relative);
    let metadata = fs::symlink_metadata(&target).map_err(|_| "目标子文件夹不存在".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("目标子文件夹不可用".into());
    }
    let target = fs::canonicalize(&target)
        .map(normalize_path)
        .map_err(|error| format!("无法访问目标子文件夹：{error}"))?;
    if !path_starts_with(&target, &root) {
        return Err("目标子文件夹必须位于文件库内".into());
    }
    let relative = target
        .strip_prefix(&root)
        .map_err(|_| "目标子文件夹路径无效".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    Ok((root, target, relative))
}

fn copy_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    copy_recursive_with_progress(source, destination, &mut |_| {})
}

pub(super) fn copy_recursive_with_progress<F>(
    source: &Path,
    destination: &Path,
    on_chunk: &mut F,
) -> Result<(), String>
where
    F: FnMut(u64),
{
    if source.is_file() {
        let expected_len = fs::metadata(source).map_err(|e| e.to_string())?.len();
        let mut input = fs::File::open(source).map_err(|e| e.to_string())?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .map_err(|e| {
                if e.kind() == io::ErrorKind::AlreadyExists {
                    format!("目标已存在，未覆盖：{}", destination.display())
                } else {
                    e.to_string()
                }
            })?;
        let mut buffer = vec![0_u8; 2 * 1024 * 1024];
        let mut written_total = 0_u64;
        loop {
            let read = input.read(&mut buffer).map_err(|e| e.to_string())?;
            if read == 0 {
                break;
            }
            output.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
            written_total += read as u64;
            on_chunk(read as u64);
        }
        output.flush().map_err(|e| e.to_string())?;
        if written_total != expected_len {
            return Err("复制过程中文件字节数不一致".into());
        }
        return Ok(());
    }
    fs::create_dir(destination).map_err(|e| {
        if e.kind() == io::ErrorKind::AlreadyExists {
            format!("目标目录已存在，未合并：{}", destination.display())
        } else {
            e.to_string()
        }
    })?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let child = entry.path();
        let target = destination.join(entry.file_name());
        if child.is_symlink() {
            return Err(format!(
                "目录包含符号链接，已阻止整夹归档：{}",
                child.display()
            ));
        }
        copy_recursive_with_progress(&child, &target, on_chunk)?;
    }
    Ok(())
}

#[tauri::command]
pub fn archive_items(
    app: AppHandle,
    item_ids: Vec<String>,
    mode: String,
) -> Result<Vec<OperationDto>, String> {
    initialize(&app)?;
    if !matches!(mode.as_str(), "copy" | "move") {
        return Err("未知的归档方式".into());
    }
    let connection = open_db(&app)?;
    let mut candidates = Vec::new();
    for item_id in item_ids {
        let row: Option<(String, String, Option<String>, String, String, String)> = connection.query_row("SELECT source_path, source_type, recommendation_library_id, status, source_signature, COALESCE(recommendation_folder_path, '') FROM analysis_items WHERE id = ?1", params![item_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))).optional().map_err(|e| e.to_string())?;
        let Some((source_path, source_type, library_id, status, source_signature, folder_path)) = row else {
            continue;
        };
        if status != "ready" {
            continue;
        }
        let Some(library_id) = library_id else {
            continue;
        };
        // A single missing/inaccessible source must not abort the whole batch;
        // execute_archive_operation records it as needs_attention instead.
        let source = canonical(&source_path)
            .unwrap_or_else(|_| normalize_path(PathBuf::from(&source_path)));
        candidates.push((item_id, source, source_type, library_id, source_signature, folder_path));
    }
    for (index, (_, left, _, _, _, _)) in candidates.iter().enumerate() {
        for (_, right, _, _, _, _) in candidates.iter().skip(index + 1) {
            if path_starts_with(left, right) || path_starts_with(right, left) {
                return Err("所选归档对象范围重叠，请取消父级或子级中的一项".into());
            }
        }
    }
    drop(connection);
    let mut outcome: Result<(), String> = Ok(());
    for (item_id, source, source_type, library_id, stored_signature, folder_path) in candidates {
        if let Err(error) = execute_archive_operation(
            &app,
            &item_id,
            &source,
            &source_type,
            &library_id,
            &folder_path,
            &stored_signature,
            &mode,
        ) {
            outcome = Err(error);
            break;
        }
    }
    invalidate_stats_cache();
    outcome?;
    list_operations(app)
}

fn update_operation(
    connection: &Connection,
    operation_id: &str,
    state: &str,
    signature: Option<&str>,
    staging_signature: Option<&str>,
    source_retained: bool,
    error: Option<&str>,
) -> Result<(), String> {
    connection.execute("UPDATE archive_operations SET state = ?1, signature = COALESCE(?2, signature), staging_signature = COALESCE(?3, staging_signature), source_retained = ?4, error = ?5, updated_at = ?6 WHERE id = ?7", params![state, signature, staging_signature, if source_retained { 1 } else { 0 }, error, now(), operation_id]).map_err(|e| e.to_string())?;
    Ok(())
}

fn execute_archive_operation(
    app: &AppHandle,
    item_id: &str,
    source: &Path,
    source_type: &str,
    library_id: &str,
    folder_path: &str,
    stored_signature: &str,
    mode: &str,
) -> Result<(), String> {
    let connection = open_db(app)?;
    let operation_id = Uuid::new_v4().to_string();
    let timestamp = now();
    let expected_signature = if stored_signature.is_empty() {
        ""
    } else {
        stored_signature
    };
    connection.execute("INSERT INTO archive_operations (id, item_id, mode, state, source_path, destination_path, source_signature, staging_path, source_retained, created_at, updated_at) VALUES (?1, ?2, ?3, 'planned', ?4, '', ?5, '', 1, ?6, ?6)", params![operation_id, item_id, mode, source.to_string_lossy().to_string(), expected_signature, timestamp]).map_err(|e| e.to_string())?;

    let needs_attention = |message: &str| -> Result<(), String> {
        update_operation(
            &connection,
            &operation_id,
            "needs_attention",
            None,
            None,
            true,
            Some(message),
        )
    };

    let (root, target_root, _) = match resolve_library_target(&connection, library_id, folder_path) {
        Ok(value) => value,
        Err(error) => {
            needs_attention(&error)?;
            return Ok(());
        }
    };
    if path_starts_with(source, &root) {
        needs_attention("源对象已经位于目标文件库中")?;
        return Ok(());
    }
    if source_type == "folder" && path_starts_with(&target_root, source) {
        needs_attention("目标文件库不能位于源文件夹内部")?;
        return Ok(());
    }
    let file_name = match source.file_name() {
        Some(value) => value,
        None => {
            needs_attention("源对象缺少名称")?;
            return Ok(());
        }
    };
    let destination = target_root.join(file_name);
    let staging = root.join(format!(".aifile-{}.partial", operation_id));
    connection
        .execute(
            "UPDATE archive_operations SET destination_path = ?1, staging_path = ?2, updated_at = ?3 WHERE id = ?4",
            params![
                destination.to_string_lossy().to_string(),
                staging.to_string_lossy().to_string(),
                now(),
                operation_id
            ],
        )
        .map_err(|e| e.to_string())?;
    let source_signature = match fingerprint(source) {
        Ok(value) => value,
        Err(error) => {
            needs_attention(&format!("无法读取源对象：{error}"))?;
            return Ok(());
        }
    };
    let expected_signature = if stored_signature.is_empty() {
        source_signature.as_str()
    } else {
        stored_signature
    };
    connection
        .execute(
            "UPDATE archive_operations SET source_signature = ?1, updated_at = ?2 WHERE id = ?3",
            params![expected_signature, now(), operation_id],
        )
        .map_err(|e| e.to_string())?;
    if source_signature != expected_signature {
        update_operation(
            &connection,
            &operation_id,
            "needs_attention",
            None,
            None,
            true,
            Some(&format!(
                "{} 在导入后发生了变化，请重新导入并审核",
                file_name.to_string_lossy()
            )),
        )?;
        return Ok(());
    }
    if destination.exists() {
        update_operation(
            &connection,
            &operation_id,
            "skipped",
            None,
            None,
            true,
            Some("目标已存在，已跳过且未覆盖"),
        )?;
        return Ok(());
    }
    update_operation(
        &connection,
        &operation_id,
        "copying",
        None,
        None,
        true,
        None,
    )?;
    if let Err(error) = copy_recursive(source, &staging) {
        cleanup_staging_path(&staging);
        update_operation(
            &connection,
            &operation_id,
            "needs_attention",
            None,
            None,
            true,
            Some(&format!("复制到临时位置失败：{error}")),
        )?;
        return Ok(());
    }
    let staging_signature = match fingerprint(&staging) {
        Ok(value) => value,
        Err(error) => {
            cleanup_staging_path(&staging);
            update_operation(
                &connection,
                &operation_id,
                "needs_attention",
                None,
                None,
                true,
                Some(&format!("临时副本校验失败：{error}")),
            )?;
            return Ok(());
        }
    };
    let source_after = match fingerprint(source) {
        Ok(value) => value,
        Err(error) => {
            cleanup_staging_path(&staging);
            update_operation(
                &connection,
                &operation_id,
                "needs_attention",
                None,
                Some(&staging_signature),
                true,
                Some(&format!("重新读取源对象失败：{error}")),
            )?;
            return Ok(());
        }
    };
    if source_after != expected_signature || staging_signature != expected_signature {
        cleanup_staging_path(&staging);
        update_operation(
            &connection,
            &operation_id,
            "needs_attention",
            None,
            Some(&staging_signature),
            true,
            Some("复制过程中源对象发生变化，已保留源对象并停止提交"),
        )?;
        return Ok(());
    }
    update_operation(
        &connection,
        &operation_id,
        "verifying",
        None,
        Some(&staging_signature),
        true,
        None,
    )?;
    if destination.exists() {
        cleanup_staging_path(&staging);
        update_operation(
            &connection,
            &operation_id,
            "needs_attention",
            None,
            Some(&staging_signature),
            true,
            Some("提交时出现同名目标，未覆盖现有内容"),
        )?;
        return Ok(());
    }
    if let Err(error) = fs::rename(&staging, &destination) {
        cleanup_staging_path(&staging);
        update_operation(
            &connection,
            &operation_id,
            "needs_attention",
            None,
            Some(&staging_signature),
            true,
            Some(&format!("提交目标失败：{error}")),
        )?;
        return Ok(());
    }
    let destination_signature = match fingerprint(&destination) {
        Ok(value) => value,
        Err(error) => {
            update_operation(
                &connection,
                &operation_id,
                "needs_attention",
                None,
                Some(&staging_signature),
                true,
                Some(&format!("无法校验已提交的目标对象：{error}")),
            )?;
            return Ok(());
        }
    };
    if destination_signature != expected_signature {
        update_operation(
            &connection,
            &operation_id,
            "needs_attention",
            Some(&destination_signature),
            Some(&staging_signature),
            true,
            Some("目标校验不一致，源对象已保留"),
        )?;
        return Ok(());
    }
    let mut source_retained = true;
    let mut final_state = "committed";
    let mut final_error: Option<String> = None;
    if mode == "move" {
        match fingerprint(source) {
            Ok(current) if current == expected_signature => {
                let removal = if source.is_dir() {
                    fs::remove_dir_all(source)
                } else {
                    fs::remove_file(source)
                };
                match removal {
                    Ok(_) => source_retained = false,
                    Err(error) => {
                        final_state = "source_retained";
                        final_error = Some(format!("目标已提交，但无法删除源对象：{error}"));
                    }
                }
            }
            Ok(_) => {
                final_state = "source_retained";
                final_error = Some("目标已提交，但源对象随后发生变化，未删除源对象".into());
            }
            Err(error) => {
                final_state = "source_retained";
                final_error = Some(format!("目标已提交，但无法重新验证源对象：{error}"));
            }
        }
    }
    update_operation(
        &connection,
        &operation_id,
        final_state,
        Some(&destination_signature),
        Some(&staging_signature),
        source_retained,
        final_error.as_deref(),
    )?;
    connection
        .execute(
            "UPDATE analysis_items SET status = 'archived' WHERE id = ?1",
            params![item_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_operations(app: AppHandle) -> Result<Vec<OperationDto>, String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let mut statement = connection.prepare("SELECT o.id, o.item_id, o.source_path, o.mode, o.state, o.source_path, o.destination_path, o.created_at, o.error, o.staging_path FROM archive_operations o ORDER BY o.created_at DESC").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let source: String = row.get(2)?;
            let state: String = row.get(4)?;
            let destination: String = row.get(6)?;
            let _staging: String = row.get(9)?;
            let can_retry = state == "needs_attention"
                && Path::new(&source).exists()
                && !Path::new(&destination).exists();
            let mode: String = row.get(3)?;
            let can_undo = state == "committed"
                && Path::new(&destination).exists()
                && if mode == "copy" {
                    Path::new(&source).exists()
                } else {
                    !Path::new(&source).exists()
                };
            Ok(OperationDto {
                id: row.get(0)?,
                item_id: row.get(1)?,
                name: Path::new(&source)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                mode: mode.clone(),
                state: state.clone(),
                source_path: row.get(5)?,
                destination_path: destination,
                created_at: row.get(7)?,
                error: row.get(8)?,
                can_retry,
                can_undo,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.map(|row| row.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn undo_operation(app: AppHandle, operation_id: String) -> Result<(), String> {
    // Undo may move/delete files even when it fails half-way, so always
    // drop cached library counts afterwards.
    let result = undo_operation_inner(app, operation_id);
    invalidate_stats_cache();
    result
}

fn undo_operation_inner(app: AppHandle, operation_id: String) -> Result<(), String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let row: (String, String, String, String, String, String) = connection.query_row("SELECT mode, state, source_path, destination_path, signature, item_id FROM archive_operations WHERE id = ?1", params![operation_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))).map_err(|e| e.to_string())?;
    if row.1 != "committed" {
        return Err("这项操作当前不能撤销".into());
    }
    let destination = Path::new(&row.3);
    if !destination.exists() || fingerprint(destination)? != row.4 {
        return Err("目标内容已变化，为避免删除用户资料，已阻止自动撤销".into());
    }
    let original = Path::new(&row.2);
    if row.0 == "copy" && !original.exists() {
        return Err("原路径下的源文件已不存在，为避免丢失资料，已阻止自动撤销".into());
    }
    update_operation(
        &connection,
        &operation_id,
        "undo_requested",
        Some(&row.4),
        None,
        row.0 == "copy",
        None,
    )?;
    if row.0 == "move" {
        if original.exists() {
            update_operation(
                &connection,
                &operation_id,
                "undo_blocked",
                Some(&row.4),
                None,
                false,
                Some("原路径已存在其他内容，不能覆盖"),
            )?;
            return Err("原路径已存在其他内容，已阻止撤销".into());
        }
        if let Err(error) = copy_recursive(destination, original) {
            let _ = update_operation(
                &connection,
                &operation_id,
                "undo_blocked",
                Some(&row.4),
                None,
                false,
                Some(&format!("恢复到原路径失败：{error}")),
            );
            return Err(format!("恢复到原路径失败：{error}"));
        }
        if fingerprint(original).ok().as_deref() != Some(row.4.as_str()) {
            let _ = update_operation(
                &connection,
                &operation_id,
                "undo_blocked",
                Some(&row.4),
                None,
                false,
                Some("恢复到原路径后的校验失败，目标副本已保留"),
            );
            return Err("恢复到原路径后的校验失败，目标副本已保留".into());
        }
    }
    let remove_result = if destination.is_dir() {
        fs::remove_dir_all(destination)
    } else {
        fs::remove_file(destination)
    };
    if let Err(error) = remove_result {
        let _ = update_operation(
            &connection,
            &operation_id,
            "undo_blocked",
            Some(&row.4),
            None,
            true,
            Some(&format!("无法移除目标副本：{error}")),
        );
        return Err(error.to_string());
    }
    update_operation(
        &connection,
        &operation_id,
        "undone",
        Some(&row.4),
        None,
        true,
        None,
    )?;
    connection
        .execute(
            "UPDATE analysis_items SET status = 'ready' WHERE id = ?1",
            params![row.5],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn recover_operations(app: AppHandle) -> Result<RecoverySummaryDto, String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let mut statement = connection.prepare("SELECT id, item_id, mode, state, source_path, destination_path, source_signature, staging_path, staging_signature FROM archive_operations WHERE state IN ('planned', 'copying', 'verifying', 'undo_requested')").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(statement);
    let mut recovered = 0_u64;
    let mut needs_attention = 0_u64;
    for (
        id,
        item_id,
        mode,
        state,
        source_text,
        destination_text,
        source_signature,
        staging_text,
        staging_signature,
    ) in rows
    {
        let source = Path::new(&source_text);
        let destination = Path::new(&destination_text);
        let staging = Path::new(&staging_text);
        if state == "undo_requested" {
            if !destination.exists()
                && (mode == "copy"
                    || (source.exists()
                        && fingerprint(source).ok().as_deref() == Some(source_signature.as_str())))
            {
                update_operation(
                    &connection,
                    &id,
                    "undone",
                    Some(&source_signature),
                    None,
                    mode == "copy",
                    None,
                )?;
                connection
                    .execute(
                        "UPDATE analysis_items SET status = 'ready' WHERE id = ?1",
                        params![item_id],
                    )
                    .map_err(|e| e.to_string())?;
                recovered += 1;
            } else {
                update_operation(
                    &connection,
                    &id,
                    "undo_blocked",
                    None,
                    None,
                    true,
                    Some("应用中断了撤销操作，请检查源路径和目标路径"),
                )?;
                needs_attention += 1;
            }
            continue;
        }
        let expected = if staging_signature.is_empty() {
            source_signature.as_str()
        } else {
            staging_signature.as_str()
        };
        if destination.exists() && fingerprint(destination).ok().as_deref() == Some(expected) {
            let mut retained = source.exists();
            let mut final_state = "committed";
            let mut error = None;
            if mode == "move"
                && retained
                && fingerprint(source).ok().as_deref() == Some(source_signature.as_str())
            {
                let removal = if source.is_dir() {
                    fs::remove_dir_all(source)
                } else {
                    fs::remove_file(source)
                };
                if removal.is_ok() {
                    retained = false;
                } else {
                    final_state = "source_retained";
                    error = Some("恢复时无法删除源对象".to_string());
                }
            }
            update_operation(
                &connection,
                &id,
                final_state,
                Some(expected),
                Some(expected),
                retained,
                error.as_deref(),
            )?;
            connection
                .execute(
                    "UPDATE analysis_items SET status = 'archived' WHERE id = ?1",
                    params![item_id],
                )
                .map_err(|e| e.to_string())?;
            recovered += 1;
        } else if state == "verifying"
            && staging.exists()
            && !destination.exists()
            && source.exists()
            && fingerprint(staging).ok().as_deref() == Some(expected)
            && fingerprint(source).ok().as_deref() == Some(source_signature.as_str())
        {
            match fs::rename(staging, destination) {
                Ok(_) => {
                    let mut retained = true;
                    let mut final_state = "committed";
                    let mut error = None;
                    if mode == "move" {
                        let removal = if source.is_dir() {
                            fs::remove_dir_all(source)
                        } else {
                            fs::remove_file(source)
                        };
                        if removal.is_ok() {
                            retained = false;
                        } else {
                            final_state = "source_retained";
                            error = Some("目标已恢复提交，但无法删除源对象".to_string());
                        }
                    }
                    update_operation(
                        &connection,
                        &id,
                        final_state,
                        Some(expected),
                        Some(expected),
                        retained,
                        error.as_deref(),
                    )?;
                    connection
                        .execute(
                            "UPDATE analysis_items SET status = 'archived' WHERE id = ?1",
                            params![item_id],
                        )
                        .map_err(|e| e.to_string())?;
                    recovered += 1;
                }
                Err(error) => {
                    update_operation(
                        &connection,
                        &id,
                        "needs_attention",
                        None,
                        None,
                        true,
                        Some(&format!("恢复提交失败：{error}")),
                    )?;
                    needs_attention += 1;
                }
            }
        } else {
            if source.exists() {
                cleanup_staging_path(staging);
            }
            update_operation(
                &connection,
                &id,
                "needs_attention",
                None,
                None,
                true,
                Some("应用在归档过程中中断；源对象已保留，请检查临时副本后重试"),
            )?;
            needs_attention += 1;
        }
    }
    invalidate_stats_cache();
    Ok(RecoverySummaryDto {
        recovered,
        needs_attention,
    })
}

#[tauri::command]
pub fn retry_operation(app: AppHandle, operation_id: String) -> Result<Vec<OperationDto>, String> {
    initialize(&app)?;
    let connection = open_db(&app)?;
    let row: (String, String, String, String, String, String) = connection.query_row("SELECT item_id, mode, state, destination_path, staging_path, source_path FROM archive_operations WHERE id = ?1", params![operation_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))).map_err(|e| e.to_string())?;
    if row.2 != "needs_attention" {
        return Err("只有需要处理的操作可以重试".into());
    }
    if Path::new(&row.3).exists() {
        return Err("检测到目标，不能自动重试；请先人工检查".into());
    }
    if !row.4.is_empty() && Path::new(&row.4).exists() {
        if Path::new(&row.4).is_dir() {
            fs::remove_dir_all(&row.4)
                .map_err(|e| format!("无法清理本次操作留下的临时目录：{e}"))?;
        } else {
            fs::remove_file(&row.4).map_err(|e| format!("无法清理本次操作留下的临时文件：{e}"))?;
        }
    }
    connection
        .execute(
            "UPDATE archive_operations SET state = 'superseded', updated_at = ?1 WHERE id = ?2",
            params![now(), operation_id],
        )
        .map_err(|e| e.to_string())?;
    connection
        .execute(
            "UPDATE analysis_items SET status = 'ready' WHERE id = ?1",
            params![row.0],
        )
        .map_err(|e| e.to_string())?;
    archive_items(app, vec![row.0], row.1)
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let target = normalize_path(PathBuf::from(&path));
    if !target.exists() {
        return Err("文件已经不存在".into());
    }
    #[cfg(target_os = "windows")]
    {
        if target.is_file() {
            // explorer.exe parses its own command line: `.arg()` would wrap the
            // whole `/select,<path>` in quotes when the path contains spaces,
            // which makes Explorer ignore it and open the default folder.
            use std::os::windows::process::CommandExt;
            Command::new("explorer")
                .raw_arg(format!("/select,\"{}\"", target.display()))
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("explorer")
                .arg(&target)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if target.is_file() {
            Command::new("open")
                .arg("-R")
                .arg(&target)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("open")
                .arg(&target)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let folder = if target.is_file() {
            target.parent().unwrap_or(&target)
        } else {
            &target
        };
        Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let normalized_input = path.replace('/', "\\");
    #[cfg(not(target_os = "windows"))]
    let normalized_input = path;

    let target = normalize_path(PathBuf::from(&normalized_input));
    if !target.exists() {
        return Err("文件或文件夹已经不存在".into());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        Command::new("explorer")
            .raw_arg(format!("\"{}\"", target.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("aifile-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn recursive_copy_preserves_tree_and_fingerprint() {
        let root = test_root("copy");
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(source.join("一级/二级/空目录")).unwrap();
        fs::write(source.join("一级/说明.txt"), "归档内容").unwrap();
        fs::write(source.join("一级/二级/data.bin"), [1_u8, 2, 3, 4]).unwrap();
        copy_recursive(&source, &destination).unwrap();
        assert!(destination.join("一级/二级/空目录").is_dir());
        assert_eq!(
            fingerprint(&source).unwrap(),
            fingerprint(&destination).unwrap()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recursive_copy_never_overwrites_existing_target() {
        let root = test_root("conflict");
        let source = root.join("source.txt");
        let destination = root.join("destination.txt");
        fs::write(&source, "new").unwrap();
        fs::write(&destination, "keep").unwrap();
        assert!(copy_recursive(&source, &destination).is_err());
        assert_eq!(fs::read_to_string(&destination).unwrap(), "keep");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fingerprint_detects_content_changes() {
        let root = test_root("fingerprint");
        let file = root.join("item.txt");
        fs::write(&file, "before").unwrap();
        let before = fingerprint(&file).unwrap();
        fs::write(&file, "after").unwrap();
        assert_ne!(before, fingerprint(&file).unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn json_fence_cleanup_is_strict() {
        assert_eq!(
            clean_json_content("```json\n{\"results\":[]}\n```"),
            "{\"results\":[]}"
        );
        assert_eq!(
            clean_json_content("```JSON\n{\"results\":[]}\n```"),
            "{\"results\":[]}"
        );
        assert_eq!(clean_json_content(" {\"results\":[]} "), "{\"results\":[]}");
    }

    #[test]
    fn strips_thinking_and_preserves_multi_block_markdown() {
        assert_eq!(
            extract_json("<think>草稿 {\"bad\": 1}</think>\n好的：\n```json\n{\"reply\":\"ok\",\"actions\":[]}\n```"),
            "{\"reply\":\"ok\",\"actions\":[]}"
        );
        assert_eq!(
            extract_json("不要用 {旧格式}，请用 {\"actions\":[]}。"),
            "{\"actions\":[]}"
        );
        assert_eq!(
            clean_markdown_content("<think>思考</think>\n```markdown\n# 规则\n放发票\n```"),
            "# 规则\n放发票"
        );
        let two_blocks = "```text\n示例1\n```\n\n## 说明\n\n```text\n示例2\n```";
        assert_eq!(clean_markdown_content(two_blocks), two_blocks);
    }

    #[test]
    fn tree_respects_folder_depth_and_ignores_staging_entries() {
        let root = test_root("tree-depth");
        fs::create_dir_all(root.join("level1/level2/level3")).unwrap();
        fs::create_dir_all(root.join(".aifile-123.partial")).unwrap();
        fs::write(root.join(".aifile-456.partial"), "staging").unwrap();
        fs::write(root.join("level1/file.txt"), "ok").unwrap();

        let stats = safe_stats(&root).unwrap();
        assert_eq!(stats.1, 1);

        let depth1 = tree(&root, Path::new(""), 1, 1).unwrap();
        assert_eq!(depth1.len(), 1);
        assert_eq!(depth1[0].count, 1);
        assert_eq!(depth1[0].name, "level1");
        assert!(depth1[0].children.is_empty());

        let depth2 = tree(&root, Path::new(""), 2, 1).unwrap();
        assert_eq!(depth2[0].children.len(), 1);
        assert_eq!(depth2[0].children[0].name, "level2");
        assert!(depth2[0].children[0].children.is_empty());

        let all = tree(&root, Path::new(""), 0, 1).unwrap();
        assert_eq!(all[0].count, 1);
        assert_eq!(tree_with_count(&root, Path::new(""), 0, 1).unwrap().1, 1);
        assert_eq!(all[0].children[0].children.len(), 1);
        assert_eq!(all[0].children[0].children[0].name, "level3");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn normalize_path_strips_windows_verbatim_prefix() {
        assert_eq!(
            normalize_path(PathBuf::from(r"\\?\C:\Users\demo\Documents")),
            PathBuf::from(r"C:\Users\demo\Documents")
        );
        assert_eq!(
            normalize_path(PathBuf::from(r"\\?\UNC\server\share\folder")),
            PathBuf::from(r"\\server\share\folder")
        );
    }
}
