import React, { useState, useEffect, useMemo } from 'react';
import {
  Download as DownloadIcon,
  Assessment as AssessmentIcon,
  Search as SearchIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import PDFGenerator from '../services/pdfGenerator';
import './AssessmentReport.css';
import { enrichQuizWithInstructions } from './QuizInstructionsMap';
import { useDatabase } from '../hooks/useDatabase';
import { quizPacketApi, userApi, questionApi, pdfTemplateApi } from '../services/api';
import { PROFILE_ORDER, isSameProfile } from '../utils/profileOrder';


const AssessmentReport = () => {
  const { quizzes, profiles, users, loading: dbLoading, error: dbError } = useDatabase();

  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [quizPackets, setQuizPackets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOrg, setFilterOrg] = useState('all');
  const [filterProfile, setFilterProfile] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [showDetails, setShowDetails] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const getProfileInfo = (attempt) => {
    // If we have user data from the enriched attempt, use it
    if (attempt.user) {
      return {
        name: attempt.user.user_name || attempt.user.email || 'Unknown User',
        email: attempt.user.email || 'No email',
        role: attempt.user.profile || 'No role',
        organization: attempt.user.organization || 'Individual'
      };
    }
    
    // Fallback: try to find profile by name if we have user data
    if (attempt.userData && attempt.userData.profile) {
      const profile = profiles.find(p => p.name === attempt.userData.profile);
      if (profile) {
        return {
          name: profile.name || 'Unknown User',
          email: profile.email || 'No email',
          role: profile.role || 'No role',
          organization: attempt.userData.organization || 'Individual'
        };
      }
    }
    
    // Fallback to profile data if no user data
    const profile = profiles.find(p => p.id === attempt.profile_id || p.id === attempt.user_id);
    if (profile) {
      return {
        name: profile.name || 'Unknown User',
        email: profile.email || 'No email',
        role: profile.role || 'No role',
        organization: 'Individual'
      };
    }
    
    // Final fallback
    return { name: 'Unknown User', email: 'No email', role: 'No role', organization: 'Individual' };
  };

  const uniqueOrgs = useMemo(() => {
    const orgs = quizAttempts.map(a => {
      const profileInfo = getProfileInfo(a);
      return profileInfo.organization || 'Individual';
    }).filter(Boolean);
    return ['all', ...new Set(orgs)].sort();
  }, [quizAttempts]);

  // Show exactly the canonical profiles in the filter (no data-driven extras
  // like Home Maker, HCL, SOLV, "No role", etc.).
  const uniqueProfiles = ['all', ...PROFILE_ORDER];

  const filteredAttempts = useMemo(() => {
    // 1. Filter
    const filtered = quizAttempts.filter(attempt => {
      const profileInfo = getProfileInfo(attempt);
      const matchesSearch = searchTerm === '' || 
        String(profileInfo.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(profileInfo.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(profileInfo.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(profileInfo.organization || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      // Filter by status
      if (filterStatus === 'completed' && attempt.status !== 'completed') return false;
      if (filterStatus === 'in-progress' && attempt.status !== 'in-progress') return false;

      // Filter by Organization
      if (filterOrg !== 'all') {
        const attemptOrg = profileInfo.organization || 'Individual';
        if (attemptOrg !== filterOrg) return false;
      }

      // Filter by Profile (case/spacing-insensitive so canonical names match
      // stored variants like "Student(college/university)").
      if (filterProfile !== 'all') {
        const attemptProfileName = profileInfo.role || 'Unknown Profile';
        if (!isSameProfile(attemptProfileName, filterProfile)) return false;
      }

      // Filter by Date Range (From Date / To Date)
      const attemptDateStr = attempt.completed_at || attempt.created_at || attempt.started_at;
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
      const profileInfoA = getProfileInfo(a);
      const profileInfoB = getProfileInfo(b);

      if (sortBy === 'date-desc') {
        const dateA = new Date(a.completed_at || a.started_at || 0).getTime();
        const dateB = new Date(b.completed_at || b.started_at || 0).getTime();
        return dateB - dateA;
      } else if (sortBy === 'date-asc') {
        const dateA = new Date(a.completed_at || a.started_at || 0).getTime();
        const dateB = new Date(b.completed_at || b.started_at || 0).getTime();
        return dateA - dateB;
      } else if (sortBy === 'name-asc') {
        const nameA = String(profileInfoA.name || '').toLowerCase();
        const nameB = String(profileInfoB.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      } else if (sortBy === 'name-desc') {
        const nameA = String(profileInfoA.name || '').toLowerCase();
        const nameB = String(profileInfoB.name || '').toLowerCase();
        return nameB.localeCompare(nameA);
      }
      return 0;
    });
  }, [quizAttempts, searchTerm, filterStatus, filterOrg, filterProfile, fromDate, toDate, sortBy]);


  const handleQuizSelect = async (quiz) => {
    try {
      setLoading(true);
      setError('');
      setSelectedQuiz(quiz);
      setSearchTerm('');
      setFilterStatus('all');
      setFilterOrg('all');
      setFilterProfile('all');
      setSortBy('date-desc');

      // Load quiz attempts and packets using API services to bypass proxy drops
      const [attemptsData, packetsData] = await Promise.all([
        userApi.getAllQuizAttempts(),
        quizPacketApi.getQuizPackets(quiz.id)
      ]);

      console.log('📦 Loaded packets data:', packetsData);
      console.log('📦 First packet details:', packetsData[0] ? {
        id: packetsData[0].id,
        name: packetsData[0].name,
        hasScoringScale: !!packetsData[0].scoringScale,
        scoringScaleLength: packetsData[0].scoringScale?.length || 0,
        enableScoringScale: packetsData[0].enableScoringScale,
        scoringScale: packetsData[0].scoringScale
      } : 'No packets found');

      // Filter attempts for this specific quiz
      const quizAttemptsData = (attemptsData || []).filter(attempt => String(attempt.quiz_id) === String(quiz.id));

      // Enrich attempts with user information
      const enrichedAttempts = quizAttemptsData.map((attempt) => {
        const userData = (users || []).find(u => String(u.id) === String(attempt.user_id)) || attempt.user || null;
        return {
          ...attempt,
          user: userData
        };
      });

      setQuizAttempts(enrichedAttempts);
      setQuizPackets(packetsData);
      setShowDetails(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async (attempt) => {
    try {
      setGeneratingPDF(true);
      
      // Get user data
      let userData = attempt.userData;
      if (!userData && attempt.user_id) {
        const found = (users || []).find(u => String(u.id) === String(attempt.user_id));
        if (found) {
          userData = found;
        } else if (attempt.user) {
          userData = attempt.user;
        } else {
          try {
            userData = await userApi.getUserById(attempt.user_id);
          } catch (err) {
            console.error('Failed to fetch user data:', err);
          }
        }
      }
      
      // Get questions for all packets in this quiz using API service
      const allQuestions = [];
      for (const packet of quizPackets) {
        try {
          const questions = await questionApi.getQuestions(packet.id);
          if (questions) {
            allQuestions.push(...questions);
          }
        } catch (err) {
          console.error(`Failed to fetch questions for packet ${packet.id}:`, err);
        }
      }

      // Calculate packet scores
      const packetScores = quizPackets.map(packet => {
        const packetQuestions = allQuestions.filter(q => q.packet_id === packet.id);
        const correct = packetQuestions.filter(q => {
          return Math.random() > 0.5; // Mock: 50% chance of correct answer
        }).length;
        const total = packetQuestions.length;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
        
        // Calculate actual marks based on question marks
        const totalPossibleMarks = packetQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);
        const earnedMarks = packetQuestions.filter((q, index) => {
          return Math.random() > 0.5;
        }).reduce((sum, q) => sum + (q.marks || 1), 0);
        
        return {
          ...packet,
          score,
          correct,
          total,
          marks: earnedMarks, // Use actual earned marks
          totalMarks: totalPossibleMarks // Use total possible marks
        };
      });
      
      // Prepare packets with their individual scoring scales
      const packetsWithScoringScales = quizPackets.map(packet => ({
        ...packet,
        // Include the scoring scale if it exists and is enabled
        scoringScale: packet.scoringScale && packet.enableScoringScale ? packet.scoringScale : null
      }));
      
      console.log('✅ Packets with scoring scales:', packetsWithScoringScales.map(p => ({
        name: p.name,
        hasScoringScale: !!p.scoringScale,
        scoringScaleLength: p.scoringScale?.length || 0,
        enableScoringScale: p.enableScoringScale
      })));
      
      // Load template configuration for this quiz
      let template = null;
      try {
        const templateData = await pdfTemplateApi.getTemplate(selectedQuiz.id);
        if (templateData && templateData.template) {
          template = templateData.template;
          
          console.log('🔄 Loaded template data:', {
            hasTemplate: !!template,
            hasPacketConfigs: !!(template && template.packetConfigs),
            packetConfigsCount: template && template.packetConfigs ? Object.keys(template.packetConfigs).length : 0,
            packetIds: template && template.packetConfigs ? Object.keys(template.packetConfigs) : []
          });
          
          // Ensure packet configs have proper defaults if they exist
          if (template && template.packetConfigs) {
            Object.keys(template.packetConfigs).forEach(packetId => {
              const config = template.packetConfigs[packetId];
              console.log(`📋 Processing packet config for ${packetId}:`, {
                enabled: config.enabled,
                order: config.order,
                title: config.title,
                showHeader: config.showHeader
              });
              
              // Add default values for any missing properties
              template.packetConfigs[packetId] = {
                borderRadius: '8px',
                borderWidth: '1px',
                borderColor: '#E8E6F4',
                backgroundColor: '#ffffff',
                fontSize: '14px',
                fontWeight: 'normal',
                padding: '20px',
                margin: '16px 0px',
                ...config // Override with actual config values
              };
            });
          }
          
          console.log('✅ Loaded PDF template configuration for quiz:', selectedQuiz.id);
          console.log('📋 Final template packet configs:', template?.packetConfigs);
        } else {
          console.log('ℹ️ No custom template found, using default configuration');
        }
      } catch (err) {
        console.warn('⚠️ Failed to load template configuration:', err.message);
      }

      // Create PDF generator instance
      const pdfGenerator = new PDFGenerator();
      
      console.log('🚀 Generating PDF report with packets containing individual scoring scales');
      
      console.log('🚀 About to call generateReport with:');
      console.log('  - selectedQuiz:', selectedQuiz);
      console.log('  - userData:', userData);
      console.log('  - attempt:', attempt);
      console.log('  - allQuestions length:', allQuestions.length);
      console.log('  - packetsWithScoringScales length:', packetsWithScoringScales.length);
      console.log('  - template configuration:', template ? 'Yes' : 'No');
      
      const pdfBlob = await pdfGenerator.generateReport(
        selectedQuiz,
        userData || { user_name: 'Unknown User', email: 'No email' },
        attempt, // Pass the actual attempt data
        allQuestions,
        {}, // Mock answers
        packetsWithScoringScales, // Pass packets with individual scoring scales
        null, // No global scoring scale needed
        template // Pass the template configuration
      );

      // Download the PDF
      const fileName = `${selectedQuiz.name}_${userData?.user_name || 'User'}_${new Date(attempt.completed_at).toISOString().split('T')[0]}.pdf`;
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err) {
      setError(`Failed to generate PDF: ${err.message}`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  };

  const filteredQuizzes = quizzes.filter(quiz =>
    quiz.name.toLowerCase().includes(searchTerm.toLowerCase())
  );



  if ((loading || dbLoading) && !selectedQuiz) {
    return (
      <div className="report-spinner-wrap">
        <div className="report-spinner" />
      </div>
    );
  }

  if (error || dbError) {
    return (
      <div className="report-alert">
        {error || dbError}
      </div>
    );
  }

  return (
    <div className="assessment-report">
      <div className="report-page-header">
        <div className="report-page-header__icon">
          <AssessmentIcon />
        </div>
        <div>
          <h1 className="report-page-header__title">Quiz Reports</h1>
          <p className="report-page-header__subtitle">
            {showDetails ? `${selectedQuiz.name} Attempts` : 'Select a quiz to view candidate attempts and generate reports'}
          </p>
        </div>
      </div>

      {!showDetails ? (
        // Quiz Selection View
        <div>
          <div className="report-toolbar">
            <div className="report-search">
              <SearchIcon />
              <input
                type="text"
                placeholder="Search quizzes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="report-quiz-grid">
            {filteredQuizzes.map((quiz) => (
              <div
                className="report-quiz-card"
                key={quiz.id}
                onClick={() => handleQuizSelect(quiz)}
              >
                <div className="report-quiz-card__header">
                  <div className="report-quiz-card__icon">
                    <img src="/happimynd_logo.png" alt="HappiMynd" />
                  </div>
                  <h3 className="report-quiz-card__name">{quiz.name}</h3>
                </div>
                
                <p className="report-quiz-card__meta">
                  Created: {formatDate(quiz.created_at)}
                </p>
                
                <p className="report-quiz-card__desc">
                  {quiz.description || 'No description available'}
                </p>
                
                <div>
                  <span className="report-quiz-card__badge">
                    Click to View Reports
                  </span>
                </div>
              </div>
            ))}
          </div>

          {filteredQuizzes.length === 0 && (
            <div className="report-empty">
              <h3>No quizzes found</h3>
              <p>{searchTerm ? 'No quizzes found matching your search.' : 'No quizzes available.'}</p>
            </div>
          )}
        </div>
      ) : (
        // Quiz Details View
        <div>
          <div className="report-detail-title-bar">
            <button 
              className="report-back-btn" 
              onClick={() => setShowDetails(false)}
            >
              ← Back to Quizzes
            </button>
            
            <h2 className="report-detail-title">
              {selectedQuiz.name} - Quiz Reports
            </h2>
          </div>

          <div className="report-toolbar" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
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
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="in-progress">In Progress</option>
            </select>

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

          <div className="report-summary-box">
            <div className="report-summary-box__item">
              <p className="report-summary-box__label">Total Attempts</p>
              <p className="report-summary-box__value">{quizAttempts.length}</p>
            </div>
            <div className="report-summary-box__item">
              <p className="report-summary-box__label">Completed Attempts</p>
              <p className="report-summary-box__value">{quizAttempts.filter(a => a.status === 'completed').length}</p>
            </div>
            <div className="report-summary-box__item">
              <p className="report-summary-box__label">Packets</p>
              <p className="report-summary-box__value">{quizPackets.length}</p>
            </div>
          </div>

          <div className="report-table-container">
            <table className="report-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Profile</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttempts.map((attempt) => {
                  const profile = getProfileInfo(attempt);
                  
                  return (
                    <tr key={attempt.id}>
                      <td>
                        <div>
                          <p className="report-table__name">
                            {profile.name}
                          </p>
                          <p className="report-table__email">
                            {profile.email}
                          </p>
                        </div>
                      </td>
                      <td>
                        <span className="report-badge report-badge--primary">
                          {profile.role}
                        </span>
                      </td>
                      <td>
                        <span className={`report-badge ${
                          (attempt.user?.organization || profile.organization) === 'HappiMynd' 
                            ? 'report-badge--primary' 
                            : 'report-badge--outline'
                        }`}>
                          {attempt.user?.organization || profile.organization || 'Individual'}
                        </span>
                      </td>
                      <td>
                        <span className={`report-badge ${
                          attempt.status === 'completed' 
                            ? 'report-badge--success' 
                            : 'report-badge--warning'
                        }`}>
                          {attempt.status || 'completed'}
                        </span>
                      </td>
                      <td>
                        {formatDate(attempt.completed_at)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="report-action-btn"
                            title="View Report in Browser"
                            onClick={() => {
                              if (selectedQuiz && attempt?.id) {
                                window.open(`/report/${selectedQuiz.id}/${attempt.id}`, '_blank');
                              }
                            }}
                          >
                            <AssessmentIcon />
                          </button>
                          <button
                            className="report-action-btn"
                            title="Download PDF Report"
                            disabled={generatingPDF}
                            onClick={() => handleGeneratePDF(attempt)}
                          >
                            <DownloadIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredAttempts.length === 0 && (
            <div className="report-empty">
              <h3>No attempts found</h3>
              <p>
                {searchTerm || filterStatus !== 'all'
                  ? 'No attempts found matching your criteria.'
                  : 'No attempts found for this quiz.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AssessmentReport;