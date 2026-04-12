import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import './LoginPage.css'

type LoginLocationState = { authError?: string | null }

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectedMessage = (location.state as LoginLocationState | null)?.authError
  const { signIn, authError } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err || authError) {
      setError(authError || err?.message || 'Erreur de connexion.')
      return
    }
    navigate('/')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Découverte — Admin</h1>
        <p className="login-subtitle">Connexion au tableau de bord</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@decouverte.cd"
              required
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {(error || authError || redirectedMessage) && (
            <p className="login-error">{error || authError || redirectedMessage}</p>
          )}
          <button type="submit" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
