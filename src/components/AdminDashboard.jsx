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

// Helper to reliably check if an attempt is completed across data variations
const isAttemptCompleted = (attempt) => {
  if (!attempt) return false
  if (attempt.completed_at && String(attempt.completed_at).trim() !== '' && attempt.completed_at !== 'null' && attempt.completed_at !== 'N/A' && attempt.completed_at !== 'undefined') return true
  if (attempt.status === 'completed') return true
  return false
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
  const [userOrgFilter, setUserOrgFilter] = useState('all')
  const [userSortBy, setUserSortBy] = useState('registered_desc')
  const [regDateFrom, setRegDateFrom] = useState('')
  const [regDateTo, setRegDateTo] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [quizSearch, setQuizSearch] = useState('')
  const [selectedQuizStat, setSelectedQuizStat] = useState(null)
  const [quizRowLimit, setQuizRowLimit] = useState('25') // number string or 'all'
  const [attemptDateFrom, setAttemptDateFrom] = useState('')
  const [attemptDateTo, setAttemptDateTo] = useState('')
  const [attemptOrgFilter, setAttemptOrgFilter] = useState('all')
  const [attemptSortBy, setAttemptSortBy] = useState('date_desc')
  const [incompleteSearch, setIncompleteSearch] = useState('')
  const [incompleteOrgFilter, setIncompleteOrgFilter] = useState('all')
  const [incompleteDateFrom, setIncompleteDateFrom] = useState('')
  const [incompleteDateTo, setIncompleteDateTo] = useState('')
  const [incompleteSortBy, setIncompleteSortBy] = useState('date_desc')

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

  // Deduplicate attempts: ensure a single user has at most one primary entry per quiz
  const deduplicatedAttempts = useMemo(() => {
    const attemptsList = enrichedAttempts || []
    const groups = {}

    attemptsList.forEach(attempt => {
      let userKey = 'unknown'
      const uData = userMap[attempt.user_id] || userMap[String(attempt.user_id)]
      const email = uData?.email || attempt.user?.email || attempt.user_email
      const name = uData?.user_name || attempt.user?.name || attempt.user_name

      if (email && email !== 'No email' && String(email).trim() !== '') {
        userKey = `email:${String(email).trim().toLowerCase()}`
      } else if (name && name !== 'Unknown User' && !String(name).startsWith('User ') && String(name).trim() !== '') {
        userKey = `name:${String(name).trim().toLowerCase()}`
      } else if (attempt.user_id) {
        userKey = `id:${String(attempt.user_id).trim()}`
      } else {
        userKey = `id:${attempt.id}`
      }

      let quizKey = 'unknown_quiz'
      if (attempt.quiz?.name && attempt.quiz.name !== 'Unknown') {
        quizKey = attempt.quiz.name.trim().toLowerCase()
      } else if (attempt.quiz_id) {
        const q = (quizzes || []).find(q => String(q.id) === String(attempt.quiz_id))
        if (q && q.name) quizKey = q.name.trim().toLowerCase()
        else quizKey = String(attempt.quiz_id).trim().toLowerCase()
      }

      const groupKey = `${userKey}___${quizKey}`

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(attempt)
    })

    const result = []

    Object.values(groups).forEach(groupAttempts => {
      const completed = groupAttempts.filter(a => isAttemptCompleted(a))
      const pending = groupAttempts.filter(a => !isAttemptCompleted(a))

      if (completed.length > 0) {
        // Keep ONLY the single latest completed attempt per user & quiz
        completed.sort((a, b) => new Date(b.completed_at || b.updated_at || 0) - new Date(a.completed_at || a.updated_at || 0))
        result.push(completed[0])
      } else if (pending.length > 0) {
        // Keep ONLY the single best pending attempt per user & quiz
        pending.sort((a, b) => {
          const answersA = a.answers && typeof a.answers === 'object' ? Object.keys(a.answers).length : 0
          const answersB = b.answers && typeof b.answers === 'object' ? Object.keys(b.answers).length : 0
          if (answersB !== answersA) return answersB - answersA
          const timeA = new Date(a.updated_at || a.started_at || a.created_at || 0).getTime()
          const timeB = new Date(b.updated_at || b.started_at || b.created_at || 0).getTime()
          return timeB - timeA
        })
        result.push(pending[0])
      }
    })

    return result.sort((a, b) => {
      const timeA = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime()
      const timeB = new Date(b.completed_at || b.updated_at || b.started_at || b.created_at || 0).getTime()
      if (timeB !== timeA) return timeB - timeA
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true })
    })
  }, [enrichedAttempts, userMap, quizzes])

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
  // raw rows (used by the drill-down modal). Seeded with all registered users.
  const userSummaries = useMemo(() => {
    const map = {}
    const emailToKeyMap = {}

    // Helper to safely resolve user registration date (never fallback to attempt date)
    const resolveUserRegistrationDate = (userObj, userId, attempt) => {
      const explicit = userObj?.created_at || userObj?.registered_at || attempt?.user?.created_at || attempt?.user?.registered_at
      if (explicit) return explicit

      const numId = Number(userId || userObj?.id)
      if (!isNaN(numId) && numId > 1000000000000 && numId < 3000000000000) {
        return new Date(numId).toISOString()
      }
      return null
    }

    // First seed from allUsersList so users with 0 attempts are listed with their registration date
    if (Array.isArray(allUsersList)) {
      allUsersList.forEach(u => {
        if (!u || !u.id) return
        const key = String(u.id)
        const emailKey = u.email ? u.email.trim().toLowerCase() : null
        const name = u.user_name || u.name || (u.email ? u.email.split('@')[0] : `User ${u.id}`)
        const email = u.email || 'No email'
        const organization = u.organization || 'Not specified'
        const registeredAt = resolveUserRegistrationDate(u, u.id, null)

        map[key] = {
          id: key,
          name,
          email,
          organization,
          registeredAt,
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
        if (emailKey) emailToKeyMap[emailKey] = key
      })
    }

    // Aggregate attempts
    deduplicatedAttempts.forEach(a => {
      let key = a.user_id ? String(a.user_id) : null
      const emailKey = a.user?.email ? a.user.email.trim().toLowerCase() : null

      if (!key || !map[key]) {
        if (emailKey && emailToKeyMap[emailKey] && map[emailToKeyMap[emailKey]]) {
          key = emailToKeyMap[emailKey]
        } else {
          const foundKey = Object.keys(map).find(k => {
            const userObj = map[k]
            return userObj.email && emailKey && userObj.email.trim().toLowerCase() === emailKey
          })
          if (foundKey) {
            key = foundKey
          } else {
            key = a.user_id || emailKey || 'unknown'
          }
        }
      }

      if (!map[key]) {
        const uData = userMap[a.user_id]
        map[key] = {
          id: key,
          name: a.user?.name || 'Unknown User',
          email: a.user?.email || 'No email',
          organization: a.user?.organization || 'Not specified',
          registeredAt: resolveUserRegistrationDate(uData, a.user_id, a),
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
        if (emailKey) emailToKeyMap[emailKey] = key
      }

      const u = map[key]

      if (!u.registeredAt) {
        const uData = userMap[a.user_id]
        u.registeredAt = resolveUserRegistrationDate(uData, a.user_id, a)
      }

      u.attempts += 1
      u.rows.push(a)
      if (isAttemptCompleted(a)) {
        u.completed += 1
        const s = Number(a.score) || 0
        u.scoreSum += s
        u.scoreCount += 1
        if (s > u.best) u.best = s
        u.obtainedMarks += Number(a.total_marks) || 0
        u.totalMarks += getAttemptMaxMarks(a)
      }
      const t = new Date(a.completed_at || a.started_at || a.created_at || 0).getTime()
      if (t > u.lastActivity) u.lastActivity = t
    })

    return Object.values(map).map(u => ({
      ...u,
      avgScore: u.scoreCount ? Math.round(u.scoreSum / u.scoreCount) : 0,
      rows: u.rows.sort((a, b) =>
        new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0))
    }))
  }, [allUsersList, deduplicatedAttempts, userMap, getAttemptMaxMarks])

  const availableUserOrgs = useMemo(() => {
    const orgs = new Set(userSummaries.map(u => u.organization).filter(Boolean))
    return Array.from(orgs).sort()
  }, [userSummaries])

  const filteredUserSummaries = useMemo(() => {
    let result = userSummaries

    // Filter by Registration Date Range
    if (regDateFrom) {
      const fromTime = new Date(`${regDateFrom}T00:00:00`).getTime()
      result = result.filter(u => {
        if (!u.registeredAt) return false
        return new Date(u.registeredAt).getTime() >= fromTime
      })
    }
    if (regDateTo) {
      const toTime = new Date(`${regDateTo}T23:59:59.999`).getTime()
      result = result.filter(u => {
        if (!u.registeredAt) return false
        return new Date(u.registeredAt).getTime() <= toTime
      })
    }

    // Filter by Organization
    if (userOrgFilter && userOrgFilter !== 'all') {
      result = result.filter(u =>
        u.organization && u.organization.toLowerCase() === userOrgFilter.toLowerCase()
      )
    }

    // Filter by Search Query
    const tokens = userSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length > 0) {
      result = result.filter(u => {
        const haystack = `${u.name} ${u.email} ${u.organization}`.toLowerCase()
        return tokens.every(t => haystack.includes(t))
      })
    }

    const getRegTime = (u) => {
      if (u.registeredAt) {
        const t = new Date(u.registeredAt).getTime()
        if (!isNaN(t) && t > 0) return t
      }
      const numId = Number(u.id)
      if (!isNaN(numId) && numId > 1000000000000 && numId < 3000000000000) {
        return numId
      }
      return 0
    }

    // Sorting
    return [...result].sort((a, b) => {
      const regA = getRegTime(a)
      const regB = getRegTime(b)
      const actA = a.lastActivity || regA
      const actB = b.lastActivity || regB

      switch (userSortBy) {
        case 'registered_desc':
          return regB - regA || actB - actA
        case 'registered_asc':
          return regA - regB || actA - actB
        case 'activity_desc':
          return actB - actA || regB - regA
        case 'activity_asc':
          return actA - actB || regA - regB
        case 'score_desc':
          return b.avgScore - a.avgScore || regB - regA
        case 'attempts_desc':
          return b.attempts - a.attempts || regB - regA
        default:
          return regB - regA
      }
    })
  }, [userSummaries, userSearch, userOrgFilter, userSortBy, regDateFrom, regDateTo])

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
      ['User', 'Email', 'Organization', 'Registered Date', 'Attempts', 'Completed', 'Score / Total Score', 'Avg Score (%)', 'Best Score (%)', 'Last Activity'],
      ...filteredUserSummaries.map(u => [
        u.name,
        u.email,
        u.organization,
        u.registeredAt ? formatDate(u.registeredAt) : 'N/A',
        u.attempts,
        u.completed,
        u.scoreCount > 0 ? `${u.obtainedMarks} / ${u.totalMarks}` : 'N/A',
        `${u.avgScore}%`,
        `${u.best}%`,
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
    let result = deduplicatedAttempts

    // Filter by Attempt Date Range
    if (attemptDateFrom) {
      const fromTime = new Date(`${attemptDateFrom}T00:00:00`).getTime()
      result = result.filter(a => {
        const t = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime()
        return t >= fromTime
      })
    }
    if (attemptDateTo) {
      const toTime = new Date(`${attemptDateTo}T23:59:59.999`).getTime()
      result = result.filter(a => {
        const t = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime()
        return t <= toTime
      })
    }

    // Filter by Organization
    if (attemptOrgFilter && attemptOrgFilter !== 'all') {
      result = result.filter(a =>
        a.user?.organization && a.user.organization.toLowerCase() === attemptOrgFilter.toLowerCase()
      )
    }

    // Filter by Status
    if (filterStatus && filterStatus !== 'all') {
      result = result.filter(a => {
        if (filterStatus === 'completed') return isAttemptCompleted(a)
        if (filterStatus === 'in-progress') return !isAttemptCompleted(a)
        return true
      })
    }

    // Filter by Search Query
    const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length > 0) {
      result = result.filter(attempt => {
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
        return tokens.every(t => haystack.includes(t))
      })
    }

    // Sorting
    return [...result].sort((a, b) => {
      const timeA = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime()
      const timeB = new Date(b.completed_at || b.updated_at || b.started_at || b.created_at || 0).getTime()
      const scoreA = Number(a.score) || 0
      const scoreB = Number(b.score) || 0
      const nameA = String(a.user?.name || '')
      const nameB = String(b.user?.name || '')
      const quizA = String(a.quiz?.name || '')
      const quizB = String(b.quiz?.name || '')

      switch (attemptSortBy) {
        case 'date_desc':
          if (timeB !== timeA) return timeB - timeA
          return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true })
        case 'date_asc':
          if (timeA !== timeB) return timeA - timeB
          return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true })
        case 'score_desc':
          if (scoreB !== scoreA) return scoreB - scoreA
          return timeB - timeA
        case 'score_asc':
          if (scoreA !== scoreB) return scoreA - scoreB
          return timeB - timeA
        case 'name_asc':
          return nameA.localeCompare(nameB) || timeB - timeA
        case 'quiz_asc':
          return quizA.localeCompare(quizB) || timeB - timeA
        default:
          return timeB - timeA
      }
    })
  }, [deduplicatedAttempts, searchTerm, filterStatus, attemptOrgFilter, attemptDateFrom, attemptDateTo, attemptSortBy])

  const getOverallStats = () => {
    if (!deduplicatedAttempts || deduplicatedAttempts.length === 0) {
      return {
        totalAttempts: 0,
        completedAttempts: 0,
        totalMarksSum: 0,
        totalUsers: 0,
        completionRate: 0
      }
    }

    const totalAttempts = deduplicatedAttempts.length
    const completedAttempts = deduplicatedAttempts.filter(attempt => isAttemptCompleted(attempt)).length
    const totalMarksSum = deduplicatedAttempts.reduce((sum, attempt) => sum + (attempt.total_marks || 0), 0)
    const uniqueUsers = new Set(deduplicatedAttempts.map(attempt => attempt.user_id).filter(Boolean)).size
    const completionRate = totalAttempts > 0 ? (completedAttempts / totalAttempts) * 100 : 0

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
      ['User Name', 'User Email', 'Organization', 'Quiz Name', 'Profile', 'Score', 'Status', 'Started At', 'Completed At'],
      ...filteredAttempts.map(attempt => [
        attempt.user?.name || 'Unknown User',
        attempt.user?.email || 'Anonymous',
        attempt.user?.organization || 'Not specified',
        attempt.quiz?.name || 'Unknown',
        attempt.profile?.name || 'Unknown',
        isAttemptCompleted(attempt) ? (attempt.score || 0) : 'N/A',
        isAttemptCompleted(attempt) ? 'Completed' : 'In Progress',
        attempt.started_at ? formatDate(attempt.started_at) : 'N/A',
        isAttemptCompleted(attempt) ? formatDate(attempt.completed_at || attempt.updated_at) : 'N/A'
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
          <div className="admin-controls" style={{ flexWrap: 'wrap', gap: 'var(--space-3, 12px)' }}>
            <div className="admin-search" style={{ minWidth: '220px', flex: 1 }}>
              <SearchIcon style={{ color: 'var(--color-muted)' }} />
              <input 
                type="text" 
                placeholder="Search by user, email, quiz, profile, or organization..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-xs, 12px)', fontWeight: 600, color: 'var(--color-muted-fg, #6b7280)' }}>Attempt Date:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)' }}>From</span>
                <input
                  type="date"
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    fontSize: 'var(--text-sm, 13px)',
                    color: 'var(--color-fg, #1f2937)',
                    cursor: 'pointer'
                  }}
                  value={attemptDateFrom}
                  onChange={(e) => setAttemptDateFrom(e.target.value)}
                  title="Filter attempt date from"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)' }}>To</span>
                <input
                  type="date"
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    fontSize: 'var(--text-sm, 13px)',
                    color: 'var(--color-fg, #1f2937)',
                    cursor: 'pointer'
                  }}
                  value={attemptDateTo}
                  onChange={(e) => setAttemptDateTo(e.target.value)}
                  title="Filter attempt date to"
                />
              </div>
              {(attemptDateFrom || attemptDateTo) && (
                <button
                  className="btn btn--outline"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '12px' }}
                  onClick={() => { setAttemptDateFrom(''); setAttemptDateTo(''); }}
                  title="Clear attempt date filter"
                >
                  Clear Dates
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FilterListIcon style={{ color: 'var(--color-muted-fg)', fontSize: '1.2rem' }} />
              <select
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  backgroundColor: 'var(--color-surface, #ffffff)',
                  fontSize: 'var(--text-sm, 14px)',
                  color: 'var(--color-fg, #1f2937)',
                  cursor: 'pointer'
                }}
                value={attemptOrgFilter}
                onChange={(e) => setAttemptOrgFilter(e.target.value)}
              >
                <option value="all">All Organizations ({availableUserOrgs.length})</option>
                {availableUserOrgs.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  backgroundColor: 'var(--color-surface, #ffffff)',
                  fontSize: 'var(--text-sm, 14px)',
                  color: 'var(--color-fg, #1f2937)',
                  cursor: 'pointer'
                }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="in-progress">In Progress</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 600, color: 'var(--color-muted-fg, #6b7280)' }}>Sort:</span>
              <select
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  backgroundColor: 'var(--color-surface, #ffffff)',
                  fontSize: 'var(--text-sm, 14px)',
                  color: 'var(--color-fg, #1f2937)',
                  cursor: 'pointer'
                }}
                value={attemptSortBy}
                onChange={(e) => setAttemptSortBy(e.target.value)}
              >
                <option value="date_desc">Attempt Date (Newest First)</option>
                <option value="date_asc">Attempt Date (Oldest First)</option>
                <option value="score_desc">Highest Score First</option>
                <option value="score_asc">Lowest Score First</option>
                <option value="name_asc">User Name (A to Z)</option>
                <option value="quiz_asc">Quiz Name (A to Z)</option>
              </select>
            </div>

            <button className="btn btn--primary" onClick={exportData} disabled={filteredAttempts.length === 0}>
              <DownloadIcon className="btn-icon" />
              Export
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-3, 12px) 0 var(--space-2, 8px) 0' }}>
            <div style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 600, color: 'var(--color-fg, #1f2937)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Total Attempts:</span>
              <span className="badge badge--primary" style={{ fontSize: '13px', padding: '0.2rem 0.65rem' }}>
                {filteredAttempts.length}
              </span>
              {(searchTerm || (attemptOrgFilter && attemptOrgFilter !== 'all') || filterStatus !== 'all' || attemptDateFrom || attemptDateTo) && (
                <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)', fontWeight: 400 }}>
                  (filtered from {deduplicatedAttempts.length} total)
                </span>
              )}
            </div>
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
                        {isAttemptCompleted(attempt) ? (() => {
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
                        {isAttemptCompleted(attempt) ? (
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
                      <td style={{ fontSize: 'var(--text-sm)' }}>{isAttemptCompleted(attempt) ? formatDate(attempt.completed_at || attempt.updated_at) : '—'}</td>
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
          <div className="admin-controls" style={{ flexWrap: 'wrap', gap: 'var(--space-3, 12px)' }}>
            <div className="admin-search" style={{ minWidth: '220px', flex: 1 }}>
              <SearchIcon style={{ color: 'var(--color-muted)' }} />
              <input
                type="text"
                placeholder="Search users by name, email, or organization..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-xs, 12px)', fontWeight: 600, color: 'var(--color-muted-fg, #6b7280)' }}>Registered:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)' }}>From</span>
                <input
                  type="date"
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    fontSize: 'var(--text-sm, 13px)',
                    color: 'var(--color-fg, #1f2937)',
                    cursor: 'pointer'
                  }}
                  value={regDateFrom}
                  onChange={(e) => setRegDateFrom(e.target.value)}
                  title="Filter registration date from"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)' }}>To</span>
                <input
                  type="date"
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    fontSize: 'var(--text-sm, 13px)',
                    color: 'var(--color-fg, #1f2937)',
                    cursor: 'pointer'
                  }}
                  value={regDateTo}
                  onChange={(e) => setRegDateTo(e.target.value)}
                  title="Filter registration date to"
                />
              </div>
              {(regDateFrom || regDateTo) && (
                <button
                  className="btn btn--outline"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '12px' }}
                  onClick={() => { setRegDateFrom(''); setRegDateTo(''); }}
                  title="Clear registration date filter"
                >
                  Clear Dates
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FilterListIcon style={{ color: 'var(--color-muted-fg)', fontSize: '1.2rem' }} />
              <select
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  backgroundColor: 'var(--color-surface, #ffffff)',
                  fontSize: 'var(--text-sm, 14px)',
                  color: 'var(--color-fg, #1f2937)',
                  cursor: 'pointer'
                }}
                value={userOrgFilter}
                onChange={(e) => setUserOrgFilter(e.target.value)}
              >
                <option value="all">All Organizations ({availableUserOrgs.length})</option>
                {availableUserOrgs.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 600, color: 'var(--color-muted-fg, #6b7280)' }}>Sort:</span>
              <select
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  backgroundColor: 'var(--color-surface, #ffffff)',
                  fontSize: 'var(--text-sm, 14px)',
                  color: 'var(--color-fg, #1f2937)',
                  cursor: 'pointer'
                }}
                value={userSortBy}
                onChange={(e) => setUserSortBy(e.target.value)}
              >
                <option value="registered_desc">Registered Date (Newest First)</option>
                <option value="registered_asc">Registered Date (Oldest First)</option>
                <option value="activity_desc">Last Activity (Recent First)</option>
                <option value="activity_asc">Last Activity (Oldest First)</option>
                <option value="score_desc">Highest Score First</option>
                <option value="attempts_desc">Most Attempts First</option>
              </select>
            </div>

            <button className="btn btn--primary" onClick={exportUserSummary} disabled={filteredUserSummaries.length === 0}>
              <DownloadIcon className="btn-icon" />
              Export
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-3, 12px) 0 var(--space-2, 8px) 0' }}>
            <div style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 600, color: 'var(--color-fg, #1f2937)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Total Users:</span>
              <span className="badge badge--primary" style={{ fontSize: '13px', padding: '0.2rem 0.65rem' }}>
                {filteredUserSummaries.length}
              </span>
              {(userSearch || (userOrgFilter && userOrgFilter !== 'all') || regDateFrom || regDateTo) && (
                <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)', fontWeight: 400 }}>
                  (filtered from {userSummaries.length} total)
                </span>
              )}
            </div>
          </div>

          <div className="admin-table-container">
            {filteredUserSummaries.length === 0 ? (
              <div className="coming-soon">
                <PeopleAltIcon />
                <h3>No users found</h3>
                <p>Try adjusting your search or filter criteria</p>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Organization</th>
                    <th>Registered</th>
                    <th>Attempts</th>
                    <th>Completed</th>
                    <th>Score / Total Score</th>
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
                      <td style={{ fontSize: 'var(--text-sm)' }}>
                        {u.registeredAt ? formatDate(u.registeredAt) : '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{u.attempts}</td>
                      <td>{u.completed}/{u.attempts}</td>
                      <td>
                        {u.scoreCount > 0 ? (
                          <span className={`badge ${scoreBadgeClass(u.avgScore)}`}>
                            {u.obtainedMarks} / {u.totalMarks}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>—</span>
                        )}
                      </td>
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
                  <div className="admin-modal__subtitle">
                    {selectedUser.email} · {selectedUser.organization}
                    {selectedUser.registeredAt && ` · Registered: ${formatDate(selectedUser.registeredAt)}`}
                  </div>
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
                  <div className="admin-user-stat__value">
                    {selectedUser.scoreCount > 0 ? `${selectedUser.obtainedMarks} / ${selectedUser.totalMarks}` : '—'}
                  </div>
                  <div className="admin-user-stat__label">Score / Total Score</div>
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
                          {isAttemptCompleted(r) ? (
                            <span className={`badge ${scoreBadgeClass(r.score || 0)}`}>{r.score || 0}%</span>
                          ) : (
                            <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>Pending</span>
                          )}
                        </td>
                        <td>
                          {isAttemptCompleted(r) ? (
                            <span className="badge badge--success">Completed</span>
                          ) : (
                            <span className="badge badge--warning">In Progress</span>
                          )}
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)' }}>{isAttemptCompleted(r) ? formatDate(r.completed_at || r.updated_at) : '—'}</td>
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
        const rawIncomplete = deduplicatedAttempts.filter(a => !isAttemptCompleted(a))

        const filteredIncomplete = rawIncomplete.filter(attempt => {
          // Search query matching user name, email, quiz name, profile name, or organization
          if (incompleteSearch.trim()) {
            const query = incompleteSearch.toLowerCase()
            const userName = (attempt.user?.name || '').toLowerCase()
            const userEmail = (attempt.user?.email || '').toLowerCase()
            const quizName = (attempt.quiz?.name || '').toLowerCase()
            const profileName = (attempt.profile?.name || '').toLowerCase()
            const orgName = (attempt.user?.organization || attempt.organization_name || '').toLowerCase()

            const matchesSearch =
              userName.includes(query) ||
              userEmail.includes(query) ||
              quizName.includes(query) ||
              profileName.includes(query) ||
              orgName.includes(query)

            if (!matchesSearch) return false
          }

          // Organization filter
          if (incompleteOrgFilter && incompleteOrgFilter !== 'all') {
            const orgName = attempt.user?.organization || attempt.organization_name || 'Individual'
            if (orgName.toLowerCase() !== incompleteOrgFilter.toLowerCase()) return false
          }

          // Date range filter
          const dateVal = attempt.started_at || attempt.updated_at
          if (incompleteDateFrom && dateVal) {
            if (new Date(dateVal) < new Date(incompleteDateFrom)) return false
          }
          if (incompleteDateTo && dateVal) {
            const endDate = new Date(incompleteDateTo)
            endDate.setHours(23, 59, 59, 999)
            if (new Date(dateVal) > endDate) return false
          }

          return true
        })

        // Sorting logic
        filteredIncomplete.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.started_at || 0).getTime()
          const dateB = new Date(b.updated_at || b.started_at || 0).getTime()

          const answersA = a.answers && typeof a.answers === 'object' ? Object.keys(a.answers).length : 0
          const totalQA = a.total_questions || 0
          const pctA = totalQA > 0 ? (answersA / totalQA) : 0

          const answersB = b.answers && typeof b.answers === 'object' ? Object.keys(b.answers).length : 0
          const totalQB = b.total_questions || 0
          const pctB = totalQB > 0 ? (answersB / totalQB) : 0

          if (incompleteSortBy === 'date_desc') return dateB - dateA
          if (incompleteSortBy === 'date_asc') return dateA - dateB
          if (incompleteSortBy === 'completion_desc') return pctB - pctA
          if (incompleteSortBy === 'completion_asc') return pctA - pctB
          if (incompleteSortBy === 'name_asc') return (a.user?.name || '').localeCompare(b.user?.name || '')
          if (incompleteSortBy === 'quiz_asc') return (a.quiz?.name || '').localeCompare(b.quiz?.name || '')

          return dateB - dateA
        })

        return (
          <>
            <div className="admin-controls" style={{ flexWrap: 'wrap', gap: 'var(--space-3, 12px)' }}>
              <div className="admin-search" style={{ minWidth: '220px', flex: 1 }}>
                <SearchIcon style={{ color: 'var(--color-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Search by user, email, quiz, profile, or organization..." 
                  value={incompleteSearch}
                  onChange={(e) => setIncompleteSearch(e.target.value)}
                />
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-xs, 12px)', fontWeight: 600, color: 'var(--color-muted-fg, #6b7280)' }}>Started Date:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)' }}>From</span>
                  <input
                    type="date"
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: '1px solid var(--color-border, #e5e7eb)',
                      backgroundColor: 'var(--color-surface, #ffffff)',
                      fontSize: 'var(--text-sm, 13px)',
                      color: 'var(--color-fg, #1f2937)',
                      cursor: 'pointer'
                    }}
                    value={incompleteDateFrom}
                    onChange={(e) => setIncompleteDateFrom(e.target.value)}
                    title="Filter started date from"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)' }}>To</span>
                  <input
                    type="date"
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: '1px solid var(--color-border, #e5e7eb)',
                      backgroundColor: 'var(--color-surface, #ffffff)',
                      fontSize: 'var(--text-sm, 13px)',
                      color: 'var(--color-fg, #1f2937)',
                      cursor: 'pointer'
                    }}
                    value={incompleteDateTo}
                    onChange={(e) => setIncompleteDateTo(e.target.value)}
                    title="Filter started date to"
                  />
                </div>
                {(incompleteDateFrom || incompleteDateTo) && (
                  <button
                    className="btn btn--outline"
                    style={{ padding: '0.35rem 0.6rem', fontSize: '12px' }}
                    onClick={() => { setIncompleteDateFrom(''); setIncompleteDateTo(''); }}
                    title="Clear date filter"
                  >
                    Clear Dates
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FilterListIcon style={{ color: 'var(--color-muted-fg)', fontSize: '1.2rem' }} />
                <select
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    fontSize: 'var(--text-sm, 14px)',
                    color: 'var(--color-fg, #1f2937)',
                    cursor: 'pointer'
                  }}
                  value={incompleteOrgFilter}
                  onChange={(e) => setIncompleteOrgFilter(e.target.value)}
                >
                  <option value="all">All Organizations ({availableUserOrgs.length})</option>
                  {availableUserOrgs.map(org => (
                    <option key={org} value={org}>{org}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 600, color: 'var(--color-muted-fg, #6b7280)' }}>Sort:</span>
                <select
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    fontSize: 'var(--text-sm, 14px)',
                    color: 'var(--color-fg, #1f2937)',
                    cursor: 'pointer'
                  }}
                  value={incompleteSortBy}
                  onChange={(e) => setIncompleteSortBy(e.target.value)}
                >
                  <option value="date_desc">Last Activity (Newest First)</option>
                  <option value="date_asc">Last Activity (Oldest First)</option>
                  <option value="completion_desc">Highest Completion % First</option>
                  <option value="completion_asc">Lowest Completion % First</option>
                  <option value="name_asc">User Name (A to Z)</option>
                  <option value="quiz_asc">Quiz Name (A to Z)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-3, 12px) 0 var(--space-2, 8px) 0' }}>
              <div style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 600, color: 'var(--color-fg, #1f2937)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Incomplete Quizzes:</span>
                <span className="badge badge--warning" style={{ fontSize: '13px', padding: '0.2rem 0.65rem' }}>
                  {filteredIncomplete.length}
                </span>
                {(incompleteSearch || (incompleteOrgFilter && incompleteOrgFilter !== 'all') || incompleteDateFrom || incompleteDateTo) && (
                  <span style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-muted-fg, #6b7280)', fontWeight: 400 }}>
                    (filtered from {rawIncomplete.length} total)
                  </span>
                )}
              </div>
            </div>

            <div className="admin-table-container">
              {filteredIncomplete.length === 0 ? (
                <div className="coming-soon">
                  <CheckCircleIcon />
                  <h3>No incomplete quizzes found</h3>
                  <p>Try adjusting your search or filter criteria</p>
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
                    {filteredIncomplete.map(attempt => {
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