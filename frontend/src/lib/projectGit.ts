import { apiFetch } from './api'

export interface GitBranchesResponse {
  branches: string[]
  suggested_main: string | null
}

export interface GitWorkflowResponse {
  main_branch: string
  dev_branch: string
  current_branch: string
}

export interface GitStatusResponse {
  enabled: boolean
  main_branch: string | null
  dev_branch: string | null
  current_branch: string | null
  remote_url: string | null
  workflow: string | null
  repo_root?: string | null
}

export function fetchGitBranches(orgId: string, projectId: string) {
  return apiFetch<GitBranchesResponse>(`/orgs/${orgId}/projects/${projectId}/git/branches`)
}

export function setupImportGit(
  orgId: string,
  projectId: string,
  mainBranch: string,
  requirementLabel: string,
) {
  return apiFetch<GitWorkflowResponse>(`/orgs/${orgId}/projects/${projectId}/git/setup-import`, {
    method: 'POST',
    body: JSON.stringify({
      main_branch: mainBranch,
      requirement_label: requirementLabel,
    }),
  })
}

export function createNewDevBranch(
  orgId: string,
  projectId: string,
  requirementLabel: string,
) {
  return apiFetch<GitWorkflowResponse>(
    `/orgs/${orgId}/projects/${projectId}/git/new-dev-branch`,
    {
      method: 'POST',
      body: JSON.stringify({ requirement_label: requirementLabel }),
    },
  )
}

export function fetchGitStatus(orgId: string, projectId: string) {
  return apiFetch<GitStatusResponse>(`/orgs/${orgId}/projects/${projectId}/git/status`)
}

export interface GitDiffResponse {
  summary: string
  patch: string
  remote_url: string | null
  empty: boolean
}

export function fetchGitDiff(orgId: string, projectId: string) {
  return apiFetch<GitDiffResponse>(`/orgs/${orgId}/projects/${projectId}/git/diff`)
}

export function pushGitBranch(orgId: string, projectId: string, remoteUrl: string | null) {
  return apiFetch<{ message: string }>(`/orgs/${orgId}/projects/${projectId}/git/push`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true, remote_url: remoteUrl || null }),
  })
}
