import { useState, useEffect, useRef } from 'react'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { LANGUAGES } from '../constants/languages'
import { sortProfiles } from '../utils/profileOrder'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslatedContent } from '../hooks/useTranslatedContent'

const API_BASE = 'https://happimynd.com/new_api';

// Product name. Deliberately kept out of UI_TEXT: it's a brand name, so it must
// render identically in every language rather than being machine-translated.
const APP_TITLE = 'Quizzard'

// Static copy for the auth screen. Everything here is translated into the
// user's selected language so the whole Sign-Up / Login flow is localized.
const UI_TEXT = {
  login: 'Login',
  signUp: 'Sign Up',
  forgotPassword: 'Forgot Password',
  userName: 'User Name',
  preferredLanguage: 'Preferred Language',
  preferredLanguageHint: 'Your dashboard and quizzes will be shown in this language. You can change it later from your dashboard.',
  email: 'Email',
  registerAs: 'Register as',
  individual: 'Individual',
  viaCode: 'Via Code and Company',
  profile: 'Profile',
  selectProfile: 'Select a profile',
  loadingProfiles: 'Loading profiles...',
  companyCode: 'Company Code',
  resolvingCode: 'Resolving company code...',
  verifiedJoining: 'Verified: Joining',
  enterCompanyCode: 'Please enter the code provided by your company.',
  password: 'Password',
  signingUp: 'Signing Up...',
  loggingIn: 'Logging In...',
  noteLabel: 'Note:',
  profileNote: 'Your profile selection enables us to guide you better in the expert sessions. Make sure to select the correct profile that matches your role.',
  resetPassword: 'Reset Password',
  checkEmail: 'Check your email!',
  resetSentPre: "We've sent a password reset link to",
  resetSentPost: 'Click the link in the email to reset your password.',
  enterUserName: 'Please enter your User Name.',
  enterEmail: 'Please enter your Email address.',
  selectProfileError: 'Please select a profile to continue.',
  enterPassword: 'Please enter your password.',
  enterCompanyCodeError: 'Please enter your company code.',
};

function AuthPage() {
  const { language, setLanguage } = useLanguage()
  const [tab, setTab] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [userName, setUserName] = useState('')
  const [profile, setProfile] = useState('')
  // Preferred language chosen during Sign-Up. Seeded from (and kept in sync
  // with) the app-wide language so the choice carries into the dashboard.
  const [preferredLanguage, setPreferredLanguage] = useState(language)
  const [registrationType, setRegistrationType] = useState('individual')
  const [organization, setOrganization] = useState('') // Added organization state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userRole, setUserRole] = useState('user')
  const [showResend, setShowResend] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)

  // Onboarding Code State
  const [onboardingCode, setOnboardingCode] = useState('')
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [verifiedOrgName, setVerifiedOrgName] = useState('')
  const [codeVerificationError, setCodeVerificationError] = useState('')

  // Verify user code with debounce
  useEffect(() => {
    if (!onboardingCode.trim()) {
      setVerifiedOrgName('')
      setCodeVerificationError('')
      setVerifyingCode(false)
      return
    }

    const verifyCode = async () => {
      setVerifyingCode(true)
      setCodeVerificationError('')
      setVerifiedOrgName('')
      try {
        const response = await fetch(`${API_BASE}/auth/verify-code?code=${encodeURIComponent(onboardingCode.trim().toUpperCase())}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })
        if (response.ok) {
          const data = await response.json()
          setVerifiedOrgName(data.name)
          if (data.flow === 'pre_existing' || (data.email && data.userName)) {
            if (data.email && !email.trim()) setEmail(data.email)
            if (data.userName && !userName.trim()) setUserName(data.userName)
          }
        } else {
          const errData = await response.json()
          setCodeVerificationError(errData.error || 'Invalid user code')
        }
      } catch (err) {
        console.error('Error verifying code:', err)
        setCodeVerificationError('Failed to connect to verification service')
      } finally {
        setVerifyingCode(false)
      }
    }

    const debounceTimer = setTimeout(() => {
      verifyCode()
    }, 500)

    return () => clearTimeout(debounceTimer)
  }, [onboardingCode])

  // Fetch available profiles from the database
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoadingProfiles(true)
      try {
        const response = await fetch(`${API_BASE}/profiles`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })
        if (response.ok) {
          const profilesData = await response.json()
          setProfiles(profilesData)
        }
      } catch (err) {
        console.error('Error fetching profiles:', err)
      } finally {
        setLoadingProfiles(false)
      }
    }

    fetchProfiles()
  }, [])

  // Auto-clear error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const errorRef = useRef(null);
  const codeErrorRef = useRef(null);

  // Auto-scroll to error banner whenever error state changes
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  // Auto-scroll to code verification error whenever codeVerificationError changes
  useEffect(() => {
    if (codeVerificationError && codeErrorRef.current) {
      codeErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [codeVerificationError]);

  // Auto-clear success messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleRegistrationTypeChange = (type) => {
    setRegistrationType(type);
    setProfile('');
    if (type === 'individual') {
      setOnboardingCode('');
      setVerifiedOrgName('');
      setCodeVerificationError('');
    }
  };

  const handleAuth = async (isSignUp) => {
    setLoading(true) // Move setLoading to the beginning for immediate feedback
    setError('')
    setSuccess('')
    setShowResend(false)

    let hasError = false; // Track if an error occurred
    
    try {
      if (isSignUp) {
        // Targeted validation checks with clear, specific error messages
        if (!userName.trim()) {
          setError(UI_TEXT.enterUserName);
          hasError = true;
          return;
        }
        if (!email.trim()) {
          setError(UI_TEXT.enterEmail);
          hasError = true;
          return;
        }
        if (!profile || !profile.trim()) {
          setError(UI_TEXT.selectProfileError);
          hasError = true;
          return;
        }
        if (!password.trim()) {
          setError(UI_TEXT.enterPassword);
          hasError = true;
          return;
        }
        // If company registration is selected, code must be provided and valid
        const isIndividual = registrationType === 'individual';
        const trimmedCode = isIndividual ? '' : onboardingCode.trim();
        if (registrationType === 'company') {
          if (!trimmedCode) {
            setError(UI_TEXT.enterCompanyCodeError);
            hasError = true;
            return;
          }
          if (!verifiedOrgName) {
            setError('The company code entered is not valid. Clear it to sign up individually.');
            hasError = true;
            return;
          }
        }

        console.log('🚀 Starting signup process...', { email, userName, profile, userRole, organization: verifiedOrgName || 'Individual', userCode: trimmedCode })

        // Sign up using the API directly
        const response = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            email,
            password,
            role: userRole,
            userName: userName,
            user_name: userName,
            profile: profile,
            userCode: trimmedCode ? trimmedCode.toUpperCase() : '',
            organization: verifiedOrgName || 'Individual',
            // Preferred language chosen during registration (both casings for
            // whichever the backend validator expects).
            preferredLanguage: preferredLanguage,
            preferred_language: preferredLanguage
          })
        });

        const result = await response.json();

        if (result.error) {
          // Handle specific signup errors
          if (result.error.toLowerCase().includes('already exists')) {
            setError('An account with this email already exists. Please use a different email or try logging in.');
          } else if (result.error.toLowerCase().includes('required')) {
            setError('Missing required fields. Please fill in all required information.');
          } else {
            setError(result.error);
          }
          hasError = true;
          return;
        }

        if (result.user) {
          console.log('✅ Signup successful, user created:', result.user);
          // Persist the language chosen during registration so it's already
          // active when the user logs in and lands on their dashboard.
          setLanguage(preferredLanguage);
          setSuccess('Account created successfully! Redirecting to sign-in...');
          // Clear form and switch to sign-in tab after successful signup
          setTimeout(() => {
            console.log('🔄 Switching to sign-in tab...');
            setTab(0); // Switch to Sign In tab
            setEmail('');
            setPassword('');
            setUserName('');
            setProfile('');
            setRegistrationType('individual');
            setOrganization(''); // Clear organization field
            setOnboardingCode('');
            setVerifiedOrgName('');
            setCodeVerificationError('');
            setUserRole('user');
            setSuccess('');
            setLoading(false); // Turn off loading after redirect
          }, 1000); // Reduce timeout to 1 second for faster redirection
        } else {
          console.log('❌ Signup failed - no user data returned');
          setError('Signup failed - please try again');
          hasError = true;
        }
      } else {
        // Sign in validation checks
        if (!email.trim()) {
          setError(UI_TEXT.enterEmail);
          hasError = true;
          return;
        }
        if (!password.trim()) {
          setError(UI_TEXT.enterPassword);
          hasError = true;
          return;
        }

        // Sign in using the API directly
        const response = await fetch(`${API_BASE}/auth/signin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            email,
            password
          })
        });

        const result = await response.json();

        if (result.error) {
          // Handle specific login errors
          if (result.error.toLowerCase().includes('invalid email') || result.error.toLowerCase().includes('invalid password') || result.error.toLowerCase().includes('invalid credentials')) {
            setError('Invalid email or password. Please check your credentials and try again.');
          } else if (result.error.toLowerCase().includes('email') && result.error.toLowerCase().includes('not found')) {
            setError('No account found with this email. Please check your email or sign up for an account.');
          } else if (result.error.toLowerCase().includes('required')) {
            setError('Both email and password are required. Please fill in both fields.');
          } else {
            setError(result.error);
          }
          hasError = true;
          return;
        }

        if (result.user) {
          console.log('✅ Login successful, user:', result.user);
          // Apply the language the user chose at registration (if the backend
          // returns it), so the dashboard renders in their preferred language.
          const savedLang = result.user.preferredLanguage || result.user.preferred_language;
          if (savedLang) setLanguage(savedLang);
          // Store user in localStorage for persistence
          localStorage.setItem('currentUser', JSON.stringify(result.user));
          // Reload the page to trigger app re-render with authenticated user
          window.location.reload();
        } else {
          console.log('❌ Login failed - no user data returned');
          setError('Login failed - please try again');
          hasError = true;
        }
      }
    } catch (err) {
      console.error('Authentication error:', err);
      if (err.message.includes('Failed to fetch')) {
        setError('Unable to connect to the server. Please check your internet connection and try again.');
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.');
      }
      hasError = true;
    } finally {
      // Only set loading to false for login attempts or signup attempts that resulted in an error
      // Successful signup will turn off loading in the timeout after redirect
      if (!isSignUp || hasError) {
        setLoading(false);
      }
    }
  };

  const handleTabChange = (newValue) => {
    setTab(newValue);
    if (newValue !== tab) {
      setEmail('');
      setPassword('');
      setUserName('');
      setProfile('');
      setRegistrationType(newValue === 1 ? 'individual' : '');
      setOrganization('');
      setError('');
      setSuccess('');
      setShowResend(false);
      setResetEmailSent(false);
    }
  };

  // Translate all static copy plus whatever dynamic strings are currently on
  // screen (errors, success messages, the resolved org name, profile options).
  const authTexts = [
    ...Object.values(UI_TEXT),
    error,
    success,
    codeVerificationError,
    verifiedOrgName,
    ...profiles.map((p) => p.name),
  ].filter((s) => typeof s === 'string' && s !== '');
  const { tx } = useTranslatedContent(authTexts);
  const t = (key) => tx(UI_TEXT[key]);

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
          {APP_TITLE}
        </h2>
        
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-6)', gap: 'var(--space-2)' }}>
          <button 
            style={{ flex: 1, padding: 'var(--space-2)', borderBottom: tab === 0 ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontWeight: tab === 0 ? 700 : 500, color: tab === 0 ? 'var(--color-primary)' : 'var(--color-muted-fg)' }}
            onClick={() => handleTabChange(0)}
          >
            {t('login')}
          </button>
          <button 
            style={{ flex: 1, padding: 'var(--space-2)', borderBottom: tab === 1 ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontWeight: tab === 1 ? 700 : 500, color: tab === 1 ? 'var(--color-primary)' : 'var(--color-muted-fg)' }}
            onClick={() => handleTabChange(1)}
          >
            {t('signUp')}
          </button>
          <button 
            style={{ flex: 1, padding: 'var(--space-2)', borderBottom: tab === 2 ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontWeight: tab === 2 ? 700 : 500, color: tab === 2 ? 'var(--color-primary)' : 'var(--color-muted-fg)' }}
            onClick={() => handleTabChange(2)}
          >
            {t('forgotPassword')}
          </button>
        </div>
        
        {/* Forgot Password Tab */}
        {tab === 2 ? (
          <form noValidate onSubmit={(e) => { 
            e.preventDefault(); 
            if (!email.trim()) {
              setError(UI_TEXT.enterEmail);
              return;
            }
            setLoading(true);
            setError('');
            setSuccess('');
            setResetEmailSent(true);
            setLoading(false);
          }}>
            <div className="form-group">
              <label className="form-label">{t('email')}</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && <div className="alert alert--error">{tx(error)}</div>}
            {success && <div className="alert alert--success" style={{ backgroundColor: '#E5DFFF', color: '#191928', border: '1px solid #8E66F1', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>{tx(success)}</div>}

            {resetEmailSent && (
              <div className="alert" style={{ backgroundColor: '#E5DFFF', color: '#191928', border: '1px solid #E5DFFF', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
                <strong>{t('checkEmail')}</strong> {t('resetSentPre')} {email}. {t('resetSentPost')}
              </div>
            )}

            <button type="submit" className="btn btn--primary" style={{ width: '100%' }}>{t('resetPassword')}</button>
          </form>
        ) : (
          // Login / Sign Up Tabs
          <form noValidate onSubmit={(e) => { e.preventDefault(); handleAuth(tab === 1); }}>
            {error && <div ref={errorRef} className="alert alert--error">{tx(error)}</div>}
            {success && <div className="alert alert--success" style={{ backgroundColor: '#E5DFFF', color: '#191928', border: '1px solid #8E66F1', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>{tx(success)}</div>}

            {tab === 1 && (
              <div className="form-group">
                <label className="form-label">{t('userName')}</label>
                <input
                  className="form-input"
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                />
              </div>
            )}

            {tab === 1 && (
              <div className="form-group">
                <label className="form-label">{t('preferredLanguage')}</label>
                <select
                  className="form-input"
                  value={preferredLanguage}
                  onChange={(e) => {
                    setPreferredLanguage(e.target.value);
                    // Keep the app-wide language in sync so the choice is
                    // reflected everywhere immediately.
                    setLanguage(e.target.value);
                  }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)' }}>
                  {t('preferredLanguageHint')}
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label className="form-label">{t('email')}</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {tab === 1 && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('registerAs')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', padding: '10px 14px', border: '1px solid var(--color-input)', borderRadius: 'var(--radius-md)', backgroundColor: registrationType === 'individual' ? 'rgba(142, 102, 241, 0.08)' : 'transparent', borderColor: registrationType === 'individual' ? 'var(--color-primary)' : 'var(--color-input)', transition: 'all 0.2s' }}>
                      <input
                        type="radio"
                        name="registrationType"
                        value="individual"
                        checked={registrationType === 'individual'}
                        onChange={() => handleRegistrationTypeChange('individual')}
                        style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-fg)' }}>{t('individual')}</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', padding: '10px 14px', border: '1px solid var(--color-input)', borderRadius: 'var(--radius-md)', backgroundColor: registrationType === 'company' ? 'rgba(142, 102, 241, 0.08)' : 'transparent', borderColor: registrationType === 'company' ? 'var(--color-primary)' : 'var(--color-input)', transition: 'all 0.2s' }}>
                      <input
                        type="radio"
                        name="registrationType"
                        value="company"
                        checked={registrationType === 'company'}
                        onChange={() => handleRegistrationTypeChange('company')}
                        style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-fg)' }}>{t('viaCode')}</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('profile')}</label>
                  <select
                    className="form-input"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    required
                    disabled={loadingProfiles}
                  >
                    <option value="" disabled>{t('selectProfile')}</option>
                    {loadingProfiles ? (
                      <option disabled>{t('loadingProfiles')}</option>
                    ) : (
                      sortProfiles(profiles)
                        .filter((profileItem) =>
                          profileItem.name &&
                          profileItem.name.toLowerCase() !== 'solv' &&
                          profileItem.name.toLowerCase() !== 'individual' &&
                          profileItem.name.toLowerCase() !== 'general'
                        )
                        .map((profileItem) => (
                          <option key={profileItem.id} value={profileItem.name}>
                            {tx(profileItem.name)}
                          </option>
                        ))
                    )}
                  </select>
                </div>

                {registrationType === 'company' && (
                  <div className="form-group">
                    <label className="form-label">{t('companyCode')}</label>
                    <input
                      className="form-input"
                      type="text"
                      value={onboardingCode}
                      onChange={(e) => setOnboardingCode(e.target.value)}
                      placeholder="e.g. AB12CD"
                      style={{ textTransform: 'uppercase' }}
                      required
                    />

                    {/* Real-time verification display */}
                    <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                      {verifyingCode && (
                        <span style={{ color: 'var(--color-muted-fg)' }}>{t('resolvingCode')}</span>
                      )}
                      {verifiedOrgName && (
                        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                          ✅ {t('verifiedJoining')} <strong>{tx(verifiedOrgName)}</strong>
                        </span>
                      )}
                      {codeVerificationError && (
                        <span ref={codeErrorRef} style={{ color: 'var(--color-destructive)', fontWeight: 600, display: 'block' }}>
                          ❌ {tx(codeVerificationError)}
                        </span>
                      )}
                      {!onboardingCode.trim() && !verifiedOrgName && !codeVerificationError && !verifyingCode && (
                        <span style={{ color: 'var(--color-muted-fg)' }}>
                          {t('enterCompanyCode')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div className="form-group">
              <label className="form-label">{t('password')}</label>
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
            </div>

            <button
              type="submit"
              className="btn btn--primary"
              style={{ width: '100%', marginBottom: 'var(--space-4)' }}
              disabled={loading}
            >
              {loading ? (tab === 1 ? t('signingUp') : t('loggingIn')) : (tab === 0 ? t('login') : t('signUp'))}
            </button>

            {tab === 1 && (
              <div className="alert" style={{ backgroundColor: '#E5DFFF', color: '#191928', border: '1px solid #E5DFFF', fontSize: 'var(--text-sm)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
                <strong>{t('noteLabel')}</strong> {t('profileNote')}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default AuthPage