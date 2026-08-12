import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'



function PasswordReset() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [session, setSession] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Password reset not available in local mode
    setError('Password reset not available in local mode. Please contact your administrator.')
  }, [])

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Password update not available in local mode
      setSuccess('Password update not available in local mode. Please contact your administrator.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = () => {
    navigate('/')
  }

  if (!session && !error) {
    return (
      <div className="auth-layout">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="dashboard__spinner" style={{ margin: '0 auto var(--space-4)' }}></div>
          <p>Verifying reset link...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
          <img 
            src="https://happimynd.com/assets/Frontend/images/happimynd_logo.png"
            alt="HappiMynd Logo"
            style={{ height: '60px', width: 'auto', objectFit: 'contain' }}
          />
        </div>
        
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-6)', fontWeight: 700, fontSize: 'var(--text-2xl)', color: 'var(--color-fg)' }}>
          Forgot Password
        </h2>

        {error && <div className="alert alert--error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
        {success && <div className="alert alert--success" style={{ marginBottom: 'var(--space-4)' }}>{success}</div>}

        {session ? (
          <form onSubmit={handlePasswordReset}>
            <p style={{ textAlign: 'center', marginBottom: 'var(--space-6)', color: 'var(--color-secondary)' }}>
              Enter your new password below.
            </p>

            <div className="form-group">
              <label className="form-label">New Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  className="form-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: '2.5rem', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-muted-fg, #6b7280)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <VisibilityOffIcon style={{ fontSize: '1.25rem' }} /> : <VisibilityIcon style={{ fontSize: '1.25rem' }} />}
                </button>
              </div>
              <div className="form-helper">Password must be at least 6 characters long</div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  className="form-input"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ paddingRight: '2.5rem', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-muted-fg, #6b7280)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <VisibilityOffIcon style={{ fontSize: '1.25rem' }} /> : <VisibilityIcon style={{ fontSize: '1.25rem' }} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--primary"
              style={{ width: '100%' }}
              disabled={loading || !password || !confirmPassword}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <button
              className="btn btn--outline"
              onClick={handleBackToLogin}
              style={{ marginTop: 'var(--space-4)' }}
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default PasswordReset