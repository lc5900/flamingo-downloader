import { invoke } from '@tauri-apps/api/core'

export function call<T>(cmd: string, args?: Record<string, unknown>) {
  return invoke<T>(cmd, args)
}
