import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { saveLastEmail } from '../lib/rememberLogin'
import { ROLE_LABELS, type UserRole } from '../types/auth'

const ROLES: UserRole[] = ['pm', 'frontend', 'backend', 'qa']

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('pm')
  const [inviteCode, setInviteCode] = useState('DEVFLOW1')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isLoading) {
    return <div className="auth-loading">加载中…</div>
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const trimmedEmail = email.trim()
      await register(trimmedEmail, password, role, inviteCode)
      saveLastEmail(trimmedEmail)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-brand">
            <img src="/favicon.png" alt="DevFlow Harness" width={44} height={44} />
            <div>
              <p className="auth-brand-title">DevFlow Harness</p>
              <p className="auth-brand-sub">研发协作工作台</p>
            </div>
          </div>
          <h1>创建账号</h1>
          <p className="auth-subtitle">选择你的角色，加入协作研发</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              邮箱
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label>
              密码（至少 8 位）
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              组织邀请码
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="DEVFLOW1"
                minLength={6}
                autoComplete="off"
              />
            </label>
            <div>
              <span className="role-label">选择角色</span>
              <div className="role-grid">
                {ROLES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`role-option ${role === item ? 'active' : ''}`}
                    onClick={() => setRole(item)}
                  >
                    {ROLE_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>
            {error ? <p className="error-banner inline">{error}</p> : null}
            <button type="submit" className="btn primary full" disabled={submitting}>
              {submitting ? '注册中…' : '注册并登录'}
            </button>
          </form>
          <p className="auth-footer">
            已有账号？<Link to="/login">登录</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
