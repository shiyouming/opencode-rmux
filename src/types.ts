export type { RMUXPluginConfig } from "./config.js"

export interface SessionInfo {
  name: string
  created: boolean
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

export type StreamEventType = 'line' | 'data' | 'render'

export interface StreamEvent {
  type: StreamEventType
  data: string
  timestamp: number
  paneTarget: string
}

export interface SplitOp<T = unknown> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export type MatchLevel = 'exact' | 'fuzzy' | 'none'

export interface FindPanesQuery {
  sessionName?: string
  currentCommand?: string
  title?: string
  active?: boolean
  dead?: boolean
}
