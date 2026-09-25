import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download as DownloadIcon,
  Assessment as AssessmentIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  FolderZip as FolderZipIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import JSZip from 'jszip';
import ReportContent, { exportElementToPdfBlob, defaultTemplate } from './ReportContent';
import './AssessmentReport.css';
import { enrichQuizWithInstructions } from './QuizInstructionsMap';
import { useDatabase } from '../hooks/useDatabase';
import { quizPacketApi, userApi, pdfTemplateApi } from '../services/api';
import { PROFILE_ORDER, isSameProfile } from '../utils/profileOrder';


const AssessmentReport = () => {
  const { quizzes, profiles, users, loading: dbLoading, error: dbError } = useDatabase();

  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [quizPackets, setQuizPackets] = useState([]);
  const [quizTemplate, setQuizTemplate] = useState(defaultTemplate);
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
  const [generatingAttemptId, setGeneratingAttemptId] = useState(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0, message: '' });
  const [bulkNotification, setBulkNotification] = useState(null);
  const [activeRenderData, setActiveRenderData] = useState(null);
  const abortDownloadRef = useRef(false);
  const offscreenReportRef = useRef(null);

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
      enrichQuizWithInstructions(quiz);
      setSelectedQuiz(quiz);
      setSearchTerm('');
      setFilterStatus('all');
      setFilterOrg('all');
      setFilterProfile('all');
      setSortBy('date-desc');

      // Load quiz attempts, packets, and template in parallel using API services
      const [attemptsData, packetsData, templateResData] = await Promise.all([
        userApi.getAllQuizAttempts(),
        quizPacketApi.getQuizPackets(quiz.id),
        pdfTemplateApi.getTemplate(quiz.id).catch(() => null)
      ]);

      const templateData = templateResData?.template || templateResData || defaultTemplate;
      setQuizTemplate(templateData);

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

      setBulkDownloading(false);
      setBulkNotification(null);
      setActiveRenderData(null);
      setQuizAttempts(enrichedAttempts);
      setQuizPackets(packetsData || []);
      setShowDetails(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderAttemptToPdfBlob = async (attempt) => {
    // 1. Get user data
    let userData = attempt.user || attempt.userData;
    if (!userData && attempt.user_id) {
      userData = (users || []).find(u => String(u.id) === String(attempt.user_id));
      if (!userData) {
        try {
          userData = await userApi.getUserById(attempt.user_id);
        } catch (e) {
          console.warn('Failed to fetch user by id:', e);
        }
      }
    }

    const quizObj = selectedQuiz ? { ...selectedQuiz } : null;
    if (quizObj) enrichQuizWithInstructions(quizObj);

    // 2. Set active render data so React mounts ReportContent into offscreen container
    setActiveRenderData({
      quiz: quizObj,
      attempt,
      user: userData || { user_name: 'User', email: 'No email' },
      packets: quizPackets || [],
      template: quizTemplate || defaultTemplate
    });

    // 3. Wait 500ms for React to mount and layout SVGs, emotion faces, and fonts
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Capture rendered element
    const element = offscreenReportRef.current || document.getElementById('report-container');
    if (!element) {
      throw new Error('Report container element not found for rendering');
    }

    const { pdf, blob } = await exportElementToPdfBlob(element);

    const safeUserName = (userData?.user_name || userData?.name || attempt.user?.name || attempt.user?.user_name || 'User')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim() || 'User';
    const safeQuizName = (quizObj?.name || 'Quiz')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim() || 'Quiz';
    const dateTag = attempt?.completed_at
      ? new Date(attempt.completed_at).toISOString().split('T')[0]
      : 'report';

    const baseFileName = `${safeQuizName}_${safeUserName}_${dateTag}.pdf`;

    return { pdf, pdfBlob: blob, baseFileName };
  };

  const handleGeneratePDF = async (attempt) => {
    try {
      setGeneratingPDF(true);
      setGeneratingAttemptId(attempt.id);
      setError('');
      
      const { pdf, baseFileName } = await renderAttemptToPdfBlob(attempt);
      pdf.save(baseFileName);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setError(`Failed to generate PDF: ${err.message}`);
    } finally {
      setActiveRenderData(null);
      setGeneratingAttemptId(null);
      setGeneratingPDF(false);
    }
  };

  const handleDownloadAllPDFs = async () => {
    if (filteredAttempts.length === 0 || bulkDownloading) return;

    abortDownloadRef.current = false;
    setBulkDownloading(true);
    setBulkNotification(null);
    setDownloadProgress({
      current: 0,
      total: filteredAttempts.length,
      message: 'Initializing report generation...'
    });

    try {
      const zip = new JSZip();
      const usedFilenames = new Set();
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < filteredAttempts.length; i++) {
        if (abortDownloadRef.current) {
          setBulkNotification({
            type: 'warning',
            message: `Batch download cancelled by user. ${successCount} reports packaged.`
          });
          break;
        }

        const attempt = filteredAttempts[i];
        const profileInfo = getProfileInfo(attempt);
        const candidateName = profileInfo.name || 'Candidate';

        setDownloadProgress({
          current: i + 1,
          total: filteredAttempts.length,
          message: `Rendering official report ${i + 1} of ${filteredAttempts.length} (${candidateName})...`
        });

        try {
          const { pdfBlob, baseFileName } = await renderAttemptToPdfBlob(attempt);

          // Ensure distinct filenames inside the ZIP
          let uniqueName = baseFileName;
          let counter = 1;
          while (usedFilenames.has(uniqueName.toLowerCase())) {
            uniqueName = baseFileName.replace(/\.pdf$/i, `_${counter}.pdf`);
            counter++;
          }
          usedFilenames.add(uniqueName.toLowerCase());

          zip.file(uniqueName, pdfBlob);
          successCount++;
        } catch (itemErr) {
          console.error(`Failed to generate PDF for attempt ${attempt.id}:`, itemErr);
          failureCount++;
        }
      }

      setActiveRenderData(null);

      if (abortDownloadRef.current) {
        setBulkDownloading(false);
        return;
      }

      if (successCount === 0) {
        throw new Error('Could not generate any PDF reports.');
      }

      setDownloadProgress({
        current: filteredAttempts.length,
        total: filteredAttempts.length,
        message: 'Packaging reports into ZIP archive...'
      });

      const zipBlob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (metadata) => {
          if (metadata.percent) {
            setDownloadProgress(prev => ({
              ...prev,
              message: `Compressing ZIP: ${Math.round(metadata.percent)}%...`
            }));
          }
        }
      );

      const safeQuizTitle = (selectedQuiz.name || 'Quiz')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/_+/g, '_')
        .trim();
      const dateTag = new Date().toISOString().split('T')[0];
      const zipFileName = `${safeQuizTitle}_Filtered_Reports_${dateTag}.zip`;

      const downloadUrl = URL.createObjectURL(zipBlob);
      const tempLink = document.createElement('a');
      tempLink.href = downloadUrl;
      tempLink.download = zipFileName;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      URL.revokeObjectURL(downloadUrl);

      setBulkNotification({
        type: failureCount > 0 ? 'warning' : 'success',
        message: failureCount > 0
          ? `Successfully downloaded ${successCount} PDF reports in ZIP archive (${failureCount} failed).`
          : `Successfully downloaded all ${successCount} PDF reports in "${zipFileName}"!`
      });
    } catch (err) {
      console.error('Bulk download error:', err);
      setBulkNotification({
        type: 'error',
        message: `Failed to download PDFs: ${err.message}`
      });
    } finally {
      setActiveRenderData(null);
      setBulkDownloading(false);
    }
  };

  const handleCancelBulkDownload = () => {
    abortDownloadRef.current = true;
    setActiveRenderData(null);
    setDownloadProgress(prev => ({ ...prev, message: 'Cancelling batch download...' }));
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
            <div className="report-detail-title-group">
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

            <div className="report-detail-header-actions">
              <button
                className="report-download-all-btn"
                disabled={filteredAttempts.length === 0 || bulkDownloading || generatingPDF}
                onClick={handleDownloadAllPDFs}
                title={filteredAttempts.length === 0 
                  ? "No attempts match current filters" 
                  : `Download all ${filteredAttempts.length} filtered PDF reports as a ZIP archive`}
              >
                <FolderZipIcon style={{ fontSize: '20px' }} />
                <span>
                  {bulkDownloading 
                    ? `Generating PDFs (${downloadProgress.current}/${downloadProgress.total})...` 
                    : `Download All Filtered PDFs (${filteredAttempts.length})`}
                </span>
              </button>
            </div>
          </div>

          {generatingPDF && !bulkDownloading && (
            <div className="report-progress-card">
              <div className="report-progress-card__header">
                <div className="report-progress-card__title-group">
                  <div className="report-progress-card__spinner" />
                  <div>
                    <h4 className="report-progress-card__title">Generating Official Report PDF</h4>
                    <p className="report-progress-card__status">Rendering complete HappiMynd report with radar charts, scores & analysis...</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {bulkDownloading && (
            <div className="report-progress-card">
              <div className="report-progress-card__header">
                <div className="report-progress-card__title-group">
                  <div className="report-progress-card__spinner" />
                  <div>
                    <h4 className="report-progress-card__title">Generating PDF Reports in Batch</h4>
                    <p className="report-progress-card__status">{downloadProgress.message}</p>
                  </div>
                </div>
                <button 
                  className="report-progress-card__cancel-btn"
                  onClick={handleCancelBulkDownload}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <div className="report-progress-bar-bg">
                <div 
                  className="report-progress-bar-fill" 
                  style={{ 
                    width: `${downloadProgress.total > 0 ? Math.round((downloadProgress.current / downloadProgress.total) * 100) : 0}%` 
                  }} 
                />
              </div>
              <div className="report-progress-card__footer">
                <span>Processed {downloadProgress.current} of {downloadProgress.total}</span>
                <span>{downloadProgress.total > 0 ? Math.round((downloadProgress.current / downloadProgress.total) * 100) : 0}%</span>
              </div>
            </div>
          )}

          {bulkNotification && (
            <div className={`report-notification report-notification--${bulkNotification.type}`}>
              <div className="report-notification__content">
                {bulkNotification.type === 'success' && <CheckCircleIcon style={{ fontSize: '20px' }} />}
                {bulkNotification.type === 'error' && <ErrorIcon style={{ fontSize: '20px' }} />}
                {bulkNotification.type === 'warning' && <WarningIcon style={{ fontSize: '20px' }} />}
                <span>{bulkNotification.message}</span>
              </div>
              <button 
                className="report-notification__close" 
                onClick={() => setBulkNotification(null)}
                aria-label="Close notification"
                type="button"
              >
                <CloseIcon style={{ fontSize: '18px' }} />
              </button>
            </div>
          )}

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
              <p className="report-summary-box__label">Filtered Attempts</p>
              <p className="report-summary-box__value" style={{ color: 'var(--color-primary)' }}>{filteredAttempts.length}</p>
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
                            disabled={generatingPDF || bulkDownloading}
                            onClick={() => handleGeneratePDF(attempt)}
                          >
                            {generatingAttemptId === attempt.id ? (
                              <div
                                className="report-progress-card__spinner"
                                style={{ width: '16px', height: '16px', borderWidth: '2px' }}
                              />
                            ) : (
                              <DownloadIcon />
                            )}
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

      {/* Hidden container used to render official HappiMynd visual report for PDF generation */}
      {activeRenderData && (
        <div
          id="offscreen-report-wrapper"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '1050px',
            backgroundColor: '#ffffff',
            zIndex: -9999,
            pointerEvents: 'none'
          }}
        >
          <ReportContent
            quiz={activeRenderData.quiz}
            attempt={activeRenderData.attempt}
            user={activeRenderData.user}
            packets={activeRenderData.packets}
            template={activeRenderData.template}
            selectedPacketId="all"
            containerRef={offscreenReportRef}
            language="en"
          />
        </div>
      )}
    </div>
  );
};

export default AssessmentReport;