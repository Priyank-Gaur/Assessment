import { useState, useEffect, useRef } from 'react'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { LANGUAGES } from '../constants/languages'
import { sortProfiles } from '../utils/profileOrder'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslatedContent } from '../hooks/useTranslatedContent'

const API_BASE = 'https://happimynd.com/new_api';

// Current Happi Mynd brand logo, served from the marketing site so the auth
// screen always shows the same mark as the rest of the platform.
const LOGO_SRC = 'https://happimynd.com/assets/Frontend/images/happimynd_logo.png';

// Product name. Deliberately kept out of UI_TEXT: it's a brand name, so it must
// render identically in every language rather than being machine-translated.
const APP_TITLE = 'Quizzard'

// Static copy for the auth screen. Everything here is translated into the
// user's selected language so the whole Sign-Up / Login flow is localized.
const UI_TEXT = {
  heroTitleTop: 'Insights That',
  heroTitleBottom: 'Inspire Growth.',
  heroSubtitle: 'Quick, engaging quizzes to help you discover more about yourself.',
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
  emailPlaceholder: 'Enter your email',
  passwordPlaceholder: 'Enter your password',
  namePlaceholder: 'Enter your name',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  newHere: 'New here?',
  uspLanguagesTitle: '35+ Languages',
  uspLanguagesText: "Take quizzes in a language you're comfortable with.",
  uspQuizzesTitle: 'Under 60 Seconds',
  uspQuizzesText: 'Quick quizzes designed to fit into your day.',
  uspProfilesTitle: '25+ Lifestyle Quizzes',
  uspProfilesText: 'Explore different aspects of your personality and life.',
  uspReportsTitle: 'Instant Insights',
  uspReportsText: 'See your results as soon as you complete a quiz.',
};

// Line icons for the USP strip. Inline (rather than an icon package) so they
// inherit currentColor and stay crisp on the gradient tiles.
const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const GlobeIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </svg>
);

const BoltIcon = () => (
  <svg {...iconProps}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

const TargetIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
);

const ChartIcon = () => (
  <svg {...iconProps}>
    <path d="M3 21h18" />
    <path d="M7 21V11M12 21V4M17 21v-6" />
  </svg>
);

// Field affordances: a tinted chip inside each input, plus the password reveal.
const UserIcon = () => (
  <svg {...iconProps}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const MailIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

const LockIcon = () => (
  <svg {...iconProps}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);

const LanguageIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </svg>
);

const BuildingIcon = () => (
  <svg {...iconProps}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 8h1M14 8h1M9 12h1M14 12h1M10 21v-4h4v4" />
  </svg>
);

const EyeIcon = () => (
  <svg {...iconProps}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg {...iconProps}>
    <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.4 4.1M6.6 7.9A17.6 17.6 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4.1-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </svg>
);

// Value props shown under the sign-in block. Titles carry the headline number,
// so the description stays a single sentence that translates cleanly.
// Tab order drives both the header strip and every `tab === n` branch below.
const TAB_LOGIN = 0;
const TAB_SIGNUP = 1;
const TAB_FORGOT = 2;

const TABS = [
  { id: TAB_LOGIN, label: 'login' },
  { id: TAB_SIGNUP, label: 'signUp' },
  { id: TAB_FORGOT, label: 'forgotPassword' },
];

const USP_CARDS = [
  { id: 'languages', icon: <GlobeIcon />, title: 'uspLanguagesTitle', text: 'uspLanguagesText' },
  { id: 'quizzes', icon: <BoltIcon />, title: 'uspQuizzesTitle', text: 'uspQuizzesText' },
  { id: 'profiles', icon: <TargetIcon />, title: 'uspProfilesTitle', text: 'uspProfilesText' },
  { id: 'reports', icon: <ChartIcon />, title: 'uspReportsTitle', text: 'uspReportsText' },
];

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
      setShowPassword(false);
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
    <div className="auth-page">
      <div className="auth-frame">
        <div className="auth-main">
          {/* ---- hero ------------------------------------------------- */}
          <section className="auth-hero">
            <div className="auth-hero__copy">
              <h1 className="auth-hero__title">
                {t('heroTitleTop')}
                <span className="auth-hero__title-accent">{t('heroTitleBottom')}</span>
              </h1>
              <p className="auth-hero__subtitle">{t('heroSubtitle')}</p>
            </div>

            {/* Illustration only — the copy above already carries the message,
                so it stays out of the accessibility tree. */}
            <div className="auth-hero__stage">
              <img
                className="auth-hero__mascot"
                src="/happimynd_mascot_laptop.png"
                alt=""
                aria-hidden="true"
              />
            </div>
          </section>

          {/* ---- login card ------------------------------------------- */}
          <div className="auth-form-card">
            <div className="auth-form-card__brand">
              <img className="auth-form-card__logo" src={LOGO_SRC} alt="Happi Mynd" />
            </div>

            {/* h2: the hero headline is the page's h1. */}
            <h2 className="auth-form-card__title">{APP_TITLE}</h2>

            <div className="auth-tabs" role="tablist" aria-label={APP_TITLE}>
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`auth-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls="auth-tabpanel"
                  className={`auth-tab${tab === id ? ' auth-tab--active' : ''}`}
                  onClick={() => handleTabChange(id)}
                >
                  {t(label)}
                </button>
              ))}
            </div>

            <div
              id="auth-tabpanel"
              role="tabpanel"
              aria-labelledby={`auth-tab-${tab}`}
            >
              {tab === TAB_FORGOT ? (
                /* ---- Forgot Password ---- */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setLoading(true);
                    setError('');
                    setSuccess('');
                    setResetEmailSent(true);
                    setLoading(false);
                  }}
                >
                  {error && <div className="auth-alert auth-alert--error" role="alert">{tx(error)}</div>}
                  {success && <div className="auth-alert auth-alert--success" role="status">{tx(success)}</div>}

                  <div className="auth-field">
                    <label className="auth-field__label" htmlFor="auth-reset-email">{t('email')}</label>
                    <div className="auth-field__control">
                      <span className="auth-field__icon" aria-hidden="true"><MailIcon /></span>
                      <input
                        id="auth-reset-email"
                        className="auth-input"
                        type="email"
                        autoComplete="email"
                        placeholder={t('emailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {resetEmailSent && (
                    <div className="auth-alert auth-alert--info" role="status">
                      <strong>{t('checkEmail')}</strong> {t('resetSentPre')} {email}. {t('resetSentPost')}
                    </div>
                  )}

                  <button type="submit" className="auth-submit">{t('resetPassword')}</button>
                </form>
              ) : (
                /* ---- Login / Sign Up ---- */
                <form onSubmit={(e) => { e.preventDefault(); handleAuth(tab === TAB_SIGNUP); }}>
                  {error && <div className="auth-alert auth-alert--error" role="alert">{tx(error)}</div>}
                  {success && <div className="auth-alert auth-alert--success" role="status">{tx(success)}</div>}

                  {tab === TAB_SIGNUP && (
                    <>
                      <div className="auth-field">
                        <label className="auth-field__label" htmlFor="auth-name">{t('userName')}</label>
                        <div className="auth-field__control">
                          <span className="auth-field__icon" aria-hidden="true"><UserIcon /></span>
                          <input
                            id="auth-name"
                            className="auth-input"
                            type="text"
                            autoComplete="name"
                            placeholder={t('namePlaceholder')}
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="auth-field">
                        <label className="auth-field__label" htmlFor="auth-language">{t('preferredLanguage')}</label>
                        <div className="auth-field__control">
                          <span className="auth-field__icon" aria-hidden="true"><LanguageIcon /></span>
                          <select
                            id="auth-language"
                            className="auth-select"
                            value={preferredLanguage}
                            onChange={(e) => {
                              setPreferredLanguage(e.target.value);
                              // Keep the app-wide language in sync so the choice
                              // is reflected everywhere immediately.
                              setLanguage(e.target.value);
                            }}
                          >
                            {LANGUAGES.map((l) => (
                              <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                          </select>
                        </div>
                        <p className="auth-field__hint">{t('preferredLanguageHint')}</p>
                      </div>
                    </>
                  )}

                  <div className="auth-field">
                    <label className="auth-field__label" htmlFor="auth-email">{t('email')}</label>
                    <div className="auth-field__control">
                      <span className="auth-field__icon" aria-hidden="true"><MailIcon /></span>
                      <input
                        id="auth-email"
                        className="auth-input"
                        type="email"
                        autoComplete="email"
                        placeholder={t('emailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {tab === TAB_SIGNUP && (
                    <>
                      <fieldset className="auth-field auth-fieldset">
                        <legend className="auth-field__label">{t('registerAs')}</legend>
                        <div className="auth-choices">
                          <label className={`auth-choice${registrationType === 'individual' ? ' auth-choice--selected' : ''}`}>
                            <input
                              type="radio"
                              name="registrationType"
                              value="individual"
                              checked={registrationType === 'individual'}
                              onChange={() => handleRegistrationTypeChange('individual')}
                            />
                            <span>{t('individual')}</span>
                          </label>
                          <label className={`auth-choice${registrationType === 'company' ? ' auth-choice--selected' : ''}`}>
                            <input
                              type="radio"
                              name="registrationType"
                              value="company"
                              checked={registrationType === 'company'}
                              onChange={() => handleRegistrationTypeChange('company')}
                            />
                            <span>{t('viaCode')}</span>
                          </label>
                        </div>
                      </fieldset>

                      <div className="auth-field">
                        <label className="auth-field__label" htmlFor="auth-profile">{t('profile')}</label>
                        <div className="auth-field__control">
                          <span className="auth-field__icon" aria-hidden="true"><TargetIcon /></span>
                          <select
                            id="auth-profile"
                            className="auth-select"
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
                      </div>

                      {registrationType === 'company' && (
                        <div className="auth-field">
                          <label className="auth-field__label" htmlFor="auth-code">{t('companyCode')}</label>
                          <div className="auth-field__control">
                            <span className="auth-field__icon" aria-hidden="true"><BuildingIcon /></span>
                            <input
                              id="auth-code"
                              className="auth-input auth-input--code"
                              type="text"
                              placeholder="e.g. AB12CD"
                              value={onboardingCode}
                              onChange={(e) => setOnboardingCode(e.target.value)}
                              required
                            />
                          </div>

                          {/* Real-time verification feedback */}
                          <p className="auth-field__hint" aria-live="polite">
                            {verifyingCode && t('resolvingCode')}
                            {!verifyingCode && verifiedOrgName && (
                              <span className="auth-field__hint--success">
                                ✅ {t('verifiedJoining')} <strong>{tx(verifiedOrgName)}</strong>
                              </span>
                            )}
                            {!verifyingCode && codeVerificationError && (
                              <span className="auth-field__hint--error">❌ {tx(codeVerificationError)}</span>
                            )}
                            {!verifyingCode && !verifiedOrgName && !codeVerificationError && !onboardingCode.trim() &&
                              t('enterCompanyCode')}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  <div className="auth-field">
                    <label className="auth-field__label" htmlFor="auth-password">{t('password')}</label>
                    <div className="auth-field__control">
                      <span className="auth-field__icon" aria-hidden="true"><LockIcon /></span>
                      <input
                        id="auth-password"
                        className="auth-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={tab === TAB_SIGNUP ? 'new-password' : 'current-password'}
                        placeholder={t('passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="auth-reveal"
                        onClick={() => setShowPassword((shown) => !shown)}
                        aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="auth-submit"
                    disabled={
                      loading ||
                      (tab === TAB_SIGNUP && (
                        !userName.trim() ||
                        !email.trim() ||
                        !profile ||
                        !password.trim() ||
                        (registrationType === 'company' && (!onboardingCode.trim() || !verifiedOrgName))
                      ))
                    }
                  >
                    {loading
                      ? (tab === TAB_SIGNUP ? t('signingUp') : t('loggingIn'))
                      : (tab === TAB_SIGNUP ? t('signUp') : t('login'))}
                  </button>

                  {tab === TAB_LOGIN && (
                    <p className="auth-footnote">
                      {t('newHere')}{' '}
                      <button type="button" className="auth-link" onClick={() => handleTabChange(TAB_SIGNUP)}>
                        {t('signUp')}
                      </button>
                    </p>
                  )}

                  {tab === TAB_SIGNUP && (
                    <p className="auth-note">
                      <strong>{t('noteLabel')}</strong> {t('profileNote')}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>

        {/* ---- USP strip ---------------------------------------------- */}
        <ul className="auth-usps">
          {USP_CARDS.map(({ id, icon, title, text }) => (
            <li key={id} className="usp-card">
              <span className="usp-card__icon" aria-hidden="true">{icon}</span>
              <h2 className="usp-card__title">{t(title)}</h2>
              <p className="usp-card__text">{t(text)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default AuthPage
