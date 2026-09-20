import { useState } from 'react'
import { useOrg } from '../contexts/OrgContext'
import CreateOrganizationDialog from './CreateOrganizationDialog'
import JoinOrganizationDialog from './JoinOrganizationDialog'

export default function JoinOrgBanner() {
  const { orgs, loading: orgLoading, joinOrg, createOrg } = useOrg()
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  if (orgLoading || orgs.length > 0) return null

  return (
    <>
      <div className="join-org-banner">
        <p>
          还未加入任何<strong>组织</strong>，联系人、发给开发等功能需要先创建或加入组织（参考 moreai
          工作区）。
        </p>
        <div className="join-org-inline-form">
          <button type="button" className="btn primary sm" onClick={() => setCreateOpen(true)}>
            创建组织
          </button>
          <button type="button" className="btn secondary sm" onClick={() => setJoinOpen(true)}>
            加入组织
          </button>
        </div>
      </div>
      <CreateOrganizationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createOrg}
      />
      <JoinOrganizationDialog open={joinOpen} onClose={() => setJoinOpen(false)} onJoin={joinOrg} />
    </>
  )
}
