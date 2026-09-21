import { FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { chatHomePath } from '../lib/lastConversation'
import {
  clearRememberedPassword,
  loadLastEmail,
  loadRememberedPassword,
  saveLastEmail,
  saveRememberedPassword,
} from '../lib/rememberLogin'

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTarget =
    (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)
      ?.from?.pathname != null
      ? `${(location.state as { from: { pathname: string; search?: string; hash?: string } }).from.pathname}${(location.state as { from: { search?: string } }).from.search ?? ''}${(location.state as { from: { hash?: string } }).from.hash ?? ''}`
      : chatHomePath()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberPassword, setRememberPassword] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const savedEmail = loadLastEmail()
    const savedPassword = loadRememberedPassword()
    if (savedEmail) setEmail(savedEmail)
    if (savedPassword) {
      setPassword(savedPassword)
      setRememberPassword(true)
    }
  }, [])

  if (isLoading) {
    return <div className="auth-loading">加载中…</div>
  }

  if (isAuthenticated) {
    return <Navigate to={redirectTarget} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const trimmedEmail = email.trim()
      await login(trimmedEmail, password)
      saveLastEmail(trimmedEmail)
      if (rememberPassword) {
        saveRememberedPassword(trimmedEmail, password)
      } else {
        clearRememberedPassword()
      }
      navigate(redirectTarget, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
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
          <h1>欢迎回来</h1>
          <p className="auth-subtitle">登录后开始多对话流式聊天</p>
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
              密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </label>
            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(e) => setRememberPassword(e.target.checked)}
              />
              <span>记住密码</span>
            </label>
            {error ? <p className="error-banner inline">{error}</p> : null}
            <button type="submit" className="btn primary full" disabled={submitting}>
              {submitting ? '登录中…' : '登录'}
            </button>
          </form>
          <p className="auth-footer">
            还没有账号？<Link to="/register">注册</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
