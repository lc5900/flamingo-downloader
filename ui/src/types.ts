export type Locale = 'en-US' | 'zh-CN'
export type ThemeMode = 'system' | 'light' | 'dark'
export type SectionKey = 'downloading' | 'downloaded'
export type MatcherType = 'ext' | 'domain' | 'type'

export type Task = {
  id: string
  aria2_gid?: string | null
  task_type?: string
  source: string
  name?: string | null
  status: string
  save_dir?: string
  category?: string | null
  total_length: number
  completed_length: number
  download_speed: number
  error_code?: string | null
  error_message?: string | null
  created_at?: number
  updated_at?: number
}

export type DownloadRule = {
  enabled: boolean
  matcher: MatcherType
  pattern: string
  save_dir: string
  subdir_by_date?: boolean
  subdir_by_domain?: boolean
}

export type CategoryRule = {
  enabled: boolean
  matcher: MatcherType
  pattern: string
  category: string
}

export type GlobalSettings = {
  aria2_bin_path?: string | null
  download_dir?: string | null
  max_concurrent_downloads?: number | null
  max_connection_per_server?: number | null
  max_overall_download_limit?: string | null
  bt_tracker?: string | null
  github_cdn?: string | null
  github_token?: string | null
  enable_upnp?: boolean | null
  ui_theme?: string | null
  browser_bridge_enabled?: boolean | null
  browser_bridge_port?: number | null
  browser_bridge_token?: string | null
  browser_bridge_allowed_origins?: string | null
  clipboard_watch_enabled?: boolean | null
  download_dir_rules?: DownloadRule[]
  category_rules?: CategoryRule[]
  retry_max_attempts?: number | null
  retry_backoff_secs?: number | null
  retry_fallback_mirrors?: string | null
  metadata_timeout_secs?: number | null
  speed_plan?: string | null
  speed_plan_rules?: Array<{
    days?: string
    start?: string
    end?: string
    limit?: string
  }> | null
  task_option_presets?: string | null
  post_complete_action?: string | null
  auto_delete_control_files?: boolean | null
  auto_clear_completed_days?: number | null
  first_run_done?: boolean | null
  start_minimized?: boolean | null
  minimize_to_tray?: boolean | null
  notify_on_complete?: boolean | null
}

export type AddFormValues = {
  url: string
  magnet: string
  save_dir?: string
  out?: string
  max_download_limit?: string
  max_upload_limit?: string
  seed_ratio?: number
  seed_time?: number
  max_connection_per_server?: number
  split?: number
  user_agent?: string
  referer?: string
  cookie?: string
  headers_text?: string
  preset_name?: string
  preset_selected?: string
}

export type AddPresetTaskType = 'http' | 'magnet' | 'torrent'

export type TaskOptionPreset = {
  name: string
  task_type: AddPresetTaskType
  options: {
    out?: string | null
    max_download_limit?: string | null
    max_upload_limit?: string | null
    seed_ratio?: number | null
    seed_time?: number | null
    max_connection_per_server?: number | null
    split?: number | null
    user_agent?: string | null
    referer?: string | null
    headers?: string[]
  }
}

export type StartupNotice = {
  level: string
  message: string
}

export type StartupSelfCheck = {
  aria2_bin_path: string
  aria2_path_source: string
  aria2_bin_exists: boolean
  aria2_bin_executable: boolean
  download_dir: string
  download_dir_exists: boolean
  download_dir_writable: boolean
  rpc_ready: boolean
  rpc_endpoint?: string | null
}

export type ImportTaskListResult = {
  imported_tasks: number
  imported_files: number
}

export type TaskFile = {
  path: string
  length: number
  completed_length: number
  selected: boolean
}

export type OperationLog = {
  ts: number
  action: string
  message: string
}

export type SaveDirSuggestion = {
  save_dir: string
  matched_rule?: DownloadRule | null
}

export type BrowserBridgeStatus = {
  enabled: boolean
  endpoint: string
  token_set: boolean
  connected: boolean
  message: string
}

export type TaskSortKey = 'updated_desc' | 'speed_desc' | 'progress_desc' | 'name_asc'
export type TableDensity = 'small' | 'middle' | 'large'
export type TableLayout = {
  columnWidths: Record<string, number>
  columnOrder: string[]
  hiddenColumns: string[]
  density: TableDensity
}
export type TableLayoutStore = Record<SectionKey, TableLayout>
