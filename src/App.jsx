import { useState, useEffect, useMemo } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { copyToClipboard, showClipboardFeedback } from './utils/clipboard'
import ProfileManager from './components/ProfileManager'
import PacketManager from './components/PacketManager'
import QuizBuilder from './components/QuizBuilder'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import MenuIcon from '@mui/icons-material/Menu'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import PeopleIcon from '@mui/icons-material/People'
import PersonIcon from '@mui/icons-material/Person'
import CategoryIcon from '@mui/icons-material/Category'
import QuizIcon from '@mui/icons-material/Quiz'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import ShareIcon from '@mui/icons-material/Share'
import AssessmentIcon from '@mui/icons-material/Assessment'
import HomeIcon from '@mui/icons-material/Home'
import HistoryIcon from '@mui/icons-material/History'
import VisibilityIcon from '@mui/icons-material/Visibility'
import InsightsIcon from '@mui/icons-material/Insights'
import DeleteIcon from '@mui/icons-material/Delete'
import BusinessIcon from '@mui/icons-material/Business'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AssignmentIcon from '@mui/icons-material/Assignment'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import * as XLSX from 'xlsx'
import './App.css'
import { Grid, Card, CardContent, Tooltip, Alert, CircularProgress, Chip } from '@mui/material'
import QuizAttempt from './components/QuizAttempt'
import { useDatabase } from './hooks/useDatabase'

import AssessmentResults from './components/AssessmentResults'
import AssessmentReport from './components/AssessmentReport'
import ReportViewer from './components/ReportViewer'
import AuthPage from './components/AuthPage'
import UserDashboard from './components/UserDashboard/UserDashboard'
import WhatsAppButton from './components/WhatsAppButton'
import AdminDashboard from './components/AdminDashboard'
import PasswordReset from './components/PasswordReset'
import PDFTemplateConfig from './components/PDFTemplateConfig'
import ActiveTracking from './components/ActiveTracking'
import OrganizationManager from './components/OrganizationManager'
import { useTranslatedContent } from './hooks/useTranslatedContent'

// Product name. Deliberately kept out of CHROME_TEXT: it's a brand name, so it
// must render identically in every language rather than being machine-translated.
const APP_TITLE = 'Quizzard'

// Static chrome copy (sidebar, navbar, dialogs) — translated into the user's
// selected language so the whole shell, not just the dashboard, is localized.
const CHROME_TEXT = {
  userDashboard: 'User Dashboard',
  adminDashboard: 'Admin Dashboard',
  howToUse: 'How to Use',
  logout: 'Logout',
  uploadExcel: 'Upload Excel',
  quizRecords: 'Quiz Records',
  noQuizAttempts: 'No quiz attempts found.',
  taken: 'Taken:',
  viewReport: 'View Report',
  quiz: 'Quiz',
  close: 'Close',
  htHomeLabel: 'Home:',
  htHome: 'View your dashboard with progress and assigned quizzes.',
  htRecordsLabel: 'Quiz Records:',
  htRecords: 'View your quiz attempt history and completion dates.',
  htTakeLabel: 'Take Quizzes:',
  htTake: 'Use the shareable links provided by your admin to take quizzes.',
}

const drawerWidth = 220

// Admin navigation items. The `permission` key maps to the dashboard "views"
// granted to a member; the menu is filtered by these (see navItems below).
const adminNavItems = [
  { label: 'Admin Dashboard', icon: <PersonIcon />, permission: 'admin_dashboard' },
  { label: 'Organization Management', icon: <BusinessIcon />, permission: 'organizations' },
  { label: 'Profile Management', icon: <PeopleIcon />, permission: 'profiles' },
  { label: 'Packet Management', icon: <CategoryIcon />, permission: 'packets' },
  { label: 'Quiz Builder', icon: <QuizIcon />, permission: 'quiz_builder' },
  { label: 'Assigned Quizzes', icon: <AssignmentTurnedInIcon />, permission: 'assigned_quizzes' },
  { label: 'Quiz Results', icon: <AssessmentIcon />, permission: 'results' },
  { label: 'Quiz Report', icon: <AssessmentIcon />, permission: 'reports' },
  { label: 'Active Tracking', icon: <InsightsIcon />, permission: 'active_tracking' },
  { label: 'PDF Templates', icon: <ShareIcon />, permission: 'pdf_templates' },
]

// User navigation items
const userNavItems = [
  { label: 'Home', icon: <HomeIcon />, permission: 'home' },
  { label: 'Quiz Records', icon: <HistoryIcon />, permission: 'quiz_records' },
]

function App() {
  const navigate = useNavigate()
  
  // Database state
  const {
    profiles,
    packets,
    quizzes: savedQuizzes,
    loading,
    error,
    addProfile,
    updateProfile,
    deleteProfile,
    addPacket,
    updatePacket,
    deletePacket,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    addQuiz,
    updateQuiz,
    deleteQuiz,
    addPacketsToQuiz,
    removePacketsFromQuiz,
    assignQuizToProfiles,
    removeQuizAssignment,
    assignQuizToUsers,
    removeUserQuizAssignment,
    getQuizPackets,
    loadData,
    quizAssignments,
    useFallback,
    loadUserQuizAttempts,
    loadUserStats,
    userQuizAttempts,
    userStats,
    users,
    organizations,
    addOrganization,
    updateOrganization,
    deleteOrganization,
    regenerateOnboardingCode,
    employees,
    loadEmployees,
    importEmployees,
    deleteEmployee
  } = useDatabase()

  // UI state
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true')
  const [tab, setTab] = useState(0)
  const [howToOpen, setHowToOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Assign Quizzes widget state
  const [formQuizId, setFormQuizId] = useState('')
  const [formTargetType, setFormTargetType] = useState('profile') // 'profile' or 'user'
  const [formSelectedProfiles, setFormSelectedProfiles] = useState([])
  const [formSelectedUsers, setFormSelectedUsers] = useState([])

  const handleFormAssign = async () => {
    if (!formQuizId) {
      alert('Please select a quiz.')
      return
    }
    try {
      if (formTargetType === 'profile') {
        if (formSelectedProfiles.length === 0) {
          alert('Please select at least one profile.')
          return
        }
        await assignQuizToProfiles(formQuizId, formSelectedProfiles)
        alert('Quiz successfully assigned to selected profiles!')
        setFormSelectedProfiles([])
      } else {
        if (formSelectedUsers.length === 0) {
          alert('Please select at least one user.')
          return
        }
        await assignQuizToUsers(formQuizId, formSelectedUsers)
        alert('Quiz successfully assigned to selected users!')
        setFormSelectedUsers([])
      }
      setFormQuizId('')
      await loadData()
    } catch (err) {
      console.error('Error in handleFormAssign:', err)
      alert('Failed to assign quiz. Please try again.')
    }
  }

  // Get navigation items based on role + assigned permissions.
  //   Super Admin            : sees every item.
  //   Admin / User           : sees only items whose `permission` was granted.
  //   Legacy (no permissions): falls back to the full set for their role so
  //                            existing accounts keep working after migration.
  const navItems = (() => {
    const base = isAdmin ? adminNavItems : userNavItems
    const perms = Array.isArray(user?.permissions) ? user.permissions : []
    if (isSuperAdmin || perms.length === 0) return base
    return base.filter(item => !item.permission || perms.includes(item.permission))
  })()

  // Sync darkMode with body class and persist the choice
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark')
    } else {
      document.body.classList.remove('dark')
    }
    localStorage.setItem('darkMode', String(darkMode))
  }, [darkMode])

  // Auth state management - using local storage
  useEffect(() => {
    // Check for existing user in localStorage
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUser(user);
        checkUserRole(user);
      } catch (err) {
        console.error('Error parsing stored user:', err);
        localStorage.removeItem('currentUser');
      }
    }
  }, [])

  // Check if user is admin
  const checkUserRole = async (user) => {
    try {
      // For our SQLite setup, the user object already contains the role.
      // Super Admin (HappiMynd) and Admin both get the admin experience;
      // Super Admin additionally unlocks restricted actions.
      if (user && user.role) {
        const superAdminUser = user.role === 'super_admin';
        const isAdminUser = superAdminUser || user.role === 'admin';
        setIsAdmin(isAdminUser);
        setIsSuperAdmin(superAdminUser);
        console.log('✅ User role detected:', user.role, 'isAdmin:', isAdminUser, 'isSuperAdmin:', superAdminUser);
        return;
      }

      // Fallback: try to get role from API
      console.warn('No role in user object, trying API fallback');
      setIsAdmin(false);
      setIsSuperAdmin(false);
    } catch (err) {
      console.warn('Role check failed:', err)
      setIsAdmin(false)
      setIsSuperAdmin(false)
    }
  }

  // Load user data when user changes
  useEffect(() => {
    if (user && !isAdmin) {
      loadUserQuizAttempts(user.id)
      loadUserStats(user.id)
    }
  }, [user, isAdmin, loadUserQuizAttempts, loadUserStats])

  // Resolve the user's assigned quizzes client-side for filtering.
  const assignedQuizzes = useMemo(() => {
    if (!user) return [];

    const userProfile = (profiles || []).find(p => p &&
      ((user.profile != null && p.name && p.name.toLowerCase() === user.profile.toLowerCase()) ||
       (user.profile_id != null && String(p.id) === String(user.profile_id)))
    );

    return (quizAssignments || [])
      .filter(a => a &&
        ((userProfile && String(a.profile_id) === String(userProfile.id) && !a.user_id) ||
         (a.user_id && String(a.user_id) === String(user.id)))
      )
      .map(a => {
        const assignedProfile = userProfile || (a.profile_id ? (profiles || []).find(p => p && String(p.id) === String(a.profile_id)) : null);
        return {
          ...a,
          quiz: (savedQuizzes || []).find(q => q && String(q.id) === String(a.quiz_id)) || null,
          profile: assignedProfile
        };
      })
      .filter(a => a.quiz); // drop assignments whose quiz was deleted
  }, [user, profiles, savedQuizzes, quizAssignments]);

  const realProfiles = useMemo(() => {
    return (profiles || []).filter(p => {
      const name = (p.name || '').trim().toUpperCase();
      return name && name !== 'SOLV' && name !== 'INDIVIDUAL';
    });
  }, [profiles]);

  const allowedQuizIds = useMemo(() => {
    return new Set(assignedQuizzes.map(aq => String(aq.quiz_id)));
  }, [assignedQuizzes]);

  const filteredUserQuizAttempts = useMemo(() => {
    return userQuizAttempts.filter(a => allowedQuizIds.has(String(a.quiz_id)));
  }, [userQuizAttempts, allowedQuizIds]);

  // Translate the app shell (sidebar titles, nav labels, navbar, dialogs) plus
  // the quiz names shown in Quiz Records into the user's selected language.
  const chromeTexts = [
    ...Object.values(CHROME_TEXT),
    ...navItems.map((item) => item.label),
    ...filteredUserQuizAttempts.map((a) => a.quiz?.name || a.quiz_name).filter(Boolean),
  ]
  const { tx: tc } = useTranslatedContent(chromeTexts)

  // Assign quiz function
  const assignQuiz = async (profileId, quizId) => {
    try {
      if (!quizAssignments.find(aq => aq.profile_id === profileId && aq.quiz_id === quizId)) {
        await assignQuizToProfiles(quizId, [profileId])
        await loadData()
      }
    } catch (err) {
      console.error('Error assigning quiz:', err)
      alert('Failed to assign quiz. Please try again.')
    }
  }

  // Export quizzes
  const exportQuizzes = () => {
    const dataStr = JSON.stringify(savedQuizzes, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quizzes.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Import quizzes
  const importQuizzes = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const imported = JSON.parse(evt.target.result)
        if (Array.isArray(imported)) {
          for (const quiz of imported) {
            await addQuiz({
              name: quiz.name,
              description: quiz.description || '',
              time_limit: quiz.timeLimit || null,
              passing_score: quiz.passingScore || 70
            })
          }
          alert('Quizzes imported successfully!')
        } else {
          alert('Invalid file format.')
        }
      } catch (err) {
        console.error('Error importing quizzes:', err)
        alert('Invalid JSON file or import failed.')
      }
    }
    reader.readAsText(file)
  }

  // Upload Excel
  const uploadExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        
        const profilesSheet = workbook.Sheets['Profiles']
        const packetsSheet = workbook.Sheets['Packets']
        const questionsSheet = workbook.Sheets['Questions']
        const quizzesSheet = workbook.Sheets['Quizzes']
        
        if (!profilesSheet || !packetsSheet || !questionsSheet || !quizzesSheet) {
          alert('Excel must have sheets: Profiles, Packets, Questions, Quizzes')
          return
        }

        // Parse and import data
        const profilesData = XLSX.utils.sheet_to_json(profilesSheet)
        for (const row of profilesData) {
          await addProfile({
            name: row.Name || row.ProfileName,
            type: row.Type || row.WorkStatus || 'general'
          })
        }

        const packetsData = XLSX.utils.sheet_to_json(packetsSheet)
        const packetMap = new Map()
        
        for (const row of packetsData) {
          const newPacket = await addPacket({
            name: row.PacketName,
            description: row.Description || ''
          })
          packetMap.set(row.PacketName, newPacket.id)
        }

        const questionsData = XLSX.utils.sheet_to_json(questionsSheet)
        for (const row of questionsData) {
          const packetId = packetMap.get(row.PacketName || row.Packet)
          if (packetId) {
            await addQuestion({
              packet_id: packetId,
              question_text: row.Text || row.QuestionText,
              question_type: row.Type === 'MCQ' ? 'mcq' : 'true_false',
              options: row.Type === 'MCQ' ? [row.Option1, row.Option2, row.Option3, row.Option4].filter(Boolean) : null,
              correct_answer: row.CorrectAnswer || row.Correct
            })
          }
        }

        const quizzesData = XLSX.utils.sheet_to_json(quizzesSheet)
        for (const row of quizzesData) {
          const packetNames = (row.PacketNames || '').split(',').map(s => s.trim())
          const packetIds = packetNames.map(name => packetMap.get(name)).filter(Boolean)
          
          const newQuiz = await addQuiz({
            name: row.QuizName,
            description: row.Description || '',
            time_limit: row.TimeLimit || null,
            passing_score: row.PassingScore || 70
          })

          if (packetIds.length > 0) {
            await addPacketsToQuiz(newQuiz.id, packetIds)
          }

          if (row.ProfileName || row.Name) {
            const profile = profiles.find(p => p.name === (row.ProfileName || row.Name))
            if (profile) {
              await assignQuizToProfiles(newQuiz.id, [profile.id])
            }
          }
        }

        await loadData()
        alert('Excel data loaded successfully!')
      } catch (err) {
        console.error('Error uploading Excel:', err)
        alert('Failed to upload Excel file. Please check the format and try again.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: { main: '#8E66F1' },
    },
    typography: {
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
    },
  })

  // Show loading state
  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography sx={{ mb: 2 }}>Loading application...</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            If this takes too long, the database may not be set up yet.
          </Typography>
          <Button 
            variant="outlined" 
            onClick={() => {
              // Force fallback mode
              if (typeof window !== 'undefined') {
                localStorage.setItem('force_fallback', 'true')
                window.location.reload()
              }
            }}
          >
            Use Fallback Mode
          </Button>
        </Box>
      </ThemeProvider>
    )
  }

  // Show error state
  if (error) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', p: 3 }}>
          <Alert severity="error" sx={{ maxWidth: 600 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Database Connection Error</Typography>
            <Typography sx={{ mb: 2 }}>{error}</Typography>
            {error.includes('Database connection failed') && (
              <Typography variant="body2" color="text.secondary">
                The app is now running with local JSON storage. All features are available offline.
              </Typography>
            )}
          </Alert>
        </Box>
      </ThemeProvider>
    )
  }

  // If not logged in, show AuthPage
  if (!user) {
    return <AuthPage />
  }

  // Render main app
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {useFallback && (
        <Alert severity="warning" sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
          <Typography>
            Running in fallback mode (localStorage). Database features are limited.
          </Typography>
        </Alert>
      )}
      <Routes>
        <Route path="/attempt/:quizId" element={<QuizAttempt />} />
        <Route path="/report/:quizId/:attemptId" element={<ReportViewer />} />
        <Route path="/reset-password" element={<PasswordReset />} />
        <Route path="*" element={
          <div className="app-layout">
            <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
              <div className="sidebar__header">
                <img src="https://happimynd.com/assets/Frontend/images/happimynd_logo.png" alt="HappiMynd" className="sidebar__logo" />
                <span className="sidebar__title">{APP_TITLE}</span>
              </div>
              <nav className="sidebar__nav">
                {navItems.map((item, idx) => {
                  const itemTab = isAdmin ? adminNavItems.findIndex(i => i.permission === item.permission) : idx;
                  const targetTab = itemTab !== -1 ? itemTab : idx;
                  return (
                    <div 
                      key={item.label} 
                      className={`nav-item ${tab === targetTab ? 'nav-item--active' : ''}`} 
                      onClick={() => {
                        setTab(targetTab);
                        setSidebarOpen(false);
                      }}
                    >
                      <div className="nav-item__icon">{item.icon}</div>
                      <span>{tc(item.label)}</span>
                    </div>
                  );
                })}
              </nav>
              <div className="sidebar__footer">
                <div className="nav-item" onClick={() => setHowToOpen(true)}>
                  <div className="nav-item__icon"><InfoOutlinedIcon /></div>
                  <span>{tc(CHROME_TEXT.howToUse)}</span>
                </div>
                <a 
                  href="https://wa.me/919136899581" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="nav-item nav-item--whatsapp"
                  style={{ textDecoration: 'none', color: '#25D366' }}
                >
                  <div className="nav-item__icon" style={{ color: '#25D366' }}><WhatsAppIcon /></div>
                  <span style={{ color: 'var(--color-fg)', fontWeight: 600 }}>Chat with us</span>
                </a>
              </div>
            </aside>
            <div className={`overlay ${sidebarOpen ? 'overlay--visible' : ''}`} onClick={() => setSidebarOpen(false)}></div>

            <main className="main-content">
              <header className="navbar">
                <div className="navbar__left">
                  <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
                    <MenuIcon />
                  </button>
                  <div className="navbar__title">
                    {isAdmin ? tc(CHROME_TEXT.adminDashboard) : tc(CHROME_TEXT.userDashboard)} {useFallback && '(Fallback Mode)'}
                  </div>
                </div>
                <div className="navbar__right">
                  {isAdmin && (
                    <label className="btn btn--outline" style={{ margin: 0, cursor: 'pointer' }}>
                      {tc(CHROME_TEXT.uploadExcel)}
                      <input type="file" accept=".xlsx,.xls" hidden onChange={uploadExcel} />
                    </label>
                  )}
                  <IconButton onClick={() => setDarkMode((prev) => !prev)} style={{ color: 'var(--color-fg)' }}>
                    {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
                  </IconButton>
                  <button className="btn btn--secondary" onClick={() => {
                    localStorage.removeItem('currentUser');
                    setUser(null);
                    setIsAdmin(false);
                    setIsSuperAdmin(false);
                  }}>{tc(CHROME_TEXT.logout)}</button>
                </div>
              </header>
              
              {/* Content Area */}
              <div className="content-area">
                {isAdmin ? (
                  // Admin Mode
                  <>
                    {tab === 0 && <AdminDashboard />}
                    {tab === 1 && (
                      <OrganizationManager 
                        organizations={organizations} 
                        addOrganization={addOrganization}
                        updateOrganization={updateOrganization}
                        deleteOrganization={deleteOrganization}
                        regenerateOnboardingCode={regenerateOnboardingCode}
                        employees={employees}
                        loadEmployees={loadEmployees}
                        importEmployees={importEmployees}
                        deleteEmployee={deleteEmployee}
                      />
                    )}
                    {tab === 2 && (
                      <ProfileManager 
                        profiles={realProfiles} 
                        addProfile={addProfile}
                        updateProfile={updateProfile}
                        deleteProfile={deleteProfile}
                      />
                    )}
                    {tab === 3 && (
                      <PacketManager 
                        packets={packets} 
                        addPacket={addPacket}
                        updatePacket={updatePacket}
                        deletePacket={deletePacket}
                        addQuestion={addQuestion}
                        updateQuestion={updateQuestion}
                        deleteQuestion={deleteQuestion}
                        onDataChange={loadData}
                      />
                    )}
                    {tab === 4 && (
                      <Box sx={{ width: '100%' }}>
                        <Box sx={{ mb: 2 }}>
                          <Button variant="contained" onClick={exportQuizzes}>Export Quizzes</Button>
                          <Button component="label" sx={{ ml: 2 }}>
                            Import Quizzes
                            <input type="file" accept="application/json" hidden onChange={importQuizzes} />
                          </Button>
                        </Box>
                        <QuizBuilder
                          profiles={realProfiles}
                          packets={packets}
                          savedQuizzes={savedQuizzes}
                          addQuiz={addQuiz}
                          updateQuiz={updateQuiz}
                          deleteQuiz={deleteQuiz}
                          addPacketsToQuiz={addPacketsToQuiz}
                          removePacketsFromQuiz={removePacketsFromQuiz}
                          assignQuiz={assignQuiz}
                          assignQuizToProfiles={assignQuizToProfiles}
                          removeQuizAssignment={removeQuizAssignment}
                          quizAssignments={quizAssignments}
                          onDataChange={loadData}
                          getQuizPackets={getQuizPackets}
                        />
                      </Box>
                    )}
                    {tab === 5 && (
                      <Box sx={{ width: '100%', mb: 4 }}>
                        {/* Assign Quiz Card */}
                        <Card variant="outlined" sx={{ mb: 4, p: 3, background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
                          <CardContent sx={{ p: 0 }}>
                            <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
                              Assign Quizzes
                            </Typography>
                            
                            <Grid container spacing={3} alignItems="flex-start">
                              {/* 1. Select Quiz */}
                              <Grid item xs={12} md={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                  Select Quiz
                                </Typography>
                                <select
                                  className="form-input"
                                  value={formQuizId}
                                  onChange={(e) => setFormQuizId(e.target.value)}
                                  style={{ width: '100%', height: '42px', padding: '0 12px' }}
                                >
                                  <option value="">-- Select Quiz --</option>
                                  {(savedQuizzes || []).map((quiz) => (
                                    <option key={quiz.id} value={quiz.id}>
                                      {quiz.name}
                                    </option>
                                  ))}
                                </select>
                              </Grid>

                              {/* 2. Choose Target Type */}
                              <Grid item xs={12} md={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                  Assign Target Type
                                </Typography>
                                <select
                                  className="form-input"
                                  value={formTargetType}
                                  onChange={(e) => setFormTargetType(e.target.value)}
                                  style={{ width: '100%', height: '42px', padding: '0 12px' }}
                                >
                                  <option value="profile">By Profile Type</option>
                                  <option value="user">By Specific User</option>
                                </select>
                              </Grid>

                              {/* 3. Checkbox Checklist */}
                              <Grid item xs={12} md={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                  Select Recipients
                                </Typography>
                                <div
                                  style={{
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '10px',
                                    maxHeight: '150px',
                                    overflowY: 'auto',
                                    background: 'var(--color-bg)'
                                  }}
                                >
                                  {formTargetType === 'profile' ? (
                                    (realProfiles || []).map((profile) => {
                                      const isChecked = (formSelectedProfiles || []).includes(profile.id);
                                      const mappedCount = (quizAssignments || []).filter(aq => aq.profile_id === profile.id && !aq.user_id).length;
                                      return (
                                        <label key={profile.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer', marginBottom: '6px', fontSize: '14px' }}>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  setFormSelectedProfiles([...(formSelectedProfiles || []), profile.id]);
                                                } else {
                                                  setFormSelectedProfiles((formSelectedProfiles || []).filter(id => id !== profile.id));
                                                }
                                              }}
                                            />
                                            {profile.name}
                                          </span>
                                          <span style={{ fontSize: '12px', color: 'var(--color-muted-fg)', backgroundColor: 'var(--color-tertiary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                            {mappedCount} {mappedCount === 1 ? 'assessment' : 'assessments'}
                                          </span>
                                        </label>
                                      );
                                    })
                                  ) : (
                                    (users || []).filter(u => u.role !== 'admin' && u.role !== 'super_admin').map((u) => {
                                      const isChecked = (formSelectedUsers || []).includes(u.id);
                                      return (
                                        <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '6px', fontSize: '14px' }}>
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setFormSelectedUsers([...(formSelectedUsers || []), u.id]);
                                              } else {
                                                setFormSelectedUsers((formSelectedUsers || []).filter(id => id !== u.id));
                                              }
                                            }}
                                          />
                                          {u.user_name || u.email} ({u.profile || 'No Profile'})
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                              </Grid>
                            </Grid>
                            
                            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                              <Button
                                variant="contained"
                                onClick={handleFormAssign}
                                disabled={
                                  !formQuizId ||
                                  (formTargetType === 'profile' && formSelectedProfiles.length === 0) ||
                                  (formTargetType === 'user' && formSelectedUsers.length === 0)
                                }
                                sx={{
                                  background: 'var(--gradient-brand)',
                                  color: '#fff',
                                  fontWeight: 700,
                                  '&:hover': {
                                    background: 'linear-gradient(135deg, #8453ED 0%, #8453ED 100%)'
                                  },
                                  // The gradient above would otherwise override only the
                                  // disabled background, leaving MUI's dark disabled text
                                  // on full-strength purple. Mute both together instead.
                                  '&.Mui-disabled': {
                                    background: 'var(--color-muted-bg)',
                                    color: 'var(--color-muted-fg)'
                                  }
                                }}
                              >
                                Assign Quiz
                              </Button>
                            </Box>
                          </CardContent>
                        </Card>

                        {/* Title for profile assignments */}
                        <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
                          Assignments by Profile
                        </Typography>

                        {(realProfiles || []).length === 0 && <Typography color="text.secondary">No profiles created.</Typography>}
                        <Grid container spacing={3} sx={{ width: '100%', mb: 4 }}>
                          {(realProfiles || []).map(profile => {
                            const profileAssignments = (quizAssignments || []).filter(aq => aq.profile_id === profile.id && !aq.user_id);
                            const mappedCount = profileAssignments.length;
                            return (
                              <Grid item xs={12} sm={6} md={4} key={profile.id} sx={{ display: 'flex' }}>
                                <Card className="assigned-quiz-card" variant="outlined" sx={{ mb: 2, p: 2, background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)', minHeight: 240, height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                  <CardContent sx={{ minHeight: 180, height: '100%', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-start' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{profile.name}{profile.type && <Typography component="span" color="text.secondary"> ({profile.type})</Typography>}</Typography>
                                      <Chip
                                        label={`${mappedCount} ${mappedCount === 1 ? 'Assessment' : 'Assessments'}`}
                                        size="small"
                                        color={mappedCount > 0 ? "primary" : "default"}
                                        variant="outlined"
                                        sx={{ fontWeight: 600, fontSize: '11px' }}
                                      />
                                    </Box>
                                    <List sx={{ alignItems: 'flex-start' }}>
                                      {profileAssignments.length === 0 && (
                                        <ListItem><ListItemText primary="No quizzes assigned." /></ListItem>
                                      )}
                                      {profileAssignments.map(aq => {
                                      const quiz = (savedQuizzes || []).find(q => q.id === aq.quiz_id)
                                      return quiz ? (
                                        <ListItem 
                                          key={aq.id} 
                                          alignItems="center" 
                                          sx={{ pr: '80px' }}
                                          secondaryAction={
                                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                              <Tooltip title="Copy shareable link">
                                                <IconButton
                                                  color="primary"
                                                  onClick={async () => {
                                                    const link = `${window.location.origin}/attempt/${quiz.id}`
                                                    const success = await copyToClipboard(link)
                                                    showClipboardFeedback(success, 'Quiz link copied to clipboard!')
                                                  }}
                                                  size="small"
                                                >
                                                  <ShareIcon fontSize="small" />
                                                </IconButton>
                                              </Tooltip>
                                              <Tooltip title="Remove assignment">
                                                <IconButton
                                                  color="error"
                                                  onClick={async () => {
                                                    if (window.confirm(`Are you sure you want to remove assignment of ${quiz.name} from profile ${profile.name}?`)) {
                                                      await removeQuizAssignment(profile.id, quiz.id)
                                                      await loadData()
                                                    }
                                                  }}
                                                  size="small"
                                                >
                                                  <DeleteIcon fontSize="small" />
                                                </IconButton>
                                              </Tooltip>
                                            </Box>
                                          }
                                        >
                                          <ListItemText
                                            primary={
                                              <Typography noWrap sx={{ fontSize: '14px', fontWeight: 500 }}>
                                                {quiz.name}
                                              </Typography>
                                            }
                                          />
                                        </ListItem>
                                      ) : null
                                    })}
                                  </List>
                                </CardContent>
                              </Card>
                            </Grid>
                          );
                        })}
                        </Grid>

                        {/* Direct User Assignments Section */}
                        <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>
                          Assignments by User
                        </Typography>
                        
                        {(quizAssignments || []).filter(aq => aq.user_id).length === 0 ? (
                          <Typography color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
                            No user-specific assignments created yet.
                          </Typography>
                        ) : (
                          <Grid container spacing={3} sx={{ width: '100%' }}>
                            {(users || []).filter(u => (quizAssignments || []).some(aq => aq.user_id === u.id)).map(userItem => (
                              <Grid item xs={12} sm={6} md={4} key={userItem.id} sx={{ display: 'flex' }}>
                                <Card className="assigned-quiz-card" variant="outlined" sx={{ mb: 2, p: 2, background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)', minHeight: 240, height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                  <CardContent sx={{ minHeight: 180, height: '100%', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-start' }}>
                                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>{userItem.user_name || userItem.email}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                      Email: {userItem.email} | Profile Type: {userItem.profile || 'General'}
                                    </Typography>
                                    <List sx={{ alignItems: 'flex-start' }}>
                                      {(quizAssignments || []).filter(aq => aq.user_id === userItem.id).map(aq => {
                                        const quiz = (savedQuizzes || []).find(q => q.id === aq.quiz_id)
                                        return quiz ? (
                                          <ListItem 
                                            key={aq.id} 
                                            alignItems="center" 
                                            sx={{ pr: '80px' }}
                                            secondaryAction={
                                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                <Tooltip title="Copy shareable link">
                                                  <IconButton
                                                    color="primary"
                                                    onClick={async () => {
                                                      const link = `${window.location.origin}/attempt/${quiz.id}`
                                                      const success = await copyToClipboard(link)
                                                      showClipboardFeedback(success, 'Quiz link copied to clipboard!')
                                                    }}
                                                    size="small"
                                                  >
                                                    <ShareIcon fontSize="small" />
                                                  </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Remove assignment">
                                                  <IconButton
                                                    color="error"
                                                    onClick={async () => {
                                                      if (window.confirm(`Are you sure you want to remove assignment of ${quiz.name} from user ${userItem.user_name || userItem.email}?`)) {
                                                        await removeUserQuizAssignment(userItem.id, quiz.id)
                                                        await loadData()
                                                      }
                                                    }}
                                                    size="small"
                                                  >
                                                    <DeleteIcon fontSize="small" />
                                                  </IconButton>
                                                </Tooltip>
                                              </Box>
                                            }
                                          >
                                            <ListItemText
                                              primary={
                                                <Typography noWrap sx={{ fontSize: '14px', fontWeight: 500 }}>
                                                  {quiz.name}
                                                </Typography>
                                              }
                                            />
                                          </ListItem>
                                        ) : null
                                      })}
                                    </List>
                                  </CardContent>
                                </Card>
                              </Grid>
                            ))}
                          </Grid>
                        )}
                      </Box>
                    )}
                    {tab === 6 && <AssessmentResults />}
                    {tab === 7 && <AssessmentReport />}
                    {tab === 8 && <ActiveTracking />}
                    {tab === 9 && <PDFTemplateConfig />}
                  </>
                ) : (
                  // User Mode
                  <>
                    {tab === 0 && <UserDashboard user={user} userStats={userStats} setTab={setTab} />}
                    {tab === 1 && (
                      <Box sx={{ width: '100%' }}>
                        <Typography variant="h4" sx={{ mb: 3 }}>{tc(CHROME_TEXT.quizRecords)}</Typography>
                        {filteredUserQuizAttempts.length === 0 ? (
                          <Typography>{tc(CHROME_TEXT.noQuizAttempts)}</Typography>
                        ) : (
                          <Grid container spacing={3}>
                            {filteredUserQuizAttempts.map((attempt) => (
                              <Grid item xs={12} sm={6} md={4} key={attempt.id}>
                                <Card sx={{ 
                                  height: '100%',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  transition: 'all 0.3s ease',
                                  borderRadius: 3,
                                  border: '1px solid var(--color-border)',
                                  boxShadow: 'var(--shadow-sm)',
                                  '&:hover': {
                                    transform: 'translateY(-4px)',
                                    boxShadow: 'var(--shadow-md)'
                                  }
                                }}>
                                  <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                      <Box sx={{ 
                                        backgroundColor: 'rgba(142, 102, 241, 0.12)', 
                                        borderRadius: 2, 
                                        p: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}>
                                        <QuizIcon sx={{ color: 'var(--color-primary)' }} />
                                      </Box>
                                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--color-fg)', fontSize: '1.15rem', lineHeight: 1.3 }}>
                                        {tc(attempt.quiz?.name || attempt.quiz_name) || tc(CHROME_TEXT.quiz)}
                                      </Typography>
                                    </Box>

                                    <Divider sx={{ my: 1 }} />

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'var(--color-muted-fg)' }}>
                                        <CalendarTodayIcon fontSize="small" sx={{ color: 'var(--color-primary)', opacity: 0.8 }} />
                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                          {tc(CHROME_TEXT.taken)} {new Date(attempt.completed_at || attempt.created_at).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </Typography>
                                      </Box>
                                    </Box>

                                    <Button
                                      variant="contained"
                                      startIcon={<VisibilityIcon />}
                                      onClick={() => navigate(`/report/${attempt.quiz_id}/${attempt.id}`)}
                                      fullWidth
                                      sx={{ 
                                        mt: 'auto',
                                        borderRadius: 2,
                                        py: 1.2,
                                        fontWeight: 600,
                                        textTransform: 'none',
                                        background: 'var(--gradient-brand)',
                                        boxShadow: '0 4px 10px rgba(142, 102, 241, 0.2)',
                                        '&:hover': {
                                          background: 'linear-gradient(135deg, #8453ED 0%, #8453ED 100%)',
                                          boxShadow: '0 6px 14px rgba(142, 102, 241, 0.3)'
                                        }
                                      }}
                                    >
                                      {tc(CHROME_TEXT.viewReport)}
                                    </Button>
                                  </CardContent>
                                </Card>
                              </Grid>
                            ))}
                          </Grid>
                        )}
                      </Box>
                    )}
                  </>
                )}
              </div>
            </main>
            <Dialog open={howToOpen} onClose={() => setHowToOpen(false)} maxWidth="sm" fullWidth>
              <DialogTitle>{tc(CHROME_TEXT.howToUse)}</DialogTitle>
              <DialogContent dividers>
                {isAdmin ? (
                  <ol>
                    <li><b>Admin Dashboard:</b> View system overview and statistics.</li>
                    <li><b>Profile Management:</b> Create and manage user profiles.</li>
                    <li><b>Packet Management:</b> Create question packets and add questions.</li>
                    <li><b>Quiz Builder:</b> Build quizzes by combining packets and assign to profiles.</li>
                    <li><b>Assigned Quizzes:</b> View and manage quiz assignments.</li>
                    <li><b>Quiz Results:</b> View detailed results and attempt records for all quizzes.</li>
                    <li><b>Quiz Report:</b> Generate and download PDF reports for individual quiz submissions with detailed analysis.</li>
                    <li><b>PDF Templates:</b> Configure PDF report templates with custom styling, colors, and layout options.</li>
                    <li><b>Upload Excel:</b> Bulk import data from Excel files.</li>
                  </ol>
                ) : (
                  <ol>
                    <li><b>{tc(CHROME_TEXT.htHomeLabel)}</b> {tc(CHROME_TEXT.htHome)}</li>
                    <li><b>{tc(CHROME_TEXT.htRecordsLabel)}</b> {tc(CHROME_TEXT.htRecords)}</li>
                    <li><b>{tc(CHROME_TEXT.htTakeLabel)}</b> {tc(CHROME_TEXT.htTake)}</li>
                  </ol>
                )}
              </DialogContent>
              <DialogActions>
                <button className="btn btn--primary" onClick={() => setHowToOpen(false)}>{tc(CHROME_TEXT.close)}</button>
              </DialogActions>
            </Dialog>
          </div>
        } />
      </Routes>
    </ThemeProvider>
  )
}

export default App
