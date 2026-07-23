export type { RMUXPluginConfig } from "./config.js"

export interface SessionInfo {
  name: string
}

export interface PaneMeta {
  sessionName: string
  windowIndex: number
  paneIndex: number
  paneId: string
  active: boolean
  width: number
  height: number
  dead: boolean
  deadStatus: number | null
  pid: number | null
  title: string
  currentCommand: string
}

export interface SessionMeta {
  name: string
  windows: number
  attached: number
  width: number
  height: number
}

export interface FindPanesQuery {
  sessionName?: string
  currentCommand?: string
  title?: string
  active?: boolean
  dead?: boolean
}
