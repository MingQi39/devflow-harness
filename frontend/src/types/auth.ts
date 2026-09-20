export type UserRole = 'pm' | 'frontend' | 'backend' | 'qa'

export interface User {
  id: string
  email: string
  role: UserRole
}

export interface AuthResponse {
  token: string
  user: User
  permissions: string[]
}

export const ROLE_LABELS: Record<UserRole, string> = {
  pm: '产品',
  frontend: '前端',
  backend: '后端',
  qa: '测试',
}
