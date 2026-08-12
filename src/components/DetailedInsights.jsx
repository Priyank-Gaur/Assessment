import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  ComposedChart,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ReferenceArea,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList
} from 'recharts'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import InsightsIcon from '@mui/icons-material/Insights'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import AddChartIcon from '@mui/icons-material/Addchart'
import TuneIcon from '@mui/icons-material/Tune'
import TableChartIcon from '@mui/icons-material/TableChart'
import CloseIcon from '@mui/icons-material/Close'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import StorageIcon from '@mui/icons-material/Storage'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import './DetailedInsights.css'

// Shared brand palette (kept in sync with ActiveTracking)
const CHART_COLORS = ['#8E66F1', '#C7B3FD', '#5E3BC4', '#A38AF2', '#8F8AA6', '#D6C8FF', '#6E5BA8', '#7540EC']

// Brand palette as RGB tuples for jsPDF (mirrors the Active Tracking export so
// both reports share one visual identity).
const PDF_BRAND = [137, 91, 245]   // #895BF5
const PDF_INK = [24, 24, 27]       // near-black body text
const PDF_MUTED = [114, 114, 121]  // secondary text
const PDF_FAINT = [161, 161, 170]  // footer / captions
const PDF_HAIRLINE = [228, 228, 231]
const PDF_PAGE_BG = [244, 242, 254]   // soft lavender page wash

// Preload an image for the PDF; resolves null on failure so a missing logo
// never breaks the export.
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

// Columns with more distinct values than this are treated as free text
// (a multi-select of hundreds of values is useless as a filter / dimension).
const MAX_CATEGORICAL_CARDINALITY = 50
// Cap categories drawn in a chart so labels stay readable; the rest roll into "Other".
const MAX_CHART_CATEGORIES = 15
const TABLE_PAGE_SIZE = 10

const isBlank = (v) => {
  if (v === null || v === undefined) return true
  const str = String(v).trim()
  return str === '' || str === '—' || str === '-' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined'
}

const isNonBlankValue = (val, type) => {
  if (isBlank(val)) return false
  if (type === 'numeric') return toNumber(val) !== null
  return true
}

const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (isBlank(v)) return null
  const n = Number(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : null
}

// Parse a value into a timestamp if it looks like a date (has date/time
// separators so plain words and bare numbers aren't mistaken for dates).
const parseDate = (v) => {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return null
  const s = String(v ?? '').trim()
  if (!s || (!/[-/]/.test(s) && !/\d{1,2}:\d{2}/.test(s))) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

// Infer a column's type by sampling its non-blank values.
const inferType = (rows, col) => {
  const values = rows.map(r => r[col]).filter(v => !isBlank(v))
  if (values.length === 0) return 'text'
  if (values.every(v => toNumber(v) !== null)) return 'numeric'
  if (values.every(v => parseDate(v) !== null)) return 'date'
  const distinct = new Set(values.map(v => String(v)))
  if (distinct.size <= MAX_CATEGORICAL_CARDINALITY) return 'categorical'
  return 'text'
}

// Distinct non-blank value count for a column.
const distinctCount = (rows, col) =>
  new Set(rows.map(r => String(r[col] ?? '').trim()).filter(Boolean)).size

// Column-name hints used to choose a meaningful default metric. We want the
// focus metric to be something worth averaging (a score), not an identifier or
// row index that merely happens to be numeric (Sr. No, Phone Number, …).
const METRIC_NAME_RE = /\b(score|scores|rating|ratings|result|results|marks?|percent|percentage|grade|points?)\b/i
const IDENTIFIER_NAME_RE = /\b(id|no\.?|number|phone|mobile|contact|serial|sr|zip|pin|code|year)\b/i

// Pick the numeric column that best represents "the thing to measure".
// Preference: a column literally named like a score → any numeric column that
// isn't an identifier/index (by name, or by having a near-unique value per row)
// → falling back to the first numeric column.
const pickMetric = (cols, rows) => {
  const numeric = cols.filter(c => c.type === 'numeric')
  if (!numeric.length) return ''
  const byName = numeric.find(c => METRIC_NAME_RE.test(c.name))
  if (byName) return byName.name
  const meaningful = numeric.filter(c => {
    if (IDENTIFIER_NAME_RE.test(c.name)) return false
    // An ID / serial column has roughly one distinct value per row.
    if (rows.length > 5 && distinctCount(rows, c.name) >= rows.length * 0.9) return false
    return true
  })
  return (meaningful[0] || numeric[0]).name
}

// Column-name hint for the "who" of a dataset, so per-person charts get labeled
// "Employees by …" and Company view anonymizes the right column.
const PEOPLE_NAME_RE = /\b(name|employee|employees|person|people|user|users|staff|member|members)\b/i

// Assessment detection: every numeric column whose name contains the word
// "Score" (EQ Score, Technical Score, Leadership Score, …) is treated as a
// separate assessment. The Smart-charts pack builds an individual report for
// each and comparative reports across all of them.
const SCORE_NAME_RE = /\bscores?\b/i
// Common HR dimensions the smart pack looks for to build the requested charts.
const DEPT_RE = /\b(department|dept|division|team|function|unit|group)\b/i
const DESIG_RE = /\b(designation|role|title|position|grade|level|band|seniority)\b/i
const EXP_RE = /\b(experience|exp|tenure|years|yoe|service)\b/i

// Diverging fill for a correlation cell: purple for positive, rose for
// negative, with opacity scaling by strength so the matrix reads as a heatmap.
const corrColor = (r) => {
  if (r === null || r === undefined) return '#F2EFFE'
  const a = Math.min(1, Math.abs(r))
  return r >= 0 ? `rgba(142,102,241,${0.12 + 0.88 * a})` : `rgba(224,105,159,${0.12 + 0.88 * a})`
}
const shortLabel = (s, n = 16) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s))

// Sequential brand fill for a 0–100 performance value: pink-tinted when weak,
// deepening to brand purple as it strengthens. Used by the heatmap & treemap.
const heatColor = (pct) => {
  if (pct === null || pct === undefined) return '#F2EFFE'
  const t = Math.max(0, Math.min(1, pct / 100))
  // Interpolate rose (#E0699F → weak) to brand purple (#7540EC → strong).
  const lerp = (a, b) => Math.round(a + (b - a) * t)
  const r = lerp(0xE0, 0x75), g = lerp(0x69, 0x40), b = lerp(0x9F, 0xEC)
  return `rgb(${r}, ${g}, ${b})`
}

// Custom Treemap tile: area encodes headcount, fill encodes average score, so
// big-but-weak and small-but-strong groups read at a glance. Labels are drawn
// only when the tile is large enough to hold them.
const TreemapTile = (props) => {
  const { x, y, width, height, name, avg, n, pct } = props
  if (!(width > 0 && height > 0)) return null
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={heatColor(pct)} stroke="#fff" strokeWidth={2} />
      {width > 64 && height > 34 && (
        <>
          <text x={x + 7} y={y + 19} fill="#fff" fontSize={12} fontWeight={700}>{shortLabel(name, Math.floor(width / 8))}</text>
          <text x={x + 7} y={y + 35} fill="#fff" fontSize={11} fillOpacity={0.92}>avg {avg} · n={n}</text>
        </>
      )}
    </g>
  )
}

// Choose the column that identifies each record. Prefer an explicitly
// person-named column (e.g. "Full Name") over emails / IDs, then fall back to
// the highest-cardinality text/categorical column.
const pickIdentity = (cols, rows) => {
  const candidates = cols
    .filter(c => c.type === 'categorical' || c.type === 'text')
    .map(c => ({ name: c.name, card: distinctCount(rows, c.name) }))
  if (!candidates.length) return ''
  const named = candidates.filter(c => PEOPLE_NAME_RE.test(c.name))
  // Prefer a display-name column over an ID-style one ("Full Name" beats
  // "Employee ID") so the per-person chart is labeled by name, not codes.
  const display = named.filter(c => !IDENTIFIER_NAME_RE.test(c.name))
  const pick = (display.length ? display : named).sort((a, b) => b.card - a.card)[0]
  return (pick || candidates.sort((a, b) => b.card - a.card)[0]).name
}

// Performance bands for a 0–100 style score, mirroring Active Tracking's
// Excellent / Good / Needs Improvement split (and its colors). Scores are
// normalized by their scale first, so bands also work for marks out of 5/10/20.
const BAND_DEFS = [
  { name: 'Excellent', color: '#7540EC' },
  { name: 'Good', color: '#A38AF2' },
  { name: 'Needs Improvement', color: '#E0699F' }
]
const detectScale = (max) => (max <= 5 ? 5 : max <= 10 ? 10 : max <= 20 ? 20 : 100)
const bandForPct = (pct) => (pct >= 80 ? 'Excellent' : pct >= 60 ? 'Good' : 'Needs Improvement')

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const AGG_LABELS = { count: 'Count', sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max' }

const round1 = (v) => Math.round(v * 10) / 10

// Group rows by a categorical column and average a numeric metric within each
// group (falling back to row counts when there is no metric).
const groupStats = (rows, dim, metric) => {
  const groups = {}
  rows.forEach(r => {
    const k = (String(r[dim] ?? '').trim()) || '—'
    if (!groups[k]) groups[k] = { vals: [], count: 0 }
    groups[k].count += 1
    if (metric) {
      const n = toNumber(r[metric])
      if (n !== null) groups[k].vals.push(n)
    }
  })
  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      count: g.count,
      value: metric && g.vals.length
        ? round1(g.vals.reduce((s, n) => s + n, 0) / g.vals.length)
        : g.count
    }))
    .sort((a, b) => b.value - a.value)
}

// Pearson correlation coefficient for paired [x, y] samples (null if undefined).
const pearson = (pairs) => {
  const n = pairs.length
  if (n < 3) return null
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n
  const my = pairs.reduce((s, p) => s + p[1], 0) / n
  let cov = 0, vx = 0, vy = 0
  pairs.forEach(([x, y]) => { cov += (x - mx) * (y - my); vx += (x - mx) ** 2; vy += (y - my) ** 2 })
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

// Least-squares trend line (slope + intercept) for paired [x, y] samples.
const linReg = (pairs) => {
  const n = pairs.length
  if (n < 2) return null
  const sx = pairs.reduce((s, p) => s + p[0], 0)
  const sy = pairs.reduce((s, p) => s + p[1], 0)
  const sxy = pairs.reduce((s, p) => s + p[0] * p[1], 0)
  const sxx = pairs.reduce((s, p) => s + p[0] * p[0], 0)
  const d = n * sxx - sx * sx
  if (d === 0) return null
  const slope = (n * sxy - sx * sy) / d
  return { slope, intercept: (sy - slope * sx) / n }
}

// Map a raw score to a performance band using its detected scale (out of 5/10/100).
const BAND_KEYS = ['Excellent', 'Good', 'Needs Improvement']
const BAND_COLOR = { Excellent: '#7540EC', Good: '#A38AF2', 'Needs Improvement': '#E0699F' }
const bandOf = (raw, scale) => bandForPct((raw / scale) * 100)

// Default opening statement pre-filled into the report narrative. It appears in
// the exported PDF by default and can be edited or cleared in the UI.
const DEFAULT_OPENING_STATEMENT = "Mental health is an essential part of overall well-being and influences how individuals think, feel, connect with others, and navigate daily challenges. Factors such as work demands, relationships, life events, stress, sleep, and emotional experiences can all impact psychological well-being. The assessments included in this report provide valuable insights into various aspects of emotional, social, cognitive, and behavioral health, helping to identify areas of strength as well as opportunities for support and growth. These findings can serve as a useful resource for understanding well-being trends and informing initiatives that promote a healthier, more resilient, and engaged workforce."

const strengthWord = (r) => {
  const a = Math.abs(r)
  return a >= 0.6 ? 'strong' : a >= 0.3 ? 'moderate' : a >= 0.15 ? 'weak' : 'no meaningful'
}

// Derive an at-a-glance narrative + highlight stats for the current rows,
// focused on the chosen metric (e.g. assessment score) across each dimension.
const computeInsights = (rows, metric, catCols) => {
  if (!rows.length) return null
  const nums = metric ? rows.map(r => toNumber(r[metric])).filter(n => n !== null) : []
  const hasMetric = nums.length > 0
  const avg = hasMetric ? round1(nums.reduce((s, n) => s + n, 0) / nums.length) : null
  const highest = hasMetric ? round1(Math.max(...nums)) : null
  const lowest = hasMetric ? round1(Math.min(...nums)) : null

  const dimStats = catCols
    .map(c => {
      const arr = groupStats(rows, c.name, hasMetric ? metric : null)
      if (arr.length < 2) return null
      return { dim: c.name, groups: arr.length, top: arr[0], bottom: arr[arr.length - 1] }
    })
    .filter(Boolean)

  const bullets = []
  if (hasMetric) {
    bullets.push(`Average ${metric} is ${avg} across ${rows.length} record${rows.length === 1 ? '' : 's'}, ranging from ${lowest} to ${highest}.`)
  } else {
    bullets.push(`${rows.length} record${rows.length === 1 ? '' : 's'} in the current selection.`)
  }
  dimStats.forEach(d => {
    if (hasMetric) {
      bullets.push(`By ${d.dim}, ${d.top.name} leads at ${d.top.value} while ${d.bottom.name} trails at ${d.bottom.value}.`)
    } else {
      bullets.push(`Most common ${d.dim}: ${d.top.name} (${d.top.count}); least common: ${d.bottom.name} (${d.bottom.count}).`)
    }
  })

  return { hasMetric, metric, avg, highest, lowest, count: rows.length, dimStats, bullets }
}

const DetailedInsights = ({ onBack, liveDataset }) => {
  const [fileName, setFileName] = useState('')
  const [columns, setColumns] = useState([])      // [{ name, type }]
  const [rows, setRows] = useState([])            // raw parsed rows (objects)
  const [parseError, setParseError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  // Filter state, keyed by column name:
  //  categorical -> array of selected values ([] = no constraint)
  //  numeric     -> { min, max }
  //  text        -> search substring
  const [filters, setFilters] = useState({})
  const [widgets, setWidgets] = useState([])      // dynamic chart configs
  const [showFilters, setShowFilters] = useState(true)
  const [tablePage, setTablePage] = useState(0)
  const [insightMetric, setInsightMetric] = useState('') // numeric column driving Key Insights
  const [drill, setDrill] = useState(null) // { type:'category'|'range', ... } for the detail modal

  // View mode mirrors Active Tracking: 'internal' shows real names; 'company'
  // anonymizes the chosen identity column so filtered reports can be shared
  // without exposing individual employees.
  const [viewMode, setViewMode] = useState('internal') // 'internal' | 'company'
  const [identityColumn, setIdentityColumn] = useState('') // column whose values get anonymized
  const [exporting, setExporting] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)   // custom-chart configuration pop-up
  // Optional narrative that brackets the PDF: an opening statement up front and
  // closing remarks at the end, both rendered as branded sections.
  const [openingStatement, setOpeningStatement] = useState(DEFAULT_OPENING_STATEMENT)
  const [closingStatement, setClosingStatement] = useState('')
  const [showNarrative, setShowNarrative] = useState(true)
  const [editingOpening, setEditingOpening] = useState(false) // opening statement is frozen until user opts to edit

  const fileInputRef = useRef(null)
  const dashboardRef = useRef(null)

  // Load a set of rows into the dashboard. `order` optionally fixes the column
  // order (header row for Excel; explicit list for the live dataset).
  const loadRows = useCallback((name, rawRows, order) => {
    if (!rawRows || !rawRows.length) {
      setParseError('There is no data to analyze.')
      return
    }
    const names = (order && order.length ? order : Object.keys(rawRows[0]))
      .map(h => String(h).trim()).filter(Boolean)
    // Normalize every row's keys to the trimmed header names. Spreadsheets often
    // carry stray whitespace in a header (e.g. "Score "); without this the
    // trimmed column name ("Score") wouldn't match the raw row key, so the
    // column reads as empty and is silently misclassified as text — dropping the
    // very metric people upload the file to analyze.
    const normRows = rawRows.map(r => {
      const o = {}
      Object.keys(r).forEach(k => { o[String(k).trim()] = r[k] })
      return o
    })
    const cols = names.map(colName => ({ name: colName, type: inferType(normRows, colName) }))
    setFileName(name)
    setColumns(cols)
    setRows(normRows)
    setFilters({})
    setTablePage(0)
    setWidgets(buildDefaultWidgets(cols, normRows))
    setInsightMetric(pickMetric(cols, normRows))
    // Default the identity column to the dataset's "who" (a person-named column
    // such as Full Name, else the most distinct text column) — the same column
    // the per-person score chart groups by, so Company view anonymizes it.
    setIdentityColumn(pickIdentity(cols, normRows))
    setParseError(null)
  }, [])

  // ── File parsing ───────────────────────────────────────────
  const parseWorkbook = useCallback((file) => {
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        const headerOrder = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []
        loadRows(file.name, raw, headerOrder)
      } catch (err) {
        console.error('Excel parse error:', err)
        setParseError('Could not read this file. Please upload a valid .xlsx, .xls or .csv file.')
      }
    }
    reader.onerror = () => setParseError('Failed to read the file.')
    reader.readAsArrayBuffer(file)
  }, [loadRows])

  const loadLiveData = () => {
    if (liveDataset) loadRows(liveDataset.name, liveDataset.rows, liveDataset.columns)
  }

  const handleFiles = (fileList) => {
    const file = fileList && fileList[0]
    if (file) parseWorkbook(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const resetAll = () => {
    setFileName('')
    setColumns([])
    setRows([])
    setFilters({})
    setWidgets([])
    setParseError(null)
    setTablePage(0)
    setViewMode('internal')
    setIdentityColumn('')
    setOpeningStatement(DEFAULT_OPENING_STATEMENT)
    setClosingStatement('')
    setEditingOpening(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const anonymized = viewMode === 'company' && Boolean(identityColumn)

  // ── Anonymization ──────────────────────────────────────────
  // Map each distinct identity value to a sequential "User N" label, ranked by
  // performance (highest average of the first numeric column = User 1). See the
  // ranking detail below. Computed over the full dataset so a value's label
  // stays stable regardless of the active filters.
  const anonMap = useMemo(() => {
    if (!anonymized) return null
    // Rank on the same metric the entity bar chart plots — the primary numeric
    // metric (see pickMetric), averaged and rounded to one decimal exactly as
    // the charts do — rather than the user-selectable focus metric, which can
    // diverge from the chart's measure. Matching the chart's value + rounding
    // (and its stable, first-appearance ordering) makes the per-user chart read
    // User 1, User 2, … in order with no gaps. Falls back to record count when
    // the dataset has no numeric column (the chart ranks by count in that case too).
    const rankMetric = pickMetric(columns, rows)
    const groups = {}
    rows.forEach(r => {
      const k = (String(r[identityColumn] ?? '').trim()) || '—'
      if (!groups[k]) groups[k] = { total: 0, nums: 0, count: 0 }
      groups[k].count += 1
      if (rankMetric) {
        const n = toNumber(r[rankMetric])
        if (n !== null) { groups[k].total += n; groups[k].nums += 1 }
      }
    })
    const ranked = Object.entries(groups)
      .map(([name, g]) => ({ name, rank: g.nums ? round1(g.total / g.nums) : g.count }))
      .sort((a, b) => b.rank - a.rank)
    const map = {}
    ranked.forEach((e, i) => { map[e.name] = `User ${i + 1}` })
    return map
  }, [anonymized, rows, identityColumn, columns])

  // Rows as seen by every downstream consumer (filters, charts, table, export).
  // In Company view the identity column is swapped for its anonymous label so
  // the anonymization propagates everywhere automatically.
  const displayRows = useMemo(() => {
    if (!anonMap) return rows
    return rows.map(r => ({
      ...r,
      [identityColumn]: anonMap[(String(r[identityColumn] ?? '').trim()) || '—'] || 'User'
    }))
  }, [rows, anonMap, identityColumn])

  // ── Distinct values & numeric bounds per column ────────────
  const columnMeta = useMemo(() => {
    const meta = {}
    columns.forEach(({ name, type }) => {
      if (type === 'categorical') {
        const distinct = [...new Set(displayRows.map(r => String(r[name] ?? '')).filter(v => v !== ''))]
          .sort((a, b) => a.localeCompare(b))
        meta[name] = { distinct }
      } else if (type === 'numeric') {
        const nums = displayRows.map(r => toNumber(r[name])).filter(n => n !== null)
        meta[name] = nums.length
          ? { min: Math.min(...nums), max: Math.max(...nums) }
          : { min: 0, max: 0 }
      }
    })
    return meta
  }, [columns, displayRows])

  // ── Apply filters ──────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return displayRows.filter(row => {
      for (const { name, type } of columns) {
        const f = filters[name]
        if (f == null) continue
        if (type === 'categorical') {
          if (f.length && !f.includes(String(row[name] ?? ''))) return false
        } else if (type === 'numeric') {
          const n = toNumber(row[name])
          if (f.min != null && (n == null || n < f.min)) return false
          if (f.max != null && (n == null || n > f.max)) return false
        } else if (type === 'date') {
          const t = parseDate(row[name])
          if (f.from && (t == null || t < Date.parse(`${f.from}T00:00:00`))) return false
          if (f.to && (t == null || t > Date.parse(`${f.to}T23:59:59`))) return false
        } else {
          if (f && !String(row[name] ?? '').toLowerCase().includes(f.toLowerCase())) return false
        }
      }
      return true
    })
  }, [displayRows, columns, filters])

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([, v]) => {
      if (Array.isArray(v)) return v.length > 0
      if (v && typeof v === 'object') return v.min != null || v.max != null || v.from || v.to
      return Boolean(v)
    }).length
  }, [filters])

  // ── Filter setters ─────────────────────────────────────────
  const toggleCategorical = (col, value) => {
    setTablePage(0)
    setFilters(prev => {
      const cur = prev[col] || []
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      return { ...prev, [col]: next }
    })
  }
  const setNumericFilter = (col, key, value) => {
    setTablePage(0)
    setFilters(prev => ({
      ...prev,
      [col]: { ...(prev[col] || {}), [key]: value === '' ? null : Number(value) }
    }))
  }
  const setTextFilter = (col, value) => {
    setTablePage(0)
    setFilters(prev => ({ ...prev, [col]: value }))
  }
  const setDateFilter = (col, key, value) => {
    setTablePage(0)
    setFilters(prev => ({ ...prev, [col]: { ...(prev[col] || {}), [key]: value || null } }))
  }
  const clearFilters = () => { setFilters({}); setTablePage(0) }

  // Drop any filter on the identity column — its values differ between modes,
  // so a stored selection wouldn't match. Also clear the open drill-down.
  const dropIdentityState = () => {
    setDrill(null)
    setTablePage(0)
    setFilters(prev => {
      if (prev[identityColumn] == null) return prev
      const next = { ...prev }
      delete next[identityColumn]
      return next
    })
  }
  const switchViewMode = (mode) => {
    if (mode === viewMode) return
    dropIdentityState()
    setViewMode(mode)
  }
  const changeIdentityColumn = (col) => {
    if (col === identityColumn) return
    setDrill(null)
    setTablePage(0)
    // Both the previously-anonymized column (now reverting to real names) and
    // the newly-anonymized one change their values, so any filter on either
    // would no longer match — drop them to avoid silently emptying the view.
    setFilters(prev => {
      if (prev[identityColumn] == null && prev[col] == null) return prev
      const next = { ...prev }
      delete next[identityColumn]
      delete next[col]
      return next
    })
    setIdentityColumn(col)
  }

  // ── Dynamic widgets ────────────────────────────────────────
  const categoricalCols = useMemo(() => columns.filter(c => c.type === 'categorical'), [columns])
  const numericCols = useMemo(() => columns.filter(c => c.type === 'numeric'), [columns])
  
  // Filter sidebar columns: hide excessive category level filters (e.g. packet level headers ending with " Level" except main "Level")
  const displayFilterColumns = useMemo(() => {
    return columns.filter(c => {
      if (c.type === 'numeric') return false;
      if (c.name.endsWith(' Level') && c.name !== 'Level') return false;
      return true;
    });
  }, [columns])
  // Anything that isn't a measure can be a grouping dimension (high-cardinality
  // columns like names stay usable thanks to the Top-N control on each chart).
  const dimensionCols = useMemo(() => columns.filter(c => c.type !== 'numeric'), [columns])
  // Columns eligible to act as the identity to anonymize (names live in
  // categorical/text columns, never numeric measures or dates).
  const identityCols = useMemo(() => columns.filter(c => c.type === 'categorical' || c.type === 'text'), [columns])

  // Each numeric column named like a "Score" is a separate assessment. When the
  // sheet has no literal Score column we fall back to every numeric measure so
  // the Smart-charts pack still works on generic data.
  const scoreCols = useMemo(() => {
    const named = numericCols.filter(c => SCORE_NAME_RE.test(c.name))
    return (named.length ? named : numericCols).map(c => c.name)
  }, [numericCols])

  // Add a fully-configured chart from the builder pop-up.
  const createWidget = (cfg) => {
    setWidgets(prev => [...prev, { id: `w_${Date.now()}_${prev.length}`, ...cfg }])
    setBuilderOpen(false)
  }
  const updateWidget = (id, patch) =>
    setWidgets(prev => prev.map(w => (w.id === id ? { ...w, ...patch } : w)))
  const removeWidget = (id) => setWidgets(prev => prev.filter(w => w.id !== id))

  // One-click "smart pack": treat every Score column as a separate assessment,
  // then build (a) an individual report for each assessment and (b) comparative
  // reports across all of them. Each generated chart carries an executive
  // explanation (metrics / business value / insights / interpretation).
  const addSmartCharts = () => {
    const scores = scoreCols
    if (!scores.length) return

    // A low-cardinality category makes the best grouping axis (e.g. Department).
    const grpCandidates = categoricalCols
      .map(c => ({ name: c.name, card: distinctCount(filteredRows, c.name) }))
      .filter(c => c.card >= 2 && c.card <= 15)
      .sort((a, b) => a.card - b.card)
    // Prefer name-matched HR dimensions, else the smallest usable category.
    const deptDim = dimensionCols.find(c => DEPT_RE.test(c.name))?.name || grpCandidates[0]?.name || categoricalCols[0]?.name
    const desigDim = dimensionCols.find(c => DESIG_RE.test(c.name) && c.name !== deptDim)?.name
    const expCol = numericCols.find(c => EXP_RE.test(c.name) && !scores.includes(c.name))?.name
    const dateCol = columns.find(c => c.type === 'date')?.name
    const entity = pickIdentity(columns, rows)

    const base = Date.now()
    let i = 0
    const make = (cfg) => ({ id: `w_${base}_${i++}`, agg: 'avg', topN: 10, ...cfg })
    const pack = []

    // Participation concentration — how respondents spread across the org. One
    // chart (count-based), since it contextualizes every assessment's averages.
    if (deptDim) pack.push(make({ type: 'pareto', dimension: deptDim, measure: 'count' }))

    // ── (a) Individual assessment report — one block per Score column ──
    scores.forEach(metric => {
      if (deptDim) pack.push(make({ type: 'combo', dimension: deptDim, measure: metric }))        // Dept performance: responses + avg
      if (deptDim) pack.push(make({ type: 'range', dimension: deptDim, measure: metric }))        // Avg trustworthiness: spread + n per dept
      pack.push(make({ type: 'histogram', measure: metric }))                                      // Score distribution
      pack.push(make({ type: 'bands', measure: metric }))                                          // Employees within score bands
      if (entity) {
        pack.push(make({ type: 'hbar', dimension: entity, measure: metric, order: 'desc' }))       // Top performers
        pack.push(make({ type: 'hbar', dimension: entity, measure: metric, order: 'asc' }))        // Low performers
      }
      if (expCol) pack.push(make({ type: 'scatterline', xMeasure: expCol, yMeasure: metric }))     // Experience vs Score (points + trend)
      if (desigDim) pack.push(make({ type: 'hbar', dimension: desigDim, measure: metric, agg: 'avg' })) // Designation vs Score
      if (dateCol) pack.push(make({ type: 'progression', dimension: dateCol, measure: metric }))   // Progression over time (points + trend)
      if (deptDim) pack.push(make({ type: 'riskmatrix', dimension: deptDim, measure: metric }))    // Risk: low score × large headcount
    })

    // Mean + spread of the primary assessment — average per group with the
    // individual scores behind it, so a strong average hiding wide variation shows.
    if (deptDim) pack.push(make({ type: 'meanspread', dimension: deptDim, measure: scores[0] }))

    // A treemap of the primary assessment — headcount sizing + score color in
    // one tile per group (complements the combo's responses-vs-average read).
    if (deptDim) pack.push(make({ type: 'treemap', dimension: deptDim, measure: scores[0] }))

    // ── (b) Comparative reports — only meaningful with 2+ assessments ──
    if (scores.length >= 2) {
      if (deptDim) pack.push(make({ type: 'grouped', dimension: deptDim, scores }))                // Dept comparison across all assessments
      if (deptDim) pack.push(make({ type: 'heatmap', dimension: deptDim, scores }))                // Group × assessment capability map
      pack.push(make({ type: 'correlation', scores }))                                             // Assessment correlation matrix
      pack.push(make({ type: 'radar', scores }))                                                   // Strength / weakness radar
      pack.push(make({ type: 'quadrant', xMeasure: scores[0], yMeasure: scores[1] }))              // Talent matrix on the first two assessments
      // Pairwise scatters for the first few assessment pairs (EQ vs Technical, …)
      let pairs = 0
      for (let a = 0; a < scores.length && pairs < 3; a++) {
        for (let b = a + 1; b < scores.length && pairs < 3; b++) {
          pack.push(make({ type: 'scatter', xMeasure: scores[a], yMeasure: scores[b] }))
          pairs++
        }
      }
    }

    // Generating the report replaces the working set so it reads top-to-bottom
    // as a structured deliverable rather than appending to ad-hoc charts.
    if (pack.length) setWidgets(pack)
  }

  // ── Auto-generated insights ────────────────────────────────
  const insights = useMemo(
    () => computeInsights(filteredRows, insightMetric, categoricalCols),
    [filteredRows, insightMetric, categoricalCols]
  )

  // ── Drill-down detail (click a bar / pie slice) ────────────
  const drillResult = useMemo(() => {
    if (!drill) return null
    let selected, title
    if (drill.type === 'range') {
      selected = filteredRows.filter(r => {
        const n = toNumber(r[drill.column])
        return n !== null && n >= drill.lo && n <= drill.hi
      })
      title = `${drill.column}: ${drill.label}`
    } else {
      selected = filteredRows.filter(r => (String(r[drill.column] ?? '').trim() || '—') === String(drill.value))
      title = String(drill.value)
    }
    let stats = null
    if (insightMetric) {
      const nums = selected.map(r => toNumber(r[insightMetric])).filter(n => n !== null)
      if (nums.length) {
        stats = {
          metric: insightMetric,
          avg: round1(nums.reduce((s, n) => s + n, 0) / nums.length),
          high: round1(Math.max(...nums)),
          low: round1(Math.min(...nums))
        }
      }
    }
    return { title, column: drill.column, rows: selected, stats }
  }, [drill, filteredRows, insightMetric])

  // Filter out any columns that are completely empty across all filtered rows
  const activeColumns = useMemo(() => {
    if (!filteredRows || !filteredRows.length) return columns;
    return columns.filter(c =>
      filteredRows.some(r => isNonBlankValue(r[c.name], c.type))
    );
  }, [columns, filteredRows]);

  const activeNumericCols = useMemo(() => activeColumns.filter(c => c.type === 'numeric'), [activeColumns]);
  const activeDimensionCols = useMemo(() => activeColumns.filter(c => c.type !== 'numeric'), [activeColumns]);

  // Active non-empty columns for the drilled records modal table
  const drillVisibleColumns = useMemo(() => {
    if (!drillResult || !drillResult.rows || !drillResult.rows.length) return activeColumns;
    return activeColumns.filter(c =>
      drillResult.rows.some(r => isNonBlankValue(r[c.name], c.type))
    );
  }, [activeColumns, drillResult]);

  // ── KPI summary ────────────────────────────────────────────
  const summary = useMemo(() => ({
    total: displayRows.length,
    filtered: filteredRows.length,
    columns: columns.length,
    dimensions: categoricalCols.length,
    metrics: numericCols.length
  }), [displayRows, filteredRows, columns, categoricalCols, numericCols])

  const hasData = rows.length > 0

  // ── Exports ────────────────────────────────────────────────
  const reportName = (fileName || 'detailed-insights').replace(/\.[^.]+$/, '')
  const fileStamp = () => new Date().toISOString().split('T')[0]

  // Export the filtered, view-aware dataset as a flat CSV.
  const exportCSV = () => {
    const headers = activeColumns.map(c => c.name)
    const body = filteredRows.map(r => headers.map(h => r[h]))
    const csv = [headers, ...body].map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${reportName}-${anonymized ? 'company' : 'internal'}-${fileStamp()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const headers = activeColumns.map(c => c.name)
    const body = filteredRows.map(r => headers.map(h => r[h]))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    ws['!cols'] = headers.map((colName) => {
      const maxLen = Math.max(
        colName.length,
        ...filteredRows.map(r => String(r[colName] ?? '').length)
      );
      return { wch: Math.min(40, Math.max(10, maxLen + 3)) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Filtered Data');
    XLSX.writeFile(wb, `${reportName}-${anonymized ? 'company' : 'internal'}-${fileStamp()}.xlsm`, { bookType: 'xlsm' });
  }

  // Build a branded multi-page PDF of the dashboards, formatted to match the
  // Active Tracking report (cover → executive summary → key insights → charts).
  const exportPDF = async () => {
    if (!dashboardRef.current) return
    setExporting(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 14
      const contentW = pageW - margin * 2

      const HEADER_H = 28
      const FOOTER_H = 14
      const contentTop = HEADER_H + 8
      const contentBottom = pageH - FOOTER_H - 2

      const viewLabel = anonymized ? 'Company View' : 'Internal View'
      const generatedAt = new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
      const logo = await loadImage('/happimynd_logo.png')
      const logoAspect = logo && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 4

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

        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(0, 0, pageW, 4, 'F')
        if (logo) {
          const h = 28
          const w = h * logoAspect
          pdf.addImage(logo, 'PNG', (pageW - w) / 2, 50, w, h)
        }
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(...PDF_BRAND)
        pdf.text('DETAILED INSIGHTS REPORT', pageW / 2, 96, { align: 'center' })

        pdf.setFontSize(30)
        pdf.setTextColor(...PDF_INK)
        pdf.text(fitText(reportName, contentW), pageW / 2, 112, { align: 'center' })

        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(pageW / 2 - 16, 118, 32, 1.2, 'F')

        const boxW = 130
        const boxX = (pageW - boxW) / 2
        const boxY = 134
        const metaRows = [
          ['View', viewLabel],
          ['Records', `${summary.filtered} of ${summary.total}`],
          ['Active filters', String(activeFilterCount)],
          ['Generated', generatedAt]
        ]
        const rowH = 11
        const boxH = metaRows.length * rowH + 8
        pdf.setFillColor(255, 255, 255)
        pdf.setDrawColor(...PDF_HAIRLINE)
        pdf.setLineWidth(0.3)
        pdf.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'FD')
        metaRows.forEach(([label, value], i) => {
          const ry = boxY + 8 + i * rowH
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(8.5)
          pdf.setTextColor(...PDF_MUTED)
          pdf.text(label.toUpperCase(), boxX + 8, ry)
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(10)
          pdf.setTextColor(...PDF_INK)
          pdf.text(fitText(value, boxW - 52), boxX + 44, ry)
        })

        if (anonymized) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(9)
          pdf.setTextColor(...PDF_BRAND)
          pdf.text(
            `Identities in “${identityColumn}” have been anonymized in this report.`,
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
        pdf.text(`Detailed Insights · ${fitText(reportName, 70)}`, pageW - margin, 16, { align: 'right' })
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

      // Render a free-text narrative section inside a branded white card,
      // splitting across pages when the text is long. Returns the new cursorY.
      const drawNarrative = (title, text, startY) => {
        let y = startY
        const paras = String(text).split(/\n{1,}/).map(s => s.trim()).filter(Boolean)
        const lineH = 5
        const padX = 6
        const padY = 6

        if (y + 20 > contentBottom) { newPage(); y = contentTop }
        y = drawSectionTitle(title, '', y) + 2

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)

        for (const para of paras) {
          const wrapped = pdf.splitTextToSize(para, contentW - padX * 2)
          // Page-break before a paragraph that wouldn't fit at all.
          if (y + padY + lineH > contentBottom) { newPage(); y = contentTop }

          // Draw the paragraph line by line so a long block can flow onto the
          // next page while keeping the lavender-on-white card look on each page.
          let i = 0
          while (i < wrapped.length) {
            const remaining = contentBottom - y - padY
            const linesThatFit = Math.max(1, Math.floor(remaining / lineH))
            const slice = wrapped.slice(i, i + linesThatFit)
            const boxH = slice.length * lineH + padY * 2
            pdf.setFillColor(255, 255, 255)
            pdf.setDrawColor(...PDF_HAIRLINE)
            pdf.setLineWidth(0.3)
            pdf.roundedRect(margin, y, contentW, boxH, 2.5, 2.5, 'FD')
            pdf.setFillColor(...PDF_BRAND)
            pdf.rect(margin, y + 3, 1.4, boxH - 6, 'F')
            pdf.setTextColor(...PDF_INK)
            pdf.text(slice, margin + padX, y + padY + 3.5)
            y += boxH + 4
            i += slice.length
            if (i < wrapped.length) { newPage(); y = contentTop }
          }
        }
        return y
      }

      // ── Cover ──
      drawCover()

      // ── 2b. Opening statement (optional, branded) ──────────
      if (openingStatement.trim()) {
        newPage()
        drawNarrative('Opening Statement', openingStatement, contentTop)
      }

      // ── 3. Executive summary (native vector) ───────────────
      newPage()
      let cursorY = drawSectionTitle('Executive Summary', '', contentTop) + 4

      const tiles = insights && insights.hasMetric
        ? [
            { value: String(insights.avg), label: `Avg ${insights.metric}` },
            { value: String(insights.highest), label: 'Highest' },
            { value: String(insights.lowest), label: 'Lowest' },
            { value: String(summary.filtered), label: 'Records' }
          ]
        : [
            { value: String(summary.filtered), label: 'Rows Shown' },
            { value: String(summary.total), label: 'Total Rows' },
            { value: String(summary.dimensions), label: 'Dimensions' },
            { value: String(summary.metrics), label: 'Metrics' }
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
        pdf.setFillColor(...PDF_BRAND)
        pdf.rect(x, cursorY + 3, 1.4, tileH - 6, 'F')
        const tx = x + 6
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(18)
        pdf.setTextColor(...PDF_BRAND)
        pdf.text(fitText(t.value, tileW - 9), tx, cursorY + 13)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(...PDF_MUTED)
        pdf.text(fitText(t.label, tileW - 9), tx, cursorY + 18.5)
      })
      cursorY += tileH + 10

      // Key insights (reuse the on-screen narrative bullets)
      if (insights && insights.bullets.length) {
        cursorY = drawSectionTitle('Key Insights', '', cursorY) + 3
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9.5)
        insights.bullets.forEach((line) => {
          pdf.setFillColor(...PDF_BRAND)
          pdf.circle(margin + 1.4, cursorY - 1.1, 1, 'F')
          pdf.setTextColor(...PDF_INK)
          const wrapped = pdf.splitTextToSize(line, contentW - 7)
          pdf.text(wrapped, margin + 6, cursorY)
          cursorY += wrapped.length * 5 + 2.5
        })
      }

      // ── 4. Chart sections ──────────────────────────────────
      const cards = [...dashboardRef.current.querySelectorAll('.di-chart-card')]
      for (const card of cards) {
        const titleEl = card.querySelector('.di-chart-card__title')
        const title = titleEl ? titleEl.textContent.trim() : 'Chart'

        const chartEl = card.querySelector('.recharts-responsive-container')
        if (!chartEl) continue
        const scroll = card.querySelector('.di-chart-scroll')
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

        const titleBlockH = 9
        let drawW = contentW
        let drawH = (canvas.height * drawW) / canvas.width
        const maxImgH = contentBottom - contentTop - titleBlockH
        if (drawH > maxImgH) {
          drawH = maxImgH
          drawW = (canvas.width * drawH) / canvas.height
        }

        if (cursorY + titleBlockH + drawH > contentBottom) {
          newPage()
          cursorY = contentTop
        } else {
          cursorY += 6
        }

        cursorY = drawSectionTitle(title, '', cursorY)
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

      // ── 4b. Closing remarks (optional, branded) ────────────
      if (closingStatement.trim()) {
        cursorY = drawNarrative('Closing Remarks', closingStatement, cursorY + 8)
      }

      // ── 5. Stamp header/footer (cover keeps its own band) ──
      const total = pdf.getNumberOfPages()
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i)
        if (i > 1) drawHeader()
        drawFooter(i, total)
      }

      pdf.save(`${reportName}-${anonymized ? 'company' : 'internal'}-${fileStamp()}.pdf`)
    } catch (e) {
      console.error('PDF export failed:', e)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="di">
      {/* Header */}
      <div className="di-header">
        <button className="di-back" onClick={onBack} aria-label="Back to Active Tracking">
          <ArrowBackIcon />
        </button>
        <div className="di-header__icon"><InsightsIcon /></div>
        <div className="di-header__text">
          <h1>Detailed Insights</h1>
          <p>Upload an employee spreadsheet, filter by its attributes, and build dynamic dashboards</p>
        </div>
        {hasData && (
          <button className="btn btn--outline di-header__reset" onClick={resetAll}>
            <RestartAltIcon className="btn-icon" /> New file
          </button>
        )}
      </div>

      {!hasData ? (
        /* ── Upload zone ── */
        <>
          <div
            className={`di-dropzone ${dragOver ? 'is-dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          >
            <UploadFileIcon />
            <h3>Drop an Excel file here, or click to browse</h3>
            <p>Supports .xlsx, .xls and .csv — the first row should contain column headers</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {liveDataset && liveDataset.rows.length > 0 && (
            <div className="di-or">
              <span>or</span>
            </div>
          )}
          {liveDataset && liveDataset.rows.length > 0 && (
            <button className="di-livecard" onClick={loadLiveData}>
              <div className="di-livecard__icon"><StorageIcon /></div>
              <div className="di-livecard__text">
                <h3>Use current tracking data</h3>
                <p>Analyze the {liveDataset.rows.length} quiz {liveDataset.rows.length === 1 ? 'attempt' : 'attempts'} already in Active Tracking — no file needed</p>
              </div>
            </button>
          )}

          {parseError && <div className="di-alert">{parseError}</div>}
        </>
      ) : (
        <>
          {parseError && <div className="di-alert">{parseError}</div>}

          {/* File / KPI bar */}
          <div className="di-meta">
            <div className="di-meta__file">
              <TableChartIcon />
              <span>{fileName}</span>
            </div>
            <div className="di-kpis">
              <div className="di-kpi"><span className="di-kpi__value">{summary.filtered}</span><span className="di-kpi__label">Rows shown</span></div>
              <div className="di-kpi"><span className="di-kpi__value">{summary.total}</span><span className="di-kpi__label">Total rows</span></div>
              <div className="di-kpi"><span className="di-kpi__value">{summary.columns}</span><span className="di-kpi__label">Attributes</span></div>
              <div className="di-kpi"><span className="di-kpi__value">{summary.dimensions}</span><span className="di-kpi__label">Dimensions</span></div>
              <div className="di-kpi"><span className="di-kpi__value">{summary.metrics}</span><span className="di-kpi__label">Metrics</span></div>
            </div>
          </div>

          {/* View mode — anonymize identities for shareable company reports */}
          <div className="di-viewbar">
            <div className="di-viewbar__group">
              <label className="di-viewbar__label">View</label>
              <div className="di-viewtoggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`di-viewtoggle__btn ${viewMode === 'internal' ? 'is-active' : ''}`}
                  onClick={() => switchViewMode('internal')}
                  title="Show real identities — for internal use"
                >
                  <VisibilityIcon /> Internal
                </button>
                <button
                  type="button"
                  className={`di-viewtoggle__btn ${viewMode === 'company' ? 'is-active' : ''}`}
                  onClick={() => switchViewMode('company')}
                  disabled={identityCols.length === 0}
                  title={identityCols.length ? 'Anonymize identities — for company sharing' : 'No text column available to anonymize'}
                >
                  <VisibilityOffIcon /> Company
                </button>
              </div>
            </div>

            {viewMode === 'company' && identityCols.length > 0 && (
              <div className="di-viewbar__group">
                <label className="di-viewbar__label" htmlFor="di-identity-select">Anonymize</label>
                <select
                  id="di-identity-select"
                  className="di-select"
                  value={identityColumn}
                  onChange={(e) => changeIdentityColumn(e.target.value)}
                >
                  {identityCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div className="di-viewbar__group di-viewbar__group--end">
              <button className="btn btn--outline" onClick={exportCSV} disabled={summary.filtered === 0}>
                <TableChartIcon className="btn-icon" /> CSV
              </button>
              <button className="btn btn--outline" onClick={exportExcel} disabled={summary.filtered === 0}>
                <TableChartIcon className="btn-icon" /> Excel
              </button>
              <button className="btn btn--primary" onClick={exportPDF} disabled={summary.filtered === 0 || exporting}>
                <PictureAsPdfIcon className="btn-icon" /> {exporting ? 'Exporting…' : 'PDF'}
              </button>
            </div>
          </div>

          {anonymized && (
            <div className="di-privacy-banner">
              <VisibilityOffIcon />
              <span>
                <strong>Company View</strong> — values in <strong>{identityColumn}</strong> are
                replaced with “User 1, User 2, …” (ranked by {insightMetric ? `average ${insightMetric}` : 'record count'})
                across every chart, table and export.
              </span>
            </div>
          )}

          {/* Report narrative — opening & closing text rendered into the PDF */}
          <div className="di-panel">
            <div className="di-panel__head">
              <h2><PictureAsPdfIcon /> Report narrative <span className="di-hint">PDF only</span></h2>
              <button className="di-link" onClick={() => setShowNarrative(s => !s)}>
                {showNarrative ? 'Hide' : 'Show'}
              </button>
            </div>
            {showNarrative && (
              <div className="di-narrative">
                <div className="di-narrative__field">
                  <label htmlFor="di-opening">Opening statement</label>
                  <textarea
                    id="di-opening"
                    className="di-textarea"
                    rows={3}
                    placeholder="Intro shown at the start of the PDF — e.g. purpose of this assessment review, period covered, audience…"
                    value={openingStatement}
                    onChange={(e) => setOpeningStatement(e.target.value)}
                    readOnly={!editingOpening}
                    aria-readonly={!editingOpening}
                  />
                  <div className="di-narrative__actions">
                    <button
                      type="button"
                      className="di-link"
                      onClick={() => setEditingOpening(v => !v)}
                    >
                      {editingOpening ? 'Done' : 'Edit'}
                    </button>
                  </div>
                </div>
                <div className="di-narrative__field">
                  <label htmlFor="di-closing">Closing remarks</label>
                  <textarea
                    id="di-closing"
                    className="di-textarea"
                    rows={3}
                    placeholder="Wrap-up shown at the end of the PDF — e.g. recommended next steps, owners, review date…"
                    value={closingStatement}
                    onChange={(e) => setClosingStatement(e.target.value)}
                  />
                </div>
                <p className="di-narrative__note">
                  These appear only in the exported PDF — the opening as the first section after the cover, the closing remarks at the very end. The opening statement is pre-filled by default; edit it as needed or leave blank to omit.
                </p>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="di-panel">
            <div className="di-panel__head">
              <h2><FilterAltIcon /> Filters {activeFilterCount > 0 && <span className="di-badge">{activeFilterCount}</span>}</h2>
              <div className="di-panel__actions">
                {activeFilterCount > 0 && (
                  <button className="di-link" onClick={clearFilters}>Clear all</button>
                )}
                <button className="di-link" onClick={() => setShowFilters(s => !s)}>
                  {showFilters ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="di-filters">
                {displayFilterColumns.map(({ name, type }) => (
                  <div key={name} className="di-filter">
                    <div className="di-filter__label">
                      {name} <span className="di-filter__type">{type}</span>
                    </div>

                    {type === 'categorical' && (
                      <div className="di-chips">
                        {columnMeta[name]?.distinct.map(val => {
                          const active = (filters[name] || []).includes(val)
                          return (
                            <button
                              key={val}
                              className={`di-chip ${active ? 'is-active' : ''}`}
                              onClick={() => toggleCategorical(name, val)}
                            >
                              {val}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {type === 'date' && (
                      <div className="di-range">
                        <input
                          type="date"
                          className="di-input"
                          value={filters[name]?.from || ''}
                          max={filters[name]?.to || undefined}
                          onChange={(e) => setDateFilter(name, 'from', e.target.value)}
                        />
                        <span className="di-range__sep">–</span>
                        <input
                          type="date"
                          className="di-input"
                          value={filters[name]?.to || ''}
                          min={filters[name]?.from || undefined}
                          onChange={(e) => setDateFilter(name, 'to', e.target.value)}
                        />
                      </div>
                    )}

                    {type === 'text' && (
                      <input
                        type="text"
                        className="di-input di-input--full"
                        placeholder={`Search ${name}…`}
                        value={filters[name] || ''}
                        onChange={(e) => setTextFilter(name, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key insights */}
          {insights && (
            <div className="di-panel">
              <div className="di-panel__head">
                <h2><LightbulbIcon /> Key Insights</h2>
                {numericCols.length > 0 && (
                  <div className="di-metric-pick">
                    <label>Focus metric</label>
                    <select className="di-select" value={insightMetric} onChange={(e) => setInsightMetric(e.target.value)}>
                      {numericCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {insights.hasMetric && (
                <div className="di-highlights">
                  <div className="di-highlight">
                    <div className="di-highlight__icon"><InsightsIcon /></div>
                    <div>
                      <div className="di-highlight__value">{insights.avg}</div>
                      <div className="di-highlight__label">Average {insights.metric}</div>
                    </div>
                  </div>
                  <div className="di-highlight">
                    <div className="di-highlight__icon di-highlight__icon--up"><TrendingUpIcon /></div>
                    <div>
                      <div className="di-highlight__value">{insights.highest}</div>
                      <div className="di-highlight__label">Highest</div>
                    </div>
                  </div>
                  <div className="di-highlight">
                    <div className="di-highlight__icon di-highlight__icon--down"><TrendingDownIcon /></div>
                    <div>
                      <div className="di-highlight__value">{insights.lowest}</div>
                      <div className="di-highlight__label">Lowest</div>
                    </div>
                  </div>
                  {insights.dimStats[0] && (
                    <div className="di-highlight">
                      <div className="di-highlight__icon di-highlight__icon--gold"><EmojiEventsIcon /></div>
                      <div>
                        <div className="di-highlight__value di-highlight__value--sm">{insights.dimStats[0].top.name}</div>
                        <div className="di-highlight__label">Top {insights.dimStats[0].dim} ({insights.dimStats[0].top.value})</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <ul className="di-bullets">
                {insights.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}

          {/* Dynamic dashboard */}
          <div className="di-panel" ref={dashboardRef}>
            <div className="di-panel__head">
              <h2><InsightsIcon /> Dashboards</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn--primary" onClick={addSmartCharts} title="Detect every Score column as a quiz and build per-quiz + comparative reports with executive commentary">
                  <InsightsIcon className="btn-icon" /> Smart charts
                </button>
                <button className="btn btn--outline" onClick={() => setBuilderOpen(true)} title="Build your own chart — pick the type, fields, scale, order and color">
                  <AddChartIcon className="btn-icon" /> Custom chart
                </button>
              </div>
            </div>

            {widgets.length === 0 ? (
              <div className="di-empty-charts">No charts yet — click “Add chart” to build one.</div>
            ) : (
              <div className="di-charts">
                {widgets.map(w => (
                  <ChartWidget
                    key={w.id}
                    widget={w}
                    rows={filteredRows}
                    columns={activeColumns}
                    dimensionCols={activeDimensionCols}
                    numericCols={activeNumericCols}
                    identityColumn={identityColumn}
                    onUpdate={updateWidget}
                    onRemove={removeWidget}
                    onDrill={setDrill}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Data table */}
          <DataTable
            columns={columns}
            rows={filteredRows}
            fileName={fileName}
            anonymized={anonymized}
            page={tablePage}
            onPage={setTablePage}
          />
        </>
      )}

      {/* Drill-down detail modal */}
      {drillResult && (
        <div className="di-modal-overlay" onClick={() => setDrill(null)}>
          <div className="di-modal" onClick={(e) => e.stopPropagation()}>
            <div className="di-modal__head">
              <div>
                <h2 className="di-modal__title">{drillResult.title}</h2>
                <p className="di-modal__subtitle">
                  {drillResult.column} · {drillResult.rows.length} record{drillResult.rows.length === 1 ? '' : 's'}
                </p>
              </div>
              <button className="di-chart-card__remove" onClick={() => setDrill(null)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            {drillResult.stats && (
              <div className="di-modal__stats">
                <div className="di-modal__stat"><div className="di-modal__stat-value">{drillResult.stats.avg}</div><div className="di-modal__stat-label">Avg {drillResult.stats.metric}</div></div>
                <div className="di-modal__stat"><div className="di-modal__stat-value">{drillResult.stats.high}</div><div className="di-modal__stat-label">Highest</div></div>
                <div className="di-modal__stat"><div className="di-modal__stat-value">{drillResult.stats.low}</div><div className="di-modal__stat-label">Lowest</div></div>
                <div className="di-modal__stat"><div className="di-modal__stat-value">{drillResult.rows.length}</div><div className="di-modal__stat-label">Records</div></div>
              </div>
            )}

            {drillResult.rows.length === 0 ? (
              <div className="di-empty-charts">No matching records.</div>
            ) : (
              <div className="di-table-wrap di-modal__table">
                <table className="di-table">
                  <thead>
                    <tr>{drillVisibleColumns.map(c => <th key={c.name}>{c.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {drillResult.rows.map((r, i) => (
                      <tr key={i}>
                        {drillVisibleColumns.map(c => <td key={c.name}>{String(r[c.name] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom-chart builder pop-up */}
      {builderOpen && (
        <ChartBuilderModal
          columns={columns}
          dimensionCols={dimensionCols}
          numericCols={numericCols}
          categoricalCols={categoricalCols}
          scoreCols={scoreCols}
          onCreate={createWidget}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </div>
  )
}

// Build an insightful starter dashboard modeled on the Active Tracking views:
//  • a ranked horizontal bar of every person by their score
//  • a Performance Distribution band chart (Excellent / Good / Needs Improvement)
//  • a score-spread histogram
//  • a headcount breakdown + average-score bar for the smallest category
//  • a headcount bar for a team-like category
//  • a trend-over-time line when a date column exists
//  • an average-by-category bar for the remaining dimensions (dept, zone, …)
function buildDefaultWidgets(cols, rows) {
  const metric = pickMetric(cols, rows)
  const dateCol = cols.find(c => c.type === 'date')?.name
  const dims = cols
    .filter(c => c.type === 'categorical' || c.type === 'text')
    .map(c => ({ name: c.name, card: distinctCount(rows, c.name) }))
    .filter(c => c.card >= 2)
    .sort((a, b) => a.card - b.card) // ascending: small categories first

  const entity = pickIdentity(cols, rows) // person-named column, else most distinct → the "who"
  const bandCat = dims.find(d => d.card <= 8)?.name // small set → good pie (e.g. gender / level)
  // A team-like category (a handful of groups, not the tiny pie set or the
  // per-person entity) to show org composition by headcount.
  const headcountCat = dims.find(d => d.card >= 3 && d.card <= 12 && d.name !== bandCat && d.name !== entity)?.name

  const widgets = []
  let i = 0
  const used = new Set()
  const add = (w) => widgets.push({ id: `w_default_${i++}`, topN: 15, measure: 'count', agg: 'count', ...w })

  // 1. Ranked entity bar — every person by their score
  if (entity) {
    used.add(entity)
    add(metric
      ? { type: 'hbar', dimension: entity, measure: metric, agg: 'avg' }
      : { type: 'hbar', dimension: entity })
  }
  // 2. Performance distribution — score split into Excellent / Good / Needs Improvement
  if (metric) add({ type: 'bands', measure: metric, agg: 'avg' })
  // 3. Score distribution histogram — the fine-grained spread
  if (metric) add({ type: 'histogram', measure: metric, agg: 'avg' })
  // 4 & 5. Smallest category as both a headcount pie and an average-score bar
  //        (e.g. Gender Breakdown + Average Score by Gender for an equity read).
  if (bandCat) {
    used.add(bandCat)
    add({ type: 'pie', dimension: bandCat })
    if (metric) add({ type: 'bar', dimension: bandCat, measure: metric, agg: 'avg' })
  }
  // 6. Headcount by a team-like category — org composition
  if (headcountCat) add({ type: 'bar', dimension: headcountCat, measure: 'count' })
  // 7. Trend over time — when there is a date column
  if (dateCol) {
    add(metric
      ? { type: 'line', dimension: dateCol, measure: metric, agg: 'avg' }
      : { type: 'line', dimension: dateCol })
  }
  // 8. Average-by-category for every remaining dimension (dept, zone, location, …)
  dims
    .filter(d => !used.has(d.name))
    .slice(0, 4)
    .forEach(d => add(metric
      ? { type: 'hbar', dimension: d.name, measure: metric, agg: 'avg' }
      : { type: 'pie', dimension: d.name }))

  return widgets
}

const TOPN_OPTIONS = [10, 15, 25, 50]

// ── Single configurable chart ────────────────────────────────
const ChartWidget = ({ widget, rows, columns, dimensionCols, numericCols, identityColumn, onUpdate, onRemove, onDrill }) => {
  const { type, dimension, measure, agg, topN = 15, series, xMeasure, yMeasure, order, title, yMin, yMax, color } = widget
  const isDate = columns.find(c => c.name === dimension)?.type === 'date'
  // Per-chart customization panel (custom title, scale, order, accent color).
  const [showCustomize, setShowCustomize] = useState(false)
  const categoricalCols = useMemo(() => columns.filter(c => c.type === 'categorical'), [columns])
  // "Smart" chart types combine the metric with a second factor.
  const isCombo = type === 'combo'
  const isStacked = type === 'stacked'
  const isScatter = type === 'scatter'
  const isRisk = type === 'riskmatrix'
  // Multi-assessment chart types span every Score column at once.
  const isGrouped = type === 'grouped'
  const isCorr = type === 'correlation'
  const isRadar = type === 'radar'
  // Dual-metric charts that pair a score read with participation / spread.
  const isRange = type === 'range'
  const isPareto = type === 'pareto'
  // Matrix / map / quadrant views.
  const isHeatmap = type === 'heatmap'   // dimension × assessment, colored by avg
  const isTreemap = type === 'treemap'   // size = headcount, color = avg score
  const isQuadrant = type === 'quadrant' // 9-box talent matrix on two assessments
  // Combined charts that overlay two encodings to read two things at once.
  const isDual = type === 'dualaxis'         // bar (metric A) + line (metric B), two axes
  const isScatterLine = type === 'scatterline' // individual points + average trend line
  const isProgression = type === 'progression' // points over time + average-per-period line
  const isMeanSpread = type === 'meanspread'   // average bar per group + individual points

  // The assessments a multi-score chart spans: the widget's stored list, else
  // every numeric column. Filtered to columns that still exist as numbers and have valid values.
  const scoreList = useMemo(() => {
    const list = (widget.scores && widget.scores.length) ? widget.scores : numericCols.map(c => c.name)
    return list.filter(n =>
      numericCols.some(c => c.name === n) &&
      rows.some(r => isNonBlankValue(r[n], 'numeric'))
    )
  }, [widget.scores, numericCols, rows])

  // Lift a clicked category/range up to the drill-down modal.
  const drillCategory = (d) => {
    const value = d?.payload?.name ?? d?.name
    if (value != null && onDrill) onDrill({ type: 'category', column: dimension, value })
  }
  const drillRange = (d) => {
    const p = d?.payload ?? d
    if (p && onDrill) onDrill({ type: 'range', column: measure, lo: p.lo, hi: p.hi, label: p.name })
  }

  // Aggregate rows by the dimension; dates are bucketed (by day, or by month
  // once the span is wide) and ordered chronologically, everything else is
  // ranked by value (highest first).
  const fullData = useMemo(() => {
    // Choose date granularity up front so a long history doesn't render a point
    // per day — switch to monthly buckets past ~31 distinct days.
    let byMonth = false
    if (isDate) {
      const days = new Set()
      rows.forEach(r => { const t = parseDate(r[dimension]); if (t != null) days.add(Math.floor(t / 86400000)) })
      byMonth = days.size > 31
    }
    const groups = {}
    rows.forEach(r => {
      let key, ts
      if (isDate) {
        const t = parseDate(r[dimension])
        if (t == null) return
        const d = new Date(t)
        if (byMonth) {
          key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          ts = Date.UTC(d.getFullYear(), d.getMonth(), 1)
        } else {
          key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          ts = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
        }
      } else {
        key = (String(r[dimension] ?? '').trim()) || '—'
      }
      if (!groups[key]) groups[key] = { values: [], count: 0, ts }
      groups[key].count += 1
      if (measure !== 'count') {
        const n = toNumber(r[measure])
        if (n !== null) groups[key].values.push(n)
      }
    })
    const arr = Object.entries(groups)
      .filter(([_, g]) => measure === 'count' || g.values.length > 0)
      .map(([name, g]) => {
        let value
        if (measure === 'count') value = g.count
        else if (agg === 'sum') value = g.values.reduce((s, n) => s + n, 0)
        else if (agg === 'min') value = Math.min(...g.values)
        else if (agg === 'max') value = Math.max(...g.values)
        else value = g.values.reduce((s, n) => s + n, 0) / g.values.length
        return { name, value: round1(value), count: g.count, ts: g.ts }
      })
    if (isDate) arr.sort((a, b) => a.ts - b.ts)
    // `order: 'asc'` surfaces the lowest performers (bottom of the ranking);
    // everything else ranks highest-first (top performers / largest groups).
    else if (order === 'asc') arr.sort((a, b) => a.value - b.value)
    else arr.sort((a, b) => b.value - a.value)
    return arr
  }, [rows, dimension, measure, agg, isDate, order])

  // Histogram: bucket a numeric column into equal-width ranges (score spread).
  const histData = useMemo(() => {
    if (type !== 'histogram' || measure === 'count') return []
    const nums = rows.map(r => toNumber(r[measure])).filter(n => n !== null)
    if (!nums.length) return []
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const bins = 10
    const width = (max - min) / bins || 1
    const buckets = Array.from({ length: bins }, (_, i) => ({
      name: `${round1(min + i * width)}–${round1(min + (i + 1) * width)}`,
      value: 0,
      lo: min + i * width,
      hi: min + (i + 1) * width
    }))
    nums.forEach(n => {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((n - min) / width)))
      buckets[idx].value += 1
    })
    return buckets
  }, [type, measure, rows])

  // Performance bands: split the metric into Excellent / Good / Needs Improvement
  // (one count per record) for an at-a-glance health read of the score.
  const bandData = useMemo(() => {
    if (type !== 'bands' || measure === 'count') return []
    const nums = rows.map(r => toNumber(r[measure])).filter(n => n !== null)
    if (!nums.length) return []
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const scale = detectScale(max)
    const counts = { Excellent: 0, Good: 0, 'Needs Improvement': 0 }
    nums.forEach(n => { counts[bandForPct((n / scale) * 100)] += 1 })
    const ranges = {
      Excellent: { lo: 0.8 * scale, hi: max },
      Good: { lo: 0.6 * scale, hi: 0.8 * scale },
      'Needs Improvement': { lo: min, hi: 0.6 * scale }
    }
    return BAND_DEFS
      .map(b => ({ name: b.name, value: counts[b.name], color: b.color, ...ranges[b.name] }))
      .filter(b => b.value > 0)
  }, [type, measure, rows])

  // ── Combo: headcount (bars) + average metric (line) per category ──────────
  const comboData = useMemo(() => {
    if (!isCombo) return []
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      const n = toNumber(r[measure])
      g[k] = g[k] || { vals: [], total: 0 }
      g[k].total += 1
      if (n !== null) g[k].vals.push(n)
    })
    // `count` = responses (people who actually have a score for this assessment)
    // so a high average backed by only a few respondents is immediately visible
    // next to its bar. `total` keeps the group's full headcount for context.
    return Object.entries(g)
      .map(([name, v]) => ({
        name,
        count: v.vals.length,
        total: v.total,
        avg: v.vals.length ? round1(v.vals.reduce((s, n) => s + n, 0) / v.vals.length) : 0
      }))
      .sort((a, b) => b.count - a.count)
  }, [isCombo, rows, dimension, measure])

  // ── Stacked: category split by a 2nd category (or by score bands) ─────────
  const stacked = useMemo(() => {
    if (!isStacked) return { data: [], keys: [], byBands: false }
    const byBands = series === '__bands__'
    let scale = 100
    if (byBands) {
      const nums = rows.map(r => toNumber(r[measure])).filter(n => n !== null)
      scale = detectScale(nums.length ? Math.max(...nums) : 100)
    }
    const keySet = new Set()
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      let sk
      if (byBands) {
        const n = toNumber(r[measure])
        if (n === null) return
        sk = bandOf(n, scale)
      } else {
        sk = (String(r[series] ?? '').trim()) || '—'
      }
      keySet.add(sk)
      g[k] = g[k] || { __total: 0 }
      g[k][sk] = (g[k][sk] || 0) + 1
      g[k].__total += 1
    })
    const keys = byBands ? BAND_KEYS.filter(k => keySet.has(k)) : [...keySet].sort()
    const data = Object.entries(g)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.__total - a.__total)
    return { data, keys, byBands }
  }, [isStacked, rows, dimension, series, measure])

  // ── Scatter: two numeric columns, one point per row, + trend line ─────────
  const scatter = useMemo(() => {
    if (!isScatter || !xMeasure || !yMeasure) return { points: [], trend: null, r: null }
    const points = rows
      .map(r => ({ x: toNumber(r[xMeasure]), y: toNumber(r[yMeasure]) }))
      .filter(p => p.x !== null && p.y !== null)
    const pairs = points.map(p => [p.x, p.y])
    const reg = linReg(pairs)
    const r = pearson(pairs)
    let trend = null
    if (reg && points.length) {
      const xs = points.map(p => p.x)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      trend = [
        { x: minX, y: round1(reg.slope * minX + reg.intercept) },
        { x: maxX, y: round1(reg.slope * maxX + reg.intercept) }
      ]
    }
    return { points, trend, r }
  }, [isScatter, rows, xMeasure, yMeasure])

  // ── Risk matrix: per-category average (X) vs headcount (Y) ────────────────
  const risk = useMemo(() => {
    if (!isRisk) return { points: [], avgThresh: 0, countThresh: 0 }
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      const n = toNumber(r[measure])
      g[k] = g[k] || { vals: [], count: 0 }
      g[k].count += 1
      if (n !== null) g[k].vals.push(n)
    })
    const points = Object.entries(g).map(([name, v]) => ({
      name,
      x: v.vals.length ? round1(v.vals.reduce((s, n) => s + n, 0) / v.vals.length) : 0,
      y: v.count
    }))
    const allNums = rows.map(r => toNumber(r[measure])).filter(n => n !== null)
    const avgThresh = allNums.length ? round1(allNums.reduce((s, n) => s + n, 0) / allNums.length) : 0
    const counts = points.map(p => p.y).sort((a, b) => a - b)
    const countThresh = counts.length ? counts[Math.floor(counts.length / 2)] : 0
    return { points, avgThresh, countThresh }
  }, [isRisk, rows, dimension, measure])

  // ── Grouped: average of every assessment per category, side by side ───────
  // Powers the "Department-wise comparison across all assessments" view.
  const grouped = useMemo(() => {
    if (!isGrouped) return { data: [], keys: [] }
    const keys = scoreList
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      if (!g[k]) g[k] = { __count: 0, sums: {}, cnts: {} }
      g[k].__count += 1
      keys.forEach(s => {
        const n = toNumber(r[s])
        if (n !== null) { g[k].sums[s] = (g[k].sums[s] || 0) + n; g[k].cnts[s] = (g[k].cnts[s] || 0) + 1 }
      })
    })
    const data = Object.entries(g)
      .filter(([_, v]) => keys.some(s => v.cnts[s] > 0))
      .map(([name, v]) => {
        const o = { name, __count: v.__count }
        keys.forEach(s => { o[s] = v.cnts[s] ? round1(v.sums[s] / v.cnts[s]) : 0 })
        return o
      })
      .sort((a, b) => b.__count - a.__count)
    return { data, keys }
  }, [isGrouped, rows, dimension, scoreList])

  // ── Correlation matrix: Pearson r between every pair of assessments ───────
  const corr = useMemo(() => {
    if (!isCorr) return { cells: [], labels: [] }
    const labels = scoreList
    const cells = []
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < labels.length; j++) {
        let r
        if (i === j) r = 1
        else {
          const pairs = rows
            .map(row => [toNumber(row[labels[j]]), toNumber(row[labels[i]])])
            .filter(p => p[0] !== null && p[1] !== null)
          r = pearson(pairs)
        }
        cells.push({ x: j, y: i, r: r === null ? null : Math.round(r * 100) / 100, xLabel: labels[j], yLabel: labels[i] })
      }
    }
    return { cells, labels }
  }, [isCorr, rows, scoreList])

  // ── Radar: workforce strength/weakness profile across assessments ─────────
  // Each assessment's average is normalized to a 0–100% scale (by its detected
  // out-of-5/10/100 ceiling) so different-scaled assessments share one axis.
  const radar = useMemo(() => {
    if (!isRadar) return []
    return scoreList
      .map(s => {
        const nums = rows.map(r => toNumber(r[s])).filter(n => n !== null)
        if (!nums.length) return null
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length
        const scale = detectScale(Math.max(...nums))
        return { assessment: s, value: round1((avg / scale) * 100), raw: round1(avg) }
      })
      .filter(Boolean)
  }, [isRadar, rows, scoreList])

  // ── Range: min / average / max of a score per category, with response count ─
  // A floating bar spans min→max and a dot marks the average, so you see both
  // the typical level AND the spread — and how many people actually scored.
  const rangeData = useMemo(() => {
    if (!isRange || measure === 'count') return []
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      const n = toNumber(r[measure])
      g[k] = g[k] || { vals: [], total: 0 }
      g[k].total += 1
      if (n !== null) g[k].vals.push(n)
    })
    return Object.entries(g)
      .filter(([, v]) => v.vals.length)
      .map(([name, v]) => {
        const lo = Math.min(...v.vals)
        const hi = Math.max(...v.vals)
        const avg = round1(v.vals.reduce((s, n) => s + n, 0) / v.vals.length)
        return { name, lo: round1(lo), hi: round1(hi), avg, count: v.vals.length, total: v.total, range: [round1(lo), round1(hi)] }
      })
      .sort((a, b) => b.avg - a.avg)
  }, [isRange, rows, dimension, measure])

  // ── Pareto: participation per category (bars, desc) + cumulative share (line) ─
  // Shows how concentrated assessment participation is — e.g. 3 departments
  // account for 80% of all respondents.
  const paretoData = useMemo(() => {
    if (!isPareto) return []
    const g = {}
    rows.forEach(r => {
      // Count respondents when a score is chosen, else all rows in the group.
      const counts = measure === 'count' || toNumber(r[measure]) !== null
      if (!counts) return
      const k = (String(r[dimension] ?? '').trim()) || '—'
      g[k] = (g[k] || 0) + 1
    })
    const sorted = Object.entries(g).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    const total = sorted.reduce((s, d) => s + d.count, 0) || 1
    let cum = 0
    return sorted.map(d => { cum += d.count; return { ...d, cumPct: round1((100 * cum) / total) } })
  }, [isPareto, rows, dimension, measure])

  // ── Heatmap: dimension (rows) × assessment (cols), colored by avg % ───────
  // Every category's normalized average on every assessment in one grid, so a
  // group strong on one assessment and weak on another is obvious at a glance.
  const heat = useMemo(() => {
    if (!isHeatmap) return { cells: [], cats: [], cols: [] }
    const cols = scoreList
    const scaleOf = {}
    cols.forEach(s => {
      const nums = rows.map(r => toNumber(r[s])).filter(n => n !== null)
      scaleOf[s] = detectScale(nums.length ? Math.max(...nums) : 100)
    })
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      if (!g[k]) { g[k] = {}; cols.forEach(s => { g[k][s] = { sum: 0, n: 0 } }) }
      cols.forEach(s => { const v = toNumber(r[s]); if (v !== null) { g[k][s].sum += v; g[k][s].n += 1 } })
    })
    // Order categories by their overall average so strong groups sit together.
    const cats = Object.keys(g).sort((a, b) => {
      const avg = (k) => cols.reduce((s, c) => s + (g[k][c].n ? g[k][c].sum / g[k][c].n / scaleOf[c] : 0), 0)
      return avg(b) - avg(a)
    })
    const cells = []
    cats.forEach((cat, yi) => {
      cols.forEach((s, xi) => {
        const cell = g[cat][s]
        const raw = cell.n ? round1(cell.sum / cell.n) : null
        const pct = cell.n ? round1((cell.sum / cell.n / scaleOf[s]) * 100) : null
        cells.push({ x: xi, y: yi, pct, raw, n: cell.n, cat, assessment: s })
      })
    })
    return { cells, cats, cols }
  }, [isHeatmap, rows, dimension, scoreList])

  // ── Treemap: one tile per category, area = headcount, color = avg score ───
  const treemap = useMemo(() => {
    if (!isTreemap || measure === 'count') return []
    const nums = rows.map(r => toNumber(r[measure])).filter(n => n !== null)
    const scale = detectScale(nums.length ? Math.max(...nums) : 100)
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      const v = toNumber(r[measure])
      g[k] = g[k] || { sum: 0, n: 0, total: 0 }
      g[k].total += 1
      if (v !== null) { g[k].sum += v; g[k].n += 1 }
    })
    return Object.entries(g)
      .map(([name, v]) => {
        const avg = v.n ? round1(v.sum / v.n) : 0
        return { name, size: v.total, avg, n: v.n, pct: round1((avg / scale) * 100) }
      })
      .sort((a, b) => b.size - a.size)
  }, [isTreemap, rows, dimension, measure])

  // ── Quadrant: one point per person on two assessments, split into 4 boxes ─
  const quadrant = useMemo(() => {
    if (!isQuadrant || !xMeasure || !yMeasure) return { points: [], xMid: 0, yMid: 0, xMax: 0, yMax: 0 }
    const points = rows
      .map(r => ({ x: toNumber(r[xMeasure]), y: toNumber(r[yMeasure]), name: identityColumn ? String(r[identityColumn] ?? '') : '' }))
      .filter(p => p.x !== null && p.y !== null)
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const mean = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0)
    return {
      points,
      xMid: round1(mean(xs)),
      yMid: round1(mean(ys)),
      xMax: xs.length ? Math.max(...xs) : 0,
      yMax: ys.length ? Math.max(...ys) : 0
    }
  }, [isQuadrant, rows, xMeasure, yMeasure, identityColumn])

  // ── Dual axis: average of metric A (bars) + average of metric B (line) per
  // category, each on its own axis — compares two different measures together. ─
  const dual = useMemo(() => {
    if (!isDual) return []
    const m2 = widget.measure2
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      g[k] = g[k] || { a: [], b: [] }
      const a = toNumber(r[measure]); if (a !== null) g[k].a.push(a)
      const b = toNumber(r[m2]); if (b !== null) g[k].b.push(b)
    })
    const mean = (arr) => (arr.length ? round1(arr.reduce((s, n) => s + n, 0) / arr.length) : 0)
    return Object.entries(g)
      .map(([name, v]) => ({ name, left: mean(v.a), right: mean(v.b), count: v.a.length }))
      .sort((a, b) => b.left - a.left)
  }, [isDual, rows, dimension, measure, widget.measure2])

  // ── Scatter + line: every individual as a point, plus a binned average curve
  // overlaid — shows the spread AND the trend in one chart. ──────────────────
  const scatterLine = useMemo(() => {
    if (!isScatterLine || !xMeasure || !yMeasure) return { points: [], line: [] }
    const points = rows
      .map(r => ({ x: toNumber(r[xMeasure]), y: toNumber(r[yMeasure]) }))
      .filter(p => p.x !== null && p.y !== null)
    if (!points.length) return { points: [], line: [] }
    const xs = points.map(p => p.x)
    const min = Math.min(...xs), max = Math.max(...xs)
    const bins = 8
    const w = (max - min) / bins || 1
    const buckets = Array.from({ length: bins }, () => ({ sum: 0, n: 0 }))
    points.forEach(p => {
      const i = Math.min(bins - 1, Math.max(0, Math.floor((p.x - min) / w)))
      buckets[i].sum += p.y; buckets[i].n += 1
    })
    const line = buckets
      .map((b, i) => (b.n ? { x: round1(min + (i + 0.5) * w), y: round1(b.sum / b.n) } : null))
      .filter(Boolean)
    return { points, line }
  }, [isScatterLine, rows, xMeasure, yMeasure])

  // ── Progression: every attempt as a point over time + the average-per-period
  // line, so improvement (or drift) across assessment dates is visible. ───────
  const progression = useMemo(() => {
    if (!isProgression) return { points: [], line: [], byMonth: false }
    const pts = []
    rows.forEach(r => {
      const tt = parseDate(r[dimension]); const y = toNumber(r[measure])
      if (tt !== null && y !== null) pts.push({ x: tt, y })
    })
    if (!pts.length) return { points: [], line: [], byMonth: false }
    const byMonth = new Set(pts.map(p => Math.floor(p.x / 86400000))).size > 31
    const g = {}
    pts.forEach(p => {
      const d = new Date(p.x)
      const ts = byMonth ? Date.UTC(d.getFullYear(), d.getMonth(), 1) : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
      g[ts] = g[ts] || { sum: 0, n: 0 }
      g[ts].sum += p.y; g[ts].n += 1
    })
    const line = Object.entries(g).map(([ts, v]) => ({ x: Number(ts), y: round1(v.sum / v.n) })).sort((a, b) => a.x - b.x)
    return { points: pts, line, byMonth }
  }, [isProgression, rows, dimension, measure])

  // ── Mean + spread: average bar per category, with every individual score
  // overlaid as a point — the mean and the distribution behind it together. ──
  const meanSpread = useMemo(() => {
    if (!isMeanSpread || measure === 'count') return { cats: [], points: [] }
    const g = {}
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      const y = toNumber(r[measure])
      g[k] = g[k] || { vals: [] }
      if (y !== null) g[k].vals.push(y)
    })
    const cats = Object.entries(g)
      .filter(([, v]) => v.vals.length)
      .map(([name, v]) => ({ name, avg: round1(v.vals.reduce((s, n) => s + n, 0) / v.vals.length), count: v.vals.length }))
      .sort((a, b) => b.avg - a.avg)
    const valid = new Set(cats.map(c => c.name))
    const points = []
    rows.forEach(r => {
      const k = (String(r[dimension] ?? '').trim()) || '—'
      const y = toNumber(r[measure])
      if (y !== null && valid.has(k)) points.push({ name: k, value: y })
    })
    return { cats, points }
  }, [isMeanSpread, rows, dimension, measure])

  const isHist = type === 'histogram'
  const isBands = type === 'bands'
  const isBar = type === 'bar' || type === 'hbar'
  const limitable = isBar && !isDate
  const limit = topN === 'all' ? Infinity : Number(topN)

  const data = useMemo(() => {
    if (limitable) return fullData.slice(0, limit)
    // Pies get a long tail rolled into "Other" (only meaningful for counts)
    if (type === 'pie' && fullData.length > MAX_CHART_CATEGORIES) {
      const head = fullData.slice(0, MAX_CHART_CATEGORIES)
      if (measure === 'count') {
        const tail = fullData.slice(MAX_CHART_CATEGORIES)
        head.push({ name: `Other (${tail.length})`, value: tail.reduce((s, d) => s + d.value, 0) })
      }
      return head
    }
    return fullData
  }, [fullData, limitable, limit, type, measure])

  const view = isCombo ? comboData
    : isStacked ? stacked.data
    : isScatter ? scatter.points
    : isRisk ? risk.points
    : isGrouped ? grouped.data
    : isCorr ? corr.cells
    : isRadar ? radar
    : isRange ? rangeData
    : isPareto ? paretoData
    : isHeatmap ? heat.cells
    : isTreemap ? treemap
    : isQuadrant ? quadrant.points
    : isDual ? dual
    : isScatterLine ? scatterLine.points
    : isProgression ? progression.points
    : isMeanSpread ? meanSpread.cats
    : isHist ? histData
    : isBands ? bandData
    : data
  const measureLabel = measure === 'count' ? 'Count' : `${AGG_LABELS[agg]} of ${measure}`
  // Report-ready titles modeled on the Active Tracking dashboards — e.g.
  // "Employees by Average Score", "Performance Distribution", "Score
  // Distribution", "Score Trend Over Time", "Average Score by Department".
  // Derived (not stored) so the title stays accurate when reconfigured.
  const titleText = useMemo(() => {
    if (isCombo) return `${dimension}: Headcount vs Avg ${measure}`
    if (isStacked) return stacked.byBands ? `${measure} Distribution by ${dimension}` : `${dimension} by ${series} (split)`
    if (isScatter) return `${yMeasure} vs ${xMeasure}`
    if (isRisk) return `Risk Matrix — ${measure} vs Headcount by ${dimension}`
    if (isGrouped) return `${dimension} — Comparison Across Quizzes`
    if (isCorr) return 'Quiz Correlation Matrix'
    if (isRadar) return 'Strength & Weakness Radar'
    if (isRange) return `${measure} Range & Average by ${dimension}`
    if (isPareto) return `Participation Concentration by ${dimension}`
    if (isHeatmap) return `${dimension} × Quiz Heatmap`
    if (isTreemap) return `${dimension} Map — Size = Headcount, Color = Avg ${measure}`
    if (isQuadrant) return `Talent Matrix — ${yMeasure} vs ${xMeasure}`
    if (isDual) return `${measure} vs ${widget.measure2} by ${dimension}`
    if (isScatterLine) return `${yMeasure} vs ${xMeasure} — Points + Average Trend`
    if (isProgression) return `${measure} Progression Over Time`
    if (isMeanSpread) return `${measure} — Average & Individual Spread by ${dimension}`
    if (isBands) return 'Performance Distribution'
    if (isHist) return `${measure} Distribution`
    if (measure === 'count') {
      if (isDate) return 'Records Over Time'
      return type === 'pie' ? `${dimension} Breakdown` : `${dimension} Distribution`
    }
    const aggWord = AGG_LABELS[agg] // Average / Sum / Min / Max
    if (isDate) return aggWord === 'Average' ? `${measure} Trend Over Time` : `${aggWord} ${measure} Over Time`
    // Explicit top / low performer framing when an order is set on the ranking.
    if (type === 'hbar' && order === 'desc') return `Top Performers — ${aggWord} ${measure}${dimension === identityColumn ? '' : ` by ${dimension}`}`
    if (type === 'hbar' && order === 'asc') return `Lowest Performers — ${aggWord} ${measure}${dimension === identityColumn ? '' : ` by ${dimension}`}`
    // Per-person framing for the identity column: "Employees by Average Score".
    if (dimension === identityColumn) {
      const who = PEOPLE_NAME_RE.test(dimension) ? 'Employees' : dimension
      return `${who} by ${aggWord} ${measure}`
    }
    return `${aggWord} ${measure} by ${dimension}`
  }, [isHist, isBands, isDate, type, dimension, measure, agg, identityColumn, isCombo, isStacked, isScatter, isRisk, isGrouped, isCorr, isRadar, isRange, isPareto, isHeatmap, isTreemap, isQuadrant, isDual, isScatterLine, isProgression, isMeanSpread, series, xMeasure, yMeasure, widget.measure2, stacked.byBands, order])
  // A custom title overrides the auto-generated one when the user sets it.
  const displayTitle = (title && title.trim()) ? title : titleText
  // User-pinned value-axis bounds ("scale need"); 'auto' lets recharts fit the
  // data. Empty → auto so charts still work out of the box.
  const vMin = (yMin === 0 || (yMin !== undefined && yMin !== null && yMin !== '')) ? Number(yMin) : 'auto'
  const vMax = (yMax === 0 || (yMax !== undefined && yMax !== null && yMax !== '')) ? Number(yMax) : 'auto'
  const valueDomain = [vMin, vMax]
  // Optional single accent color; when unset the multi-color palette is used.
  const accent = color || null
  // Charts whose value axis the scale controls apply to.
  const scalable = ['bar', 'hbar', 'line', 'combo', 'histogram', 'dualaxis', 'scatterline', 'progression', 'meanspread'].includes(type)
  const showTopN = limitable && fullData.length > TOPN_OPTIONS[0]

  // ── Auto-generated executive commentary for each chart ────────────────────
  // Returns { question, metrics, business, insights, executive } or null, with
  // every field derived from the live aggregates so the commentary stays
  // accurate for any uploaded dataset. The four facets answer the brief:
  // metrics used · business value · insights generated · executive interpretation.
  const insight = useMemo(() => {
    const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`

    if (isCombo && comboData.length) {
      const best = comboData.reduce((a, b) => (b.avg > a.avg ? b : a))
      const worst = comboData.reduce((a, b) => (b.avg < a.avg ? b : a))
      const largest = comboData.reduce((a, b) => (b.count > a.count ? b : a))
      if (best.name === worst.name) return null
      return {
        question: `Which ${dimension} groups underperform on ${measure} — and how many employees does that affect?`,
        metrics: `Headcount per ${dimension} (bars) plotted against the average ${measure} of each group (line).`,
        business: `Headcount and performance move independently, so a weak average inside a large group quietly affects far more people than the score alone implies — this view sizes that exposure.`,
        insights: `${worst.name} has the lowest average ${measure} (${worst.avg}) and ${best.name} the highest (${best.avg}); the largest group is ${largest.name} (${people(largest.count)}).`,
        executive: `Prioritize a ${worst.name} intervention and benchmark its practices against ${best.name}.`
      }
    }

    if (isStacked && stacked.data.length) {
      if (stacked.byBands) {
        const need = 'Needs Improvement'
        const withNeed = stacked.data
          .map(d => ({ name: d.name, n: d[need] || 0, total: d.__total }))
          .sort((a, b) => b.n - a.n)
        const worst = withNeed[0]
        const totalNeed = withNeed.reduce((s, d) => s + d.n, 0)
        if (!worst || totalNeed === 0) return null
        const pct = round1((100 * worst.n) / worst.total)
        return {
          question: `Are low ${measure} scores a few failures or a broadly weak ${dimension}?`,
          metrics: `Each ${dimension} bar split into Excellent / Good / Needs Improvement bands of ${measure} (employee counts).`,
          business: `A high share of below-bar scores is a systemic capability gap, not a handful of outliers — it calls for a group fix rather than individual coaching.`,
          insights: `${worst.name} carries the most below-bar scores — ${worst.n} of ${worst.total} (${pct}%) in “Needs Improvement”; ${people(totalNeed)} fall below the Good band overall.`,
          executive: pct >= 50
            ? `Treat ${worst.name} as a structural gap: group upskilling, not one-off coaching.`
            : `Target the bottom band in ${worst.name} while protecting its stronger performers.`
        }
      }
      return {
        question: `How does ${series} break down within each ${dimension}?`,
        metrics: `Employee counts per ${dimension}, stacked by ${series}.`,
        business: `Differences in composition often explain performance gaps that a single average can't reveal.`,
        insights: `${people(rows.length)} across ${stacked.data.length} ${dimension} groups, each showing its own ${series} mix rather than just a total.`,
        executive: `Compare groups with similar mixes to separate real performance differences from composition effects.`
      }
    }

    if (isScatter && scatter.r !== null) {
      const r = scatter.r
      const dir = r >= 0 ? 'positive' : 'negative'
      const strong = strengthWord(r)
      const weak = Math.abs(r) < 0.15
      return {
        question: `Does ${xMeasure} relate to ${yMeasure}?`,
        metrics: `One point per employee — ${xMeasure} (x) vs ${yMeasure} (y) — with a least-squares trend line and Pearson r.`,
        business: `Shows whether ${xMeasure} is a usable predictor of ${yMeasure}, informing where to place hiring and development bets.`,
        insights: `${strong === 'no meaningful' ? 'No meaningful' : `A ${strong} ${dir}`} relationship (r = ${Math.round(r * 100) / 100}) across ${people(scatter.points.length)}.`,
        executive: weak
          ? `Treat ${xMeasure} and ${yMeasure} as independent — don't use one to forecast the other; segment by role or department instead.`
          : `Use ${xMeasure} as an early signal for ${yMeasure} and focus support on employees sitting well below the trend line.`
      }
    }

    if (isRisk && risk.points.length) {
      const high = risk.points
        .filter(p => p.x < risk.avgThresh && p.y >= risk.countThresh)
        .sort((a, b) => b.y - a.y)
      const affected = high.reduce((s, p) => s + p.y, 0)
      const common = {
        question: `Which low-scoring ${dimension} groups affect the most people on ${measure}?`,
        metrics: `Per ${dimension}: average ${measure} (x) vs headcount (y), with reference lines at the overall average (${risk.avgThresh}) and median group size.`,
        business: `Sequences interventions by exposure — weak scores multiplied by large populations give the biggest return on a fix.`
      }
      if (!high.length) {
        return {
          ...common,
          insights: `No group is both below-average (${risk.avgThresh}) and above median size — risk is well distributed.`,
          executive: `Maintain monitoring; re-check after the next assessment cycle.`
        }
      }
      return {
        ...common,
        insights: `${high.map(p => `${p.name} (avg ${p.x}, ${people(p.y)})`).join('; ')} sit in the high-risk zone — ${people(affected)} in total.`,
        executive: `Sequence fixes by exposure: start with ${high[0].name} (${people(high[0].y)}).`
      }
    }

    if (isGrouped && grouped.data.length && grouped.keys.length) {
      // Tally which group leads each assessment, and find the assessment with
      // the widest spread between groups (the biggest comparative gap).
      const leadTally = {}
      let widest = { key: grouped.keys[0], spread: -1 }
      grouped.keys.forEach(k => {
        const vals = grouped.data.map(d => ({ name: d.name, v: d[k] }))
        const top = vals.reduce((a, b) => (b.v > a.v ? b : a))
        leadTally[top.name] = (leadTally[top.name] || 0) + 1
        const spread = round1(Math.max(...vals.map(v => v.v)) - Math.min(...vals.map(v => v.v)))
        if (spread > widest.spread) widest = { key: k, spread }
      })
      const leader = Object.entries(leadTally).sort((a, b) => b[1] - a[1])[0]
      return {
        question: `How does each ${dimension} compare across all ${grouped.keys.length} assessments at once?`,
        metrics: `Average of each assessment (${grouped.keys.join(', ')}) per ${dimension}, shown side by side.`,
        business: `Surfaces every group's relative strengths and weaknesses across the whole assessment suite in a single view, instead of one chart per score.`,
        insights: `${leader[0]} leads in ${leader[1]} of ${grouped.keys.length} assessments; ${widest.key} shows the widest spread between groups (${widest.spread} points).`,
        executive: `Tailor development to each group's weakest assessment rather than running one-size-fits-all programs.`
      }
    }

    if (isCorr && corr.labels.length >= 2) {
      const off = corr.cells.filter(c => c.x < c.y && c.r !== null) // unique pairs, lower triangle
      if (!off.length) return null
      const strongest = off.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a))
      const weakest = off.reduce((a, b) => (Math.abs(b.r) < Math.abs(a.r) ? b : a))
      return {
        question: `Which assessments measure overlapping abilities, and which are independent?`,
        metrics: `Pairwise Pearson correlation between all ${corr.labels.length} assessments; cell color shows strength and direction.`,
        business: `Highly correlated assessments may be redundant; independent or negatively related ones reveal genuine skill trade-offs to staff around.`,
        insights: `Strongest link: ${shortLabel(strongest.yLabel)} ↔ ${shortLabel(strongest.xLabel)} (r = ${strongest.r}); most independent: ${shortLabel(weakest.yLabel)} ↔ ${shortLabel(weakest.xLabel)} (r = ${weakest.r}).`,
        executive: `Consider consolidating the most correlated assessments; design roles and teams around the genuine trade-offs the weak/negative pairs expose.`
      }
    }

    if (isRadar && radar.length >= 3) {
      const valid = radar.filter(d => d.value > 0)
      if (valid.length < 3) return null
      const max = valid.reduce((a, b) => (b.value > a.value ? b : a))
      const min = valid.reduce((a, b) => (b.value < a.value ? b : a))
      return {
        question: `What is the workforce's overall strength-and-weakness profile across assessments?`,
        metrics: `Average of each assessment normalized to a 0–100% scale (by its detected ceiling), one axis per assessment.`,
        business: `One glance shows where the organization is collectively strong and where capability gaps lie across the full assessment set.`,
        insights: `Strongest area: ${shortLabel(max.assessment)} (${max.value}%); weakest: ${shortLabel(min.assessment)} (${min.value}%).`,
        executive: `Direct development budget at ${shortLabel(min.assessment)}; leverage ${shortLabel(max.assessment)} as a competitive strength.`
      }
    }

    if (isBands && bandData.length) {
      const total = bandData.reduce((s, b) => s + b.value, 0)
      const find = (n) => bandData.find(b => b.name === n)?.value || 0
      const need = find('Needs Improvement')
      const exc = find('Excellent')
      if (!total) return null
      const needPct = round1((100 * need) / total)
      return {
        question: `What share of employees are excelling versus needing support on ${measure}?`,
        metrics: `Each employee's ${measure} mapped to Excellent / Good / Needs Improvement bands (count per band).`,
        business: `Quantifies the size of the development gap and the high-performer pool — the numbers behind a single average.`,
        insights: `${people(need)} (${needPct}%) sit in “Needs Improvement” and ${people(exc)} are “Excellent”, out of ${total}.`,
        executive: needPct >= 25
          ? `A material ${needPct}% fall below the Good band on ${measure} — budget targeted development this cycle.`
          : `Distribution is healthy; protect and stretch the top performers while lifting the remainder.`
      }
    }

    if (isHist && histData.length) {
      const total = histData.reduce((s, b) => s + b.value, 0)
      if (!total) return null
      const modal = histData.reduce((a, b) => (b.value > a.value ? b : a))
      const modalIdx = histData.indexOf(modal)
      const skew = modalIdx <= 2 ? 'concentrated toward the lower end' : modalIdx >= 7 ? 'concentrated toward the top' : 'centred in the mid-range'
      return {
        question: `How is ${measure} spread — clustered, skewed, or polarized?`,
        metrics: `${measure} bucketed into equal-width ranges; bar height = number of employees.`,
        business: `Reveals concentration, polarization and outlier tails that a single average hides.`,
        insights: `Most employees fall in the ${modal.name} range (${people(modal.value)}); the distribution is ${skew}.`,
        executive: `Use the spread to set realistic ${measure} targets and to size the at-risk tail for follow-up.`
      }
    }

    if (isRange && rangeData.length) {
      const widest = rangeData.reduce((a, b) => ((b.hi - b.lo) > (a.hi - a.lo) ? b : a))
      const thin = rangeData.filter(d => d.count <= 3)
      const topAvg = rangeData.reduce((a, b) => (b.avg > a.avg ? b : a))
      return {
        question: `Is each ${dimension}'s average ${measure} trustworthy, or driven by a few people or wide spread?`,
        metrics: `Per ${dimension}: a bar spanning the min–max of ${measure}, a dot for the average, and the response count (n) behind it.`,
        business: `Guards against misreading a group's average — a high mean from 3 respondents, or one stretched across a huge range, is far less reliable than a tight mean from many.`,
        insights: `${topAvg.name} has the highest average (${topAvg.avg}, n=${topAvg.count}); ${widest.name} has the widest spread (${widest.lo}–${widest.hi}).${thin.length ? ` Thin samples (n≤3): ${thin.map(d => `${d.name} (${d.count})`).join(', ')}.` : ''}`,
        executive: `Trust averages from large, tight groups; treat ${thin.length ? thin[0].name : widest.name} as indicative only until more people are assessed.`
      }
    }

    if (isPareto && paretoData.length) {
      const total = paretoData.reduce((s, d) => s + d.count, 0)
      // How many groups make up ~80% of all respondents.
      let n80 = 0
      for (const d of paretoData) { n80++; if (d.cumPct >= 80) break }
      const top = paretoData[0]
      return {
        question: `Is assessment participation concentrated in a few ${dimension} groups?`,
        metrics: `Respondents per ${dimension} (bars, highest first) with the running cumulative share (line).`,
        business: `Reveals whether results are dominated by a handful of groups — averages across the whole population can be skewed by who actually showed up.`,
        insights: `${top.name} alone accounts for ${top.cumPct}% of the ${total} respondents; the top ${n80} ${dimension} group${n80 === 1 ? '' : 's'} cover ~80%.`,
        executive: `Drive participation in the long tail before treating org-wide averages as representative.`
      }
    }

    if (isHeatmap && heat.cells.length && heat.cats.length && heat.cols.length) {
      const valid = heat.cells.filter(c => c.pct !== null)
      if (!valid.length) return null
      const best = valid.reduce((a, b) => (b.pct > a.pct ? b : a))
      const worst = valid.reduce((a, b) => (b.pct < a.pct ? b : a))
      return {
        question: `Where is each ${dimension} strong or weak across all ${heat.cols.length} assessments?`,
        metrics: `Average of every assessment per ${dimension}, normalized to 0–100% and color-coded in one grid (cell label = %).`,
        business: `Replaces ${heat.cols.length} separate charts with a single map of capability, exposing pockets of strength and weakness that per-chart views scatter.`,
        insights: `Brightest cell: ${shortLabel(best.cat)} on ${shortLabel(best.assessment)} (${best.pct}%); weakest: ${shortLabel(worst.cat)} on ${shortLabel(worst.assessment)} (${worst.pct}%).`,
        executive: `Move best practice from strong cells to the matching weak ones; target development at ${shortLabel(worst.cat)}'s ${shortLabel(worst.assessment)}.`
      }
    }

    if (isTreemap && treemap.length) {
      const biggest = treemap[0]
      const bigWeak = [...treemap].sort((a, b) => (b.size * (100 - b.pct)) - (a.size * (100 - a.pct)))[0]
      return {
        question: `Which ${dimension} groups combine large headcount with weak ${measure}?`,
        metrics: `One tile per ${dimension}: area = headcount, color = average ${measure} (pink = low, purple = high).`,
        business: `Size and performance in one view — a large pale tile is a far bigger risk than a small one with the same average.`,
        insights: `Largest group: ${biggest.name} (${biggest.n} respondents, avg ${biggest.avg}). Highest people-weighted gap: ${bigWeak.name} (avg ${bigWeak.avg}, n=${bigWeak.n}).`,
        executive: `Prioritize the large, pale tiles — fixing ${bigWeak.name} moves the most people at once.`
      }
    }

    if (isQuadrant && quadrant.points.length) {
      const { points, xMid, yMid } = quadrant
      const stars = points.filter(p => p.x >= xMid && p.y >= yMid).length
      const dev = points.filter(p => p.x < xMid && p.y < yMid).length
      return {
        question: `How do employees split across ${xMeasure} and ${yMeasure} together?`,
        metrics: `One point per employee — ${xMeasure} (x) vs ${yMeasure} (y) — divided into four boxes at each assessment's average.`,
        business: `A talent-matrix read: combines two assessments to separate all-round strength from one-sided profiles and genuine development needs.`,
        insights: `${stars} employee${stars === 1 ? '' : 's'} are above average on both (Top Talent); ${dev} sit below average on both (Development), out of ${points.length}.`,
        executive: `Fast-track the Top Talent box; build targeted plans for the Development box and round out the one-sided quadrants.`
      }
    }

    if (isDual && dual.length) {
      const m2 = widget.measure2
      const topA = dual.reduce((a, b) => (b.left > a.left ? b : a))
      const topB = dual.reduce((a, b) => (b.right > a.right ? b : a))
      const aligned = topA.name === topB.name
      return {
        question: `How do ${measure} and ${m2} compare across ${dimension} — do they move together?`,
        metrics: `Two measures per ${dimension} on independent axes: average ${measure} (bars) and average ${m2} (line).`,
        business: `Reveals whether two different capabilities rise and fall together or trade off — a single-metric chart can't show that relationship.`,
        insights: aligned
          ? `${topA.name} leads on both — highest ${measure} (${topA.left}) and ${m2} (${topB.right}), so the two track together.`
          : `${topA.name} leads on ${measure} (${topA.left}) but ${topB.name} leads on ${m2} (${topB.right}) — the two diverge by group.`,
        executive: aligned
          ? `Treat ${topA.name} as the all-round benchmark for both ${measure} and ${m2}.`
          : `Don't assume strength in ${measure} implies strength in ${m2}; develop each ${dimension} on its weaker axis.`
      }
    }

    if (isScatterLine && scatterLine.points.length && scatterLine.line.length >= 2) {
      const ln = scatterLine.line
      const first = ln[0], last = ln[ln.length - 1]
      const delta = round1(last.y - first.y)
      const dir = delta > 0 ? 'rises' : delta < 0 ? 'falls' : 'stays flat'
      return {
        question: `How does ${yMeasure} change as ${xMeasure} increases — and how scattered are individuals around that trend?`,
        metrics: `Every employee as a point (${xMeasure} vs ${yMeasure}) with a binned average curve overlaid.`,
        business: `The points show how consistent people are; the line shows the underlying trend — together they separate a real pattern from noise.`,
        insights: `Average ${yMeasure} ${dir} from ${first.y} to ${last.y} (${delta >= 0 ? '+' : ''}${delta}) across the ${xMeasure} range, plotted over ${people(scatterLine.points.length)}.`,
        executive: Math.abs(delta) < 1
          ? `${yMeasure} is largely independent of ${xMeasure}; look elsewhere for what drives it.`
          : `${xMeasure} tracks ${yMeasure} — focus on individuals sitting well below the average curve.`
      }
    }

    if (isProgression && progression.line.length >= 2) {
      const ln = progression.line
      const first = ln[0], last = ln[ln.length - 1]
      const delta = round1(last.y - first.y)
      const dir = delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'flat'
      return {
        question: `Is ${measure} improving across assessment dates — and how consistent are individuals?`,
        metrics: `Every attempt as a point over time, with the average ${measure} per period drawn as a line.`,
        business: `Separates a genuine trend from noise: the line shows direction, the scatter shows whether everyone is moving or just a few.`,
        insights: `Average ${measure} went from ${first.y} to ${last.y} (${delta >= 0 ? '+' : ''}${delta}) across ${ln.length} periods — ${dir} — over ${people(progression.points.length)} attempts.`,
        executive: delta >= 0
          ? `Momentum is positive; keep investing in what's driving the gains and watch the points lagging the line.`
          : `The trend is slipping — review what changed and support the widening low tail.`
      }
    }

    if (isMeanSpread && meanSpread.cats.length) {
      const top = meanSpread.cats[0]
      const bottom = meanSpread.cats[meanSpread.cats.length - 1]
      // Widest individual spread within a group (consistency signal).
      const spreadBy = {}
      meanSpread.points.forEach(p => { (spreadBy[p.name] = spreadBy[p.name] || []).push(p.value) })
      let widest = null
      Object.entries(spreadBy).forEach(([name, vals]) => {
        const range = Math.max(...vals) - Math.min(...vals)
        if (!widest || range > widest.range) widest = { name, range: round1(range) }
      })
      return {
        question: `How does each ${dimension}'s average ${measure} compare, and how spread out are individuals within it?`,
        metrics: `A bar for each ${dimension}'s average ${measure}, with every individual score overlaid as a point.`,
        business: `The bar gives the headline; the points reveal whether a group is uniformly at that level or hiding wide internal variation.`,
        insights: `${top.name} leads (avg ${top.avg}) and ${bottom.name} trails (avg ${bottom.avg})${widest ? `; ${widest.name} has the widest internal spread (${widest.range} points)` : ''}.`,
        executive: `Coach for consistency where spread is widest; a strong average can still hide at-risk individuals.`
      }
    }

    // Ranked bar with a numeric measure → top / low performers (per person) or
    // an average-by-category read (e.g. Designation vs Score).
    if (isBar && measure !== 'count' && fullData.length >= 2) {
      const top = fullData[0]
      const bottom = fullData[fullData.length - 1]
      const aggWord = AGG_LABELS[agg]
      const perPerson = dimension === identityColumn
      if (perPerson && order === 'asc') {
        return {
          question: `Who needs the most support on ${measure}?`,
          metrics: `${aggWord} ${measure} per person, ranked lowest-first (showing the bottom ${Math.min(limit, fullData.length)}).`,
          business: `Targets coaching where it moves the needle most.`,
          insights: `${bottom.name} trails at ${bottom.value}; the lowest ranks cluster well under the top of ${top.value}.`,
          executive: `Prioritize coaching for the bottom group and set 90-day improvement goals.`
        }
      }
      if (perPerson) {
        return {
          question: `Who are the strongest performers on ${measure}?`,
          metrics: `${aggWord} ${measure} per person, ranked highest-first (showing the top ${Math.min(limit, fullData.length)}).`,
          business: `Identifies role models and retention priorities.`,
          insights: `${top.name} leads at ${top.value}, ahead of a field that bottoms out at ${bottom.value}.`,
          executive: `Recognize and retain top talent; study their practices for wider rollout.`
        }
      }
      if (top.name === bottom.name) return null
      return {
        question: `How does ${measure} vary across ${dimension}?`,
        metrics: `${aggWord} ${measure} per ${dimension}, ranked ${order === 'asc' ? 'lowest' : 'highest'}-first.`,
        business: `Pinpoints which ${dimension} groups to develop or learn from.`,
        insights: `${top.name} leads at ${top.value} while ${bottom.name} trails at ${bottom.value} — a ${round1(Math.abs(top.value - bottom.value))}-point gap.`,
        executive: `Close the gap by transferring ${top.name}'s practices to ${bottom.name}.`
      }
    }

    // Date line with a numeric measure → trend / progression across attempts.
    if (type === 'line' && isDate && measure !== 'count' && fullData.length >= 2) {
      const first = fullData[0]
      const last = fullData[fullData.length - 1]
      const delta = round1(last.value - first.value)
      const dir = delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'flat'
      return {
        question: `Is ${measure} improving over time?`,
        metrics: `Average ${measure} per period (${fullData.length} points) ordered chronologically.`,
        business: `Tracks whether assessment cycles are translating into real, sustained improvement.`,
        insights: `${measure} moved from ${first.value} (${first.name}) to ${last.value} (${last.name}) — ${dir}${delta ? ` by ${Math.abs(delta)} points` : ''}.`,
        executive: delta >= 0
          ? `Momentum is positive — keep investing in what's driving the gains.`
          : `The downward trend needs attention; review what changed since ${first.name}.`
      }
    }

    return null
  }, [isCombo, isStacked, isScatter, isRisk, isGrouped, isCorr, isRadar, isRange, isPareto, isHeatmap, isTreemap, isQuadrant, isDual, isScatterLine, isProgression, isMeanSpread, isBands, isHist, isBar, isDate, type, comboData, stacked, scatter, risk, grouped, corr, radar, rangeData, paretoData, heat, treemap, quadrant, dual, scatterLine, progression, meanSpread, widget.measure2, bandData, histData, fullData, rows.length, dimension, measure, agg, order, limit, identityColumn, series, xMeasure, yMeasure])

  // Tooltip formatter that appends the sample size to an averaged value, so a
  // high average backed by only a few respondents is never read in isolation.
  const withSampleSize = (v, n, p) =>
    (measure !== 'count' && p?.payload?.count != null) ? [`${v}  (n=${p.payload.count})`, n] : [v, n]

  const renderChart = () => {
    if (isCombo) {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={comboData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#68657F' }} allowDecimals={false} label={{ value: 'Responses', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <YAxis yAxisId="right" orientation="right" domain={valueDomain} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: `Avg ${measure}`, angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <Tooltip formatter={(v, n, p) => (n === 'Responses' ? [`${v} of ${p.payload.total}`, 'Responses'] : [v, n])} />
            <Legend />
            <Bar yAxisId="left" dataKey="count" name="Responses" fill={accent || '#C7B3FD'} radius={[5, 5, 0, 0]} cursor="pointer" onClick={drillCategory}>
              <LabelList dataKey="count" position="top" style={{ fontSize: 9, fill: '#68657F', fontWeight: 'bold' }} />
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="avg" name={`Avg ${measure}`} stroke="#8E66F1" strokeWidth={2.6} dot={{ r: 3.5, fill: '#8E66F1' }} activeDot={{ r: 5 }}>
              <LabelList dataKey="avg" position="top" style={{ fontSize: 9, fill: '#8E66F1', fontWeight: 'bold' }} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
    if (isStacked) {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={stacked.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis tick={{ fontSize: 12, fill: '#68657F' }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            {stacked.keys.map((k, i) => (
              <Bar key={k} dataKey={k} name={k} stackId="s"
                fill={stacked.byBands ? (BAND_COLOR[k] || CHART_COLORS[i % CHART_COLORS.length]) : CHART_COLORS[i % CHART_COLORS.length]}
                radius={i === stacked.keys.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )
    }
    if (isScatter) {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 12, right: 20, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis type="number" dataKey="x" name={xMeasure} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: xMeasure, position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <YAxis type="number" dataKey="y" name={yMeasure} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: yMeasure, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <ZAxis range={[45, 45]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={scatter.points} fill="#8E66F1" fillOpacity={0.6} />
            {scatter.trend && (
              <Line data={scatter.trend} dataKey="y" type="linear" dot={false} stroke="#E0699F" strokeWidth={2} strokeDasharray="6 4" isAnimationActive={false} legendType="none" />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      )
    }
    if (isRisk) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis type="number" dataKey="x" name={`Avg ${measure}`} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: `Avg ${measure} →`, position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <YAxis type="number" dataKey="y" name="Headcount" allowDecimals={false} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: 'Headcount →', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <ZAxis dataKey="y" range={[120, 600]} />
            <ReferenceLine x={risk.avgThresh} stroke="#8F8AA6" strokeDasharray="5 5" label={{ value: `avg ${risk.avgThresh}`, fontSize: 10, fill: '#8F8AA6' }} />
            <ReferenceLine y={risk.countThresh} stroke="#8F8AA6" strokeDasharray="5 5" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [v, n]} />
            <Scatter data={risk.points} cursor="pointer" onClick={drillCategory}>
              {risk.points.map((p) => {
                const highRisk = p.x < risk.avgThresh && p.y >= risk.countThresh
                return <Cell key={p.name} fill={highRisk ? '#E0699F' : '#8E66F1'} fillOpacity={highRisk ? 0.85 : 0.55} />
              })}
              <LabelList dataKey="name" position="top" style={{ fontSize: 10, fill: '#52525B', fontWeight: 600 }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )
    }
    if (isGrouped) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={grouped.data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis tick={{ fontSize: 12, fill: '#68657F' }} />
            <Tooltip />
            <Legend />
            {grouped.keys.map((k, i) => (
              <Bar key={k} dataKey={k} name={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )
    }
    if (isCorr) {
      const n = corr.labels.length
      const ticks = Array.from({ length: n }, (_, i) => i)
      return (
        <ResponsiveContainer width="100%" height={Math.max(280, n * 52 + 110)}>
          <ScatterChart margin={{ top: 16, right: 24, left: 70, bottom: 90 }}>
            <XAxis type="number" dataKey="x" domain={[-0.5, n - 0.5]} ticks={ticks} interval={0}
              tickFormatter={(i) => shortLabel(corr.labels[i] ?? '', 12)} angle={-30} textAnchor="end"
              tick={{ fontSize: 10, fill: '#68657F' }} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="y" domain={[-0.5, n - 0.5]} ticks={ticks} interval={0} reversed
              tickFormatter={(i) => shortLabel(corr.labels[i] ?? '', 12)}
              tick={{ fontSize: 10, fill: '#68657F' }} axisLine={false} tickLine={false} width={70} />
            <ZAxis range={[1600, 1600]} />
            <Tooltip cursor={false}
              formatter={(v, name, p) => [p?.payload?.r ?? '—', `${shortLabel(p?.payload?.yLabel ?? '')} ↔ ${shortLabel(p?.payload?.xLabel ?? '')}`]} />
            <Scatter data={corr.cells} shape="square">
              {corr.cells.map((c) => <Cell key={`${c.x}-${c.y}`} fill={corrColor(c.r)} />)}
              <LabelList dataKey="r" position="center" formatter={(v) => (v === null || v === undefined ? '' : Number(v).toFixed(2))}
                style={{ fontSize: 10, fontWeight: 700 }} fill="#27272A" />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )
    }
    if (isRadar) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart data={radar} outerRadius="72%">
            <PolarGrid stroke="#E8E6F4" />
            <PolarAngleAxis dataKey="assessment" tick={{ fontSize: 11, fill: '#68657F' }} tickFormatter={(v) => shortLabel(v, 14)} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#8F8AA6' }} />
            <Radar name="Avg %" dataKey="value" stroke="#8E66F1" fill="#8E66F1" fillOpacity={0.35} />
            <Tooltip formatter={(v, name, p) => [`${v}% (avg ${p?.payload?.raw})`, p?.payload?.assessment]} />
          </RadarChart>
        </ResponsiveContainer>
      )
    }
    if (isRange) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={rangeData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis tick={{ fontSize: 12, fill: '#68657F' }} />
            <Tooltip formatter={(v, n, p) => {
              if (n === 'Range') return [`${p.payload.lo} – ${p.payload.hi}`, 'Min–Max']
              if (n === `Avg ${measure}`) return [`${v}  (n=${p.payload.count} of ${p.payload.total})`, n]
              return [v, n]
            }} />
            <Legend />
            <Bar dataKey="range" name="Range" fill="#C7B3FD" radius={[5, 5, 5, 5]} barSize={26} cursor="pointer" onClick={drillCategory} />
            <Line type="monotone" dataKey="avg" name={`Avg ${measure}`} stroke="#8E66F1" strokeWidth={0} dot={{ r: 5, fill: '#8E66F1' }} activeDot={{ r: 6 }} legendType="circle">
              <LabelList dataKey="avg" position="top" style={{ fontSize: 9, fill: '#8E66F1', fontWeight: 'bold' }} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
    if (isPareto) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={paretoData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#68657F' }} allowDecimals={false} label={{ value: 'Respondents', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 12, fill: '#68657F' }} unit="%" label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <Tooltip formatter={(v, n) => (n === 'Cumulative %' ? [`${v}%`, n] : [v, n])} />
            <Legend />
            <Bar yAxisId="left" dataKey="count" name="Respondents" fill="#8E66F1" radius={[5, 5, 0, 0]} cursor="pointer" onClick={drillCategory}>
              <LabelList dataKey="count" position="top" style={{ fontSize: 9, fill: '#68657F', fontWeight: 'bold' }} />
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="cumPct" name="Cumulative %" stroke="#E0699F" strokeWidth={2.4} dot={{ r: 3, fill: '#E0699F' }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
    if (isHeatmap) {
      const nx = heat.cols.length
      const ny = heat.cats.length
      const xticks = Array.from({ length: nx }, (_, i) => i)
      const yticks = Array.from({ length: ny }, (_, i) => i)
      return (
        <ResponsiveContainer width="100%" height={Math.max(280, ny * 46 + 120)}>
          <ScatterChart margin={{ top: 16, right: 24, left: 95, bottom: 90 }}>
            <XAxis type="number" dataKey="x" domain={[-0.5, nx - 0.5]} ticks={xticks} interval={0}
              tickFormatter={(i) => shortLabel(heat.cols[i] ?? '', 12)} angle={-30} textAnchor="end"
              tick={{ fontSize: 10, fill: '#68657F' }} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="y" domain={[-0.5, ny - 0.5]} ticks={yticks} interval={0} reversed
              tickFormatter={(i) => shortLabel(heat.cats[i] ?? '', 14)}
              tick={{ fontSize: 10, fill: '#68657F' }} axisLine={false} tickLine={false} width={95} />
            <ZAxis range={[1400, 1400]} />
            <Tooltip cursor={false}
              formatter={(v, name, p) => [p?.payload?.raw == null ? '—' : `${p.payload.raw}  (${p.payload.pct}%, n=${p.payload.n})`, `${shortLabel(p?.payload?.cat ?? '')} · ${shortLabel(p?.payload?.assessment ?? '')}`]} />
            <Scatter data={heat.cells} shape="square">
              {heat.cells.map((c) => <Cell key={`${c.x}-${c.y}`} fill={c.pct == null ? '#F2EFFE' : heatColor(c.pct)} />)}
              <LabelList dataKey="pct" position="center" formatter={(v) => (v === null || v === undefined ? '' : `${Math.round(v)}`)}
                style={{ fontSize: 10, fontWeight: 700 }} fill="#fff" />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )
    }
    if (isTreemap) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <Treemap data={treemap} dataKey="size" stroke="#fff" isAnimationActive={false} content={<TreemapTile />}>
            <Tooltip formatter={(v, name, p) => [`${p?.payload?.size} people · avg ${p?.payload?.avg} (n=${p?.payload?.n})`, p?.payload?.name]} />
          </Treemap>
        </ResponsiveContainer>
      )
    }
    if (isQuadrant) {
      const { points, xMid, yMid, xMax, yMax } = quadrant
      const quadColor = (p) => {
        const hx = p.x >= xMid, hy = p.y >= yMid
        if (hx && hy) return '#7540EC'
        if (!hx && !hy) return '#E0699F'
        return '#A38AF2'
      }
      const areaLabel = { fontSize: 10, fill: '#8F8AA6', fontWeight: 600 }
      return (
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis type="number" dataKey="x" name={xMeasure} domain={[0, 'dataMax']} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: `${xMeasure} →`, position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <YAxis type="number" dataKey="y" name={yMeasure} domain={[0, 'dataMax']} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: `${yMeasure} →`, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <ZAxis range={[55, 55]} />
            {points.length > 0 && (
              <>
                <ReferenceArea x1={xMid} y1={yMid} x2={xMax} y2={yMax} fill="#8E66F1" fillOpacity={0.07} label={{ value: 'Top Talent', position: 'insideTopRight', ...areaLabel, fill: '#7540EC' }} />
                <ReferenceArea x1={0} y1={yMid} x2={xMid} y2={yMax} fill="#A38AF2" fillOpacity={0.05} label={{ value: `High ${shortLabel(yMeasure, 12)}`, position: 'insideTopLeft', ...areaLabel }} />
                <ReferenceArea x1={xMid} y1={0} x2={xMax} y2={yMid} fill="#A38AF2" fillOpacity={0.05} label={{ value: `High ${shortLabel(xMeasure, 12)}`, position: 'insideBottomRight', ...areaLabel }} />
                <ReferenceArea x1={0} y1={0} x2={xMid} y2={yMid} fill="#E0699F" fillOpacity={0.05} label={{ value: 'Development', position: 'insideBottomLeft', ...areaLabel, fill: '#E0699F' }} />
              </>
            )}
            <ReferenceLine x={xMid} stroke="#8F8AA6" strokeDasharray="5 5" />
            <ReferenceLine y={yMid} stroke="#8F8AA6" strokeDasharray="5 5" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [v, n === 'x' ? xMeasure : n === 'y' ? yMeasure : n]} />
            <Scatter data={points} fillOpacity={0.7}>
              {points.map((p, i) => <Cell key={i} fill={quadColor(p)} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )
    }
    if (isDual) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={dual} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis yAxisId="left" domain={valueDomain} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: `Avg ${measure}`, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: `Avg ${widget.measure2}`, angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="left" name={`Avg ${measure}`} fill={accent || '#C7B3FD'} radius={[5, 5, 0, 0]} cursor="pointer" onClick={drillCategory} />
            <Line yAxisId="right" type="monotone" dataKey="right" name={`Avg ${widget.measure2}`} stroke="#8E66F1" strokeWidth={2.6} dot={{ r: 3.5, fill: '#8E66F1' }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
    if (isScatterLine) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 12, right: 20, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis type="number" dataKey="x" name={xMeasure} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: xMeasure, position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <YAxis type="number" dataKey="y" domain={valueDomain} name={yMeasure} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: yMeasure, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <ZAxis range={[45, 45]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter data={scatterLine.points} name="Individuals" fill={accent || '#8E66F1'} fillOpacity={0.5} />
            <Line data={scatterLine.line} dataKey="y" name="Average trend" type="monotone" stroke="#E0699F" strokeWidth={2.6} dot={{ r: 3, fill: '#E0699F' }} isAnimationActive={false} legendType="line" />
          </ScatterChart>
        </ResponsiveContainer>
      )
    }
    if (isProgression) {
      const fmtTs = (t2) => {
        const d = new Date(t2)
        return progression.byMonth
          ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 12, right: 20, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis type="number" dataKey="x" name="Date" domain={['dataMin', 'dataMax']} tickFormatter={fmtTs} tick={{ fontSize: 11, fill: '#68657F' }} />
            <YAxis type="number" dataKey="y" domain={valueDomain} name={measure} tick={{ fontSize: 12, fill: '#68657F' }} label={{ value: measure, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8F8AA6' } }} />
            <ZAxis range={[40, 40]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} labelFormatter={fmtTs} formatter={(v, n) => [v, n === 'x' ? 'Date' : measure]} />
            <Legend />
            <Scatter data={progression.points} name="Individual attempts" fill={accent || '#8E66F1'} fillOpacity={0.4} />
            <Line data={progression.line} dataKey="y" name="Average per period" type="monotone" stroke="#E0699F" strokeWidth={2.6} dot={{ r: 3, fill: '#E0699F' }} isAnimationActive={false} legendType="line" />
          </ScatterChart>
        </ResponsiveContainer>
      )
    }
    if (isMeanSpread) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={meanSpread.cats} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis domain={valueDomain} tick={{ fontSize: 12, fill: '#68657F' }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Bar dataKey="avg" name={`Avg ${measure}`} fill={accent || '#C7B3FD'} radius={[5, 5, 0, 0]} barSize={28} cursor="pointer" onClick={drillCategory} />
            <Scatter data={meanSpread.points} dataKey="value" name="Individuals" fill="#7540EC" fillOpacity={0.55} />
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
    if (type === 'hbar') {
      return (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
          <BarChart layout="vertical" data={data} margin={{ top: 8, right: 28, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" horizontal={false} />
            <XAxis type="number" domain={valueDomain} tick={{ fontSize: 12, fill: '#68657F' }} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: '#68657F' }} tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />
            <Tooltip formatter={withSampleSize} />
            <Bar dataKey="value" name={measureLabel} fill={accent || undefined} radius={[0, 6, 6, 0]} barSize={18} cursor="pointer" onClick={drillCategory}>
              {!accent && data.map((entry, i) => <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: '#68657F', fontWeight: 'bold' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }
    if (type === 'line') {
      // Cap visible axis labels to ~10 so they never overlap, regardless of point count.
      const tickInterval = data.length > 12 ? Math.ceil(data.length / 10) : 0
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={tickInterval} tickMargin={8} minTickGap={16} />
            <YAxis domain={valueDomain} tick={{ fontSize: 12, fill: '#68657F' }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" name={measureLabel} stroke={accent || '#8E66F1'} strokeWidth={2.5} dot={{ r: 3, fill: accent || '#8E66F1' }} activeDot={{ r: 5 }}>
              <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: '#68657F', fontWeight: 'bold' }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      )
    }
    if (type === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(d) => `${d.name}: ${d.value}`} cursor="pointer" onClick={drillCategory}>
              {data.map((entry, i) => <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )
    }
    if (type === 'bands') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={bandData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2} label={(d) => `${d.name}: ${d.value}`} cursor="pointer" onClick={drillRange}>
              {bandData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(v) => [`${v} ${v === 1 ? 'person' : 'people'}`, 'Count']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )
    }
    if (type === 'histogram') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={histData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }} barCategoryGap={1}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis domain={valueDomain} tick={{ fontSize: 12, fill: '#68657F' }} allowDecimals={false} />
            <Tooltip formatter={(v) => [`${v} record${v === 1 ? '' : 's'}`, 'Records']} />
            <Bar dataKey="value" name="Records" fill={accent || '#8E66F1'} radius={[4, 4, 0, 0]} cursor="pointer" onClick={drillRange}>
              <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: '#68657F', fontWeight: 'bold' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#68657F' }} interval={0} angle={-25} textAnchor="end" height={60} tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
          <YAxis domain={valueDomain} tick={{ fontSize: 12, fill: '#68657F' }} />
          <Tooltip formatter={withSampleSize} />
          <Bar dataKey="value" name={measureLabel} fill={accent || undefined} radius={[6, 6, 0, 0]} cursor="pointer" onClick={drillCategory}>
            {!accent && data.map((entry, i) => <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#68657F', fontWeight: 'bold' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="di-chart-card">
      <div className="di-chart-card__head">
        <h3 className="di-chart-card__title">{displayTitle}</h3>
        <button className="di-chart-card__remove" onClick={() => onRemove(widget.id)} aria-label="Remove chart" title="Remove this chart (it won't appear in the PDF)">
          <CloseIcon />
        </button>
      </div>

      <div className="di-chart-controls">
        <select
          className="di-select"
          value={type}
          onChange={(e) => {
            const t = e.target.value
            const num0 = numericCols[0]?.name
            const num1 = numericCols.find(c => c.name !== num0)?.name
            const patch = { type: t }
            // Charts that measure a number need a numeric measure, not "count".
            if (['histogram', 'bands', 'combo', 'riskmatrix', 'stacked', 'range', 'treemap', 'dualaxis', 'progression', 'meanspread'].includes(t) && (measure === 'count' || !measure)) {
              patch.measure = num0
              patch.agg = 'avg'
            }
            // Progression plots over time — default its axis to a date column.
            if (t === 'progression') {
              const dCol = columns.find(c => c.type === 'date')?.name
              if (dCol && columns.find(c => c.name === dimension)?.type !== 'date') patch.dimension = dCol
            }
            // Smart-type specific defaults so the chart renders immediately.
            if (t === 'stacked' && !series) {
              patch.series = num0 ? '__bands__' : (categoricalCols.find(c => c.name !== dimension)?.name)
            }
            if (t === 'scatter' || t === 'quadrant' || t === 'scatterline') {
              patch.xMeasure = xMeasure || num1 || num0
              patch.yMeasure = yMeasure || num0
            }
            if (t === 'dualaxis' && !widget.measure2) {
              patch.measure2 = num1 || num0
            }
            // Multi-assessment charts span every numeric column by default.
            if (['grouped', 'correlation', 'radar', 'heatmap'].includes(t) && !(widget.scores && widget.scores.length)) {
              patch.scores = numericCols.map(c => c.name)
            }
            onUpdate(widget.id, patch)
          }}
        >
          <optgroup label="Basic">
            <option value="hbar">Bar (ranked)</option>
            <option value="bar">Bar (column)</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
            {numericCols.length > 0 && <option value="histogram">Histogram</option>}
            {numericCols.length > 0 && <option value="bands">Performance bands</option>}
          </optgroup>
          {numericCols.length > 0 && (
            <optgroup label="Smart (two factors)">
              <option value="combo">Combo · responses + avg</option>
              <option value="range">Range · min/avg/max + n</option>
              <option value="pareto">Pareto · participation concentration</option>
              <option value="treemap">Treemap · headcount + avg score</option>
              {numericCols.length >= 2 && <option value="dualaxis">Dual axis · bar + line (2 metrics)</option>}
              {numericCols.length >= 2 && <option value="scatterline">Scatter + line · points + trend</option>}
              <option value="progression">Progression · points + trend over time</option>
              <option value="meanspread">Mean + spread · bar + points</option>
              <option value="stacked">Stacked · split / distribution</option>
              {numericCols.length >= 2 && <option value="scatter">Scatter · correlation</option>}
              {numericCols.length >= 2 && <option value="quadrant">Quadrant · talent matrix</option>}
              <option value="riskmatrix">Risk matrix · score vs size</option>
            </optgroup>
          )}
          {numericCols.length >= 2 && (
            <optgroup label="Multi-quiz">
              <option value="grouped">Grouped · compare all quizzes</option>
              <option value="heatmap">Heatmap · group × quiz</option>
              <option value="correlation">Correlation matrix</option>
              <option value="radar">Strength / weakness radar</option>
            </optgroup>
          )}
        </select>

        {/* Scatter, quadrant & scatter+line compare two numeric columns (X vs Y). */}
        {(isScatter || isQuadrant || isScatterLine) ? (
          <>
            <select className="di-select" value={xMeasure || ''} onChange={(e) => onUpdate(widget.id, { xMeasure: e.target.value })}>
              {numericCols.map(c => <option key={c.name} value={c.name}>X: {c.name}</option>)}
            </select>
            <span className="di-chart-controls__sep">vs</span>
            <select className="di-select" value={yMeasure || ''} onChange={(e) => onUpdate(widget.id, { yMeasure: e.target.value })}>
              {numericCols.map(c => <option key={c.name} value={c.name}>Y: {c.name}</option>)}
            </select>
          </>
        ) : (
          <>
            {!isHist && !isBands && !isCorr && !isRadar && (
              <>
                <span className="di-chart-controls__sep">by</span>
                <select className="di-select" value={dimension} onChange={(e) => onUpdate(widget.id, { dimension: e.target.value })}>
                  {dimensionCols.length === 0 && <option value={dimension}>{dimension}</option>}
                  {dimensionCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </>
            )}

            {/* Multi-assessment charts span every Score column — no single measure to pick. */}
            {(isGrouped || isCorr || isRadar || isHeatmap) && (
              <span className="di-chart-controls__sep">across {scoreList.length} {scoreList.length === 1 ? 'quiz' : 'quizzes'}</span>
            )}

            {/* Stacked: choose the second factor to split each bar by. */}
            {isStacked && (
              <>
                <span className="di-chart-controls__sep">split by</span>
                <select className="di-select" value={series || ''} onChange={(e) => onUpdate(widget.id, { series: e.target.value })}>
                  {numericCols.length > 0 && <option value="__bands__">Score bands</option>}
                  {categoricalCols.filter(c => c.name !== dimension).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </>
            )}

            {/* Combo, risk, hist & bands always measure a numeric; bar/line/pie can also just count. */}
            {!isStacked && !isGrouped && !isCorr && !isRadar && !isHeatmap && (
              <>
                {!isHist && !isBands && <span className="di-chart-controls__sep">·</span>}
                <select
                  className="di-select"
                  value={measure}
                  onChange={(e) => {
                    const m = e.target.value
                    onUpdate(widget.id, { measure: m, agg: m === 'count' ? 'count' : (agg === 'count' ? 'avg' : agg) })
                  }}
                >
                  {!isHist && !isBands && !isCombo && !isRisk && !isRange && !isTreemap && !isDual && !isProgression && !isMeanSpread && <option value="count">{isPareto ? 'All respondents' : 'Count of rows'}</option>}
                  {numericCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </>
            )}

            {/* Dual axis: the second metric drawn as the overlaid line. */}
            {isDual && (
              <>
                <span className="di-chart-controls__sep">+ line</span>
                <select className="di-select" value={widget.measure2 || ''} onChange={(e) => onUpdate(widget.id, { measure2: e.target.value })}>
                  {numericCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </>
            )}

            {measure !== 'count' && !isHist && !isBands && !isCombo && !isRisk && !isStacked && !isGrouped && !isCorr && !isRadar && !isRange && !isPareto && !isTreemap && !isHeatmap && !isDual && !isProgression && !isMeanSpread && (
              <select className="di-select" value={agg} onChange={(e) => onUpdate(widget.id, { agg: e.target.value })}>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            )}
            {showTopN && (
              <select className="di-select" value={String(topN)} onChange={(e) => onUpdate(widget.id, { topN: e.target.value })}>
                {TOPN_OPTIONS.filter(n => n < fullData.length).map(n => <option key={n} value={String(n)}>Top {n}</option>)}
                <option value="all">All ({fullData.length})</option>
              </select>
            )}
          </>
        )}
        <button
          type="button"
          className={`di-customize-toggle ${showCustomize ? 'is-active' : ''}`}
          onClick={() => setShowCustomize(s => !s)}
          title="Customize this chart — title, scale, order, color"
        >
          <TuneIcon /> Customize
        </button>
      </div>

      {showCustomize && (
        <div className="di-customize">
          <div className="di-customize__field di-customize__field--wide">
            <label>Title</label>
            <input
              type="text"
              className="di-input di-input--full"
              placeholder={titleText}
              value={title || ''}
              onChange={(e) => onUpdate(widget.id, { title: e.target.value })}
            />
          </div>

          {(type === 'bar' || type === 'hbar') && !isDate && (
            <div className="di-customize__field">
              <label>Order</label>
              <select className="di-select" value={order || 'desc'} onChange={(e) => onUpdate(widget.id, { order: e.target.value })}>
                <option value="desc">High → Low</option>
                <option value="asc">Low → High</option>
              </select>
            </div>
          )}

          {scalable && (
            <div className="di-customize__field">
              <label>Scale (axis min / max)</label>
              <div className="di-range">
                <input type="number" className="di-input" placeholder="auto" value={yMin ?? ''} onChange={(e) => onUpdate(widget.id, { yMin: e.target.value === '' ? null : e.target.value })} />
                <span className="di-range__sep">–</span>
                <input type="number" className="di-input" placeholder="auto" value={yMax ?? ''} onChange={(e) => onUpdate(widget.id, { yMax: e.target.value === '' ? null : e.target.value })} />
              </div>
            </div>
          )}

          {['bar', 'hbar', 'line', 'histogram', 'combo', 'dualaxis', 'scatterline', 'progression', 'meanspread'].includes(type) && (
            <div className="di-customize__field">
              <label>Color</label>
              <div className="di-customize__color">
                <input type="color" value={color || '#8E66F1'} onChange={(e) => onUpdate(widget.id, { color: e.target.value })} />
                {color && <button type="button" className="di-link" onClick={() => onUpdate(widget.id, { color: null })}>Reset</button>}
              </div>
            </div>
          )}

          <button
            type="button"
            className="di-link di-customize__reset"
            onClick={() => onUpdate(widget.id, { title: '', yMin: null, yMax: null, color: null })}
          >
            Reset all
          </button>
        </div>
      )}

      {view.length === 0
        ? <div className="di-empty-charts">No data for the current filters.</div>
        : (type === 'hbar' ? <div className="di-chart-scroll">{renderChart()}</div> : renderChart())}

      {insight && (
        <div className="di-insight-card">
          <div className="di-insight-card__q">
            <LightbulbIcon style={{ fontSize: 16 }} /> {insight.question}
          </div>
          <div className="di-insight-card__grid">
            <div><span className="di-insight-card__k">Metrics used</span><p>{insight.metrics}</p></div>
            <div><span className="di-insight-card__k">Business value</span><p>{insight.business}</p></div>
            <div><span className="di-insight-card__k">Insights generated</span><p>{insight.insights}</p></div>
            <div><span className="di-insight-card__k">Executive interpretation</span><p>{insight.executive}</p></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Paginated data table with CSV export ──────────────────────
const DataTable = ({ columns, rows, fileName, anonymized, page, onPage }) => {
  const visibleColumns = useMemo(() => {
    if (!rows || !rows.length) return columns;
    return columns.filter(c =>
      rows.some(r => isNonBlankValue(r[c.name], c.type))
    );
  }, [columns, rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * TABLE_PAGE_SIZE
  const pageRows = rows.slice(start, start + TABLE_PAGE_SIZE)

  const exportCSV = () => {
    const headers = visibleColumns.map(c => c.name)
    const body = rows.map(r => headers.map(h => r[h]))
    const csv = [headers, ...body].map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(fileName || 'data').replace(/\.[^.]+$/, '')}-filtered-${anonymized ? 'company' : 'internal'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const headers = visibleColumns.map(c => c.name)
    const body = rows.map(r => headers.map(h => r[h]))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    ws['!cols'] = headers.map((colName) => {
      const maxLen = Math.max(
        colName.length,
        ...rows.map(r => String(r[colName] ?? '').length)
      );
      return { wch: Math.min(40, Math.max(10, maxLen + 3)) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Filtered Data');
    const name = (fileName || 'data').replace(/\.[^.]+$/, '')
    XLSX.writeFile(wb, `${name}-filtered-${anonymized ? 'company' : 'internal'}.xlsm`, { bookType: 'xlsm' });
  }

  return (
    <div className="di-panel">
      <div className="di-panel__head">
        <h2><TableChartIcon /> Filtered Data <span className="di-badge">{rows.length}</span></h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn--outline" onClick={exportCSV} disabled={rows.length === 0}>
            <TableChartIcon className="btn-icon" /> Export CSV
          </button>
          <button className="btn btn--outline" onClick={exportExcel} disabled={rows.length === 0}>
            <TableChartIcon className="btn-icon" /> Export Excel
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="di-empty-charts">No rows match the current filters.</div>
      ) : (
        <>
          <div className="di-table-wrap">
            <table className="di-table">
              <thead>
                <tr>{visibleColumns.map(c => <th key={c.name}>{c.name}</th>)}</tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={start + i}>
                    {visibleColumns.map(c => <td key={c.name}>{String(r[c.name] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="di-pager">
              <button className="di-link" onClick={() => onPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>Prev</button>
              <span>Page {safePage + 1} of {totalPages}</span>
              <button className="di-link" onClick={() => onPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Custom-chart builder pop-up ───────────────────────────────
// Collects every field for a chart (type, dimension/measures, scale, title,
// color, order, Top-N) up front, then hands the finished config to onCreate.
const ChartBuilderModal = ({ columns, dimensionCols, numericCols, categoricalCols, scoreCols, onCreate, onClose }) => {
  const num0 = numericCols[0]?.name
  const num1 = numericCols.find(c => c.name !== num0)?.name
  const firstDim = dimensionCols[0]?.name || columns[0]?.name

  const [draft, setDraft] = useState({
    type: 'bar',
    dimension: firstDim,
    measure: 'count',
    agg: 'count',
    topN: 15,
    scores: numericCols.map(c => c.name)
  })
  const set = (patch) => setDraft(d => ({ ...d, ...patch }))

  // Mirror the inline type-change defaults so the chosen type renders on create.
  const changeType = (t) => {
    const patch = { type: t }
    if (['histogram', 'bands', 'combo', 'riskmatrix', 'stacked', 'range', 'treemap', 'dualaxis', 'progression', 'meanspread'].includes(t) && (draft.measure === 'count' || !draft.measure)) {
      patch.measure = num0; patch.agg = 'avg'
    }
    if (t === 'progression') {
      const dCol = columns.find(c => c.type === 'date')?.name
      if (dCol) patch.dimension = dCol
    }
    if (t === 'stacked' && !draft.series) patch.series = num0 ? '__bands__' : (categoricalCols.find(c => c.name !== draft.dimension)?.name)
    if (['scatter', 'quadrant', 'scatterline'].includes(t)) { patch.xMeasure = draft.xMeasure || num1 || num0; patch.yMeasure = draft.yMeasure || num0 }
    if (t === 'dualaxis' && !draft.measure2) patch.measure2 = num1 || num0
    if (['grouped', 'heatmap', 'correlation', 'radar'].includes(t) && !(draft.scores && draft.scores.length)) patch.scores = numericCols.map(c => c.name)
    set(patch)
  }

  const t = draft.type
  const isXY = ['scatter', 'quadrant', 'scatterline'].includes(t)
  const isMulti = ['grouped', 'heatmap', 'correlation', 'radar'].includes(t)
  const isStackedT = t === 'stacked'
  const needsDim = !isXY && !['histogram', 'bands', 'correlation', 'radar'].includes(t)
  const numericMeasureType = ['histogram', 'bands', 'combo', 'riskmatrix', 'range', 'treemap', 'dualaxis', 'progression', 'meanspread'].includes(t)
  const canCount = ['bar', 'hbar', 'line', 'pie', 'pareto'].includes(t)
  const showMeasure = numericMeasureType || canCount
  const showAgg = ['bar', 'hbar', 'line', 'pie'].includes(t) && draft.measure !== 'count'
  const showOrder = ['bar', 'hbar'].includes(t)
  const scalableT = ['bar', 'hbar', 'line', 'combo', 'histogram', 'dualaxis', 'scatterline', 'progression', 'meanspread'].includes(t)
  const colorableT = ['bar', 'hbar', 'line', 'histogram', 'combo', 'dualaxis', 'scatterline', 'progression', 'meanspread'].includes(t)

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal di-builder" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal__head">
          <div>
            <h2 className="di-modal__title">Build a custom chart</h2>
            <p className="di-modal__subtitle">Choose the fields and scale, then create the chart</p>
          </div>
          <button className="di-chart-card__remove" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className="di-builder__grid">
          <div className="di-builder__field di-builder__field--wide">
            <label>Chart type</label>
            <select className="di-select" value={t} onChange={(e) => changeType(e.target.value)}>
              <optgroup label="Basic">
                <option value="hbar">Bar (ranked)</option>
                <option value="bar">Bar (column)</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                {numericCols.length > 0 && <option value="histogram">Histogram</option>}
                {numericCols.length > 0 && <option value="bands">Performance bands</option>}
              </optgroup>
              {numericCols.length > 0 && (
                <optgroup label="Smart (two factors)">
                  <option value="combo">Combo · responses + avg</option>
                  <option value="range">Range · min/avg/max + n</option>
                  <option value="pareto">Pareto · participation</option>
                  <option value="treemap">Treemap · headcount + avg</option>
                  {numericCols.length >= 2 && <option value="dualaxis">Dual axis · bar + line</option>}
                  {numericCols.length >= 2 && <option value="scatterline">Scatter + line · points + trend</option>}
                  <option value="progression">Progression · points + trend over time</option>
                  <option value="meanspread">Mean + spread · bar + points</option>
                  <option value="stacked">Stacked · split / distribution</option>
                  {numericCols.length >= 2 && <option value="scatter">Scatter · correlation</option>}
                  {numericCols.length >= 2 && <option value="quadrant">Quadrant · talent matrix</option>}
                  <option value="riskmatrix">Risk matrix · score vs size</option>
                </optgroup>
              )}
              {numericCols.length >= 2 && (
                <optgroup label="Multi-quiz">
                  <option value="grouped">Grouped · all quizzes</option>
                  <option value="heatmap">Heatmap · group × quiz</option>
                  <option value="correlation">Correlation matrix</option>
                  <option value="radar">Strength / weakness radar</option>
                </optgroup>
              )}
            </select>
          </div>

          {needsDim && (
            <div className="di-builder__field">
              <label>{isStackedT || isMulti ? 'Group by' : 'Category (X axis)'}</label>
              <select className="di-select" value={draft.dimension || ''} onChange={(e) => set({ dimension: e.target.value })}>
                {dimensionCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}

          {isXY && (
            <>
              <div className="di-builder__field">
                <label>X axis</label>
                <select className="di-select" value={draft.xMeasure || ''} onChange={(e) => set({ xMeasure: e.target.value })}>
                  {numericCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="di-builder__field">
                <label>Y axis</label>
                <select className="di-select" value={draft.yMeasure || ''} onChange={(e) => set({ yMeasure: e.target.value })}>
                  {numericCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </>
          )}

          {showMeasure && (
            <div className="di-builder__field">
              <label>{t === 'dualaxis' ? 'Bars (metric A)' : 'Measure (Y axis)'}</label>
              <select className="di-select" value={draft.measure} onChange={(e) => { const m = e.target.value; set({ measure: m, agg: m === 'count' ? 'count' : (draft.agg === 'count' ? 'avg' : draft.agg) }) }}>
                {canCount && <option value="count">{t === 'pareto' ? 'All respondents' : 'Count of rows'}</option>}
                {numericCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}

          {t === 'dualaxis' && (
            <div className="di-builder__field">
              <label>Line (metric B)</label>
              <select className="di-select" value={draft.measure2 || ''} onChange={(e) => set({ measure2: e.target.value })}>
                {numericCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}

          {isStackedT && (
            <div className="di-builder__field">
              <label>Split by</label>
              <select className="di-select" value={draft.series || ''} onChange={(e) => set({ series: e.target.value })}>
                {numericCols.length > 0 && <option value="__bands__">Score bands</option>}
                {categoricalCols.filter(c => c.name !== draft.dimension).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}

          {showAgg && (
            <div className="di-builder__field">
              <label>Aggregation</label>
              <select className="di-select" value={draft.agg} onChange={(e) => set({ agg: e.target.value })}>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </div>
          )}

          {showOrder && (
            <div className="di-builder__field">
              <label>Order</label>
              <select className="di-select" value={draft.order || 'desc'} onChange={(e) => set({ order: e.target.value })}>
                <option value="desc">High → Low</option>
                <option value="asc">Low → High</option>
              </select>
            </div>
          )}

          {showOrder && (
            <div className="di-builder__field">
              <label>Show</label>
              <select className="di-select" value={String(draft.topN)} onChange={(e) => set({ topN: e.target.value })}>
                {TOPN_OPTIONS.map(n => <option key={n} value={String(n)}>Top {n}</option>)}
                <option value="all">All</option>
              </select>
            </div>
          )}

          {isMulti && (
            <div className="di-builder__field di-builder__field--wide">
              <label>Quizzes</label>
              <div className="di-builder__note">Uses all {scoreCols.length} detected {scoreCols.length === 1 ? 'quiz' : 'quizzes'} automatically.</div>
            </div>
          )}

          {scalableT && (
            <div className="di-builder__field">
              <label>Scale (axis min / max)</label>
              <div className="di-range">
                <input type="number" className="di-input" placeholder="auto" value={draft.yMin ?? ''} onChange={(e) => set({ yMin: e.target.value === '' ? null : e.target.value })} />
                <span className="di-range__sep">–</span>
                <input type="number" className="di-input" placeholder="auto" value={draft.yMax ?? ''} onChange={(e) => set({ yMax: e.target.value === '' ? null : e.target.value })} />
              </div>
            </div>
          )}

          {colorableT && (
            <div className="di-builder__field">
              <label>Color</label>
              <div className="di-customize__color">
                <input type="color" value={draft.color || '#8E66F1'} onChange={(e) => set({ color: e.target.value })} />
                {draft.color && <button type="button" className="di-link" onClick={() => set({ color: null })}>Reset</button>}
              </div>
            </div>
          )}

          <div className="di-builder__field di-builder__field--wide">
            <label>Title (optional)</label>
            <input type="text" className="di-input di-input--full" placeholder="Auto-generated from your selection" value={draft.title || ''} onChange={(e) => set({ title: e.target.value })} />
          </div>
        </div>

        <div className="di-builder__actions">
          <button className="btn btn--outline" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={() => onCreate({ ...draft })}>
            <AddChartIcon className="btn-icon" /> Create chart
          </button>
        </div>
      </div>
    </div>
  )
}

export default DetailedInsights
