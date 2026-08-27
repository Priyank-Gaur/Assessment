import React, { useState, useEffect, useMemo } from 'react';
import {
  Assessment as AssessmentIcon,
  Quiz as QuizIcon,
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useDatabase } from '../hooks/useDatabase';
import { quizPacketApi, userApi } from '../services/api';
import { PROFILE_ORDER, isSameProfile } from '../utils/profileOrder';
import './AssessmentResults.css';

const AssessmentResults = () => {
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quizPackets, setQuizPackets] = useState([]);
  const [questionCounts, setQuestionCounts] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOrg, setFilterOrg] = useState('all');
  const [filterProfile, setFilterProfile] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');

  const { quizzes, packets, profiles, users, loading: dataLoading, error: dataError } = useDatabase();

  const uniqueOrgs = useMemo(() => {
    const orgs = quizAttempts.map(a => a.user?.organization || 'Individual').filter(Boolean);
    return ['all', ...new Set(orgs)].sort();
  }, [quizAttempts]);

  // Show exactly the canonical profiles in the filter (no data-driven extras
  // like Home Maker, HCL, SOLV, "No role", etc.).
  const uniqueProfiles = ['all', ...PROFILE_ORDER];

  const filteredAndSearchedAttempts = useMemo(() => {
    // 1. Filter
    const filtered = quizAttempts.filter(attempt => {
      const term = searchTerm.toLowerCase();
      const userName = String(attempt.user?.name || '').toLowerCase();
      const userEmail = String(attempt.user?.email || '').toLowerCase();
      const org = String(attempt.user?.organization || '').toLowerCase();
      const profileName = String(attempt.profile?.name || '').toLowerCase();
      
      const matchesSearch = userName.includes(term) ||
             userEmail.includes(term) ||
             org.includes(term) ||
             profileName.includes(term);

      if (!matchesSearch) return false;

      // Filter by Organization
      if (filterOrg !== 'all') {
        const attemptOrg = attempt.user?.organization || 'Individual';
        if (attemptOrg !== filterOrg) return false;
      }

      // Filter by Profile
      if (filterProfile !== 'all') {
        const attemptProfileName = attempt.profile?.name || 'Unknown Profile';
        if (!isSameProfile(attemptProfileName, filterProfile)) return false;
      }

      // Filter by Date Range (From Date / To Date)
      const attemptDateStr = attempt.completed_at || attempt.started_at || attempt.created_at;
      if (fromDate || toDate) {
        if (!attemptDateStr) return false;
        const attemptTime = new Date(attemptDateStr).getTime();

        if (fromDate) {
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          if (attemptTime < start.getTime()) return false;
        }

        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          if (attemptTime > end.getTime()) return false;
        }
      }

      return true;
    });

    // 2. Sort
    return filtered.sort((a, b) => {
      if (sortBy === 'date-desc') {
        const dateA = new Date(a.completed_at || a.started_at || 0).getTime();
        const dateB = new Date(b.completed_at || b.started_at || 0).getTime();
        return dateB - dateA;
      } else if (sortBy === 'date-asc') {
        const dateA = new Date(a.completed_at || a.started_at || 0).getTime();
        const dateB = new Date(b.completed_at || b.started_at || 0).getTime();
        return dateA - dateB;
      } else if (sortBy === 'name-asc') {
        const nameA = String(a.user?.name || '').toLowerCase();
        const nameB = String(b.user?.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      } else if (sortBy === 'name-desc') {
        const nameA = String(a.user?.name || '').toLowerCase();
        const nameB = String(b.user?.name || '').toLowerCase();
        return nameB.localeCompare(nameA);
      }
      return 0;
    });
  }, [quizAttempts, searchTerm, filterOrg, filterProfile, fromDate, toDate, sortBy]);

  // Fetch the number of questions for each quiz (sum of questions across its packets)
  useEffect(() => {
    if (!quizzes || quizzes.length === 0) return;

    let cancelled = false;

    const loadQuestionCounts = async () => {
      try {
        const entries = await Promise.all(
          quizzes.map(async (quiz) => {
            try {
              const packetsData = await quizPacketApi.getQuizPackets(quiz.id);
              const count = (packetsData || []).reduce(
                (sum, packet) => sum + (packet.questions ? packet.questions.length : 0),
                0
              );
              return [quiz.id, count];
            } catch {
              return [quiz.id, 0];
            }
          })
        );

        if (!cancelled) {
          setQuestionCounts(Object.fromEntries(entries));
        }
      } catch (err) {
        console.warn('Failed to load question counts:', err);
      }
    };

    loadQuestionCounts();

    return () => { cancelled = true; };
  }, [quizzes]);

  // Fetch attempts for a specific quiz
  const fetchQuizAttempts = async (quizId) => {
    setLoading(true);
    setError(null);
    
    try {
      // First get the quiz packets using API service
      const quizPacketsData = await quizPacketApi.getQuizPackets(quizId);
      setQuizPackets(quizPacketsData || []);

      const allAttempts = await userApi.getAllQuizAttempts();
      
      // Filter attempts for this specific quiz
      const filteredAttempts = (allAttempts || []).filter(attempt => String(attempt.quiz_id) === String(quizId));
      
      // Enrich attempts with user and profile data
      const enrichedAttempts = filteredAttempts.map((attempt) => {
        try {
          // Get user data from locally cached users list
          const userData = (users || []).find(u => String(u.id) === String(attempt.user_id)) || null;
          
          // Find profile by name (since users now store profile name as string)
          let profile = null;
          if (userData && userData.profile) {
            profile = profiles.find(p => p.name === userData.profile);
          }
          
          // Fallback: try to find by profile_id if available
          if (!profile && attempt.profile_id) {
            profile = profiles.find(p => p.id === attempt.profile_id);
          }
          
          // Create user object with actual user data or attempt.user fallback
          let user = null;
          if (userData) {
            user = {
              name: userData.user_name || userData.email || 'Unknown User',
              email: userData.email || 'No email',
              organization: userData.organization || 'Individual'
            };
          } else if (attempt.user) {
            user = {
              name: attempt.user.name || attempt.user.user_name || 'Unknown User',
              email: attempt.user.email || 'No email',
              organization: attempt.user.organization || 'Individual'
            };
          } else if (profile) {
            user = {
              name: profile.name || 'Unknown User',
              email: profile.email || 'No email',
              organization: 'Individual'
            };
          } else {
            user = { 
              name: `User ${attempt.user_id || attempt.profile_id || 'Unknown'}`, 
              email: 'No email',
              organization: 'Individual'
            };
          }
          
          return {
            ...attempt,
            profile: profile || { name: 'Unknown Profile', email: 'No email', role: 'No role' },
            user: user || { name: 'Unknown User', email: 'No email' }
          };
        } catch (err) {
          console.error('Failed to resolve user data for attempt:', attempt.id, err);
          return {
            ...attempt,
            profile: { name: 'Unknown Profile', email: 'No email', role: 'No role' },
            user: attempt.user || { name: 'Unknown User', email: 'No email' }
          };
        }
      });
      
      setQuizAttempts(enrichedAttempts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuizClick = (quiz) => {
    setSelectedQuiz(quiz);
    setSearchTerm('');
    setFilterOrg('all');
    setFilterProfile('all');
    setSortBy('date-desc');
    fetchQuizAttempts(quiz.id);
  };

  const handleBackToQuizzes = () => {
    setSelectedQuiz(null);
    setQuizAttempts([]);
    setError(null);
    setQuizPackets([]);
    setSearchTerm('');
    setFilterOrg('all');
    setFilterProfile('all');
    setSortBy('date-desc');
  };

  // Estimate the time needed to complete a quiz based on its question count.
  // Each question is assumed to take up to 40 seconds to answer.
  // The exact estimate is rounded to the nearest 5-minute boundary and shown
  // as a fuzzy range (e.g. 7 min -> "<5 mins", 34 min -> ">30 mins").
  const estimateTimeLimit = (questionCount) => {
    if (!questionCount || questionCount <= 0) return 'N/A';
    const maxMinutes = Math.ceil((questionCount * 40) / 60);
    let rounded = Math.round(maxMinutes / 5) * 5;
    if (rounded < 5) rounded = 5;
    if (rounded >= 30) return '<30 mins';
    return `<${rounded} mins`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not submitted';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get performance level based on marks using custom scoring scale
  const getPerformanceLevel = (marks, packetName) => {
    try {
      const savedScaling = localStorage.getItem('packetScaling_' + packetName);
      if (savedScaling) {
        const customScale = JSON.parse(savedScaling);
        if (customScale.enabled && customScale.scales && customScale.scales.length > 0) {
          const level = customScale.scales.find(range => marks >= range.min && marks <= range.max);
          if (level) return level;
        }
      }
    } catch (error) {
      console.warn('Failed to parse custom scaling for packet:', packetName, error);
    }
    
    const defaultScale = [
      { min: 0, max: 2, label: "Needs Improvement", color: "#8E66F1", image: "" },
      { min: 3, max: 5, label: "Average", color: "#8E66F1", image: "" },
      { min: 6, max: 8, label: "Good", color: "#8E66F1", image: "" },
      { min: 9, max: 12, label: "Excellent", color: "#8E66F1", image: "" }
    ];
    
    const level = defaultScale.find(range => marks >= range.min && marks <= range.max);
    return level || defaultScale[0];
  };

  // Calculate packet-based scores for an attempt
  const calculatePacketScores = (attempt) => {
    const packetScores = {};
    
    if (attempt.packet_marks && Object.keys(attempt.packet_marks).length > 0) {
      quizPackets.forEach(packet => {
        const packetData = attempt.packet_marks[packet.name];
        if (packetData) {
          packetScores[packet.id] = {
            marks: packetData.marks,
            questions: packetData.questions,
            performanceLevel: getPerformanceLevel(packetData.marks, packet.name)
          };
        } else {
          packetScores[packet.id] = {
            marks: 0,
            questions: 0,
            performanceLevel: getPerformanceLevel(0, packet.name)
          };
        }
      });
    } else {
      quizPackets.forEach(packet => {
        packetScores[packet.id] = {
          marks: 0,
          questions: 0,
          performanceLevel: getPerformanceLevel(0, packet.name)
        };
      });
    }
    
    return packetScores;
  };

  // ── Loading state ──────────────────────────────────────────
  if (dataLoading) {
    return (
      <div className="results-spinner-wrap">
        <div className="results-spinner" />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (dataError) {
    return (
      <div className="assessment-results">
        <div className="report-alert">Error loading data: {dataError}</div>
      </div>
    );
  }

  // ── Detail view (quiz selected) ────────────────────────────
  if (selectedQuiz) {


        return (
          <div className="assessment-results">
            {/* Header */}
            <div className="results-header" style={{ flexWrap: 'wrap' }}>
              <button className="results-back-btn" onClick={handleBackToQuizzes} style={{ background: 'rgba(255,255,255,0.2)', border: 'none' }}>
                <ArrowBackIcon style={{ color: '#fff' }} />
              </button>
              <div className="results-header__text">
                <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AssessmentIcon style={{ width: 28, height: 28 }} />
                  Quiz Results: {selectedQuiz.name}
                </h1>
                <p>View all attempt records for this quiz with performance levels and packet-by-packet analysis</p>
              </div>
            </div>

            {/* Quiz Info Banner */}
            <div className="results-info-banner">
              <div>
                <h3>Quiz Details</h3>
                <p><strong>Description:</strong> {selectedQuiz.description || 'No description'}</p>
                <p><strong>Time Limit:</strong> {estimateTimeLimit(quizPackets.reduce((sum, packet) => sum + (packet.questions ? packet.questions.length : 0), 0))}</p>
                <p><strong>No. of Questions:</strong> {quizPackets.reduce((sum, packet) => sum + (packet.questions ? packet.questions.length : 0), 0)}</p>
              </div>
              <div>
                <h3>Statistics</h3>
                <p><strong>Total Attempts:</strong> {quizAttempts.length}</p>
                <p><strong>Packets:</strong> {quizPackets.length}</p>
                <p><strong>Completion Rate:</strong> {
                  quizAttempts.length > 0
                    ? `${quizAttempts.filter(a => a.status === 'completed').length}/${quizAttempts.length}`
                    : 'No attempts'
                }</p>
              </div>
            </div>

            {/* Toolbar with Search, Filters, and Sorting */}
            <div className="report-toolbar" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
              <div className="report-search" style={{ flex: '1', minWidth: '200px' }}>
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                className="report-filter-select"
                value={filterOrg}
                onChange={(e) => setFilterOrg(e.target.value)}
              >
                <option value="all">All Organizations</option>
                {uniqueOrgs.filter(org => org !== 'all').map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>

              <select
                className="report-filter-select"
                value={filterProfile}
                onChange={(e) => setFilterProfile(e.target.value)}
              >
                <option value="all">All Profiles</option>
                {uniqueProfiles.filter(p => p !== 'all').map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              <div className="report-date-filters" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'nowrap' }}>
                <div className="report-date-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)', fontWeight: 500 }}>From:</span>
                  <input
                    type="date"
                    className="report-filter-select"
                    style={{ minWidth: '130px', padding: '8px 10px' }}
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>

                <div className="report-date-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)', fontWeight: 500 }}>To:</span>
                  <input
                    type="date"
                    className="report-filter-select"
                    style={{ minWidth: '130px', padding: '8px 10px' }}
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>

              <select
                className="report-filter-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date-desc">Latest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </select>
            </div>

            {/* Attempts Table */}
            {loading ? (
              <div className="results-spinner-wrap">
                <div className="results-spinner" />
              </div>
            ) : error ? (
              <div className="report-alert">{error}</div>
            ) : quizAttempts.length === 0 ? (
              <div className="results-empty">
                <AssessmentIcon />
                <h3>No attempts found</h3>
                <p>This quiz hasn't been attempted by any users yet.</p>
              </div>
            ) : filteredAndSearchedAttempts.length === 0 ? (
              <div className="results-empty">
                <SearchIcon style={{ width: 48, height: 48 }} />
                <h3>No results found</h3>
                <p>No attempts matched your search term "{searchTerm}".</p>
              </div>
            ) : (
              <div className="results-table-container">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Profile</th>
                      <th>Organization</th>
                      <th>Status</th>
                      <th>Completed</th>
                      {quizPackets.map(packet => (
                        <th key={packet.id} style={{ minWidth: 120 }}>{packet.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSearchedAttempts.map((attempt) => {
                      const packetScores = calculatePacketScores(attempt);
                      
                      return (
                        <tr key={attempt.id}>
                          <td>
                            <p className="results-table__user-name">{attempt.user?.name || 'Unknown User'}</p>
                            <p className="results-table__user-email">{attempt.user?.email || 'No email'}</p>
                          </td>
                          <td>
                            <p className="results-table__user-name">{attempt.profile?.name || 'Unknown Profile'}</p>
                          </td>
                          <td>
                            <span className="results-badge results-badge--outline">
                              {attempt.user?.organization || 'Not specified'}
                            </span>
                          </td>
                          <td>
                            <span className={`results-badge ${attempt.status === 'completed' ? 'results-badge--completed' : 'results-badge--warning'}`}>
                              {attempt.status || 'Unknown'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--color-secondary)' }}>
                            {formatDate(attempt.completed_at)}
                          </td>
                          {quizPackets.map(packet => {
                            const packetScore = packetScores[packet.id];
                            return (
                              <td key={packet.id} className="results-performance-cell">
                                <span
                                  className="results-performance-badge"
                                  style={{ backgroundColor: packetScore.performanceLevel.color }}
                                >
                                  {packetScore.performanceLevel.label}
                                </span>
                                <br />
                                <span className="results-performance-sub">
                                  {packetScore.questions} questions
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
  }

  // ── Quiz selection grid ────────────────────────────────────
  return (
    <div className="assessment-results">
      {/* Header */}
      <div className="results-header">
        <div className="results-header__icon">
          <AssessmentIcon />
        </div>
        <div className="results-header__text">
          <h1>Quiz Results</h1>
          <p>Click on any quiz to view detailed attempt records with performance levels and packet-by-packet analysis</p>
        </div>
      </div>

      {/* Quizzes Grid */}
      {quizzes.length === 0 ? (
        <div className="results-empty">
          <QuizIcon />
          <h3>No quizzes available</h3>
          <p>Create some quizzes first to view quiz results.</p>
        </div>
      ) : (
        <div className="results-quiz-grid">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="results-quiz-card"
              onClick={() => handleQuizClick(quiz)}
            >
              <div className="results-quiz-card__header">
                <div className="results-quiz-card__icon">
                  <img src="/happimynd_logo.png" alt="HappiMynd" />
                </div>
                <h3 className="results-quiz-card__name">{quiz.name}</h3>
              </div>
              
              <p className="results-quiz-card__desc">
                {quiz.description || 'No description available'}
              </p>
              
              <div className="results-quiz-card__footer">
                <div className="results-quiz-card__meta">
                  <div>
                    <span className="results-quiz-card__meta-label">Time Limit</span>
                    <span className="results-quiz-card__meta-value">{questionCounts[quiz.id] != null ? estimateTimeLimit(questionCounts[quiz.id]) : '—'}</span>
                  </div>
                  <div>
                    <span className="results-quiz-card__meta-label">No. of Questions</span>
                    <span className="results-quiz-card__meta-value">{questionCounts[quiz.id] ?? '—'}</span>
                  </div>
                </div>
                
                <button className="results-quiz-card__action-btn">
                  <AssessmentIcon style={{ width: 18, height: 18 }} />
                  View Results
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssessmentResults;
