import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Quiz as QuizIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  PeopleAlt as PeopleAltIcon,
  Email as EmailIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Download as DownloadIcon,
  BarChart as BarChartIcon,
  Analytics as AnalyticsIcon,
  Business as BusinessIcon
} from '@mui/icons-material'
import { useDatabase } from '../hooks/useDatabase'
import { organizationApi, userApi, quizPacketApi, questionApi } from '../services/api'
import { profileRank, PROFILE_ORDER } from '../utils/profileOrder'
import './AdminDashboard.css'

// Maximum score a single question can award. Mirrors the scoring used when a
// quiz is taken: if the options carry per-option marks, the max is the highest
// option; otherwise fall back to the question's own marks (default 1).
const questionMaxMarks = (question) => {
  let options = question?.options
  if (typeof options === 'string') {
    try { options = JSON.parse(options) } catch { options = null }
  }
  if (
    Array.isArray(options) && options.length &&
    typeof options[0] === 'object' && options[0] !== null && 'marks' in options[0]
  ) {
    return Math.max(...options.map(o => Number(o?.marks) || 0), 0)
  }
  return Number(question?.marks) || 1
}

// Sum the maximum possible marks across a list of questions.
const questionsMaxMarks = (questions) =>
  (questions || []).reduce((sum, q) => sum + questionMaxMarks(q), 0)

const AdminDashboard = () => {
  const [tab, setTab] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userMap, setUserMap] = useState({})
  const [showProfileBreakdown, setShowProfileBreakdown] = useState(false)
  const [showOthersBreakdown, setShowOthersBreakdown] = useState(false)
  const [showOrganizationBreakdown, setShowOrganizationBreakdown] = useState(false)
  const [organizations, setOrganizations] = useState([])
  const [allUsersList, setAllUsersList] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [quizSearch, setQuizSearch] = useState('')
  const [selectedQuizStat, setSelectedQuizStat] = useState(null)
  const [quizRowLimit, setQuizRowLimit] = useState('25') // number string or 'all'

  const {
    allQuizAttempts,
    loadAllQuizAttempts,
    quizzes,
    profiles,
    packets
  } = useDatabase()

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        const attempts = await loadAllQuizAttempts()

        // Load organizations and users in parallel
        const [orgs, users] = await Promise.all([
          organizationApi.getAllOrganizations().catch(err => {
            console.error('Error loading organizations:', err)
            return []
          }),
          userApi.getAllUsers().catch(err => {
            console.error('Error loading users:', err)
            return []
          })
        ])
        setOrganizations(orgs)
        setAllUsersList(users)

        // Map preloaded users directly to userMap to avoid network overhead and proxy socket drops
        const localUserMap = {}
        if (users && users.length) {
          users.forEach(u => {
            localUserMap[String(u.id)] = u
          })
        }
        setUserMap(localUserMap)
      } catch (err) {
        console.error('Error loading admin data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [loadAllQuizAttempts])

  // Enrich flat attempts with quiz / profile / user objects expected by the UI
  const enrichedAttempts = useMemo(() => {
    const list = (allQuizAttempts || []).map(attempt => {
      const quiz = (quizzes || []).find(q => String(q.id) === String(attempt.quiz_id)) || null

      const userData = userMap[attempt.user_id] || null
      let profile = null
      if (userData && userData.profile) {
        profile = (profiles || []).find(p => p.name === userData.profile) || null
      }
      if (!profile && attempt.profile_id) {
        profile = (profiles || []).find(p => String(p.id) === String(attempt.profile_id)) || null
      }

      // Prefer the freshly-fetched user record, but fall back to the user data
      // already attached to the attempt (returned by /api/quiz-attempts) before
      // resorting to a generic "User {id}" placeholder. This keeps the name and
      // email correct even when the per-user fetch fails (e.g. legacy/guest ids).
      const attemptUser = attempt.user || {}
      const name =
        userData?.user_name ||
        userData?.email ||
        attemptUser.user_name ||
        attemptUser.name ||
        attemptUser.email ||
        `User ${attempt.user_id || 'Unknown'}`
      const email =
        userData?.email ||
        attemptUser.email ||
        'No email'
      const user = {
        name,
        email,
        organization:
          userData?.organization ||
          attemptUser.organization ||
          'Not specified'
      }

      return {
        ...attempt,
        quiz: quiz || { name: 'Unknown' },
        profile: profile || { name: 'Unknown' },
        user
      }
    })

    return list.sort((a, b) => {
      const timeA = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime()
      const timeB = new Date(b.completed_at || b.updated_at || b.started_at || b.created_at || 0).getTime()
      if (timeB !== timeA) return timeB - timeA
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true })
    })
  }, [allQuizAttempts, quizzes, profiles, userMap])

  // Count unique active users grouped by their profile
  const usersByProfile = useMemo(() => {
    // Define profiles to show individually
    const displayedProfiles = [
      'Salaried',
      'Frontline Warrior',
      'Student(College/University)',
      'Student(college/university)', // lowercase variant
      'Student(School)',
      'Student(school)', // lowercase variant
      'Senior Citizen',
      'Entrepreneur',
      'Working Woman',
      'Jobseeker',
      'Self Employed',
      'Home Maker'
    ]
    
    const profileToUsers = {}
    // Seed every canonical profile so each always appears — 0 when no one has
    // logged in under that profile (e.g. Frontline Warrior), otherwise the count.
    PROFILE_ORDER.forEach(name => { profileToUsers[name] = 0 })
    const othersBreakdown = {}
    const seen = new Set()

    ;(allQuizAttempts || []).forEach(attempt => {
      const userId = attempt.user_id
      if (!userId || seen.has(userId)) return
      seen.add(userId)

      const userData = userMap[userId]
      let profileName = (userData && userData.profile) || 'Unassigned'
      
      // Group profiles not in the displayed list into "Others" (case-insensitive check)
      const matched = displayedProfiles.find(dp => dp.toLowerCase() === profileName.toLowerCase())
      if (matched) {
        profileName = matched
      } else {
        othersBreakdown[profileName] = (othersBreakdown[profileName] || 0) + 1
        profileName = 'Others'
      }
      
      profileToUsers[profileName] = (profileToUsers[profileName] || 0) + 1
    })

    // Order by the canonical profile sequence; non-canonical profiles follow,
    // and the "Others" bucket is always pinned last.
    const rankFor = (name) => name === 'Others' ? Number.MAX_SAFE_INTEGER : profileRank(name)
    const profiles = Object.entries(profileToUsers)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => rankFor(a.name) - rankFor(b.name) || b.count - a.count)
    
    // Attach others breakdown for later use
    profiles.othersBreakdown = Object.entries(othersBreakdown)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return profiles
  }, [allQuizAttempts, userMap])

  // Dynamically compute list of all organizations (merging backend orgs with legacy ones scanned from users)
  const allOrganizations = useMemo(() => {
    const list = [...organizations];
    const userOrgNames = [...new Set(allUsersList.map(u => u.organization).filter(Boolean))];
    userOrgNames.forEach(orgName => {
      const nameLower = orgName.toLowerCase();
      if (nameLower !== 'individual' && !list.some(o => o.name.toLowerCase() === nameLower)) {
        list.push({
          id: 'legacy-' + nameLower.replace(/\s+/g, '-'),
          name: orgName,
          onboarding_code: 'LEGACY-' + orgName.toUpperCase().replace(/\s+/g, ''),
          isLegacy: true
        });
      }
    });
    // Filter out test/dummy organizations
    return list.filter(org => {
      const nameLower = org.name.toLowerCase();
      return (
        !nameLower.includes('automation test org') &&
        nameLower !== 'test 2' &&
        nameLower !== 'test org'
      );
    });
  }, [organizations, allUsersList]);

  // Group users by their organization and count members
  const orgMembers = useMemo(() => {
    return allOrganizations.map(org => {
      const memberCount = allUsersList.filter(u => 
        (u.organization_id && String(u.organization_id) === String(org.id)) ||
        (u.organization && u.organization.toLowerCase() === org.name.toLowerCase())
      ).length;
      return {
        id: org.id,
        name: org.name,
        memberCount
      };
    }).sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));
  }, [allOrganizations, allUsersList]);

  // Sum the per-packet maximums recorded on an attempt (this is the max score
  // the app computed for that attempt). Returns 0 when packet_marks is absent.
  const attemptMaxFromPacketMarks = (attempt) =>
    Object.values(attempt?.packet_marks || {})
      .reduce((sum, p) => sum + (Number(p?.total) || 0), 0)

  // A quiz's maximum score is fixed, so derive one canonical value per quiz from
  // whichever attempts actually recorded packet_marks. This keeps every row of
  // the same assessment showing the same denominator (e.g. HappiEQ → 250)
  // instead of a per-row estimate.
  const quizMaxMarks = useMemo(() => {
    const map = {}
    ;(allQuizAttempts || []).forEach(a => {
      const max = attemptMaxFromPacketMarks(a)
      if (max > 0) {
        const key = String(a.quiz_id)
        // Fixed per quiz; guard against stale/partial rows by keeping the largest.
        if (!map[key] || max > map[key]) map[key] = max
      }
    })
    return map
  }, [allQuizAttempts])

  // Authoritative maximum per assessment, computed from the quiz's current
  // questions. This covers quizzes whose attempts never recorded packet_marks
  // (e.g. HappiLife, Emotional Intelligence) so every row of the same quiz
  // shows one correct denominator instead of a per-row estimate.
  const [quizQuestionMax, setQuizQuestionMax] = useState({})
  useEffect(() => {
    if (!quizzes?.length) return
    let cancelled = false
    // Only compute for quizzes that actually have attempts on this dashboard.
    const quizIdsWithAttempts = new Set((allQuizAttempts || []).map(a => String(a.quiz_id)))
    const targetQuizzes = quizzes.filter(q => quizIdsWithAttempts.has(String(q.id)))

    const quizTotal = async (quiz) => {
      const quizPackets = await quizPacketApi.getQuizPackets(quiz.id)
      const perPacket = await Promise.all((quizPackets || []).map(async (packet) => {
        // Use already-loaded questions when present, else fetch them —
        // the /packets response may not embed questions.
        let questions = (packets || [])
          .find(p => String(p.id) === String(packet.id))?.questions
        if (!questions || !questions.length) {
          questions = await questionApi.getQuestions(packet.id)
        }
        return questionsMaxMarks(questions)
      }))
      return perPacket.reduce((sum, m) => sum + m, 0)
    }

    const compute = async () => {
      const entries = await Promise.all(targetQuizzes.map(async (quiz) => {
        try {
          const total = await quizTotal(quiz)
          return total > 0 ? [String(quiz.id), total] : null
        } catch {
          return null // Skip quizzes whose packets/questions can't be resolved.
        }
      }))
      if (!cancelled) setQuizQuestionMax(Object.fromEntries(entries.filter(Boolean)))
    }
    compute()
    return () => { cancelled = true }
  }, [quizzes, packets, allQuizAttempts])

  // Maximum possible score for a single attempt, resolved in priority order:
  //  1. total recorded in attempts' packet_marks (validated, e.g. HappiEQ → 250)
  //  2. the quiz's current questions (for quizzes without packet_marks)
  //  3. this attempt's own packet_marks
  //  4. a last-resort estimate from the stored percentage
  const getAttemptMaxMarks = useCallback((attempt) => {
    const key = String(attempt.quiz_id)
    if (quizMaxMarks[key] > 0) return quizMaxMarks[key]
    if (quizQuestionMax[key] > 0) return quizQuestionMax[key]
    const own = attemptMaxFromPacketMarks(attempt)
    if (own > 0) return own
    const obtained = Number(attempt.total_marks) || 0
    return attempt.score > 0 ? Math.round((obtained / attempt.score) * 100) : 0
  }, [quizMaxMarks, quizQuestionMax])

  // One row per user, aggregating their attempts into headline metrics plus the
  // raw rows (used by the drill-down modal). Averages/best use completed attempts only.
  const userSummaries = useMemo(() => {
    const map = {}
    enrichedAttempts.forEach(a => {
      const key = a.user_id || a.user?.email || 'unknown'
      if (!map[key]) {
        map[key] = {
          id: key,
          name: a.user?.name || 'Unknown User',
          email: a.user?.email || 'No email',
          organization: a.user?.organization || 'Not specified',
          attempts: 0,
          completed: 0,
          scoreSum: 0,
          scoreCount: 0,
          best: 0,
          obtainedMarks: 0,
          totalMarks: 0,
          lastActivity: 0,
          rows: []
        }
      }
      const u = map[key]
      u.attempts += 1
      u.rows.push(a)
      if (a.completed_at) {
        u.completed += 1
        const s = Number(a.score) || 0
        u.scoreSum += s
        u.scoreCount += 1
        if (s > u.best) u.best = s
        // Actual marks obtained vs. the assessment's fixed maximum. `total_marks`
        // holds the raw obtained marks; the max comes from the quiz's canonical
        // total so every attempt of the same assessment agrees.
        u.obtainedMarks += Number(a.total_marks) || 0
        u.totalMarks += getAttemptMaxMarks(a)
      }
      const t = new Date(a.completed_at || a.started_at || 0).getTime()
      if (t > u.lastActivity) u.lastActivity = t
    })

    return Object.values(map)
      .map(u => ({
        ...u,
        avgScore: u.scoreCount ? Math.round(u.scoreSum / u.scoreCount) : 0,
        rows: u.rows.sort((a, b) =>
          new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0))
      }))
      .sort((a, b) => b.avgScore - a.avgScore || b.attempts - a.attempts)
  }, [enrichedAttempts, getAttemptMaxMarks])

  const filteredUserSummaries = useMemo(() => {
    const tokens = userSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return userSummaries
    return userSummaries.filter(u => {
      const haystack = `${u.name} ${u.email} ${u.organization}`.toLowerCase()
      return tokens.every(t => haystack.includes(t))
    })
  }, [userSummaries, userSearch])

  const scoreBadgeClass = (score) =>
    score >= 80 ? 'badge--success' : score >= 60 ? 'badge--warning' : 'badge--outline'

  // One row per quiz, aggregating attempts into headline metrics + score-band
  // distribution. A "pass" is a completed attempt scoring 60% or higher.
  const quizAnalytics = useMemo(() => {
    const map = {}
    enrichedAttempts.forEach(a => {
      const key = a.quiz_id || a.quiz?.name || 'unknown'
      if (!map[key]) {
        map[key] = {
          id: key,
          name: a.quiz?.name || 'Unknown Quiz',
          attempts: 0,
          completed: 0,
          scoreSum: 0,
          scoreCount: 0,
          best: 0,
          worst: 100,
          passCount: 0,
          bands: { Excellent: 0, Good: 0, 'Needs Improvement': 0 },
          users: new Set(),
          lastActivity: 0,
          rows: []
        }
      }
      const q = map[key]
      q.attempts += 1
      q.rows.push(a)
      if (a.user_id) q.users.add(a.user_id)
      if (a.completed_at) {
        q.completed += 1
        const s = Number(a.score) || 0
        q.scoreSum += s
        q.scoreCount += 1
        if (s > q.best) q.best = s
        if (s < q.worst) q.worst = s
        if (s >= 60) q.passCount += 1
        if (s >= 80) q.bands.Excellent += 1
        else if (s >= 60) q.bands.Good += 1
        else q.bands['Needs Improvement'] += 1
      }
      const t = new Date(a.completed_at || a.started_at || 0).getTime()
      if (t > q.lastActivity) q.lastActivity = t
    })

    return Object.values(map)
      .map(q => ({
        ...q,
        uniqueUsers: q.users.size,
        avgScore: q.scoreCount ? Math.round(q.scoreSum / q.scoreCount) : 0,
        worst: q.scoreCount ? q.worst : 0,
        passRate: q.scoreCount ? Math.round((q.passCount / q.scoreCount) * 100) : 0,
        completionRate: q.attempts ? Math.round((q.completed / q.attempts) * 100) : 0,
        rows: q.rows.sort((a, b) =>
          new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0))
      }))
      .sort((a, b) => b.attempts - a.attempts || b.avgScore - a.avgScore)
  }, [enrichedAttempts])

  const filteredQuizAnalytics = useMemo(() => {
    const tokens = quizSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return quizAnalytics
    return quizAnalytics.filter(q => tokens.every(t => q.name.toLowerCase().includes(t)))
  }, [quizAnalytics, quizSearch])

  const exportQuizAnalytics = () => {
    const csvData = [
      ['Quiz', 'Attempts', 'Unique Users', 'Completed', 'Completion Rate', 'Avg Score', 'Best', 'Lowest', 'Pass Rate', 'Last Activity'],
      ...filteredQuizAnalytics.map(q => [
        q.name, q.attempts, q.uniqueUsers, q.completed, `${q.completionRate}%`,
        `${q.avgScore}%`, `${q.best}%`, `${q.worst}%`, `${q.passRate}%`,
        q.lastActivity ? formatDate(q.lastActivity) : 'N/A'
      ])
    ]
    const csvContent = csvData.map(row => row.map(c => {
      const s = String(c ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quiz-analytics-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportUserSummary = () => {
    const csvData = [
      ['User', 'Email', 'Organization', 'Attempts', 'Completed', 'Avg Score', 'Best Score', 'Last Activity'],
      ...filteredUserSummaries.map(u => [
        u.name, u.email, u.organization, u.attempts, u.completed,
        `${u.avgScore}%`, `${u.best}%`,
        u.lastActivity ? formatDate(u.lastActivity) : 'N/A'
      ])
    ]
    const csvContent = csvData.map(row => row.map(c => {
      const s = String(c ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `user-summary-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredAttempts = useMemo(() => {
    return enrichedAttempts
      .filter(attempt => {
        // Combine every searchable field into one haystack so a query matches by
        // quiz, profile, email, user name or organization (in any combination).
        const haystack = [
          attempt.quiz?.name,
          attempt.profile?.name,
          attempt.user?.email,
          attempt.user?.name,
          attempt.user?.organization
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean)
        const matchesSearch = tokens.every(token => haystack.includes(token))

        const matchesFilter = filterStatus === 'all' ||
          (filterStatus === 'completed' && attempt.completed_at) ||
          (filterStatus === 'in-progress' && !attempt.completed_at)

        return matchesSearch && matchesFilter
      })
      .sort((a, b) => {
        const timeA = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime()
        const timeB = new Date(b.completed_at || b.updated_at || b.started_at || b.created_at || 0).getTime()
        if (timeB !== timeA) return timeB - timeA
        return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true })
      })
  }, [enrichedAttempts, searchTerm, filterStatus])

  const getOverallStats = () => {
    if (allQuizAttempts.length === 0) {
      return {
        totalAttempts: 0,
        completedAttempts: 0,
        totalMarksSum: 0,
        totalUsers: 0,
        completionRate: 0
      }
    }

    const totalAttempts = allQuizAttempts.length
    const completedAttempts = allQuizAttempts.filter(attempt => attempt.completed_at).length
    const totalMarksSum = allQuizAttempts.reduce((sum, attempt) => sum + (attempt.total_marks || 0), 0)
    const uniqueUsers = new Set(allQuizAttempts.map(attempt => attempt.user_id).filter(Boolean)).size
    const completionRate = (completedAttempts / totalAttempts) * 100

    return {
      totalAttempts,
      completedAttempts,
      totalMarksSum,
      totalUsers: uniqueUsers,
      completionRate: Math.round(completionRate * 100) / 100
    }
  }

  const exportData = () => {
    const csvData = [
      ['User Email', 'Quiz Name', 'Profile', 'Score', 'Status', 'Started At', 'Completed At'],
      ...filteredAttempts.map(attempt => [
        attempt.user?.email || 'Anonymous',
        attempt.quiz?.name || 'Unknown',
        attempt.profile?.name || 'Unknown',
        attempt.score || 0,
        attempt.completed_at ? 'Completed' : 'In Progress',
        formatDate(attempt.started_at),
        attempt.completed_at ? formatDate(attempt.completed_at) : 'N/A'
      ])
    ]

    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quiz-attempts-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="dashboard__loading">
        <div className="dashboard__spinner"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="alert alert--error">
          <h4>Dashboard Error</h4>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const stats = getOverallStats()

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header__icon">
          <BarChartIcon />
        </div>
        <div>
          <h1 className="admin-header__title">Admin Dashboard</h1>
          <p className="admin-header__subtitle">Monitor all quiz attempts and user activity</p>
        </div>
      </header>

      <div className="admin-stats-grid">
        <div
          className="admin-stat-card admin-stat-card--clickable"
          onClick={() => setShowProfileBreakdown(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowProfileBreakdown(true) }}
          title="View active users per profile"
        >
          <div>
            <div className="admin-stat-card__value" style={{ color: '#8E66F1' }}>{stats.totalUsers}</div>
            <div className="admin-stat-card__label">Active Users</div>
          </div>
          <div className="admin-stat-card__icon" style={{ backgroundColor: '#8E66F1' }}>
            <PeopleAltIcon />
          </div>
        </div>

        <div 
          className="admin-stat-card admin-stat-card--clickable"
          onClick={() => setShowOrganizationBreakdown(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowOrganizationBreakdown(true) }}
          title="View members per organization"
        >
          <div>
            <div className="admin-stat-card__value" style={{ color: '#8E66F1' }}>{allOrganizations.length}</div>
            <div className="admin-stat-card__label">Organizations</div>
          </div>
          <div className="admin-stat-card__icon" style={{ backgroundColor: '#8E66F1' }}>
            <BusinessIcon />
          </div>
        </div>

        <div className="admin-stat-card">
          <div>
            <div className="admin-stat-card__value" style={{ color: 'var(--color-primary)' }}>{stats.totalAttempts}</div>
            <div className="admin-stat-card__label">Total Attempts</div>
          </div>
          <div className="admin-stat-card__icon" style={{ backgroundColor: 'var(--color-primary)' }}>
            <QuizIcon />
          </div>
        </div>
        
        <div className="admin-stat-card">
          <div>
            <div className="admin-stat-card__value" style={{ color: '#8E66F1' }}>{stats.completedAttempts}</div>
            <div className="admin-stat-card__label">Completed</div>
          </div>
          <div className="admin-stat-card__icon" style={{ backgroundColor: '#8E66F1' }}>
            <CheckCircleIcon />
          </div>
        </div>

        <div className="admin-stat-card">
          <div>
            <div className="admin-stat-card__value" style={{ color: '#8E66F1' }}>{Math.round(stats.completionRate)}%</div>
            <div className="admin-stat-card__label">Completion Rate ({stats.completedAttempts}/{stats.totalAttempts})</div>
          </div>
          <div className="admin-stat-card__icon" style={{ backgroundColor: '#8E66F1' }}>
            <ScheduleIcon />
          </div>
        </div>
      </div>

      <div className="admin-tabs">
        <button 
          className={`admin-tab ${tab === 0 ? 'admin-tab--active' : ''}`}
          onClick={() => setTab(0)}
        >
          All Attempts
        </button>
        <button 
          className={`admin-tab ${tab === 1 ? 'admin-tab--active' : ''}`}
          onClick={() => setTab(1)}
        >
          User Summary
        </button>
        <button 
          className={`admin-tab ${tab === 2 ? 'admin-tab--active' : ''}`}
          onClick={() => setTab(2)}
        >
          Quiz Analytics
        </button>
        <button 
          className={`admin-tab ${tab === 3 ? 'admin-tab--active' : ''}`}
          onClick={() => setTab(3)}
        >
          Incomplete Quizzes
        </button>
      </div>

      {tab === 0 && (
        <>
          <div className="admin-controls">
            <div className="admin-search">
              <SearchIcon style={{ color: 'var(--color-muted)' }} />
              <input 
                type="text" 
                placeholder="Search by quiz, profile, or email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <button 
              className="btn btn--outline" 
              onClick={() => setFilterStatus(filterStatus === 'all' ? 'completed' : filterStatus === 'completed' ? 'in-progress' : 'all')}
            >
              <FilterListIcon className="btn-icon" />
              {filterStatus === 'all' ? 'All' : filterStatus === 'completed' ? 'Completed' : 'In Progress'}
            </button>

            <button className="btn btn--primary" onClick={exportData}>
              <DownloadIcon className="btn-icon" />
              Export
            </button>
          </div>

          <div className="admin-table-container">
            {filteredAttempts.length === 0 ? (
              <div className="coming-soon">
                <QuizIcon />
                <h3>No attempts found</h3>
                <p>Try adjusting your search or filter criteria</p>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Quiz</th>
                    <th>Profile</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttempts.map(attempt => (
                    <tr key={attempt.id}>
                      <td>
                        <div className="admin-user-cell">
                          <span className="admin-user-cell__name">{attempt.user?.name || 'Unknown User'}</span>
                          <span className="admin-user-cell__email">
                            <EmailIcon style={{ width: '13px', height: '13px', marginRight: '4px' }} />
                            {attempt.user?.email || 'Anonymous'}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{attempt.quiz?.name || 'Unknown'}</td>
                      <td>
                        <span className="badge badge--primary">{attempt.profile?.name || 'Unknown'}</span>
                      </td>
                      <td>
                        {attempt.completed_at ? (() => {
                          // Show actual marks: obtained (total_marks) out of the
                          // assessment's canonical maximum possible score.
                          const obtained = Number(attempt.total_marks) || 0
                          const maxPossible = getAttemptMaxMarks(attempt)
                          return (
                            <span className={`badge ${attempt.score >= 80 ? 'badge--success' : attempt.score >= 60 ? 'badge--warning' : 'badge--outline'}`}>
                              {obtained}/{maxPossible}
                            </span>
                          )
                        })() : (
                          <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>Pending</span>
                        )}
                      </td>
                      <td>
                        {attempt.completed_at ? (
                          <span className="badge badge--success">
                            <CheckCircleIcon style={{ width: '14px', height: '14px', marginRight: '4px' }} />
                            Completed
                          </span>
                        ) : (
                          <span className="badge badge--warning">
                            <ScheduleIcon style={{ width: '14px', height: '14px', marginRight: '4px' }} />
                            In Progress
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 'var(--text-sm)' }}>{attempt.completed_at ? formatDate(attempt.completed_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 1 && (
        <>
          <div className="admin-controls">
            <div className="admin-search">
              <SearchIcon style={{ color: 'var(--color-muted)' }} />
              <input
                type="text"
                placeholder="Search users by name, email, or organization..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <button className="btn btn--primary" onClick={exportUserSummary} disabled={filteredUserSummaries.length === 0}>
              <DownloadIcon className="btn-icon" />
              Export
            </button>
          </div>

          <div className="admin-table-container">
            {filteredUserSummaries.length === 0 ? (
              <div className="coming-soon">
                <PeopleAltIcon />
                <h3>No users found</h3>
                <p>Try adjusting your search criteria</p>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Organization</th>
                    <th>Attempts</th>
                    <th>Completed</th>
                    <th>Score</th>
                    <th>Total Score</th>
                    <th>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUserSummaries.map(u => (
                    <tr
                      key={u.id}
                      className="admin-table__row--clickable"
                      onClick={() => setSelectedUser(u)}
                      title="View user details"
                    >
                      <td>
                        <div className="admin-user-cell">
                          <span className="admin-user-cell__name">{u.name}</span>
                          <span className="admin-user-cell__email">
                            <EmailIcon style={{ width: '13px', height: '13px', marginRight: '4px' }} />
                            {u.email}
                          </span>
                        </div>
                      </td>
                      <td><span className="badge badge--primary">{u.organization}</span></td>
                      <td style={{ fontWeight: 600 }}>{u.attempts}</td>
                      <td>{u.completed}/{u.attempts}</td>
                      <td>
                        {u.scoreCount > 0 ? (
                          <span className={`badge ${scoreBadgeClass(u.avgScore)}`}>{u.obtainedMarks}</span>
                        ) : (
                          <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>—</span>
                        )}
                      </td>
                      <td>{u.scoreCount > 0 ? u.totalMarks : '—'}</td>
                      <td style={{ fontSize: 'var(--text-sm)' }}>{u.lastActivity ? formatDate(u.lastActivity) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 2 && (
        <>
          <div className="admin-controls">
            <div className="admin-search">
              <SearchIcon style={{ color: 'var(--color-muted)' }} />
              <input
                type="text"
                placeholder="Search quizzes by name..."
                value={quizSearch}
                onChange={(e) => setQuizSearch(e.target.value)}
              />
            </div>

            <button className="btn btn--primary" onClick={exportQuizAnalytics} disabled={filteredQuizAnalytics.length === 0}>
              <DownloadIcon className="btn-icon" />
              Export
            </button>
          </div>

          <div className="admin-table-container">
            {filteredQuizAnalytics.length === 0 ? (
              <div className="coming-soon">
                <AnalyticsIcon />
                <h3>No quizzes found</h3>
                <p>Try adjusting your search criteria</p>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Quiz</th>
                    <th>Attempts</th>
                    <th>Users</th>
                    <th>Completion</th>
                    <th>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuizAnalytics.map(q => (
                    <tr
                      key={q.id}
                      className="admin-table__row--clickable"
                      onClick={() => { setQuizRowLimit('25'); setSelectedQuizStat(q) }}
                      title="View quiz details"
                    >
                      <td style={{ fontWeight: 600 }}>{q.name}</td>
                      <td>{q.attempts}</td>
                      <td>{q.uniqueUsers}</td>
                      <td>{q.completed}/{q.attempts}</td>
                      <td style={{ fontSize: 'var(--text-sm)' }}>{q.lastActivity ? formatDate(q.lastActivity) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="admin-modal admin-modal--lg" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <div className="admin-modal__title">
                <PeopleAltIcon />
                <div>
                  <span>{selectedUser.name}</span>
                  <div className="admin-modal__subtitle">{selectedUser.email} · {selectedUser.organization}</div>
                </div>
              </div>
              <button
                className="admin-modal__close"
                onClick={() => setSelectedUser(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              <div className="admin-user-stats">
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedUser.attempts}</div>
                  <div className="admin-user-stat__label">Attempts</div>
                </div>
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedUser.completed}</div>
                  <div className="admin-user-stat__label">Completed</div>
                </div>
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedUser.scoreCount > 0 ? selectedUser.obtainedMarks : '—'}</div>
                  <div className="admin-user-stat__label">Score</div>
                </div>
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedUser.scoreCount > 0 ? selectedUser.totalMarks : '—'}</div>
                  <div className="admin-user-stat__label">Total Score</div>
                </div>
              </div>

              <h4 className="admin-modal__section">Attempt History</h4>
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Quiz</th>
                      <th>Profile</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUser.rows.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.quiz?.name || 'Unknown'}</td>
                        <td><span className="badge badge--primary">{r.profile?.name || 'Unknown'}</span></td>
                        <td>
                          {r.completed_at ? (
                            <span className={`badge ${scoreBadgeClass(r.score || 0)}`}>{r.score || 0}%</span>
                          ) : (
                            <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>Pending</span>
                          )}
                        </td>
                        <td>
                          {r.completed_at ? (
                            <span className="badge badge--success">Completed</span>
                          ) : (
                            <span className="badge badge--warning">In Progress</span>
                          )}
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)' }}>{r.completed_at ? formatDate(r.completed_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedQuizStat && (
        <div className="admin-modal-overlay" onClick={() => setSelectedQuizStat(null)}>
          <div className="admin-modal admin-modal--lg" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <div className="admin-modal__title">
                <AnalyticsIcon />
                <div>
                  <span>{selectedQuizStat.name}</span>
                  <div className="admin-modal__subtitle">
                    {selectedQuizStat.attempts} attempts · {selectedQuizStat.uniqueUsers} users
                  </div>
                </div>
              </div>
              <button
                className="admin-modal__close"
                onClick={() => setSelectedQuizStat(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              <div className="admin-user-stats">
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedQuizStat.completionRate}%</div>
                  <div className="admin-user-stat__label">Completion</div>
                </div>
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedQuizStat.scoreCount > 0 ? `${selectedQuizStat.avgScore}%` : '—'}</div>
                  <div className="admin-user-stat__label">Avg Score</div>
                </div>
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedQuizStat.scoreCount > 0 ? `${selectedQuizStat.best}%` : '—'}</div>
                  <div className="admin-user-stat__label">Best</div>
                </div>
                <div className="admin-user-stat">
                  <div className="admin-user-stat__value">{selectedQuizStat.scoreCount > 0 ? `${selectedQuizStat.passRate}%` : '—'}</div>
                  <div className="admin-user-stat__label">Pass Rate</div>
                </div>
              </div>

              {selectedQuizStat.scoreCount > 0 && (
                <>
                  <h4 className="admin-modal__section">Score Distribution</h4>
                  <div className="admin-dist">
                    {[
                      { label: 'Excellent (80–100%)', key: 'Excellent', cls: 'admin-dist__fill--excellent' },
                      { label: 'Good (60–79%)', key: 'Good', cls: 'admin-dist__fill--good' },
                      { label: 'Needs Improvement (<60%)', key: 'Needs Improvement', cls: 'admin-dist__fill--low' }
                    ].map(({ label, key, cls }) => {
                      const count = selectedQuizStat.bands[key]
                      const pct = Math.round((count / selectedQuizStat.scoreCount) * 100)
                      return (
                        <div key={key} className="admin-dist__row">
                          <span className="admin-dist__label">{label}</span>
                          <span className="admin-dist__bar">
                            <span className={`admin-dist__fill ${cls}`} style={{ width: `${pct}%` }} />
                          </span>
                          <span className="admin-dist__val">{count} ({pct}%)</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {(() => {
                const limit = quizRowLimit === 'all' ? selectedQuizStat.rows.length : Number(quizRowLimit)
                const visibleRows = selectedQuizStat.rows.slice(0, limit)
                return (
              <>
              <div className="admin-modal__section-head">
                <h4 className="admin-modal__section">Recent Attempts</h4>
                <div className="admin-rowlimit">
                  <label htmlFor="quiz-row-limit">Show</label>
                  <select
                    id="quiz-row-limit"
                    className="admin-rowlimit__select"
                    value={quizRowLimit}
                    onChange={(e) => setQuizRowLimit(e.target.value)}
                  >
                    {[25, 50, 100].filter(n => n < selectedQuizStat.rows.length).map(n => (
                      <option key={n} value={String(n)}>Top {n}</option>
                    ))}
                    <option value="all">All ({selectedQuizStat.rows.length})</option>
                  </select>
                </div>
              </div>
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(r => (
                      <tr key={r.id}>
                        <td>{r.user?.email || r.user?.name || 'Anonymous'}</td>
                        <td>
                          {r.completed_at ? (
                            <span className={`badge ${scoreBadgeClass(r.score || 0)}`}>{r.score || 0}%</span>
                          ) : (
                            <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>Pending</span>
                          )}
                        </td>
                        <td>
                          {r.completed_at ? (
                            <span className="badge badge--success">Completed</span>
                          ) : (
                            <span className="badge badge--warning">In Progress</span>
                          )}
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)' }}>{r.completed_at ? formatDate(r.completed_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleRows.length < selectedQuizStat.rows.length && (
                  <p className="admin-modal__empty">Showing {visibleRows.length} of {selectedQuizStat.rows.length} attempts.</p>
                )}
              </div>
              </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {tab === 3 && (() => {
        const incompleteAttempts = enrichedAttempts.filter(a => !a.completed_at && a.status !== 'completed')
        return (
          <>
            <div className="admin-table-container">
              {incompleteAttempts.length === 0 ? (
                <div className="coming-soon">
                  <CheckCircleIcon />
                  <h3>No incomplete quizzes</h3>
                  <p>All users have completed their quizzes</p>
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Quiz</th>
                      <th>Started At</th>
                      <th>Last Activity</th>
                      <th>Questions Attempted</th>
                      <th>Total Questions</th>
                      <th>Completion %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incompleteAttempts.map(attempt => {
                      const answersCount = attempt.answers && typeof attempt.answers === 'object'
                        ? Object.keys(attempt.answers).length
                        : 0
                      const totalQ = attempt.total_questions || 0
                      const completionPct = totalQ > 0 ? Math.round((answersCount / totalQ) * 100) : 0
                      return (
                        <tr key={attempt.id}>
                          <td>
                            <div className="admin-user-cell">
                              <span className="admin-user-cell__name">{attempt.user?.name || 'Unknown User'}</span>
                              <span className="admin-user-cell__email">
                                <EmailIcon style={{ width: '13px', height: '13px', marginRight: '4px' }} />
                                {attempt.user?.email || 'No email'}
                              </span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{attempt.quiz?.name || 'Unknown'}</td>
                          <td style={{ fontSize: 'var(--text-sm)' }}>{attempt.started_at ? formatDate(attempt.started_at) : '—'}</td>
                          <td style={{ fontSize: 'var(--text-sm)' }}>{attempt.updated_at ? formatDate(attempt.updated_at) : (attempt.started_at ? formatDate(attempt.started_at) : '—')}</td>
                          <td style={{ textAlign: 'center' }}>{answersCount}</td>
                          <td style={{ textAlign: 'center' }}>{totalQ}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${completionPct >= 75 ? 'badge--success' : completionPct >= 25 ? 'badge--warning' : 'badge--outline'}`}>
                              {completionPct}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )
      })()}

      {showProfileBreakdown && (
        <div className="admin-modal-overlay" onClick={() => setShowProfileBreakdown(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <div className="admin-modal__title">
                <PeopleAltIcon />
                <span>Active Users by Profile</span>
              </div>
              <button
                className="admin-modal__close"
                onClick={() => setShowProfileBreakdown(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              {usersByProfile.length === 0 ? (
                <p className="admin-modal__empty">No active users yet.</p>
              ) : (
                <ul className="admin-profile-list">
                  {usersByProfile.map(({ name, count }) => (
                    <li 
                      key={name} 
                      className={`admin-profile-list__item ${name === 'Others' ? 'admin-profile-list__item--clickable' : ''}`}
                      onClick={() => name === 'Others' && setShowOthersBreakdown(true)}
                      style={name === 'Others' ? { cursor: 'pointer' } : {}}
                    >
                      <span className="admin-profile-list__name">
                        {name}
                        {name === 'Others' && <span style={{ marginLeft: '8px', fontSize: '0.85em', color: 'var(--color-primary)' }}>▸</span>}
                      </span>
                      <span className="admin-profile-list__count">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showOthersBreakdown && (
        <div className="admin-modal-overlay" onClick={() => setShowOthersBreakdown(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <div className="admin-modal__title">
                <PeopleAltIcon />
                <span>Others - Profile Breakdown</span>
              </div>
              <button
                className="admin-modal__close"
                onClick={() => setShowOthersBreakdown(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              {!usersByProfile.othersBreakdown || usersByProfile.othersBreakdown.length === 0 ? (
                <p className="admin-modal__empty">No other profiles.</p>
              ) : (
                <ul className="admin-profile-list">
                  {usersByProfile.othersBreakdown.map(({ name, count }) => (
                    <li key={name} className="admin-profile-list__item">
                      <span className="admin-profile-list__name">{name}</span>
                      <span className="admin-profile-list__count">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showOrganizationBreakdown && (
        <div className="admin-modal-overlay" onClick={() => setShowOrganizationBreakdown(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <div className="admin-modal__title">
                <BusinessIcon />
                <span>Organizations & Member Count</span>
              </div>
              <button
                className="admin-modal__close"
                onClick={() => setShowOrganizationBreakdown(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              {orgMembers.length === 0 ? (
                <p className="admin-modal__empty">No organizations found.</p>
              ) : (
                <ul className="admin-profile-list">
                  {orgMembers.map(({ id, name, memberCount }) => (
                    <li key={id} className="admin-profile-list__item">
                      <span className="admin-profile-list__name">
                        <strong>{name}</strong>
                      </span>
                      <span className="admin-profile-list__count">{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard