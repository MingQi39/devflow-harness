import type { UserRole } from './auth'

export type OrgMembershipRole = 'owner' | 'member'

export interface Organization {
  id: string
  name: string
  invite_code: string
  member_count: number
  membership_role: OrgMembershipRole | null
}

export interface OrgMember {
  user_id: string
  email: string
  role: UserRole
  membership_role: OrgMembershipRole
  joined_at: string
}

export interface PrototypeDelivery {
  id: string
  org_id: string
  conversation_id: string
  sender_id: string
  recipient_id: string
  sender_email: string | null
  recipient_email: string | null
  title: string
  message: string
  read_at: string | null
  dev_project_id: string | null
  dev_conversation_id: string | null
  created_at: string
}
