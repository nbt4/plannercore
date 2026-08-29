import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'
import { appPath } from '../lib/app-paths'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { refetch } = useAuth()
  const branding = useBranding()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(appPath('/api/v1/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      })

      if (res.ok) {
        refetch()
        const params = new URLSearchParams(window.location.search)
        const raw = params.get('redirect') || '/'
        // Validate redirect: only allow same-origin relative paths
        const safe = (() => {
          try {
            const url = new URL(raw, window.location.origin)
            return url.origin === window.location.origin ? url.pathname + url.search : '/'
          } catch { return '/' }
        })()
        window.location.href = safe
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Anmeldung fehlgeschlagen')
      }
    } catch {
      setError('Verbindungsfehler – ist der Server erreichbar?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-surface)',
        padding: 'var(--space-4)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 400,
          backgroundColor: 'var(--surface-1)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
          <img
            src={branding.assets.stackedOnDark}
            alt={branding.productName}
            style={{ height: 128, maxWidth: 280, objectFit: 'contain' }}
          />
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
            }}
          >
            {branding.brandName || branding.companyName !== branding.productName
              ? `by ${branding.brandName || branding.companyName}`
              : 'Mit Cores-Konto anmelden'}
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'rgba(208,2,27,0.1)',
              border: '1px solid var(--color-accent-red)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-accent-red)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {error}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Benutzername
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            style={{
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border-input)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Passwort
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border-input)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
            }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--color-accent-red)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Anmeldung...' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
