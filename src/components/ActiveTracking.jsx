import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList
} from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import BusinessIcon from '@mui/icons-material/Business'
import InsightsIcon from '@mui/icons-material/Insights'
import GroupIcon from '@mui/icons-material/Group'
import AssignmentIcon from '@mui/icons-material/Assignment'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import TableChartIcon from '@mui/icons-material/TableChart'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import CloseIcon from '@mui/icons-material/Close'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useDatabase } from '../hooks/useDatabase'
import DetailedInsights from './DetailedInsights'
import './ActiveTracking.css'

const API_BASE = ''

// Selectable limits for the per-employee chart so labels stay readable
const EMPLOYEE_LIMIT_OPTIONS = [10, 15, 25, 50]

// Brand chart palette (purple-based). Ordered light/dark alternating so
// neighbouring series stay separable.
const CHART_COLORS = ['#8E66F1', '#C7B3FD', '#5E3BC4', '#A38AF2', '#8F8AA6']
// Bands stay hue-separated, not just lightness-separated, so the wellness
// rating survives greyscale printing and colour-vision deficiency.
const BAND_COLORS = {
  Excellent: '#7540EC',
  Good: '#A38AF2',
  'Needs Improvement': '#E0699F'
}

const scoreBand = (score) => {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  return 'Needs Improvement'
}

// Absolute marks obtained on an attempt (charts show real numbers, not %).
const attemptMarks = (a) => Number(a?.total_marks) || 0

// Maximum marks available for an attempt: prefer the per-packet totals recorded
// on the attempt, else back it out from the stored percentage. Mirrors the
// resolution used on the Admin dashboard so denominators stay consistent.
const attemptMaxMarks = (a) => {
  const fromPackets = Object.values(a?.packet_marks || {})
    .reduce((sum, p) => sum + (Number(p?.total) || 0), 0)
  if (fromPackets > 0) return fromPackets
  const obtained = attemptMarks(a)
  return a?.score > 0 ? Math.round((obtained / a.score) * 100) : 0
}

// Best-available timestamp for an attempt
const attemptTime = (a) => new Date(a.completed_at || a.created_at || a.started_at || 0).getTime()

const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// Escape a value for CSV
const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Brand palette as RGB tuples for jsPDF (which doesn't take hex strings directly)
const PDF_BRAND = [137, 91, 245]   // #895BF5
const PDF_INK = [24, 24, 27]       // near-black body text
const PDF_MUTED = [114, 114, 121]  // secondary text
const PDF_FAINT = [161, 161, 170]  // footer / captions
const PDF_HAIRLINE = [228, 228, 231]
const PDF_PAGE_BG = [244, 242, 254]   // soft lavender page wash

// Convert a #rrggbb hex string to an [r, g, b] tuple for jsPDF setters.
const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [137, 91, 245]
}

// Preload an image so it can be drawn into the PDF; resolves null on failure
// (logo is optional — a missing asset shouldn't break the export).
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

const ActiveTracking = () => {
  const { allQuizAttempts, loadAllQuizAttempts, quizzes, organizations: dbOrganizations, employees, loadEmployees, users, packets: dbPackets } = useDatabase()

  const currentUser = useMemo(() => {
    try {
      const stored = localStorage.getItem('currentUser');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedOrg, setSelectedOrg] = useState('')
  // Assessment (quiz) filter — 'all' shows every assessment for the selected
  // organization; otherwise scopes all stats and charts to one assessment name.
  const [selectedQuiz, setSelectedQuiz] = useState('all')
  const [employeeLimit, setEmployeeLimit] = useState('15') // number string or 'all'
  const [dateRange, setDateRange] = useState('all') // all | 30d | quarter | custom
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [selectedBand, setSelectedBand] = useState(null)
  const [exporting, setExporting] = useState(false)
  // View mode: 'internal' shows real employee names (internal team monitoring),
  // 'company' anonymizes identities so companies see performance without names.
  const [viewMode, setViewMode] = useState('internal') // 'internal' | 'company'
  // When true, replace the dashboard with the standalone Detailed Insights tool
  // (upload a spreadsheet → filter by its attributes → build dynamic dashboards).
  const [showInsights, setShowInsights] = useState(false)
  // Info popup explaining what the Vector-wise Score chart shows and how it's computed
  const [showVectorInfo, setShowVectorInfo] = useState(false)

  const dashboardRef = useRef(null)

  // Load attempts + the users they reference (the list endpoint isn't available,
  // and the global attempts endpoint returns flat records, so enrich client-side).
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const attempts = await loadAllQuizAttempts()
        
        // Build user map locally from users loaded by useDatabase hook
        const localUserMap = {}
        if (users && Array.isArray(users)) {
          users.forEach(u => {
            if (u && u.id) {
              localUserMap[u.id] = u
            }
          })
        }
        
        // Fallback to attempts user enrichment
        if (attempts && Array.isArray(attempts)) {
          attempts.forEach(a => {
            if (a.user_id && a.user && !localUserMap[a.user_id]) {
              localUserMap[a.user_id] = {
                id: a.user_id,
                user_name: a.user.user_name || a.user.name,
                email: a.user.email,
                organization: a.user.organization
              }
            }
          })
        }
        setUserMap(localUserMap)
      } catch (err) {
        console.error('Active Tracking load error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [loadAllQuizAttempts, users])

  // Enrich each attempt with quiz name, employee name and organization
  const attempts = useMemo(() => {
    const all = (allQuizAttempts || []).map(a => {
      const quiz = (quizzes || []).find(q => String(q.id) === String(a.quiz_id))
      const u = userMap[a.user_id] || null
      const userProfile = u?.profile || a?.profile?.name || a?.profile || a?.user?.profile || 'Unassigned';
      return {
        ...a,
        score: Number(a.score) || 0,
        quizName: quiz?.name || a.quiz_name || a.quiz_title || a.quiz?.name || 'Unknown Quiz',
        employee: u?.user_name || u?.email || `User ${a.user_id || '?'}`,
        profile: userProfile,
        organization: (u?.organization && u.organization.trim()) || 'Unspecified'
      }
    })

    const isScopedAdmin = currentUser && currentUser.role === 'admin' && currentUser.organization_id;
    if (isScopedAdmin) {
      const myOrgId = currentUser.organization_id;
      const myOrg = (dbOrganizations || []).find(o => String(o.id) === String(myOrgId));
      const myOrgName = myOrg ? myOrg.name : currentUser.organization;
      return all.filter(a => a.organization === myOrgName);
    }
    return all;
  }, [allQuizAttempts, quizzes, userMap, currentUser, dbOrganizations])

  // Organizations available in the data (combining database organizations and attempts)
  const organizations = useMemo(() => {
    const isScopedAdmin = currentUser && currentUser.role === 'admin' && currentUser.organization_id;
    if (isScopedAdmin) {
      const myOrgId = currentUser.organization_id;
      const myOrg = (dbOrganizations || []).find(o => String(o.id) === String(myOrgId));
      const myOrgName = myOrg ? myOrg.name : currentUser.organization;
      return myOrgName ? [myOrgName] : [];
    }

    const dbNames = (dbOrganizations || [])
      .filter(o => o.status === 'active')
      .map(o => o.name);
    const attemptNames = (attempts || []).map(a => a.organization);
    const combined = new Set([...dbNames, ...attemptNames]);
    return [...combined].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [dbOrganizations, attempts, currentUser])

  // Default selection to the first organization once data is loaded
  useEffect(() => {
    if (!selectedOrg && organizations.length > 0) {
      setSelectedOrg(organizations[0])
    }
  }, [organizations, selectedOrg])

  // All attempts for the selected organization (before the assessment filter).
  // Used both to build the assessment dropdown and as the base for filtering.
  const orgAllAttempts = useMemo(
    () => attempts.filter(a => a.organization === selectedOrg),
    [attempts, selectedOrg]
  )

  // Distinct assessments present in the selected organization's data, so the
  // filter only ever offers assessments that actually have attempts here.
  const availableQuizzes = useMemo(() => {
    const names = new Set(orgAllAttempts.map(a => a.quizName).filter(Boolean))
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [orgAllAttempts])

  // Filename-safe tag for the selected assessment, added to export filenames so
  // a filtered download is distinguishable from a full-organization one.
  const quizFileTag = selectedQuiz === 'all'
    ? ''
    : `${selectedQuiz.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}-`

  // When the organization changes (or its assessment list changes), reset the
  // assessment filter if the current selection is no longer available.
  useEffect(() => {
    if (selectedQuiz !== 'all' && !availableQuizzes.includes(selectedQuiz)) {
      setSelectedQuiz('all')
    }
  }, [availableQuizzes, selectedQuiz])

  // Apply the assessment filter. Everything downstream (period filtering,
  // anonymization, every chart and the summary) derives from this, so the whole
  // dashboard updates when a single assessment is selected.
  const orgAttempts = useMemo(
    () => (selectedQuiz === 'all'
      ? orgAllAttempts
      : orgAllAttempts.filter(a => a.quizName === selectedQuiz)),
    [orgAllAttempts, selectedQuiz]
  )

  // Flatten enriched attempts into a tabular dataset so Detailed Insights can
  // analyze the live tracking data without requiring a spreadsheet upload.
  const liveDataset = useMemo(() => {
    const getAttemptPacketMarks = (a) => {
      let pm = a?.packet_marks;
      if (!pm) return {};
      if (typeof pm === 'string') {
        try { pm = JSON.parse(pm); } catch { return {}; }
      }
      if (typeof pm !== 'object') return {};
      return pm;
    };

    const getPacketNameAndScore = (pm) => {
      const result = [];
      Object.entries(pm).forEach(([key, data]) => {
        let packetId = (data && typeof data === 'object' && data.id) ? data.id : (data?.packet_id || key);
        let rawName = (data && typeof data === 'object') ? (data.name || key) : key;
        let marks = 0;
        let total = 0;
        let questions = 0;

        if (data && typeof data === 'object') {
          marks = Number(data.marks ?? data.score ?? 0);
          total = Number(data.total ?? 0);
          questions = Number(data.questions ?? 0);
        } else if (typeof data === 'number') {
          marks = data;
        }

        // Dynamically resolve current packet name from live database packets if available
        const matchedPacket = (dbPackets || []).find(p => String(p.id) === String(packetId) || String(p.name).trim().toLowerCase() === String(rawName).trim().toLowerCase());
        const name = matchedPacket?.name || rawName;

        // Only include packets that have actual questions, total marks, or marks scored in this attempt
        if (name && (total > 0 || questions > 0 || marks > 0)) {
          result.push({ name, marks, total, questions });
        }
      });
      return result;
    };

    // Include all attempts across all organizations in Detailed Insights live dataset
    const targetAttempts = attempts;

    // Group packet names by quiz
    const quizPacketsMap = {};
    targetAttempts.forEach(a => {
      const qName = a.quizName || 'Unknown Quiz';
      if (!quizPacketsMap[qName]) quizPacketsMap[qName] = new Set();
      const pm = getAttemptPacketMarks(a);
      const packets = getPacketNameAndScore(pm);
      packets.forEach(p => quizPacketsMap[qName].add(p.name));
    });

    // Identify packet names for the selected quiz (or multi-packet quizzes if 'all')
    const multiPacketNames = [];
    if (selectedQuiz !== 'all') {
      const normSel = String(selectedQuiz || '').trim().toLowerCase();
      Object.entries(quizPacketsMap).forEach(([qName, pSet]) => {
        if (String(qName).trim().toLowerCase() === normSel && pSet.size > 1) {
          pSet.forEach(pName => {
            if (!multiPacketNames.includes(pName)) {
              multiPacketNames.push(pName);
            }
          });
        }
      });
    } else {
      Object.entries(quizPacketsMap).forEach(([qName, pSet]) => {
        if (pSet.size > 1) {
          pSet.forEach(pName => {
            if (!multiPacketNames.includes(pName)) {
              multiPacketNames.push(pName);
            }
          });
        }
      });
    }

    const packetColsList = [];
    const packetColsMap = {};

    multiPacketNames.forEach(pName => {
      const baseName = pName.replace(/\s+(score|level|label)$/i, '');
      const scoreHeader = `${baseName} Score`;
      const levelHeader = `${baseName} Level`;
      packetColsMap[pName] = { scoreHeader, levelHeader };
      packetColsList.push(scoreHeader, levelHeader);
    });

    const columns = [
      'Organization',
      'Employee',
      'Profile',
      'Quiz',
      'Score',
      'Total Score',
      'Level',
      ...packetColsList,
      'Status',
      'Completed'
    ];

    const rows = targetAttempts.map(a => {
      const obtainedScore = attemptMarks(a);
      const totalScore = attemptMaxMarks(a);
      const pm = getAttemptPacketMarks(a);
      const packets = getPacketNameAndScore(pm);
      const packetDataMap = {};
      packets.forEach(p => {
        packetDataMap[p.name] = p;
      });

      const row = {
        Organization: a.organization,
        Employee: a.employee,
        Profile: a.profile || 'Unassigned',
        Quiz: a.quizName,
        Score: obtainedScore,
        'Total Score': totalScore,
        Level: scoreBand(a.score),
        Status: a.completed_at ? 'Completed' : 'In Progress',
        Completed: a.completed_at ? new Date(a.completed_at).toLocaleDateString('en-US') : ''
      };

      multiPacketNames.forEach(pName => {
        const { scoreHeader, levelHeader } = packetColsMap[pName];
        const pData = packetDataMap[pName];
        if (pData) {
          row[scoreHeader] = pData.marks;
          const pPct = pData.total > 0 ? (pData.marks / pData.total) * 100 : (pData.marks > 0 ? 100 : 0);
          row[levelHeader] = scoreBand(pPct);
        } else {
          row[scoreHeader] = '';
          row[levelHeader] = '';
        }
      });

      return row;
    });

    return {
      name: 'Active Tracking data',
      columns,
      rows
    };
  }, [attempts, selectedQuiz, dbPackets])

  // Find current organization object to get its ID
  const currentOrg = useMemo(() => {
    return (dbOrganizations || []).find(o => o.name === selectedOrg);
  }, [dbOrganizations, selectedOrg])

  // Load employee directory for selected organization
  useEffect(() => {
    if (currentOrg?.id) {
      loadEmployees(currentOrg.id);
    }
  }, [currentOrg, loadEmployees])

  // Calculate employee progress list for selected organization
  const employeeProgress = useMemo(() => {
    if (!selectedOrg) return [];
    
    // Get all pre-registered employees for this organization
    const orgEmployees = currentOrg 
      ? (employees || []).filter(e => e.organization_id === currentOrg.id) 
      : [];
      
    // Create a map of attempts grouped by employee email, honoring the active
    // assessment filter so counts and averages reflect the selected assessment.
    const emailAttempts = {};
    attempts.forEach(a => {
      if (selectedQuiz !== 'all' && a.quizName !== selectedQuiz) return;
      // Find the user email for this attempt
      const u = userMap[a.user_id];
      if (u && u.email) {
        const email = u.email.toLowerCase();
        if (!emailAttempts[email]) emailAttempts[email] = [];
        emailAttempts[email].push(a);
      }
    });

    // Match each directory employee to user signup status & attempts
    return orgEmployees.map(emp => {
      const email = emp.email ? emp.email.toLowerCase() : '';
      const personalEmail = (emp.personal_email || (emp.metadata && emp.metadata.personal_email) || '').toLowerCase();
      
      // Check if user is registered: either directly from the `users` state or if they have attempts, or check if emp.registered is 1
      const isRegistered = emp.registered === 1 || (users || []).some(u => 
        (u.email.toLowerCase() === email || (personalEmail && u.email.toLowerCase() === personalEmail)) && 
        String(u.organization_id) === String(currentOrg?.id)
      );

      const empAttempts = (emailAttempts[email] || []).concat(personalEmail ? (emailAttempts[personalEmail] || []) : []);
      const attemptsCount = empAttempts.length;

      // Individual per-quiz scores as raw marks obtained (out of the max
      // available), not percentages.
      const scores = empAttempts.map(a => ({
        quiz: a.quizName,
        marks: attemptMarks(a),
        max: attemptMaxMarks(a),
      }));

      // Find the user object in userMap for this email
      const matchedUser = Object.values(userMap).find(u => 
        u && u.email && (u.email.toLowerCase() === email || (personalEmail && u.email.toLowerCase() === personalEmail))
      );
      const baseEmployeeName = matchedUser 
        ? (matchedUser.user_name || matchedUser.email || `User ${matchedUser.id || '?'}`) 
        : null;

      return {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        personal_email: emp.personal_email || (emp.metadata && emp.metadata.personal_email) || '',
        registered: isRegistered,
        attemptsCount,
        scores,
        baseEmployeeName
      };
    });
  }, [selectedOrg, currentOrg, employees, attempts, userMap, users, selectedQuiz])

  const anonymized = viewMode === 'company'

  // Switch view mode and clear drill-downs (a stored name won't match the
  // other mode's labels, so the modal would render empty otherwise).
  const switchViewMode = (mode) => {
    if (mode === viewMode) return
    setSelectedEmployee(null)
    setSelectedBand(null)
    setViewMode(mode)
  }

  // ── Date-range bounds ─────────────────────────────────────
  const rangeBounds = useMemo(() => {
    const now = new Date()
    if (dateRange === '7d') {
      const from = new Date(now); from.setDate(now.getDate() - 7)
      return { from: from.getTime(), to: now.getTime() }
    }
    if (dateRange === '30d') {
      const from = new Date(now); from.setDate(now.getDate() - 30)
      return { from: from.getTime(), to: now.getTime() }
    }
    if (dateRange === 'quarter') {
      const q = Math.floor(now.getMonth() / 3)
      const from = new Date(now.getFullYear(), q * 3, 1)
      return { from: from.getTime(), to: now.getTime() }
    }
    if (dateRange === 'custom') {
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null,
        to: customTo ? new Date(`${customTo}T23:59:59`).getTime() : null
      }
    }
    return { from: null, to: null } // all time
  }, [dateRange, customFrom, customTo])

  // Org attempts filtered by the active period (real employee names)
  const periodAttempts = useMemo(() => {
    const { from, to } = rangeBounds
    if (from == null && to == null) return orgAttempts
    return orgAttempts.filter(a => {
      const t = attemptTime(a)
      if (from != null && t < from) return false
      if (to != null && t > to) return false
      return true
    })
  }, [orgAttempts, rangeBounds])

  // Sequential anonymous labels for Company view, numbered by performance rank
  // (highest average = User 1) so the per-employee chart reads User 1, User 2,
  // User 3 … top-to-bottom. Recomputed per period so numbering stays sequential.
  const anonMap = useMemo(() => {
    const agg = {}
    periodAttempts.forEach(a => {
      if (!agg[a.employee]) agg[a.employee] = { total: 0, count: 0 }
      agg[a.employee].total += a.score
      agg[a.employee].count += 1
    })
    const ranked = Object.entries(agg)
      .map(([name, v]) => ({ name, avg: Math.round(v.total / v.count) }))
      .sort((a, b) => b.avg - a.avg)
    const map = {}
    ranked.forEach((e, i) => { map[e.name] = `User ${i + 1}` })
    return map
  }, [periodAttempts])

  // In Company view the employee field is replaced with its anonymous label so
  // every chart, table, modal and export inherits the anonymization automatically.
  const viewAttempts = useMemo(() => {
    return anonymized
      ? periodAttempts.map(a => ({ ...a, employee: anonMap[a.employee] || 'User' }))
      : periodAttempts
  }, [periodAttempts, anonymized, anonMap])

  // ── Derived chart datasets ────────────────────────────────
  const employeeScores = useMemo(() => {
    const map = {}
    viewAttempts.forEach(a => {
      if (!map[a.employee]) map[a.employee] = { name: a.employee, total: 0, marks: 0, max: 0, count: 0 }
      map[a.employee].total += a.score
      map[a.employee].marks += attemptMarks(a)
      map[a.employee].max += attemptMaxMarks(a)
      map[a.employee].count += 1
    })
    return Object.values(map)
      // avgScore (%) is retained for band grouping; avgMarks/avgMax drive the chart.
      .map(e => ({
        name: e.name,
        avgScore: Math.round(e.total / e.count),
        avgMarks: Math.round(e.marks / e.count),
        avgMax: Math.round(e.max / e.count),
        attempts: e.count
      }))
      .sort((a, b) => b.avgMarks - a.avgMarks)
  }, [viewAttempts])

  // Employees to plot, based on the selected limit
  const shownEmployees = useMemo(
    () => (employeeLimit === 'all' ? employeeScores : employeeScores.slice(0, Number(employeeLimit))),
    [employeeScores, employeeLimit]
  )

  const performanceDistribution = useMemo(() => {
    // Group each employee by their AVERAGE score band (one person = one count)
    const empAvg = {}
    viewAttempts.forEach(a => {
      if (!empAvg[a.employee]) empAvg[a.employee] = { total: 0, count: 0 }
      empAvg[a.employee].total += a.score
      empAvg[a.employee].count += 1
    })
    const bandCounts = { Excellent: 0, Good: 0, 'Needs Improvement': 0 }
    Object.values(empAvg).forEach(({ total, count }) => {
      bandCounts[scoreBand(Math.round(total / count))] += 1
    })
    return Object.entries(bandCounts)
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
  }, [viewAttempts])

  const scoreTrend = useMemo(() => {
    const byDate = {}
    viewAttempts
      .filter(a => a.completed_at)
      .forEach(a => {
        const d = new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        if (!byDate[d]) byDate[d] = { date: d, marks: 0, max: 0, count: 0, ts: new Date(a.completed_at).getTime() }
        byDate[d].marks += attemptMarks(a)
        byDate[d].max += attemptMaxMarks(a)
        byDate[d].count += 1
      })
    return Object.values(byDate)
      .sort((a, b) => a.ts - b.ts)
      .map(d => ({ date: d.date, avgMarks: Math.round(d.marks / d.count), avgMax: Math.round(d.max / d.count) }))
  }, [viewAttempts])

  const quizAverages = useMemo(() => {
    const map = {}
    viewAttempts.forEach(a => {
      if (!map[a.quizName]) map[a.quizName] = { name: a.quizName, marks: 0, max: 0, count: 0 }
      map[a.quizName].marks += attemptMarks(a)
      map[a.quizName].max += attemptMaxMarks(a)
      map[a.quizName].count += 1
    })
    return Object.values(map)
      .map(q => ({ name: q.name, avgMarks: Math.round(q.marks / q.count), avgMax: Math.round(q.max / q.count) }))
      .sort((a, b) => b.avgMarks - a.avgMarks)
  }, [viewAttempts])

  // Average performance (%) per assessment area across all attempts
  const packetAverages = useMemo(() => {
    const map = {}
    viewAttempts.forEach(a => {
      const pm = a.packet_marks || {}
      Object.entries(pm).forEach(([name, data]) => {
        const total = Number(data?.total) || 0
        const marks = Number(data?.marks) || 0
        if (total <= 0) return
        const pct = (marks / total) * 100
        if (!map[name]) map[name] = { name, total: 0, marksSum: 0, maxSum: 0, count: 0 }
        map[name].total += pct
        map[name].marksSum += marks
        map[name].maxSum += total
        map[name].count += 1
      })
    })
    return Object.values(map)
      .map(p => ({
        name: p.name,
        avgScore: Math.round(p.total / p.count),
        avgMarks: Math.round((p.marksSum / p.count) * 10) / 10,
        avgMax: Math.round((p.maxSum / p.count) * 10) / 10,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
  }, [viewAttempts])

  // Top areas for the radar view — too many spokes makes a radar unreadable,
  // so cap at the highest-scoring areas while keeping the full set in the bar chart.
  const RADAR_MAX_AREAS = 10
  const packetRadar = useMemo(
    () => packetAverages.slice(0, RADAR_MAX_AREAS),
    [packetAverages]
  )

  // ── Summary metrics ───────────────────────────────────────
  const summary = useMemo(() => {
    const employees = new Set(viewAttempts.map(a => a.employee)).size
    const totalAttempts = viewAttempts.length
    const avgScore = totalAttempts
      ? Math.round(viewAttempts.reduce((s, a) => s + a.score, 0) / totalAttempts)
      : 0
    const top = employeeScores[0]
    return { employees, totalAttempts, avgScore, top }
  }, [viewAttempts, employeeScores])

  // ── Employee drill-down data ──────────────────────────────
  const employeeDetail = useMemo(() => {
    if (!selectedEmployee) return null
    const rows = viewAttempts
      .filter(a => a.employee === selectedEmployee)
      .sort((a, b) => attemptTime(b) - attemptTime(a))
    if (rows.length === 0) return null

    const scores = rows.map(r => r.score)
    const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)

    const pmap = {}
    rows.forEach(a => {
      const pm = a.packet_marks || {}
      Object.entries(pm).forEach(([name, data]) => {
        const total = Number(data?.total) || 0
        const marks = Number(data?.marks) || 0
        if (total <= 0) return
        const pct = (marks / total) * 100
        if (!pmap[name]) pmap[name] = { packet: name, total: 0, count: 0 }
        pmap[name].total += pct
        pmap[name].count += 1
      })
    })
    const packets = Object.values(pmap)
      .map(p => ({ packet: p.packet, score: Math.round(p.total / p.count) }))
      .sort((a, b) => b.score - a.score)

    return {
      name: selectedEmployee,
      rows,
      attempts: rows.length,
      avg,
      best: Math.max(...scores),
      worst: Math.min(...scores),
      packets
    }
  }, [selectedEmployee, viewAttempts])

  // ── Band drill-down (click a pie slice) ───────────────────
  // Group employees into the clicked performance band by their average score,
  // sorted high→low so "Excellent" leads with the top scorer.
  const bandEmployees = useMemo(() => {
    if (!selectedBand) return null
    return employeeScores.filter(e => scoreBand(e.avgScore) === selectedBand)
  }, [selectedBand, employeeScores])

  // ── Exports ───────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (dateRange === '7d') return 'Last 7 days'
    if (dateRange === '30d') return 'Last 30 days'
    if (dateRange === 'quarter') return 'This quarter'
    if (dateRange === 'custom') return `${customFrom || '…'} to ${customTo || '…'}`
    return 'All time'
  }, [dateRange, customFrom, customTo])

  const fileStamp = () => new Date().toISOString().split('T')[0]

  const exportCSV = () => {
    const headers = ['Organization', 'Employee', 'Quiz', 'Score (%)', 'Status', 'Completed At']
    const rows = viewAttempts.map(a => [
      selectedOrg, a.employee, a.quizName, a.score, a.status || 'in_progress',
      a.completed_at ? fmtDateTime(a.completed_at) : ''
    ])
    const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `active-tracking-${selectedOrg}-${quizFileTag}${anonymized ? 'company' : 'internal'}-${fileStamp()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const headers = ['Organization', 'Employee', 'Quiz', 'Score (%)', 'Status', 'Completed At']
    const rows = viewAttempts.map(a => [
      selectedOrg,
      a.employee,
      a.quizName,
      a.score,
      a.completed_at ? 'Completed' : 'In Progress',
      a.completed_at ? fmtDateTime(a.completed_at) : ''
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 22 }, // Organization
      { wch: 22 }, // Employee
      { wch: 26 }, // Quiz
      { wch: 12 }, // Score
      { wch: 14 }, // Status
      { wch: 20 }  // Completed At
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Active Tracking');
    XLSX.writeFile(wb, `active-tracking-${selectedOrg}-${quizFileTag}${anonymized ? 'company' : 'internal'}-${fileStamp()}.xlsm`, { bookType: 'xlsm' });
  }

  const exportPDF = async () => {
    if (!dashboardRef.current) return
    setExporting(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 14
      const contentW = pageW - margin * 2

      // Reserved zones for the repeating header band and footer so content
      // never collides with the branding.
      const HEADER_H = 28           // band height on content pages
      const FOOTER_H = 14           // footer strip height on every page
      const contentTop = HEADER_H + 8
      const contentBottom = pageH - FOOTER_H - 2

      const viewLabel = anonymized ? 'Company View' : 'Internal Team View'
      const generatedAt = new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
      const logo = await loadImage('/happimynd_logo.png')
      const logoAspect = logo && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 4

      // Truncate a string so it fits within maxW at the current font size.
      const fitText = (str, maxW) => {
        let s = String(str ?? '')
        if (pdf.getTextWidth(s) <= maxW) return s
        while (s.length > 1 && pdf.getTextWidth(`${s}…`) > maxW) s = s.slice(0, -1)
        return `${s}…`
      }

      // Wash every page in a soft lavender so the report reads as branded
      // stationery rather than plain white. Must run before any page content.
      const paintPageBg = () => {
        pdf.setFillColor(...PDF_PAGE_BG)
        pdf.rect(0, 0, pageW, pageH, 'F')
      }
      // Add a fresh page that already carries the lavender wash.
      const newPage = () => {
        pdf.addPage()
        paintPageBg()
      }

      // Prepare SVG elements for html2canvas by copy-inlining computed styles and fixing tspan offsets.
      const prepareSvgForHtml2Canvas = (originalEl, clonedEl) => {
        const originalSvgs = originalEl.querySelectorAll('svg')
        const clonedSvgs = clonedEl.querySelectorAll('svg')

        for (let i = 0; i < originalSvgs.length; i++) {
          const origSvg = originalSvgs[i]
          const clonedSvg = clonedSvgs[i]
          if (!clonedSvg) continue

          const rect = origSvg.getBoundingClientRect()
          clonedSvg.setAttribute('width', String(rect.width || 600))
          clonedSvg.setAttribute('height', String(rect.height || 300))

          const originalChildren = origSvg.querySelectorAll('*')
          const clonedChildren = clonedSvg.querySelectorAll('*')

          for (let j = 0; j < originalChildren.length; j++) {
            const origChild = originalChildren[j]
            const clonedChild = clonedChildren[j]
            if (!clonedChild) continue

            const style = window.getComputedStyle(origChild)
            if (style.fill && style.fill !== 'none') {
              clonedChild.style.fill = style.fill
            }
            if (style.stroke && style.stroke !== 'none') {
              clonedChild.style.stroke = style.stroke
            }
            if (style.strokeWidth) {
              clonedChild.style.strokeWidth = style.strokeWidth
            }
            if (style.fontSize) {
              clonedChild.style.fontSize = style.fontSize
            }
            if (style.fontFamily) {
              clonedChild.style.fontFamily = style.fontFamily
            }
            if (style.fontWeight) {
              clonedChild.style.fontWeight = style.fontWeight
            }
            if (style.opacity) {
              clonedChild.style.opacity = style.opacity
            }
            if (origChild.getAttribute('transform')) {
              clonedChild.setAttribute('transform', origChild.getAttribute('transform'))
            }
          }

          const clonedTspans = clonedSvg.querySelectorAll('tspan')
          clonedTspans.forEach(tspan => {
            const parentText = tspan.closest('text')
            if (parentText) {
              if (!tspan.getAttribute('x') && parentText.getAttribute('x')) {
                tspan.setAttribute('x', parentText.getAttribute('x'))
              }
              if (!tspan.getAttribute('y') && parentText.getAttribute('y')) {
                let y = parseFloat(parentText.getAttribute('y') || '0')
                const dy = tspan.getAttribute('dy')
                if (dy) {
                  if (dy.endsWith('em')) {
                    const origTspan = origSvg.querySelectorAll('tspan')[Array.from(clonedTspans).indexOf(tspan)]
                    const fontSize = origTspan ? parseFloat(window.getComputedStyle(origTspan).fontSize || '12') : 12
                    y += parseFloat(dy) * fontSize
                  } else {
                    y += parseFloat(dy)
                  }
                }
                tspan.setAttribute('y', String(y))
              }
            }
          })
        }
      }

      // ── 1. Cover page ──────────────────────────────────────
      const drawCover = () => {
        // Lavender stationery wash for the whole page
        paintPageBg()

        // Full-width brand band across the top
        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(0, 0, pageW, 4, 'F')

        // Centered logo
        if (logo) {
          const h = 28
          const w = h * logoAspect
          pdf.addImage(logo, 'PNG', (pageW - w) / 2, 50, w, h)
        }

        // Eyebrow label
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(...PDF_BRAND)
        pdf.text('ACTIVE TRACKING REPORT', pageW / 2, 96, { align: 'center' })

        // Organization (main title)
        pdf.setFontSize(30)
        pdf.setTextColor(...PDF_INK)
        pdf.text(fitText(selectedOrg, contentW), pageW / 2, 112, { align: 'center' })

        // Accent rule under the title
        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(pageW / 2 - 16, 118, 32, 1.2, 'F')

        // Metadata box
        const boxW = 130
        const boxX = (pageW - boxW) / 2
        const boxY = 134
        const rows = [
          ['View', viewLabel],
          ['Quiz', selectedQuiz === 'all' ? 'All quizzes' : selectedQuiz],
          ['Period', periodLabel],
          ['Generated', generatedAt]
        ]
        const rowH = 11
        const boxH = rows.length * rowH + 8
        pdf.setFillColor(255, 255, 255)
        pdf.setDrawColor(...PDF_HAIRLINE)
        pdf.setLineWidth(0.3)
        pdf.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'FD')
        rows.forEach(([label, value], i) => {
          const ry = boxY + 8 + i * rowH
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(8.5)
          pdf.setTextColor(...PDF_MUTED)
          pdf.text(label.toUpperCase(), boxX + 8, ry)
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(10)
          pdf.setTextColor(...PDF_INK)
          pdf.text(fitText(value, boxW - 52), boxX + 40, ry)
        })

        if (anonymized) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(9)
          pdf.setTextColor(...PDF_BRAND)
          pdf.text(
            'Employee identities have been anonymized in this report.',
            pageW / 2, boxY + boxH + 12, { align: 'center' }
          )
        }
      }

      // ── 2. Repeating header / footer on content pages ──────
      const drawHeader = () => {
        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(0, 0, pageW, 2.5, 'F')
        if (logo) {
          const h = 16
          pdf.addImage(logo, 'PNG', margin, 7, h * logoAspect, h)
        }
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.setTextColor(...PDF_BRAND)
        pdf.text(`Active Tracking · ${fitText(selectedOrg, 70)}`, pageW - margin, 16, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        pdf.setDrawColor(...PDF_HAIRLINE)
        pdf.setLineWidth(0.3)
        pdf.line(margin, HEADER_H - 3, pageW - margin, HEADER_H - 3)
      }

      const drawFooter = (pageNum, totalPages) => {
        const y = pageH - FOOTER_H + 5
        pdf.setDrawColor(...PDF_HAIRLINE)
        pdf.setLineWidth(0.3)
        pdf.line(margin, y, pageW - margin, y)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(...PDF_FAINT)
        pdf.text(
          `HappiMynd · Confidential${anonymized ? ' · Identities anonymized' : ''}`,
          margin, y + 5
        )
        pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, y + 5, { align: 'right' })
      }

      // Draw a section heading (vector text + accent underline) at cursorY,
      // returning the y position right below it.
      const drawSectionTitle = (title, note, y) => {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(13)
        pdf.setTextColor(...PDF_INK)
        pdf.text(title, margin, y)
        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(margin, y + 2.5, 18, 1, 'F')
        let next = y + 7
        if (note) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8.5)
          pdf.setTextColor(...PDF_MUTED)
          pdf.text(fitText(note, contentW), margin, next)
          next += 4
        }
        return next
      }

      // ── Cover ──
      drawCover()

      // ── 3. Executive summary (native, crisp vector) ────────
      newPage()
      let cursorY = drawSectionTitle('Executive Summary', '', contentTop) + 4

      // KPI tiles
      const tiles = [
        { value: String(summary.employees), label: anonymized ? 'Users' : 'Employees' },
        { value: String(summary.totalAttempts), label: 'Total Attempts' },
        { value: `${summary.avgScore}%`, label: 'Average Score' },
        { value: summary.top ? summary.top.name : '—', label: 'Top Performer', small: true }
      ]
      const gap = 4
      const tileW = (contentW - gap * (tiles.length - 1)) / tiles.length
      const tileH = 24
      tiles.forEach((t, i) => {
        const x = margin + i * (tileW + gap)
        pdf.setFillColor(255, 255, 255)
        pdf.setDrawColor(...PDF_HAIRLINE)
        pdf.setLineWidth(0.3)
        pdf.roundedRect(x, cursorY, tileW, tileH, 2.5, 2.5, 'FD')
        // Left accent bar
        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(x, cursorY + 3, 1.4, tileH - 6, 'F')
        const tx = x + 6
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(t.small ? 11 : 18)
        pdf.setTextColor(...(t.small ? PDF_INK : PDF_BRAND))
        pdf.text(fitText(t.value, tileW - 9), tx, cursorY + (t.small ? 12 : 13))
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(...PDF_MUTED)
        pdf.text(
          t.label + (t.small && summary.top ? ` (${summary.top.avgScore}%)` : ''),
          tx, cursorY + 18.5
        )
      })
      cursorY += tileH + 10

      // Performance-band legend with counts
      const distMap = Object.fromEntries(performanceDistribution.map(d => [d.name, d.value]))
      cursorY = drawSectionTitle('Performance Distribution', '', cursorY) + 3
      const bands = ['Excellent', 'Good', 'Needs Improvement']
      let chipX = margin
      pdf.setFontSize(9)
      bands.forEach((b) => {
        const count = distMap[b] || 0
        const text = `${b}: ${count}`
        pdf.setFont('helvetica', 'bold')
        const tw = pdf.getTextWidth(text)
        const chipW = tw + 12
        if (chipX + chipW > margin + contentW) { chipX = margin; cursorY += 9 }
        pdf.setFillColor(...(BAND_COLORS[b] ? hexToRgb(BAND_COLORS[b]) : PDF_BRAND))
        pdf.circle(chipX + 3, cursorY - 1.2, 1.6, 'F')
        pdf.setTextColor(...PDF_INK)
        pdf.text(text, chipX + 7, cursorY)
        chipX += chipW + 6
      })
      cursorY += 11

      // Key insights
      const strongest = packetAverages[0]
      const weakest = packetAverages.length > 1 ? packetAverages[packetAverages.length - 1] : null
      const insights = []
      insights.push(`Average score across ${summary.totalAttempts} attempt${summary.totalAttempts === 1 ? '' : 's'} by ${summary.employees} ${anonymized ? 'user' : 'employee'}${summary.employees === 1 ? '' : 's'} is ${summary.avgScore}%.`)
      if (summary.top) insights.push(`Top performer is ${summary.top.name} with an average of ${summary.top.avgScore}%.`)
      insights.push(`Performance bands: ${distMap['Excellent'] || 0} Excellent, ${distMap['Good'] || 0} Good, ${distMap['Needs Improvement'] || 0} Needs Improvement.`)
      if (strongest) insights.push(`Strongest area: ${strongest.name} (${strongest.avgScore}%).`)
      if (weakest && weakest.name !== strongest?.name) insights.push(`Area to focus on: ${weakest.name} (${weakest.avgScore}%).`)

      cursorY = drawSectionTitle('Key Insights', '', cursorY) + 3
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9.5)
      insights.forEach((line) => {
        pdf.setFillColor(...PDF_BRAND)
        pdf.circle(margin + 1.4, cursorY - 1.1, 1, 'F')
        pdf.setTextColor(...PDF_INK)
        const wrapped = pdf.splitTextToSize(line, contentW - 7)
        pdf.text(wrapped, margin + 6, cursorY)
        cursorY += wrapped.length * 5 + 2.5
      })

      // ── 4. Chart sections ──────────────────────────────────
      // Capture only the chart graphic (titles are drawn natively above),
      // so the export is free of the on-screen card chrome and double titles.
      const cards = [...dashboardRef.current.querySelectorAll('.at-chart-card')]
      for (const card of cards) {
        const titleEl = card.querySelector('.at-chart-card__title')
        const noteEl = card.querySelector('.at-chart-card__note')
        const note = noteEl ? noteEl.textContent.replace(/^[\s—·-]+/, '').trim() : ''
        let title = titleEl ? titleEl.textContent.trim() : 'Chart'
        if (note && noteEl) title = title.replace(noteEl.textContent, '').trim()

        const chartEl = card.querySelector('.recharts-responsive-container') || card
        const scroll = card.querySelector('.at-chart-scroll')
        const prevMaxH = scroll ? scroll.style.maxHeight : null
        if (scroll) scroll.style.maxHeight = 'none'

        const canvas = await html2canvas(chartEl, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          onclone: (clonedDoc) => {
            prepareSvgForHtml2Canvas(chartEl, clonedDoc.body)
          }
        })

        if (scroll) scroll.style.maxHeight = prevMaxH

        const titleBlockH = note ? 11 : 9
        let drawW = contentW
        let drawH = (canvas.height * drawW) / canvas.width
        const maxImgH = contentBottom - contentTop - titleBlockH
        if (drawH > maxImgH) {
          drawH = maxImgH
          drawW = (canvas.width * drawH) / canvas.height
        }

        // New page if the title + chart won't fit in remaining space
        if (cursorY + titleBlockH + drawH > contentBottom) {
          newPage()
          cursorY = contentTop
        } else {
          cursorY += 6
        }

        cursorY = drawSectionTitle(title, note, cursorY)
        const x = margin + (contentW - drawW) / 2
        // White rounded card behind the chart so it reads as a panel on lavender.
        pdf.setFillColor(255, 255, 255)
        pdf.setDrawColor(...PDF_HAIRLINE)
        pdf.setLineWidth(0.3)
        pdf.roundedRect(x - 2, cursorY - 2, drawW + 4, drawH + 4, 2, 2, 'FD')
        // JPEG keeps the file small; PNG of tall charts ballooned to 100s of MB.
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', x, cursorY, drawW, drawH, undefined, 'FAST')
        cursorY += drawH
      }

      // ── 5. Stamp header/footer (cover keeps its own top band) ──
      const total = pdf.getNumberOfPages()
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i)
        if (i > 1) drawHeader()
        drawFooter(i, total)
      }

      pdf.save(`active-tracking-${selectedOrg}-${quizFileTag}${anonymized ? 'company' : 'internal'}-${fileStamp()}.pdf`)
    } catch (e) {
      console.error('PDF export failed:', e)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // ── States ────────────────────────────────────────────────
  const renderEmployeeProgressTable = () => {
    const registeredCount = employeeProgress.filter(e => e.registered).length;
    const totalCount = employeeProgress.length;

    return (
      <div className="at-chart-card at-chart-card--wide" style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="at-chart-card__head" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <h3 className="at-chart-card__title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <span>
              Employee Progress Directory
              <span className="at-chart-card__note">
                {' '}— {registeredCount} of {totalCount} registered · track signup and quiz status
              </span>
            </span>
          </h3>
        </div>

        {employeeProgress.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-muted-fg)' }}>
            No pre-registered employees found in the directory for this organization.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="at-modal__table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Employee Name</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Official Email</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Personal Email</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, textAlign: 'center' }}>Quizzes Taken</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, textAlign: 'center' }}>Scores</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', width: '100px' }}></th>
                </tr>
              </thead>
              <tbody>
                {employeeProgress.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 500 }}>{emp.name}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>{emp.email}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>{emp.personal_email || ''}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <span 
                        className={`badge badge--${emp.registered ? 'success' : 'neutral'}`}
                        style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-block', fontWeight: 600, borderRadius: '4px' }}
                      >
                        {emp.registered ? 'Registered' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 600 }}>
                      {emp.attemptsCount}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                      {emp.scores.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', justifyContent: 'center' }}>
                          {emp.scores.map((s, i) => (
                            <span
                              key={i}
                              title={s.quiz}
                              style={{
                                fontWeight: 600,
                                color: 'var(--color-primary)',
                                background: 'var(--color-primary-soft, rgba(163, 138, 242, 0.12))',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: 'var(--text-sm)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {s.max > 0 ? `${s.marks}/${s.max}` : s.marks}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-muted-fg)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                      {emp.attemptsCount > 0 && (
                        <button
                          type="button"
                          className="btn btn--outline"
                          style={{ padding: '2px 8px', fontSize: 'var(--text-xs)', height: '24px' }}
                          onClick={() => {
                            const targetName = anonymized 
                              ? (anonMap[emp.baseEmployeeName] || 'User') 
                              : emp.baseEmployeeName;
                            if (targetName) {
                              setSelectedEmployee(targetName);
                            }
                          }}
                        >
                          Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Detailed Insights is a self-contained tool; show it in place of the
  // org dashboard until the user navigates back.
  if (showInsights) {
    return <DetailedInsights onBack={() => setShowInsights(false)} liveDataset={liveDataset} />
  }

  if (loading) {
    return (
      <div className="at-spinner-wrap"><div className="at-spinner" /></div>
    )
  }

  if (error) {
    return (
      <div className="active-tracking">
        <div className="at-alert">Error loading tracking data: {error}</div>
      </div>
    )
  }

  const hasData = viewAttempts.length > 0

  return (
    <div className="active-tracking">
      {/* Header */}
      <div className="at-header">
        <div className="at-header__icon"><InsightsIcon /></div>
        <div className="at-header__text">
          <h1>Active Tracking</h1>
          <p>Select an organization to visualize its employees' quiz performance</p>
        </div>
        <button
          className="btn btn--outline at-insights-btn"
          onClick={() => setShowInsights(true)}
          title="Upload a spreadsheet and build custom dashboards"
        >
          <QueryStatsIcon className="btn-icon" /> Detailed Insights
        </button>
      </div>

      {organizations.length === 0 ? (
        <div className="at-empty">
          <InsightsIcon />
          <h3>No data to track yet</h3>
          <p>Once employees complete quizzes, their organizations will appear here.</p>
        </div>
      ) : (
        <>
          {/* Filters + export */}
          <div className="at-controls">
            <div className="at-controls__group">
              <BusinessIcon style={{ color: 'var(--color-primary)' }} />
              <label htmlFor="at-org-select" className="at-controls__label">Organization</label>
              <select
                id="at-org-select"
                className="at-select"
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
              >
                {organizations.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
            </div>

            <div className="at-controls__group">
              <AssignmentIcon style={{ color: 'var(--color-primary)' }} />
              <label htmlFor="at-quiz-select" className="at-controls__label">Quiz</label>
              <select
                id="at-quiz-select"
                className="at-select"
                value={selectedQuiz}
                onChange={(e) => setSelectedQuiz(e.target.value)}
                disabled={availableQuizzes.length === 0}
              >
                <option value="all">All quizzes{availableQuizzes.length ? ` (${availableQuizzes.length})` : ''}</option>
                {availableQuizzes.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="at-controls__group">
              <CalendarMonthIcon style={{ color: 'var(--color-primary)' }} />
              <label htmlFor="at-range-select" className="at-controls__label">Period</label>
              <select
                id="at-range-select"
                className="at-select at-select--sm"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="quarter">This quarter</option>
                <option value="custom">Custom…</option>
              </select>
              {dateRange === 'custom' && (
                <span className="at-daterange">
                  <input type="date" className="at-date-input" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
                  <span className="at-daterange__sep">to</span>
                  <input type="date" className="at-date-input" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
                </span>
              )}
            </div>

            <div className="at-controls__group">
              <label className="at-controls__label">View</label>
              <div className="at-viewtoggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`at-viewtoggle__btn ${viewMode === 'internal' ? 'is-active' : ''}`}
                  onClick={() => switchViewMode('internal')}
                  title="Show employee names — for internal monitoring"
                >
                  <VisibilityIcon /> Internal Team
                </button>
                <button
                  type="button"
                  className={`at-viewtoggle__btn ${viewMode === 'company' ? 'is-active' : ''}`}
                  onClick={() => switchViewMode('company')}
                  title="Anonymize employee identities — for company sharing"
                >
                  <VisibilityOffIcon /> Company
                </button>
              </div>
            </div>

            <div className="at-controls__group at-controls__group--end">
              <button className="btn btn--outline" onClick={exportCSV} disabled={!hasData}>
                <TableChartIcon className="btn-icon" /> CSV
              </button>
              <button className="btn btn--outline" onClick={exportExcel} disabled={!hasData}>
                <TableChartIcon className="btn-icon" /> Excel
              </button>
              <button className="btn btn--primary" onClick={exportPDF} disabled={!hasData || exporting}>
                <PictureAsPdfIcon className="btn-icon" /> {exporting ? 'Exporting…' : 'PDF'}
              </button>
            </div>
          </div>

          {anonymized && hasData && (
            <div className="at-privacy-banner">
              <VisibilityOffIcon />
              <span>
                <strong>Company View</strong> — employee identities are anonymized in the charts and exported reports.
              </span>
            </div>
          )}

          {!hasData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%' }}>
              <div className="at-empty" style={{ padding: 'var(--space-6) var(--space-4)', marginBottom: 0 }}>
                <InsightsIcon />
                <h3>No attempts for {selectedOrg}{selectedQuiz !== 'all' ? ` · ${selectedQuiz}` : ''}</h3>
                <p>{selectedQuiz !== 'all'
                  ? `No attempts recorded for "${selectedQuiz}"${dateRange === 'all' ? '' : ` in the selected period (${periodLabel})`}.`
                  : (dateRange === 'all' ? 'This organization has no recorded quiz attempts yet.' : `No attempts in the selected period (${periodLabel}).`)}</p>
              </div>
              {renderEmployeeProgressTable()}
            </div>
          ) : (
            <div className="at-dashboard">
              <div ref={dashboardRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {/* Summary cards */}
              <div className="at-stats">
                <div className="at-stat-card">
                  <div className="at-stat-card__icon"><GroupIcon /></div>
                  <div>
                    <div className="at-stat-card__value">{summary.employees}</div>
                    <div className="at-stat-card__label">Employees</div>
                  </div>
                </div>
                <div className="at-stat-card">
                  <div className="at-stat-card__icon"><AssignmentIcon /></div>
                  <div>
                    <div className="at-stat-card__value">{summary.totalAttempts}</div>
                    <div className="at-stat-card__label">Total Attempts</div>
                  </div>
                </div>
                <div className="at-stat-card">
                  <div className="at-stat-card__icon"><InsightsIcon /></div>
                  <div>
                    <div className="at-stat-card__value">{summary.avgScore}%</div>
                    <div className="at-stat-card__label">Average Score</div>
                  </div>
                </div>
                <div className="at-stat-card">
                  <div className="at-stat-card__icon"><EmojiEventsIcon /></div>
                  <div>
                    <div className="at-stat-card__value at-stat-card__value--sm">
                      {summary.top ? summary.top.name : '—'}
                    </div>
                    <div className="at-stat-card__label">
                      Top Performer {summary.top ? `(${summary.top.avgScore}%)` : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts grid */}
              <div className="at-charts">
                {/* Avg score per employee (horizontal, selectable count, clickable) */}
                <div className="at-chart-card at-chart-card--wide">
                  <div className="at-chart-card__head">
                    <h3 className="at-chart-card__title">
                      Employees by Average Marks
                      <span className="at-chart-card__note">
                        {' '}— showing {shownEmployees.length} of {employeeScores.length} · click a bar for details
                      </span>
                    </h3>
                    <div className="at-chart-card__control">
                      <label htmlFor="at-emp-limit">Show</label>
                      <select
                        id="at-emp-limit"
                        className="at-select at-select--sm"
                        value={employeeLimit}
                        onChange={(e) => setEmployeeLimit(e.target.value)}
                      >
                        {EMPLOYEE_LIMIT_OPTIONS.filter(n => n < employeeScores.length).map(n => (
                          <option key={n} value={String(n)}>Top {n}</option>
                        ))}
                        <option value="all">All ({employeeScores.length})</option>
                      </select>
                    </div>
                  </div>
                  <div className="at-chart-scroll">
                    <ResponsiveContainer width="100%" height={Math.max(280, shownEmployees.length * 34)}>
                      <BarChart
                        layout="vertical"
                        data={shownEmployees}
                        margin={{ top: 8, right: 32, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#68657F' }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={150}
                          tick={{ fontSize: 12, fill: '#68657F' }}
                          tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
                        />
                        <Tooltip formatter={(v, n, p) => `${v} / ${p?.payload?.avgMax ?? ''}`} />
                        <Bar
                          dataKey="avgMarks"
                          name="Avg Marks"
                          fill="#8E66F1"
                          radius={[0, 6, 6, 0]}
                          barSize={18}
                          cursor="pointer"
                          onClick={(d) => {
                            const name = d?.payload?.name ?? d?.name
                            if (name) setSelectedEmployee(name)
                          }}
                        >
                          <LabelList dataKey="avgMarks" position="right" style={{ fontSize: 11, fill: '#68657F', fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Performance distribution */}
                <div className="at-chart-card">
                  <h3 className="at-chart-card__title">
                    Performance Distribution
                    <span className="at-chart-card__note">{' '}— click a slice to see who's in it</span>
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={performanceDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(d) => `${d.name}: ${d.value}`}
                        cursor="pointer"
                        onClick={(d) => {
                          const name = d?.name ?? d?.payload?.name
                          if (name) setSelectedBand(name)
                        }}
                      >
                        {performanceDistribution.map((entry) => (
                          <Cell key={entry.name} fill={BAND_COLORS[entry.name]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} ${value === 1 ? 'person' : 'people'}`, name]}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Score trend over time */}
                <div className="at-chart-card">
                  <h3 className="at-chart-card__title">Score Trend Over Time</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={scoreTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#68657F' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#68657F' }} />
                      <Tooltip formatter={(v, n, p) => `${v} / ${p?.payload?.avgMax ?? ''}`} />
                      <Line type="monotone" dataKey="avgMarks" name="Avg Marks" stroke="#8E66F1" strokeWidth={3} dot={{ r: 4, fill: '#8E66F1' }}>
                        <LabelList dataKey="avgMarks" position="top" style={{ fontSize: 10, fill: '#68657F', fontWeight: 'bold' }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Avg score per quiz (horizontal, sorted, scrollable) */}
                <div className="at-chart-card">
                  <h3 className="at-chart-card__title">Average Marks by Quiz</h3>
                  <div className="at-chart-scroll">
                    <ResponsiveContainer width="100%" height={Math.max(240, quizAverages.length * 32)}>
                      <BarChart layout="vertical" data={quizAverages} margin={{ top: 8, right: 32, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#68657F' }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={150}
                          tick={{ fontSize: 12, fill: '#68657F' }}
                          tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
                        />
                        <Tooltip formatter={(v, n, p) => `${v} / ${p?.payload?.avgMax ?? ''}`} />
                        <Bar dataKey="avgMarks" name="Avg Marks" radius={[0, 6, 6, 0]} barSize={16}>
                          {quizAverages.map((entry, i) => (
                            <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                          <LabelList dataKey="avgMarks" position="right" style={{ fontSize: 10, fill: '#68657F', fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Performance by area (horizontal, sorted, scrollable) */}
                {packetAverages.length > 0 && (
                  <div className="at-chart-card">
                    <h3 className="at-chart-card__title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      Vector-wise Score average absolute score
                      <button
                        type="button"
                        className="at-chart-info-btn"
                        onClick={() => setShowVectorInfo(true)}
                        aria-label="About this chart"
                        title="What does this chart show?"
                        style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: 0 }}
                      >
                        <InfoOutlinedIcon style={{ fontSize: 18 }} />
                      </button>
                    </h3>
                    <div className="at-chart-scroll">
                      <ResponsiveContainer width="100%" height={Math.max(240, packetAverages.length * 32)}>
                        <BarChart layout="vertical" data={packetAverages} margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 12, fill: '#68657F' }} allowDecimals={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={160}
                            tick={{ fontSize: 12, fill: '#68657F' }}
                            tickFormatter={(v) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                          />
                          <Tooltip formatter={(v, n, p) => `${v} / ${p?.payload?.avgMax ?? ''}`} />
                          <Bar dataKey="avgMarks" name="Avg Score" fill="#A38AF2" radius={[0, 6, 6, 0]} barSize={16}>
                            <LabelList dataKey="avgMarks" position="right" style={{ fontSize: 10, fill: '#68657F', fontWeight: 'bold' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Performance by area — radar view (top areas for readability) */}
                {packetRadar.length >= 3 && (
                  <div className="at-chart-card at-chart-card--wide">
                    <h3 className="at-chart-card__title">
                      Performance by Area — Radar
                      <span className="at-chart-card__note">
                        {packetAverages.length > packetRadar.length
                          ? ` — top ${packetRadar.length} of ${packetAverages.length} areas`
                          : ` — ${packetRadar.length} areas`}
                      </span>
                    </h3>
                    <ResponsiveContainer width="100%" height={420}>
                      <RadarChart data={packetRadar} outerRadius="72%" margin={{ top: 16, right: 48, bottom: 16, left: 48 }}>
                        <PolarGrid stroke="#E8E6F4" />
                        <PolarAngleAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fill: '#68657F' }}
                          tickFormatter={(v) => {
                            const item = packetRadar.find(p => p.name === v);
                            const label = v.length > 16 ? `${v.slice(0, 15)}…` : v;
                            return item ? `${label} (${item.avgMarks}/${item.avgMax})` : label;
                          }}
                        />
                        <PolarRadiusAxis angle={90} tick={{ fontSize: 10, fill: '#8F8AA6' }} />
                        <Radar name="Avg Marks" dataKey="avgMarks" stroke="#8E66F1" fill="#8E66F1" fillOpacity={0.35} />
                        <Tooltip formatter={(v, n, p) => `${v} / ${p?.payload?.avgMax ?? ''}`} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              </div>
              <div style={{ marginTop: 'var(--space-6)' }}>
                {renderEmployeeProgressTable()}
              </div>
            </div>
          )}
        </>
      )}

      {/* Employee drill-down modal */}
      {showVectorInfo && (
        <div className="at-modal-overlay" onClick={() => setShowVectorInfo(false)}>
          <div className="at-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="at-modal__header">
              <div>
                <h2 className="at-modal__title">Vector-wise Score</h2>
                <p className="at-modal__subtitle">How this chart is calculated</p>
              </div>
              <button className="at-modal__close" onClick={() => setShowVectorInfo(false)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', lineHeight: 1.5 }}>
              <div>
                <h3 className="at-modal__section">What it shows</h3>
                <p>
                  Each bar is one assessment area (vector). It shows the <strong>average absolute
                  score</strong> employees obtained in that area — in actual marks, not a percentage.
                  Areas are sorted from strongest to weakest, so the top bars are where the
                  {' '}{viewMode === 'company' ? 'organization' : 'team'} performs best.
                </p>
              </div>

              <div>
                <h3 className="at-modal__section">Formula</h3>
                <p style={{ margin: 0 }}>
                  For each area, across every attempt in the selected filters:
                </p>
                <pre style={{ background: 'var(--color-surface-2, #F2EFFE)', padding: 'var(--space-3)', borderRadius: 8, overflowX: 'auto', fontSize: 'var(--text-sm)', margin: 'var(--space-2) 0 0' }}>
{`Avg Score = Σ (marks in the area)  ÷  number of attempts`}
                </pre>
                <p style={{ marginTop: 'var(--space-2)' }}>
                  The label next to each bar is that average score, and the tooltip shows it as
                  {' '}<code>score / max</code> — the average marks scored out of the average marks
                  available in that area.
                </p>
              </div>

              <div>
                <h3 className="at-modal__section">Scope</h3>
                <p style={{ margin: 0 }}>
                  Respects the current <strong>Organization</strong>, <strong>Quiz</strong>,
                  {' '}<strong>Period</strong> and <strong>View</strong> (Internal Team / Company)
                  filters. Only areas with recorded marks appear.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {employeeDetail && (
        <div className="at-modal-overlay" onClick={() => setSelectedEmployee(null)}>
          <div className="at-modal" onClick={(e) => e.stopPropagation()}>
            <div className="at-modal__header">
              <div>
                <h2 className="at-modal__title">{employeeDetail.name}</h2>
                <p className="at-modal__subtitle">{selectedOrg} · {periodLabel}</p>
              </div>
              <button className="at-modal__close" onClick={() => setSelectedEmployee(null)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <div className="at-modal__stats">
              <div className="at-modal__stat">
                <div className="at-modal__stat-value">{employeeDetail.avg}%</div>
                <div className="at-modal__stat-label">Average</div>
              </div>
              <div className="at-modal__stat">
                <div className="at-modal__stat-value">{employeeDetail.best}%</div>
                <div className="at-modal__stat-label">Best</div>
              </div>
              <div className="at-modal__stat">
                <div className="at-modal__stat-value">{employeeDetail.worst}%</div>
                <div className="at-modal__stat-label">Lowest</div>
              </div>
              <div className="at-modal__stat">
                <div className="at-modal__stat-value">{employeeDetail.attempts}</div>
                <div className="at-modal__stat-label">Attempts</div>
              </div>
            </div>

            {/* Attempt history */}
            <h3 className="at-modal__section">Attempt History</h3>
            <div className="at-modal__table-wrap">
              <table className="at-modal__table">
                <thead>
                  <tr>
                    <th>Quiz</th>
                    <th>Score</th>
                    <th>Level</th>
                    <th>Status</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeDetail.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.quizName}</td>
                      <td><strong>{r.score}%</strong></td>
                      <td>
                        <span className="at-band-badge" style={{ backgroundColor: BAND_COLORS[scoreBand(r.score)] }}>
                          {scoreBand(r.score)}
                        </span>
                      </td>
                      <td>{r.completed_at ? 'Completed' : 'In Progress'}</td>
                      <td>{fmtDateTime(r.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Packet breakdown */}
            {employeeDetail.packets.length > 0 && (
              <>
                <h3 className="at-modal__section">Performance by Area</h3>
                <div className="at-packet-list">
                  {employeeDetail.packets.map((p) => (
                    <div key={p.packet} className="at-packet-row">
                      <span className="at-packet-row__name">{p.packet}</span>
                      <span className="at-packet-row__bar">
                        <span className="at-packet-row__fill" style={{ width: `${p.score}%` }} />
                      </span>
                      <span className="at-packet-row__val">{p.score}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Performance band drill-down modal */}
      {bandEmployees && (
        <div className="at-modal-overlay" onClick={() => setSelectedBand(null)}>
          <div className="at-modal" onClick={(e) => e.stopPropagation()}>
            <div className="at-modal__header">
              <div>
                <h2 className="at-modal__title">
                  <span className="at-band-badge" style={{ backgroundColor: BAND_COLORS[selectedBand] }}>
                    {selectedBand}
                  </span>
                </h2>
                <p className="at-modal__subtitle">
                  {selectedOrg} · {periodLabel} · {bandEmployees.length} {bandEmployees.length === 1 ? 'person' : 'people'} (by average score)
                </p>
              </div>
              <button className="at-modal__close" onClick={() => setSelectedBand(null)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            {bandEmployees.length === 0 ? (
              <p className="at-modal__subtitle">No employees fall in this band for the current selection.</p>
            ) : (
              <div className="at-modal__table-wrap">
                <table className="at-modal__table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Avg Score</th>
                      <th>Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bandEmployees.map((e) => (
                      <tr
                        key={e.name}
                        className="at-modal__row--clickable"
                        onClick={() => { setSelectedBand(null); setSelectedEmployee(e.name) }}
                        title="View details"
                      >
                        <td>{e.name}</td>
                        <td><strong>{e.avgScore}%</strong></td>
                        <td>{e.attempts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ActiveTracking
