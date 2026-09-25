import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import StarIcon from '@mui/icons-material/Star';
import TargetIcon from '@mui/icons-material/GpsFixed';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './ReportViewer.css';
import { enrichQuizWithInstructions } from './QuizInstructionsMap';
import { quizApi, userApi, quizPacketApi, pdfTemplateApi } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { translateBatch } from '../services/translation';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import ReportContent, { exportElementToPdfBlob } from './ReportContent';


// Custom alpha function for hex/rgb to rgba conversion without material-ui
const alpha = (color, opacity) => {
  if (!color) return `rgba(142, 102, 241, ${opacity})`;
  if (color === 'primary') return `rgba(142, 102, 241, ${opacity})`;
  if (color.startsWith('var(')) {
    if (color.includes('--color-primary')) return `rgba(142, 102, 241, ${opacity})`;
    if (color.includes('--color-secondary')) return `rgba(80, 80, 88, ${opacity})`;
    if (color.includes('--color-fg')) return `rgba(24, 24, 27, ${opacity})`;
  }
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (color.startsWith('rgb')) {
    return color.replace(/rgb\(|rgba\(/, 'rgba(').replace(/\)/, `, ${opacity})`);
  }
  return color;
};

// Helper to filter out duplicate sections from quiz.report_footer
const getFilteredFooterMarkdown = (footerText) => {
  if (!footerText) return '';
  const lines = footerText.split('\n');
  const result = [];
  let skipSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if line starts a section header (markdown H1, H2, H3, H4)
    if (trimmed.startsWith('#')) {
      const lowerLine = trimmed.toLowerCase();
      if (
        lowerLine.includes('next step') ||
        lowerLine.includes('support services') ||
        lowerLine.includes('our services') ||
        lowerLine.includes('contact') ||
        lowerLine.includes('disclaimer') ||
        lowerLine.includes('helpline')
      ) {
        skipSection = true;
      } else {
        skipSection = false;
      }
    }
    
    if (!skipSection) {
      result.push(line);
    }
  }
  
  return result.join('\n').trim();
};

// The EQ "Score Table" section is only meaningful for HappiEQ. Strip it (the
// "Score Table" label plus the markdown table that follows) from other
// assessments' report text. Handles the label as a markdown heading
// ("## Score Table") or a bold line ("**Score Table**").
const stripScoreTableSection = (text) => {
  if (!text) return '';
  const lines = text.split('\n');
  const result = [];
  let skipping = false;

  // Reduce a line to letters only so "## Score Table", "**Score Table**" and
  // "Score Table" all collapse to "scoretable".
  const isScoreTableLabel = (t) => t.replace(/[^a-z]/gi, '').toLowerCase() === 'scoretable';
  const isTableRow = (t) => t.startsWith('|');

  for (const line of lines) {
    const trimmed = line.trim();

    if (skipping) {
      // Keep dropping the table rows and blank lines under the label.
      if (isTableRow(trimmed) || trimmed === '') continue;
      // Anything else marks the end of the Score Table block.
      skipping = false;
    }

    if (isScoreTableLabel(trimmed)) {
      skipping = true;
      continue; // drop the label line itself
    }

    result.push(line);
  }

  return result.join('\n').trim();
};

// Strip the plain-markdown "Support Services" section from a report footer so it
// can be replaced by the styled Support Services cards. Removes the labeled
// heading (markdown "#" or bold "**...**") and everything under it until the
// next heading.
const stripSupportServicesSection = (text) => {
  if (!text) return '';
  const lines = text.split('\n');
  const result = [];
  let skipping = false;

  const isHeading = (t) =>
    t.startsWith('#') || /^\*\*.+\*\*:?$/.test(t) || /^__.+__:?$/.test(t);

  for (const line of lines) {
    const trimmed = line.trim();
    if (isHeading(trimmed)) {
      const bare = trimmed.replace(/[^a-z]/gi, '').toLowerCase();
      skipping = bare.includes('supportservices') || bare.includes('ourservices');
    }
    if (!skipping) result.push(line);
  }

  return result.join('\n').trim();
};

// Split footer markdown at the "Contact Details" heading so other content (the
// Support Services cards) can be inserted just before it. Returns
// [beforeContact, contactOnward].
const splitAtContactDetails = (text) => {
  if (!text) return ['', ''];
  const lines = text.split('\n');
  const idx = lines.findIndex((line) => {
    const t = line.trim();
    const isHeading = t.startsWith('#') || /^\*\*.+\*\*:?$/.test(t) || /^__.+__:?$/.test(t);
    return isHeading && t.replace(/[^a-z]/gi, '').toLowerCase().includes('contactdetails');
  });
  if (idx === -1) return [text.trim(), ''];
  return [lines.slice(0, idx).join('\n').trim(), lines.slice(idx).join('\n').trim()];
};

// Service page URLs on the main website (used for Score Table links)
const SERVICE_PAGE_LINKS = {
  happilife: 'https://happimynd.com/v2/services?service=happilife',
  happiself: 'https://happimynd.com/v2/services?service=happiself',
  happibuddy: 'https://happimynd.com/v2/services?service=happibuddy',
  happilearn: 'https://happimynd.com/v2/services?service=happilearn',
  solv: 'https://happimynd.com/v2/services?service=solv',
  happitalk: 'https://happimynd.com/v2/services?service=happitalk'
};

// View Plans page URLs for users to directly buy services (used for Next Steps / Support Services)
const VIEW_PLANS_LINKS = {
  happiself: 'https://happimynd.com/v2/services/happiself',
  happibuddy: 'https://happimynd.com/v2/services/happibuddy',
  happilearn: 'https://happimynd.com/v2/services/happilearn',
  happitalk: 'https://happimynd.com/v2/services/happitalk',
  solv: 'https://happimynd.com/v2/services/solv',
  happiguide: 'https://happimynd.com/v2/services/happiself',
  happilife: 'https://happimynd.com/v2/services/happilife',
  games: 'https://happimynd.com/v2/games'
};

const getViewPlansUrl = (serviceName) => {
  const key = String(serviceName || '').toLowerCase().replace(/[^a-z]/g, '');
  return VIEW_PLANS_LINKS[key] || 'https://happimynd.com/v2/services/happiself';
};

// Helper to attach service page links to services mentioned in the Score Table markdown
const attachServiceLinksToScoreTable = (text) => {
  if (!text) return '';
  const lines = text.split('\n');
  const services = [
    { name: 'HappiLEARN', url: 'https://happimynd.com/v2/services?service=happilearn' },
    { name: 'HappiBUDDY', url: 'https://happimynd.com/v2/services?service=happibuddy' },
    { name: 'HappiSELF', url: 'https://happimynd.com/v2/services?service=happiself' },
    { name: 'HappiTALK', url: 'https://happimynd.com/v2/services?service=happitalk' },
    { name: 'HappiLIFE', url: 'https://happimynd.com/v2/services?service=happilife' },
    { name: 'SOLV', url: 'https://happimynd.com/v2/services?service=solv' }
  ];

  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      const cells = line.split('|');
      return cells.map((cell) => {
        if (cell.includes('http://') || cell.includes('https://') || cell.includes('](')) {
          return cell;
        }
        let updatedCell = cell;
        services.forEach(({ name, url }) => {
          const regex = new RegExp(`\\b${name}\\b`, 'gi');
          updatedCell = updatedCell.replace(regex, `[${name}](${url})`);
        });
        return updatedCell;
      }).join('|');
    }
    return line;
  }).join('\n');
};

const markdownComponents = {
  a: ({ node, href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'var(--color-primary, #8E66F1)',
        fontWeight: 600,
        textDecoration: 'underline',
        textUnderlineOffset: '3px'
      }}
      {...props}
    >
      {children}
    </a>
  )
};

const defaultTemplate = {
  header: {
    enabled: true,
    backgroundColor: 'linear-gradient(135deg, #8E66F1 0%, #8E66F1 100%)',
    textColor: '#ffffff',
    title: 'Emotional Intelligence Report',
    subtitle: 'You can book a guidance session with our expert',
    showDate: true,
    dateFormat: 'MMM DD, YYYY'
  },
  userInfo: {
    enabled: true,
    backgroundColor: '#ffffff',
    borderColor: '#E8E6F4',
    borderRadius: '16px',
    padding: '24px'
  },
  overallScore: {
    enabled: true,
    backgroundColor: '#ffffff',
    borderColor: '#E8E6F4',
    borderRadius: '16px',
    padding: '24px'
  },
  charts: {
    enabled: true,
    backgroundColor: '#ffffff',
    borderColor: '#E8E6F4',
    borderRadius: '16px',
    padding: '24px'
  },
  sectionAnalysis: {
    enabled: true,
    backgroundColor: '#ffffff',
    borderColor: '#E8E6F4',
    borderRadius: '16px',
    padding: '24px'
  }
};

const FALLBACK_SCALE = [
  {
    min: 0, max: 2,
    label: 'Needs Improvement',
    color: '#F04C5A',
    lightColor: '#FFF5F6',
    image: '',
    largeText: "Keep practicing! You're making progress. Focus on building fundamental skills.",
    icon: ''
  },
  {
    min: 3, max: 5,
    label: 'Developing',
    color: '#8E66F1',
    lightColor: '#E5DFFF',
    image: '',
    largeText: "Good effort! You're on the right track. Continue building on your foundation.",
    icon: ''
  },
  {
    min: 6, max: 8,
    label: 'Proficient',
    color: '#8E66F1',
    lightColor: '#E5DFFF',
    image: '',
    largeText: "Well done! You're showing strong understanding and solid skills.",
    icon: ''
  },
  {
    min: 9, max: 12,
    label: 'Excellent',
    color: '#8E66F1',
    lightColor: '#F6F3FF',
    image: '',
    largeText: "Outstanding! You've mastered this material with exceptional performance!",
    icon: ''
  }
];

// Emotion face images (in /public), ordered from struggling → thriving, used
// for HappiEQ report cards in place of a generic icon. If a face image is
// missing, we fall back to the numbered mood faces that ship in /public.
const HAPPIEQ_EMOTION_FACES = [
  '/emoji-angry.png',
  '/emoji-nervous.png',
  '/emoji-anxious.png',
  '/emoji-happy.png',
  '/emoji-calm.png'
];
const HAPPIEQ_EMOTION_FALLBACK = ['/1.png', '/2.png', '/3.png', '/4.png', '/5.png'];

// Map a performance band (by its position in the scale) to an emotion face —
// lower bands read as struggling, higher bands as thriving.
function getEmotionFace(rank, scaleLength) {
  const r = rank || 1;
  const fraction = scaleLength > 1 ? (r - 1) / (scaleLength - 1) : 0;
  const idx = Math.round(fraction * (HAPPIEQ_EMOTION_FACES.length - 1));
  return { src: HAPPIEQ_EMOTION_FACES[idx], fallback: HAPPIEQ_EMOTION_FALLBACK[idx] };
}

function formatDate(dateString) {
  try {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'N/A';
  }
}

function getPerformanceLevel(marks, packetName) {
  try {
    const savedScaling = localStorage.getItem('packetScaling_' + packetName);
    if (savedScaling) {
      const customScale = JSON.parse(savedScaling);
      if (customScale.enabled && customScale.scales && customScale.scales.length > 0) {
        const level = customScale.scales.find(range => marks >= range.min && marks <= range.max);
        if (level) return level;
      }
    }
  } catch { }

  return FALLBACK_SCALE.find(range => marks >= range.min && marks <= range.max) || FALLBACK_SCALE[0];
}

// Modern Bar Chart Component (MUI removed)
const ModernBarChart = ({ data, height = 200 }) => {
  const maxRank = Math.max(...data.map(d => d.rank), 1);

  return (
    <div style={{ height: `${height}px`, display: 'flex', alignItems: 'flex-end', gap: '16px', paddingLeft: '16px', paddingRight: '16px' }}>
      {data.map((item, index) => {
        const heightPercent = (item.rank / maxRank) * 100;
        const color = item.level?.color || '#8E66F1';
        
        return (
          <div key={item.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              className="bar-chart-bar"
              style={{
                width: '100%',
                maxWidth: '60px',
                height: `${Math.max(20, heightPercent)}%`,
                background: `linear-gradient(135deg, ${color} 0%, ${alpha(color, 0.7)} 100%)`,
                borderRadius: '8px 8px 4px 4px',
                position: 'relative',
                boxShadow: `0 4px 20px ${alpha(color, 0.3)}`,
                transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  padding: '4px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  zIndex: 2
                }}
              >
                <span style={{ fontSize: '14px', lineHeight: 1 }}>
                  {item.level?.icon || '📊'}
                </span>
              </div>
            </div>
            <span
              style={{
                marginTop: '8px',
                textAlign: 'center',
                fontWeight: 600,
                fontSize: '0.75rem',
                color: 'var(--color-secondary)'
              }}
            >
              {item.name.length > 10 ? `${item.name.substring(0, 10)}...` : item.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Performance Ring Component (MUI removed)
const PerformanceRing = ({ level, size = 150, marks = 0, totalMarks = 0 }) => {
  const circumference = 2 * Math.PI * 45;
  const percentage = totalMarks > 0 ? (marks / totalMarks) * 100 : 0;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const color = level?.color || '#8E66F1';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.08))' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r="45"
          stroke="var(--color-border)"
          strokeWidth="8"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r="45"
          stroke={color}
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div 
          className="rv-avatar" 
          style={{
            backgroundColor: color,
            width: '30px',
            height: '30px',
            fontSize: '18px',
            boxShadow: `0 4px 20px ${alpha(color, 0.3)}`
          }}
        >
          {level?.image && level.image.startsWith('data:image') ? (
            <img src={level.image} alt="badge" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          ) : (
            level?.icon || '📊'
          )}
        </div>
        <span style={{ fontWeight: 700, fontSize: '11px', color: color, marginTop: '4px' }}>
          {marks || 0}/{totalMarks || 0}
        </span>
      </div>
    </div>
  );
};

// Radar (Spider) Chart Component (MUI removed)
const RadarChart = ({ scores, size = 660 }) => {
  const center = size / 2;
  const radius = Math.max(120, center - 80);
  const itemCount = scores.length;
  const angleStep = (Math.PI * 2) / Math.max(1, itemCount);

  const getPoint = (valueRatio, index) => {
    const angle = -Math.PI / 2 + angleStep * index;
    const r = radius * Math.min(1, Math.max(0, valueRatio));
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `${x},${y}`;
  };

  const valuePoints = scores
    .map((s, i) => getPoint((s.rank || 0) / Math.max(1, s.scaleLength || 1), i))
    .join(' ');

  const gridLevels = 4;
  const gridPolygons = Array.from({ length: gridLevels }, (_, levelIndex) => {
    const ratio = (levelIndex + 1) / gridLevels;
    const points = Array.from({ length: itemCount }, (_, i) => getPoint(ratio, i)).join(' ');
    return (
      <polygon
        key={`grid-${levelIndex}`}
        points={points}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={1}
      />
    );
  });

  const axes = scores.map((s, i) => {
    const end = getPoint(1, i).split(',').map(Number);
    const labelRadius = radius + 16;
    const angle = -Math.PI / 2 + angleStep * i;
    const lx = center + labelRadius * Math.cos(angle);
    const ly = center + labelRadius * Math.sin(angle);
    const textAnchor = Math.cos(angle) > 0.2 ? 'start' : Math.cos(angle) < -0.2 ? 'end' : 'middle';
    const dy = Math.sin(angle) > 0.2 ? '1em' : Math.sin(angle) < -0.2 ? '-0.4em' : '0.35em';
    return (
      <g key={`axis-${i}`}>
        <line x1={center} y1={center} x2={end[0]} y2={end[1]} stroke="var(--color-border)" strokeWidth={1} />
        <text x={lx} y={ly} textAnchor={textAnchor} fontSize={12} fill="var(--color-secondary)" dy={dy}>
          {s.name} ({s.marks}/{s.totalMarks})
        </text>
      </g>
    );
  });

  const dots = scores.map((s, i) => {
    const point = getPoint((s.rank || 0) / Math.max(1, s.scaleLength || 1), i).split(',').map(Number);
    const color = s.level?.color || '#8E66F1';
    const angle = -Math.PI / 2 + angleStep * i;
    const offsetDistance = 12;
    const offsetX = offsetDistance * Math.cos(angle);
    const offsetY = offsetDistance * Math.sin(angle);

    return (
      <g key={`dot-${i}`}>
        <circle 
          cx={point[0]} 
          cy={point[1]} 
          r={4}
          fill={color}
          stroke={alpha(color, 0.5)}
          strokeWidth={1.5}
        />
        <text
          x={point[0] + offsetX}
          y={point[1] + offsetY}
          textAnchor="middle"
          fontSize={10}
          fontWeight="bold"
          fill={color}
          dy="0.35em"
        >
          {s.marks}
        </text>
      </g>
    );
  });

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <svg width={660} height={360} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="var(--color-muted-bg)" stroke="var(--color-border)" />
        {gridPolygons}
        {axes}
        <polygon
          points={valuePoints}
          fill="rgba(142, 102, 241, 0.2)"
          stroke="var(--color-primary)"
          strokeWidth={2}
        />
        {dots}
      </svg>
    </div>
  );
};

const ReportViewer = () => {
  const { quizId, attemptId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [user, setUser] = useState(null);
  const [packets, setPackets] = useState([]);
  const [template, setTemplate] = useState(defaultTemplate);
  const [selectedPacketId, setSelectedPacketId] = useState('all');

  // Multilingual reports. `language` defaults to the user's app-wide preferred
  // language (LanguageContext / localStorage) and can be overridden from the
  // selector in the report header. The report JSX always renders in English;
  // when a non-English language is active we translate the rendered DOM text
  // in place (see the effect below), so both the on-screen report and the
  // exported PDF — which rasterises the same #report-container node — match.
  const { language, setLanguage, languages } = useLanguage();
  const reportRef = useRef(null);
  const [translating, setTranslating] = useState(false);

  // Static chrome that lives OUTSIDE #report-container (nav buttons, status
  // labels) can't be reached by the in-place DOM translation, so we translate
  // this small set of UI strings the idiomatic React way and render via t().
  const UI_STRINGS = {
    backToDashboard: 'Back to Dashboard',
    downloadPdf: 'Download PDF Report',
    loading: 'Loading your report...',
    reportLanguage: 'Report language',
    translating: 'Translating…',
  };
  const [uiTranslations, setUiTranslations] = useState(null);
  const t = (key) =>
    (language !== DEFAULT_LANGUAGE && uiTranslations?.[key]) || UI_STRINGS[key];

  // The '...assessment' names below predate the rename to '...quiz' and are kept
  // so attempts saved against the old quiz name still resolve to this layout.
  const isSpecialReport = useMemo(() => {
    const name = quiz?.name?.toLowerCase() || '';
    return (
      name.includes('happieq') ||
      name.includes('happi eq') ||
      name.includes('happiness quotient') ||
      name.includes('emotional intelligence quiz') ||
      name.includes('emotional intelligence assessment') ||
      name.includes('happilife') ||
      name.includes('happi assess ei') ||
      name.includes('personality')
    );
  }, [quiz]);

  const isHappiEQ = useMemo(() => {
    const name = quiz?.name?.toLowerCase() || '';
    return (
      name.includes('happieq') || 
      name.includes('happi eq') ||
      name.includes('happiness quotient') ||
      name.includes('emotional intelligence quiz') ||
      name.includes('emotional intelligence assessment') ||
      name.includes('happi assess ei')
    );
  }, [quiz]);

  const getServiceList = () => {
    if (isHappiEQ) {
      return [
        { name: 'SOLV', desc: "It provides one-on-one sessions with growth experts to help you navigate important life decisions, transitions, aspirations,and challenges. It's confidential and thoughtful environment for meaningful progress all from the comfort of your own space." },
        { name: 'HappiLEARN', desc: "Your emotional wellbeing library—open 24/7. With HappiLEARN, you get unlimited access to 5000+ minutes of curated videos, audios, blogs, and tools designed by experts to practice empathy, regulation, and resilience at your own pace." },
        { name: 'HappiBUDDY', desc: "Confidential space to enhance your relational EQ because everyone needs someone to talk to or just a safe space to vent out our emotions. HappiBUDDY connects you with a trusted professional \"buddy\" in a safe, private, and judgment-free space so you never have to face challenges alone." },
        { name: 'HappiSELF', desc: "It offers interactive tools and guided practices that help you build awareness, balance and resilience in everyday life. These scientific methods are designed for everyday use that help you stay aligned and grounded to enable your growth." },
        { name: 'HappiTALK', desc: "A safe space for real conversations, allowing you to have meaningful discussions with experts to improve communication, relationships, and emotional expression." },
        { name: 'Games', desc: "A fun space to play, unwind, and relax your mind." }
      ];
    }
    
    return [
      { name: 'SOLV', desc: "It provides one-on-one sessions with growth experts to help you navigate important life decisions, transitions, aspirations,and challenges. It's confidential and thoughtful environment for meaningful progress all from the comfort of your own space." },
      { name: 'HappiLEARN', desc: 'It is our online self-help library that enriches you with a 24*7 access to 5000+ minutes of curated, well researched content that includes video, audio, blogs and more.' },
      { name: 'HappiBUDDY', desc: 'It allows you to connect with a professional expert buddy in a personal emotional log room that is non-judgemental, anonymous, and 100% confidential.' },
      { name: 'HappiSELF', desc: "It offers interactive tools and guided practices that help you build awareness, balance and resilience in everyday life. These scientific methods are designed for everyday use that help you stay aligned and grounded to enable your growth." },
      { name: 'HappiTALK', desc: 'It offers you a safe space to discuss life, aspirations, personal issues, relationships and more with the best of our country’s experts from the comfort of your home.' },
      { name: 'Games', desc: "A fun space to play, unwind, and relax your mind." }
    ];
  };

  const getDisclaimerTextB = () => {
    if (isHappiEQ) {
      return (
        <>
          <strong>B.</strong> This summary can support you in discovering yourself, knowing the areas of improvement and living a holistic life. However, it is indicative and not a replacement for any medical advice. The statements used in HappiEQ are inspired by the work of EQ experts across the globe. If you are having difficult thoughts or going through rough times, please consider calling the helpline numbers below:
        </>
      );
    }
    
    return (
      <>
        <strong>B.</strong> This summary can support you in discovering yourself, knowing the areas of improvement and living a holistic life. However, it is indicative and not a replacement for medical advice. The statements used in HappiLIFE awareness tool are inspired by ICD-10 (WHO) & DSM-5® guidelines. If you are having difficult thoughts or going through rough times, consider calling the below listed helpline numbers:
      </>
    );
  };

  const renderContactDetails = () => {
    if (isHappiEQ) {
      return (
        <div className="rv-contact-details">
          <h4 className="rv-contact-details__title">📞 Contact Details</h4>
          <p className="rv-contact-details__text" style={{ marginBottom: '16px' }}>
            For further details you may contact us at <strong>info@happimynd.com</strong> or <strong>08062365939</strong> or <a href="https://wa.me/919136899581?text=EQ" target="_blank" rel="noopener noreferrer"><strong>WhatsApp Chat</strong></a> or download our mobile app:
          </p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '12px' }}>
            <a href="https://play.google.com/store/apps/details?id=com.happimynd" target="_blank" rel="noopener noreferrer">
              <img 
                src="https://happimynd.com/assets/Frontend/images/play_store.png" 
                alt="Download on Google Play" 
                style={{ height: '40px', borderRadius: '4px' }} 
              />
            </a>
            <a href="https://apps.apple.com/in/app/happimynd-emotional-self-help/id1634742782" target="_blank" rel="noopener noreferrer">
              <img 
                src="https://happimynd.com/assets/Frontend/images/app_store.png"
                alt="Download on App Store"
                style={{ height: '40px', borderRadius: '4px' }} 
              />
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="rv-contact-details">
        <h4 className="rv-contact-details__title">📞 Contact Details</h4>
        <p className="rv-contact-details__text">
          For further details you may contact us at <strong>info@happimynd.com</strong> or <strong>08062365939</strong> or visit our website at <a href="https://www.happimynd.com" target="_blank" rel="noopener noreferrer">www.happimynd.com</a> to explore more.
        </p>
      </div>
    );
  };

  const isShortAssessment = useMemo(() => {
    if (!quiz) return false;
    const quizName = quiz.name?.toLowerCase() || '';
    const packetNames = packets.map(p => p.name?.toLowerCase() || '');
    
    const themes = [
      'sleep', 'anger', 'body image', 'work life', 'bullying', 
      'natal', 'postpartum', 'stress', 'worry', 'conflict',
      'relationship', 'esteem', 'confidence', 'motivation', 
      'loss', 'loneliness', 'anxiety', 'happiness', 'satisfaction', 
      'trauma', 'emotion', 'low'
    ];
    
    const matchesQuiz = themes.some(theme => quizName.includes(theme));
    const matchesPackets = packetNames.some(pName => 
      themes.some(theme => pName.includes(theme))
    );
    
    return matchesQuiz || matchesPackets;
  }, [quiz, packets]);

  const showShortReportFeatures = useMemo(() => {
    const isHappiEQOrLife = quiz?.name?.toLowerCase().includes('happieq') || 
                            quiz?.name?.toLowerCase().includes('happi eq') ||
                            quiz?.name?.toLowerCase().includes('happiness quotient') ||
                            quiz?.name?.toLowerCase().includes('emotional intelligence quiz') ||
                            quiz?.name?.toLowerCase().includes('emotional intelligence assessment') ||
                            quiz?.name?.toLowerCase().includes('happilife') ||
                            quiz?.name?.toLowerCase().includes('happi life') ||
                            quiz?.name?.toLowerCase().includes('happi assess ei');
    return (isShortAssessment || isHappiEQOrLife) && !quiz?.name?.toLowerCase().includes('personality');
  }, [isShortAssessment, quiz]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');

        // Load quiz, attempts, packets, and template in parallel using API client
        const [quizData, attempts, packetData, templateResData] = await Promise.all([
          quizApi.getQuizById(quizId),
          userApi.getAllQuizAttempts(),
          quizPacketApi.getQuizPackets(quizId),
          pdfTemplateApi.getTemplate(quizId).catch(() => null)
        ]);

        enrichQuizWithInstructions(quizData);
        const templateData = templateResData?.template || templateResData;

        const foundAttempt = (attempts || []).find(a => String(a.id) === String(attemptId));
        if (!foundAttempt) {
          throw new Error('Attempt not found');
        }

        let userData = null;
        if (foundAttempt.user_id) {
          try {
            userData = await userApi.getUserById(foundAttempt.user_id);
          } catch { }
        }

        if (cancelled) return;
        setQuiz(quizData);
        setAttempt(foundAttempt);
        setUser(userData);
        setPackets(packetData || []);
        setTemplate(templateData || defaultTemplate);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [quizId, attemptId]);

  const packetScores = useMemo(() => {
    const scores = [];
    if (!attempt || packets.length === 0) return scores;
    const marksMap = attempt.packet_marks || {};

    console.log('ReportViewer - Attempt packet_marks:', marksMap);
    console.log('ReportViewer - Packets:', packets);

    for (const packet of packets) {
      let m = marksMap[packet.name];
      console.log(`Checking packet: ${packet.name} (${packet.id}) - Name match:`, m);

      if (!m && packet.id) {
        m = marksMap[packet.id];
        console.log(`Checking packet: ${packet.name} (${packet.id}) - ID match:`, m);
      }

      if (!m) {
        const keys = Object.keys(marksMap);
        const matchingKey = keys.find(key =>
          key.toLowerCase().includes(packet.name.toLowerCase()) ||
          packet.name.toLowerCase().includes(key.toLowerCase())
        );
        if (matchingKey) {
          m = marksMap[matchingKey];
          console.log(`Checking packet: ${packet.name} (${packet.id}) - Fuzzy match (${matchingKey}):`, m);
        }
      }

      const marks = m?.marks || 0;
      let totalMarks = m?.total || 0;

      console.log(`Final marks for ${packet.name}: marks=${marks}, total=${totalMarks}`);

      if (totalMarks === 0 && packet.questions && Array.isArray(packet.questions)) {
        totalMarks = packet.questions.reduce((sum, q) => sum + (q.marks || 1), 0);
      }

      if (totalMarks === 0 && packet.scoringScale && Array.isArray(packet.scoringScale)) {
        const maxRange = packet.scoringScale.reduce((max, range) => Math.max(max, range.max), 0);
        totalMarks = maxRange;
      }

      const scale = (packet && packet.enableScoringScale && Array.isArray(packet.scoringScale) && packet.scoringScale.length > 0)
        ? packet.scoringScale
        : FALLBACK_SCALE;
      const level = scale.find(range => marks >= range.min && marks <= range.max) || scale[0];
      const levelIndex = Math.max(0, scale.findIndex(r => r.label === level.label && r.min === level.min && r.max === level.max));
      const rank = levelIndex + 1;
      scores.push({
        id: packet.id,
        name: packet.name,
        level: { ...level, rank },
        rank,
        scaleLength: scale.length,
        marks: marks,
        totalMarks: totalMarks
      });
    }
    console.log('ReportViewer - Final scores:', scores);
    return scores;
  }, [attempt, packets]);

  const filteredPacketScores = useMemo(() => {
    if (selectedPacketId === 'all') return packetScores;
    return packetScores.filter(s => s.id === selectedPacketId);
  }, [packetScores, selectedPacketId]);

  // Translate the rendered report into the active language.
  //
  // The container is keyed on `language` + `selectedPacketId`, so any change to
  // either remounts it and React repaints the pristine English DOM first. This
  // effect then runs after commit, walks the freshly-rendered English text
  // nodes, batch-translates them through the same server-proxied Google
  // Translate endpoint the rest of the app uses, and swaps the text in place.
  // Because we always start from a clean English remount, nodes are never
  // double-translated. Numbers/scores (no letters) and SVG chart text are left
  // untouched. Selecting English is a no-op here — the remount already shows it.
  useEffect(() => {
    if (loading || error) return;
    if (language === DEFAULT_LANGUAGE) return;
    const el = reportRef.current;
    if (!el) return;

    let cancelled = false;

    const collectNodes = () => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
          // Leave chart/graphic text alone — translating SVG tspans reflows them.
          if (parent.closest('svg')) return NodeFilter.FILTER_REJECT;
          const text = node.nodeValue;
          // Skip whitespace-only and number/punctuation-only nodes (scores, dates).
          if (!text || !/[A-Za-z]/.test(text)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
      return nodes;
    };

    (async () => {
      const nodes = collectNodes();
      if (!nodes.length) return;
      try {
        setTranslating(true);
        const out = await translateBatch(nodes.map((n) => n.nodeValue), language);
        if (cancelled) return;
        nodes.forEach((n, i) => {
          const translated = out[i];
          if (typeof translated !== 'string') return;
          // Preserve the original node's surrounding whitespace so inline runs
          // (e.g. text around <strong>) keep their spacing.
          const orig = n.nodeValue;
          const lead = orig.match(/^\s*/)[0];
          const trail = orig.match(/\s*$/)[0];
          n.nodeValue = lead + translated.trim() + trail;
        });
      } catch (err) {
        console.error('Report translation failed:', err);
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();

    return () => { cancelled = true; };
    // filteredPacketScores/packets/attempt are included so the effect re-runs
    // once real data has populated the DOM after the initial load.
  }, [language, loading, error, selectedPacketId, packets, attempt, filteredPacketScores]);

  // Translate the header/chrome UI strings (outside #report-container) whenever
  // the language changes. English clears the bundle so t() falls back to source.
  useEffect(() => {
    if (language === DEFAULT_LANGUAGE) {
      setUiTranslations(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const keys = Object.keys(UI_STRINGS);
        const out = await translateBatch(keys.map((k) => UI_STRINGS[k]), language);
        if (cancelled) return;
        const bundle = {};
        keys.forEach((k, i) => { bundle[k] = out[i]; });
        setUiTranslations(bundle);
      } catch (err) {
        console.error('Header translation failed:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const handleDownloadPDF = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const element = document.getElementById('report-container') || reportRef.current;
      if (!element) {
        throw new Error('Report content could not be found to download');
      }
      const { pdf } = await exportElementToPdfBlob(element);
      const safeUserName = (user?.user_name || user?.name || user?.email || 'Report').replace(/[/\\?%*:|"<>]/g, '_').trim();
      const safeQuizName = (quiz?.name || 'Quiz').replace(/[/\\?%*:|"<>]/g, '_').trim();
      const dateTag = attempt?.completed_at ? new Date(attempt.completed_at).toISOString().split('T')[0] : 'report';
      pdf.save(`${safeQuizName}_${safeUserName}_${dateTag}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="rv-loading-screen">
        <div className="rv-spinner" />
        <p style={{ fontWeight: 600, color: 'var(--color-secondary)' }}>{t('loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rv-error-screen">
        <div className="rv-alert-error">
          {error}
        </div>
        <button
          className="rv-btn rv-btn--outline"
          onClick={() => navigate('/')}
        >
          <ArrowBackIcon style={{ marginRight: '8px', verticalAlign: 'middle' }} /> {t('backToDashboard')}
        </button>
      </div>
    );
  }

  return (
    <div className="report-viewer-shell">
      {/* Shell Header - For web navigation and operations, NOT captured in the printed PDF */}
      <div className="rv-shell-header">
        <button
          className="rv-btn rv-btn--outline"
          onClick={() => navigate('/')}
        >
          <ArrowBackIcon style={{ marginRight: '8px', fontSize: '20px' }} /> {t('backToDashboard')}
        </button>
        
        <div className="rv-logo-wrap">
          <img
            src="/happimynd_logo.png"
            alt="HappiMynd Logo"
            className="rv-logo-img"
          />
        </div>

        <div className="rv-header-actions">
          {/* Language selector — lives OUTSIDE #report-container, so it is not
              captured in the exported PDF. Defaults to the user's preferred
              language; switching re-translates the report in place. */}
          <div className="rv-lang-wrap">
            <span className="rv-lang-icon" aria-hidden="true">🌐</span>
            <select
              id="report-language"
              className="rv-lang-select"
              aria-label={t('reportLanguage')}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={translating}
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            {translating && <span className="rv-lang-status">{t('translating')}</span>}
          </div>

          <button
            className="rv-btn rv-btn--primary"
            onClick={handleDownloadPDF}
            disabled={translating}
          >
            <DownloadIcon style={{ marginRight: '8px', fontSize: '20px' }} /> {t('downloadPdf')}
          </button>
        </div>
      </div>

      {/* Printable Report Content */}
      <ReportContent
        quiz={quiz}
        attempt={attempt}
        user={user}
        packets={packets}
        template={template}
        selectedPacketId={selectedPacketId}
        onSelectPacketId={setSelectedPacketId}
        containerRef={reportRef}
        language={language}
      />
    </div>
  );
};

export default ReportViewer;