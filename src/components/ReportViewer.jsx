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
        { name: 'HappiTALK', desc: "A safe space for real conversations, allowing you to have meaningful discussions with experts to improve communication, relationships, and emotional expression." }
      ];
    }
    
    return [
      { name: 'SOLV', desc: "It provides one-on-one sessions with growth experts to help you navigate important life decisions, transitions, aspirations,and challenges. It's confidential and thoughtful environment for meaningful progress all from the comfort of your own space." },
      { name: 'HappiLEARN', desc: 'is our online self-help library that enriches you with a 24*7 access to 5000+ minutes of curated, well researched content that includes video, audio, blogs and more.' },
      { name: 'HappiBUDDY', desc: 'allows you to connect with a professional expert buddy in a personal emotional log room that is non-judgemental, anonymous, and 100% confidential.' },
      { name: 'HappiSELF', desc: "It offers interactive tools and guided practices that help you build awareness, balance and resilience in everyday life. These scientific methods are designed for everyday use that help you stay aligned and grounded to enable your growth." },
      { name: 'HappiTALK', desc: 'offers you a safe space to discuss life, aspirations, personal issues, relationships and more with the best of our country’s experts from the comfort of your home.' }
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
      await new Promise(resolve => setTimeout(resolve, 2000));
      const element = document.getElementById('report-container');

      if (!element) {
        console.error('Report container element not found');
        alert('Error: Could not find report content to download');
        return;
      }

      const allImages = element.querySelectorAll('img');
      allImages.forEach(img => {
        if (img.src && img.src.includes('happimynd.com')) {
          console.log('Pre-processing external image:', img.src);
          if (img.src.includes('happimynd_logo.png')) {
            img.src = '/happimynd_logo.png';
          } else if (img.src.includes('play_store.png')) {
            img.src = '/play_store.png';
          } else if (img.src.includes('app_store.png')) {
            img.src = '/app_store.png';
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

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

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: true,
        backgroundColor: '#ffffff',
        allowTaint: false,
        foreignObjectRendering: false,
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          prepareSvgForHtml2Canvas(element, clonedDoc.body);

          clonedDoc.querySelectorAll('img').forEach(img => {
            if (img.src && img.src.includes('happimynd.com')) {
              console.log('Found external image:', img.src);
              if (img.src.includes('happimynd_logo.png')) {
                img.src = '/happimynd_logo.png';
                console.log('Replaced logo with local version');
              } else if (img.src.includes('play_store.png')) {
                img.src = '/play_store.png';
                console.log('Replaced play_store with local version');
              } else if (img.src.includes('app_store.png')) {
                img.src = '/app_store.png';
                console.log('Replaced app_store with local version');
              } else {
                img.setAttribute('crossorigin', 'anonymous');
                console.log('Added crossorigin to:', img.src);
              }
            }
          });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save('report.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
      const isCorsError = error.message?.includes('CORS') || 
                         error.message?.includes('tainted') ||
                         error.message?.includes('SecurityError');
      
      if (isCorsError) {
        alert('Error generating PDF: External images could not be loaded due to security restrictions.\n\nSolutions:\n1. Download the images locally to the public folder\n2. Or try again - sometimes it works on retry\n\nThe PDF may still be generated but without external images.');
      } else {
        alert('Error generating PDF: ' + error.message);
      }
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
      {/* Keyed on language + packet so a change remounts a pristine English DOM
          before the translation effect re-runs (prevents double-translation). */}
      <div
        id="report-container"
        className="report-viewer-container"
        ref={reportRef}
        key={`report-${language}-${selectedPacketId}`}
      >
        {/* Official Printable Header Card */}
        <div className="rv-card rv-print-header-card">
          <div className="rv-print-header-top">
            <img
              src="/happimynd_logo.png"
              alt="HappiMynd Logo"
              className="rv-print-logo"
            />
            <div className="rv-print-meta">
              <span className="rv-print-badge-official">Official Quiz Record</span>
              <span className="rv-print-date">Generated: {formatDate(attempt?.completed_at)}</span>
            </div>
          </div>

          <div className="rv-print-divider" />

          {/* Title and Metadata */}
          <div className="rv-print-title-block">
            <h1 className="rv-print-title">
              Comprehensive Analysis Report
            </h1>
          </div>

          {/* Participant Profile Grid */}
          {template?.userInfo?.enabled && (
            <div className="rv-profile-grid">
              <div className="rv-profile-item">
                <div className="rv-profile-icon-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div className="rv-profile-details">
                  <span className="rv-profile-label">Participant</span>
                  <p className="rv-profile-value">
                    {user?.user_name || user?.email || 'Anonymous'}
                  </p>
                </div>
              </div>
              
              <div className="rv-profile-item">
                <div className="rv-profile-icon-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div className="rv-profile-details">
                  <span className="rv-profile-label">Email Address</span>
                  <p className="rv-profile-value">
                    {user?.email || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="rv-profile-item">
                <div className="rv-profile-icon-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div className="rv-profile-details">
                  <span className="rv-profile-label">Quiz</span>
                  <p className="rv-profile-value">
                    {quiz?.name || 'Untitled'}
                  </p>
                </div>
              </div>

              <div className="rv-profile-item">
                <div className="rv-profile-icon-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div className="rv-profile-details">
                  <span className="rv-profile-label">Completed At</span>
                  <p className="rv-profile-value">
                    {formatDate(attempt?.completed_at)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* Custom Header Text — the "Score Table" section is HappiEQ-only, so it
          is stripped from every other assessment's header. */}
      {quiz?.report_header && (() => {
        const headerMarkdown = isHappiEQ
          ? quiz.report_header
          : stripScoreTableSection(quiz.report_header);
        return headerMarkdown ? (
          <div className="rv-card rv-card--intro">
            <div className="rv-markdown-content animate-fade-in">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{headerMarkdown}</ReactMarkdown>
            </div>
          </div>
        ) : null;
      })()}

      {/* Modern Charts Section */}
      {template?.charts?.enabled && packetScores.length > 0 && !isSpecialReport && !showShortReportFeatures && (
        <div className="rv-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <h2 className="rv-card__title" style={{ margin: 0 }}>📊 Score Card</h2>
            <div className="rv-select-wrap">
              <span className="rv-select-label">View Section:</span>
              <select
                className="rv-select"
                value={selectedPacketId}
                onChange={(e) => setSelectedPacketId(e.target.value)}
              >
                <option value="all">All Sections</option>
                {packets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rv-grid" style={{ gridTemplateColumns: selectedPacketId === 'all' && filteredPacketScores.length > 1 ? 'repeat(auto-fit, minmax(400px, 1fr))' : '1fr' }}>
            <div className="rv-grid-item">
              <div className="rv-info-box" style={{ background: '#ffffff', textAlign: 'left', padding: '24px', height: '100%' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 20px 0', color: 'var(--color-fg)' }}>
                  Parameter Wise Scores
                </h3>
                <div className="rv-parameter-list">
                  {filteredPacketScores.map(score => {
                    const scoreColor = score.level?.color || '#8E66F1';
                    return (
                      <div className="rv-parameter-item" key={score.id}>
                        <div className="rv-parameter-meta">
                          <span className="rv-parameter-name">{score.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-fg)' }}>
                              Score: {score.marks} / {score.totalMarks}
                            </span>
                            <span className="rv-badge" style={{ backgroundColor: scoreColor }}>
                              {score.level?.label}
                            </span>
                          </div>
                        </div>
                        <div className="rv-progress-container" style={{ borderColor: alpha(scoreColor, 0.2), backgroundColor: alpha(scoreColor, 0.05) }}>
                          <div 
                            className="rv-progress-fill" 
                            style={{ 
                              width: `${Math.max(5, (score.marks / score.totalMarks) * 100)}%`, 
                              backgroundColor: scoreColor,
                              boxShadow: `0 0 10px ${alpha(scoreColor, 0.3)}`
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })}

                  {selectedPacketId === 'all' && filteredPacketScores.length > 1 && (
                    <div className="rv-overall-summary-box">
                      <div className="rv-parameter-meta" style={{ marginBottom: '8px' }}>
                        <span className="rv-parameter-name" style={{ color: 'var(--color-primary)', fontWeight: 800 }}>Overall Performance</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-fg)' }}>
                          {Math.round((packetScores.reduce((acc, p) => acc + p.marks, 0) / packetScores.reduce((acc, p) => acc + p.totalMarks, 0)) * 100)}%
                        </span>
                      </div>
                      <div className="rv-progress-container" style={{ height: '8px' }}>
                        <div 
                          className="rv-progress-fill" 
                          style={{ 
                            width: `${(packetScores.reduce((acc, p) => acc + p.marks, 0) / packetScores.reduce((acc, p) => acc + p.totalMarks, 0)) * 100}%`, 
                            backgroundColor: 'var(--color-primary)' 
                          }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedPacketId === 'all' && filteredPacketScores.length > 1 && (
              <div className="rv-grid-item">
                <div className="rv-info-box" style={{ background: '#ffffff', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 20px 0', color: 'var(--color-fg)', alignSelf: 'flex-start' }}>
                    Performance Analysis Radar
                  </h3>
                  <RadarChart scores={packetScores} size={340} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Personality Analysis - For Personality Quizzes */}
      {template?.sectionAnalysis?.enabled && packetScores.length > 0 && (() => {
        const personalityTypes = [
          'Paranoid', 'Dissocial', 'Impulsive', 'Borderline',
          'Histrionic', 'Anankastic', 'Anxious', 'Dependent'
        ];

        const isPersonalityQuiz = packetScores.some(p =>
          personalityTypes.some(type =>
            p.name.toLowerCase().includes(type.toLowerCase())
          )
        );

        if (!isPersonalityQuiz) return null;

        const sortedPackets = [...packetScores].sort((a, b) => b.marks - a.marks);
        const primaryPersonality = sortedPackets.length > 0 ? sortedPackets[0] : null;
        const secondaryPersonality = sortedPackets.length > 1 ? sortedPackets[1] : null;

        const personalityDescriptions = {
          "Paranoid": "You seem to be a considerate and thoughtful person who tends to give a lot of love and attention to people around. You might be expecting the same treatment in return. However, it might not be possible for everyone to be available for you all the time. Sometimes, it might hurt and you tend to start keeping a distance from such people. You have a great eye for details and tasks which needs viglance can be assigned to you confidently. Infact you can take up some serious and mundane tasks with lot of ease and relieve others from pain of micro management, when you are around. These traits in you can make some people perceive that it is hard to communicate with you. However, you might be protecting some key tasks or saving yourself from getting hurt. The sense of protection might even extend to your interpersonal relationships, where it turns in self protection. Hence, you might be a little vigilant in your relationships. In a situation, when someone is nice to you, you seem to make sure if their intention is in the right place and they are not trying to take advantage of you. The sense of self-protection might be rooting for your survival instinct but it might hinder your ability to develop new relationships. You seem to be sentimental at times. In an unfavourable situation, you might get a little anxious. At times, it can affect your daily activities so manage this part of your personality well. It appears that you have high self-esteem. This makes you a confident person and people look upto you for who you are, however it might be a little difficult for you to deal with refusals or criticism.",
          "Dissocial": "You seem to have a higher purpose in life and open to take risks for achieving it. You are the one who can step out of comfort zone for any cause and lead by example. Your hard work and drive to get there is inspiring for others and can make some most difficult projects to see light of the day. You can take decisions and stand by them for good. This open and revolutionary behavior may not conform to the rules of society sometimes and may make things difficult. You seem to be devoted to achieving your higher goals hence, your closeda ones might feel that you are ignoring their emotional needs and responsibilities, so be bit careful about it. You seem to have leadership qualities that makes you drive with single minded focus and due to the same sometimes, it might get difficult for you to accept criticism. You might be a little uncomfortable while dealing with unfavourable situations. Taking care of these tendencies may help, in taking people along with you. You seem to believe that you are on the right path, so decision making comes natural to you. Even if you have to do something that is out of your comfort zone, you might do it without feeling guilty and in most passionate way. Since you seem to be so engrossed in your cause, you might feel disconnected from others. You might think that people are unable to understand your purpose. It might affect your interpersonal relationships and lead to rough situations. Be aware of these tendencies.",
          "Impulsive": "You have the ability to take those steps in life which others can't but be aware to not be rash in your journey. People may see you as courageous and path breaker but be aware they may take benefit of this ability of yours. Exercising caution in your decisions and actions can make you stand out in life. To act swiftly and seize the opportunities is your style and may keep you ahead in many ways. On the other hand, you seem to be a sensitive person and might easily be affected by criticism. You might be unable to handle stressful situations and keep calm. It leads to increased vulnerability and somtimes there could be thoughts of self-harm or may be others. You might be having troubles in your relationships due to high intensity of emotions and can incur personal losses. Advised to practice calmness and mindfulness.",
          "Borderline": "You can be pretty creative and intense in your approach. You seem to be very fussy and selective about your needs and wants, which sometimes leads to confusion and dilemma. This also makes the process of taking decisions and hanging off the key issues delay. It seems that you are discovering your identity and sexuality because you are confused about it. Your relationships may have been intense and you may have gone pretty deep into them; however, your partners may not have been in a position to fulfill your emotional needs. Unsuccessful relationships may make you hollow or disconnect with people around you. Some problematic behaviors may be repetitive due to which you might face adjustment problems in your relationships. Try to be sure and more informed on your choices that might help you against all these odds.",
          "Histrionic": "You might be an emotional and expressive person due to which some people might think that you could be seeking attention. You are confident of self and ability to create vision for others. Your ability to focus on big picture can help you in takeing others along. Your ability to address large groups and get them to align around bigger purpose may keep you ahead of others. You seem to be receptive of other's opinions and thoughts. Sometimes, you might change your decision at the last moment as accomodating many ideas may defer things. Hence, people might think you are indecisive. It might lead to problems in your personal, marital and occupational setup. You seem to be confident in your skin and can pull off difficult situations. If someone compliments on your physical appearance, you seem to like it. Your image concious behavior can sometimes keep you away from opportunities.",
          "Anankastic": "You are a person who feels responsible and keeps secret ambitions in life. Hard work for things of your liking comes to you easy. In areas of your choice, you can go to any level of micro management. Perfectionism seems to be one of your greatest virtues. You tend to spend extra time perfecting even the smallest details. It appears that your skills match your job role and you try to give your best. Sometimes, you might feel that you are not performing up to the mark because you fall short of own ambitions. You might even doubt the quality of your work. Everything comes secondary to your need of being perfect. It might affect your interpersonal relationships. You have fairly good leadership skills and competetive behavior may also reflect in your personality. These traits can keep you ahead of others in your field. You seem to have high standards in your area of expertise which might not be possible for everyone to achieve in your team. Hence, you might come across as someone very particular and may not come up as a team player. Others may get away from you for this want of perfection. You seem to have high standards which might not be possible for everyone to achieve in your team. Hence, you might across as someone very particular. Other employees might find it hard to match up to your expectations.",
          "Anxious": "You seem to like following a routine and might not appreciate many changes in your schedule. Timeliines and meeting them suits you which also makes you competitive and hardworking. It appears that you are an ambitious person who tries to be better than people around themself. You seem to give your best so that your colleagues and managers appreciate you. Sometimes, you might not be able to take criticism healthily. You seem to focus on your work rather than investing time in group activities or discussions. Hence, some people might perceive you are unsocial. At your home, you might not like to engage in small talk. It might be affecting your interpersonal relationships. Your family members might want to talk to you. However, you might be unable to reciprocate with the same intensity of emotions. You seem to be a responsible person who seeks security in all the spheres of life. If you learn to remain somewhat relaxed in many spheres of life then your qualities can take you to places.",
          "Dependent": "You seem to have a friendly and welcoming personality. It appears that you seek advice from your friends and family before taking any important decision in your life. Your considertae behavior is liked by others and also makes you popular. You seem to be obedient and might not question authority. It appears that you like to go with the flow. You seem to be kind and helpful. It might be difficult for you to say no to your closed ones. You seem to be very attached to your friends and family and sometimes, might even fear of losing them. It might seem to you like you will be left alone. You might not be comfortable with that thought. Being in team gives you confidence and boosts your productivity. If left alone you might find it difficult to work. Some people might even perceive you as an under-confident person because you seek reassurance. So you must develop your independent side and work upon taking decisions and standing by them. You must try to lead in situations and bring some outcomes with your team player abilities."
        };

        const getPersonalityDescription = (packetName) => {
          if (!packetName) return null;
          if (personalityDescriptions[packetName]) return personalityDescriptions[packetName];
          const lowerPacketName = packetName.toLowerCase();
          const matchedKey = Object.keys(personalityDescriptions).find(key =>
            key.toLowerCase() === lowerPacketName
          );
          if (matchedKey) return personalityDescriptions[matchedKey];
          const partialMatch = Object.keys(personalityDescriptions).find(key =>
            lowerPacketName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerPacketName)
          );
          if (partialMatch) return personalityDescriptions[partialMatch];
          return null;
        };

        const primaryDescription = primaryPersonality ? getPersonalityDescription(primaryPersonality.name) : null;
        const secondaryDescription = secondaryPersonality ? getPersonalityDescription(secondaryPersonality.name) : null;

        return (
          <div className="rv-card">
            <h2 className="rv-card__title">🎭 Personality Analysis</h2>
            
            {primaryPersonality && primaryDescription && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '18px', margin: '0 0 12px 0' }}>Primary Personality</h3>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', lineHeight: 1.8, fontSize: '15px', textAlign: 'justify', color: 'var(--color-fg)' }}>
                  {primaryDescription}
                </div>
              </div>
            )}

            {secondaryPersonality && secondaryDescription && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '18px', margin: '0 0 12px 0' }}>Secondary Personality</h3>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', lineHeight: 1.8, fontSize: '15px', textAlign: 'justify', color: 'var(--color-fg)' }}>
                  {secondaryDescription}
                </div>
              </div>
            )}

            {!primaryPersonality && !secondaryPersonality && (
              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#FFF5F6', color: '#F04C5A', border: '1px solid #F04C5A' }}>
                Personality analysis requires at least one completed section.
              </div>
            )}
          </div>
        );
      })()}

      {/* Detailed Section Analysis (Hide for Personality Quizzes) */}
      {template?.sectionAnalysis?.enabled && !quiz?.name?.toLowerCase().includes('personality') && (
        <div className="rv-card">
          <h2 className="rv-card__title">🔍 Analysis</h2>
          <div className={`rv-analysis-grid ${filteredPacketScores.length > 1 ? 'rv-analysis-grid--2cols' : ''}`}>
            {filteredPacketScores.map(p => {
              const pColor = p.level?.color || '#8E66F1';
              const lightBg = p.level?.lightColor || '#FFFFFF';
              return (
                <div 
                  className="rv-analysis-card" 
                  key={p.id}
                  style={{
                    background: `linear-gradient(135deg, ${lightBg} 0%, #ffffff 100%)`,
                    borderLeftColor: pColor
                  }}
                >
                  <div className="rv-analysis-card__header">
                    <div 
                      className="rv-avatar rv-avatar--large" 
                      style={{
                        backgroundColor: pColor,
                        boxShadow: `0 4px 20px ${alpha(pColor, 0.3)}`
                      }}
                    >
                      {p.level?.image && p.level.image.startsWith('data:image') ? (
                        <img src={p.level.image} alt="badge" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                      ) : isHappiEQ ? (
                        (() => {
                          const face = getEmotionFace(p.level?.rank, p.scaleLength);
                          return (
                            <img
                              src={face.src}
                              alt=""
                              onError={(e) => {
                                if (e.currentTarget.src.indexOf(face.fallback) === -1) {
                                  e.currentTarget.src = face.fallback;
                                }
                              }}
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          );
                        })()
                      ) : (
                        p.level?.icon || '📘'
                      )}
                    </div>
                    <div>
                      <h3 className="rv-analysis-card__title">{p.name}</h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                        {(!showShortReportFeatures || isHappiEQ) && (
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: pColor }}>
                            Score: {p.marks} / {p.totalMarks}
                          </span>
                        )}
                        {!showShortReportFeatures && (
                          <span className="rv-badge" style={{ backgroundColor: pColor }}>
                            {p.level?.label || 'Level'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {showShortReportFeatures && (
                    <div style={{ marginBottom: '24px' }}>
                      <div 
                        className="rv-progress-container" 
                        style={{ 
                          height: '32px', 
                          borderColor: alpha(pColor, 0.2), 
                          backgroundColor: alpha(pColor, 0.05),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px'
                        }}
                      >
                        <div 
                          className="rv-progress-fill" 
                          style={{ 
                            position: 'absolute',
                            left: 0, top: 0, bottom: 0,
                            width: `${Math.max(10, (p.marks / p.totalMarks) * 100)}%`, 
                            backgroundColor: pColor,
                            borderRadius: '4px',
                            boxShadow: `0 0 20px ${alpha(pColor, 0.2)}`
                          }} 
                        />
                        <span 
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            fontWeight: 800,
                            color: (p.marks / p.totalMarks) > 0.4 ? 'white' : 'var(--color-fg)',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            fontSize: '13px',
                            textShadow: (p.marks / p.totalMarks) > 0.4 ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
                          }}
                        >
                          {p.level?.label} {isHappiEQ && `(${p.marks} / ${p.totalMarks})`}
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{ height: '1px', backgroundColor: 'var(--color-border)', margin: '16px 0' }} />
                  
                  <p className="rv-analysis-card__text">
                    {p.level?.largeText || 'No detailed description available for this level.'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom Footer Text (Filtered to avoid duplicates in special reports) */}
      {(() => {
        if (!quiz?.report_footer) return null;
        
        const isHappiEQOrLife = quiz?.name?.toLowerCase().includes('happieq') || 
                                quiz?.name?.toLowerCase().includes('happi eq') ||
                                quiz?.name?.toLowerCase().includes('happiness quotient') ||
                                quiz?.name?.toLowerCase().includes('emotional intelligence quiz') ||
                                quiz?.name?.toLowerCase().includes('emotional intelligence assessment') ||
                                quiz?.name?.toLowerCase().includes('happilife') ||
                                quiz?.name?.toLowerCase().includes('happi life') ||
                                quiz?.name?.toLowerCase().includes('happi assess ei');
                                
        let footerMarkdown = isHappiEQOrLife
          ? getFilteredFooterMarkdown(quiz.report_footer)
          : quiz.report_footer;
        // The Score Table is HappiEQ-only — strip it from every other report.
        if (!isHappiEQ) footerMarkdown = stripScoreTableSection(footerMarkdown);
        // Support Services is rendered as styled cards below, so drop the plain
        // markdown version from the footer for every assessment.
        footerMarkdown = stripSupportServicesSection(footerMarkdown);

        if (!footerMarkdown.trim()) return null;

        // Support Services cards (styled) — for short reports these already
        // render inside the Next Steps block, so only add them here for the
        // other assessments, placed just before the Contact Details section.
        const supportServicesCards = !showShortReportFeatures ? (
          <div className="rv-card">
            <h3 style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '18px', margin: '0 0 16px 0' }}>🤝 Support Services:</h3>
            <div className="rv-service-grid">
              {getServiceList().map((service) => (
                <div key={service.name} className="rv-service-card">
                  <h4 className="rv-service-card__name">{service.name}</h4>
                  <p className="rv-service-card__desc">{service.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null;

        const [beforeContact, contactOnward] = !showShortReportFeatures
          ? splitAtContactDetails(footerMarkdown)
          : [footerMarkdown, ''];

        return (
          <>
            {beforeContact.trim() && (
              <div className="rv-card">
                <div className="rv-markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{beforeContact}</ReactMarkdown>
                </div>
              </div>
            )}
            {supportServicesCards}
            {contactOnward.trim() && (
              <div className="rv-card">
                <div className="rv-markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{contactOnward}</ReactMarkdown>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Next Steps Section */}
      {showShortReportFeatures && (
        <div className="rv-card">
          <h2 className="rv-card__title">🎯 Next Steps</h2>
          
          <p style={{ marginBottom: '16px', textAlign: 'justify', lineHeight: 1.8, fontSize: '1.05rem', color: 'var(--color-fg)' }}>
            Congratulations on completing your self assessment and going through the summary. Now that you know how you are doing on this aspect of life, we are sure you have gained a comprehensive understanding of what steps to be taken up next.
          </p>
          
          <p style={{ marginBottom: '16px', textAlign: 'justify', lineHeight: 1.8, fontSize: '1.05rem', color: 'var(--color-fg)' }}>
            If you are keen on making the most out of your summary, an assisted session by our emotional wellbeing expert will guide you in minutely scrutinizing and interpreting your performance on this parameter, what implications the scores carry, and guiding you on the necessary next steps that can set you sailing on a holistic wellness journey.
          </p>
          
          <p style={{ marginBottom: '24px', textAlign: 'justify', lineHeight: 1.8, fontSize: '1.05rem', color: 'var(--color-fg)' }}>
            Once aware of your needs, you can choose from our unique range of accessible, actionable & transformative services available over a fully digital human assisted platform while ensuring utmost confidentiality.
          </p>

          <div style={{ height: '1px', backgroundColor: 'var(--color-border)', margin: '24px 0' }} />
          
          <h3 style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '18px', margin: '0 0 16px 0' }}>🤝 Support Services:</h3>

          <div className="rv-service-grid">
            {getServiceList().map((service) => (
              <div key={service.name} className="rv-service-card">
                <h4 className="rv-service-card__name">{service.name}</h4>
                <p className="rv-service-card__desc">{service.desc}</p>
              </div>
            ))}
          </div>

          {renderContactDetails()}

          <h4 style={{ fontWeight: 700, color: 'var(--color-secondary)', fontSize: '14px', margin: '24px 0 12px 0' }}>⚠️ Disclaimer :</h4>
          
          <span className="rv-disclaimer-text">
            <strong>A.</strong> If the services are availed by a person who belongs/works with a company/organization which are enrolled with the services for its employees or has a tie up with HappiMynd, the services/tools available to the users are subject to the following terms:
            <br />1. The user can avail only those services which the affiliated company has subscribed/purchased for its employees.
            <br />2. If the user is willing to avail services which are not covered/subscribed/purchased by the affiliated company, then the user can make an individual/personal purchase of the required services.
            <br />3. The services available and their prices for an individual user can be found on the dashboard of the HappiMynd app or website itself.
          </span>

          <span className="rv-disclaimer-text">
            {getDisclaimerTextB()}
            <br />• National Emergency No. - 112
            <br />• Women Helpline - 1091
            <br />• Senior Citizen Helpline - 14567
            <br />• Suicide Prevention - 9820466726 (AASRA)
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="rv-card" style={{ textAlign: 'center', padding: '24px', margin: 0 }}>
        <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-secondary)', fontSize: '14px' }}>
          Report generated on {formatDate(new Date().toISOString())} • Keep up the excellent work and continue learning! 🚀
        </p>
      </div>
    </div>
  </div>
  );
};

export default ReportViewer;