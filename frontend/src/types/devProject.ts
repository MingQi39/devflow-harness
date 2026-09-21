export type DevProjectOriginMode = 'import' | 'greenfield'

export interface StackRecommendation {
  stack_id: string
  frontend: string
  backend: string
  rationale: string
  summary: string
}

export interface LocalProjectBinding {
  local_root: string
  label: string
  project_id: string
  updated_at: string
}

export interface DevProjectBootstrapResult {
  project_id: string
  conversation_id: string
  created: boolean
  delivery_id: string
  origin_mode: DevProjectOriginMode
  stack_id: string | null
  files_imported?: number | null
}
