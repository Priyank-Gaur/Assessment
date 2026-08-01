import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../../hooks/useDatabase';
import { quizPacketApi } from '../../services/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTranslatedContent } from '../../hooks/useTranslatedContent';
import WhatsAppButton from '../WhatsAppButton';

// Static UI copy for the dashboard. Every string is fed through the translation
// hook so the whole page renders in the user's selected language.
const UI_TEXT = {
  welcome: 'Welcome!',
  tagline: 'Small steps toward conscious growth. Take a moment to check in with yourself today.',
  language: 'Language',
  mapped: 'Mapped Quizzes',
  taken: 'Quizzes Taken',
  totalAttempts: 'Total Attempts',
  assignedQuizzes: 'Assigned Quizzes',
  noQuizzes: 'No quizzes assigned yet',
  noQuizzesSub: 'New quizzes will appear here when assigned',
  pending: 'Pending Completion',
  startQuiz: 'Start Quiz',
  resumeAssessment: 'Resume Quiz',
  recentAttempts: 'Recent Attempts',
  noAttempts: 'No attempts yet',
  noAttemptsSub: 'Your quiz results will show up here',
  completed: 'Completed',
  viewReport: 'View Report',
  resume: 'Resume',
  quiz: 'Quiz',
  viewAll: 'View All',
  attempts: 'Attempts',
  loginPrompt: 'Please log in to view your dashboard.',
  translating: 'Translating…',
};
import {
  Quiz as QuizIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Assignment as AssignmentIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Visibility as VisibilityIcon,
  AccessTime as AccessTimeIcon,
  Event as EventIcon,
  HourglassEmpty as HourglassEmptyIcon
} from '@mui/icons-material';
import './UserDashboard.css';

const UserDashboard = ({ setTab }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { language, setLanguage, languages } = useLanguage();

  const {
    userQuizAttempts,
    loadUserQuizAttempts,
    profiles,
    quizzes,
    quizAssignments,
    loading: dbLoading
  } = useDatabase();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        setError(null);

        const storedUser = localStorage.getItem('currentUser');
        if (!storedUser) {
          setError('No user found. Please log in.');
          return;
        }

        const currentUser = JSON.parse(storedUser);
        setUser(currentUser);

        await loadUserQuizAttempts(currentUser.id);

      } catch (err) {
        console.error('Error loading user data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [loadUserQuizAttempts]);

  // Resolve the user's assigned quizzes client-side.
  // The /api/users/:id/assigned-quizzes endpoint returns [] (it never maps a
  // user to their profile's assignments), so we join the data the app already
  // loads: user.profile is a profile *name* → match the profile record →
  // pull quiz_assignments for that profile_id → attach the quiz details.
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
          quiz: (quizzes || []).find(q => q && String(q.id) === String(a.quiz_id)) || null,
          profile: assignedProfile
        };
      })
      .filter(a => a.quiz); // drop assignments whose quiz was deleted
  }, [user, profiles, quizzes, quizAssignments]);

  // Filter attempts so we only include those for quizzes that are assigned to the user/profile.
  const allowedQuizIds = useMemo(() => {
    return new Set(assignedQuizzes.map(aq => String(aq.quiz_id)));
  }, [assignedQuizzes]);

  const filteredUserQuizAttempts = useMemo(() => {
    return userQuizAttempts
      .filter(a => allowedQuizIds.has(String(a.quiz_id)))
      .sort((a, b) => {
        const timeA = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime();
        const timeB = new Date(b.completed_at || b.updated_at || b.started_at || b.created_at || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
      });
  }, [userQuizAttempts, allowedQuizIds]);

  // Derive the summary cards stats
  const stats = useMemo(() => {
    // Unique mapped assessments (count of unique quizzes assigned to the user/profile)
    const mappedCount = allowedQuizIds.size;

    // Unique assessments taken (unique quizzes in filteredUserQuizAttempts completed at least once)
    const takenQuizIds = new Set(
      filteredUserQuizAttempts
        .filter(a => a.completed_at || a.status === 'completed')
        .map(a => String(a.quiz_id))
    );
    const takenCount = takenQuizIds.size;

    // Total attempts made by the user on the allowed/mapped assessments
    const totalAttemptsCount = filteredUserQuizAttempts.length;

    return { mappedCount, takenCount, totalAttemptsCount };
  }, [allowedQuizIds, filteredUserQuizAttempts]);

  // Estimate time the same way the admin's Assessment Results does: based on the
  // quiz's question count (≈40s per question), not the stale stored time_limit.
  const estimateTimeLimit = (questionCount) => {
    if (!questionCount || questionCount <= 0) return 'N/A';
    return `${Math.ceil((questionCount * 40) / 60)} min`;
  };

  // Question count per assigned quiz (sum of questions across its packets),
  // fetched the same way the admin dashboard does, so the displayed time matches.
  const [questionCounts, setQuestionCounts] = useState({});
  useEffect(() => {
    const ids = [...new Set(assignedQuizzes.map(a => a.quiz_id))];
    if (ids.length === 0) return;

    let cancelled = false;
    const loadCounts = async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const packetsData = await quizPacketApi.getQuizPackets(id);
            const count = (packetsData || []).reduce(
              (sum, packet) => sum + (packet.questions ? packet.questions.length : 0),
              0
            );
            return [id, count];
          } catch {
            return [id, 0];
          }
        })
      );
      if (!cancelled) setQuestionCounts(Object.fromEntries(entries));
    };

    loadCounts();
    return () => { cancelled = true; };
  }, [assignedQuizzes]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Collect every dynamic string the dashboard renders (quiz names,
  // descriptions, profile names) so they get translated alongside the static
  // UI copy. translateBatch de-dupes and caches, so this stays cheap.
  const dynamicTexts = useMemo(() => {
    const arr = [];
    assignedQuizzes.forEach((a) => {
      if (a.quiz?.name) arr.push(a.quiz.name);
      if (a.quiz?.description) arr.push(a.quiz.description);
      if (a.profile?.name) arr.push(a.profile.name);
    });
    filteredUserQuizAttempts.forEach((a) => {
      if (a.quiz?.name) arr.push(a.quiz.name);
      if (a.profile?.name) arr.push(a.profile.name);
    });
    return arr;
  }, [assignedQuizzes, filteredUserQuizAttempts]);

  const allTexts = useMemo(
    () => [...Object.values(UI_TEXT), ...dynamicTexts],
    [dynamicTexts]
  );

  const { tx, translating } = useTranslatedContent(allTexts);
  // Shorthand for translating a static UI key.
  const t = (key) => tx(UI_TEXT[key]);

  if (loading || dbLoading) {
    return (
      <div className="dashboard__loading">
        <div className="dashboard__spinner" aria-label="Loading dashboard..."></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dashboard">
        <div className="alert alert--warning" role="alert">
          {t('loginPrompt')}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-content">
          <div className="dashboard__avatar">
            <PersonIcon />
          </div>
          <div>
            <h1 className="dashboard__title">{t('welcome')}</h1>
            <div className="dashboard__subtitle">
              <EmailIcon />
              <span>{user.email}</span>
            </div>
            <p className="dashboard__tagline">{t('tagline')}</p>
          </div>
        </div>

        <div className="dashboard__lang">
          <label className="dashboard__lang-label" htmlFor="dashboard-language">
            {t('language')}
          </label>
          <select
            id="dashboard-language"
            className="dashboard__lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          {translating && (
            <span className="dashboard__lang-status">{UI_TEXT.translating}</span>
          )}
        </div>
      </header>

      <div className="dashboard__grid-stats">
        <div className="stat-card stat-card--primary">
          <div className="stat-card__content">
            <div>
              <div className="stat-card__value">{stats.mappedCount}</div>
              <div className="stat-card__label">{t('mapped')}</div>
            </div>
            <div className="stat-card__icon">
              <AssignmentIcon />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card--success">
          <div className="stat-card__content">
            <div>
              <div className="stat-card__value">{stats.takenCount}</div>
              <div className="stat-card__label">{t('taken')}</div>
            </div>
            <div className="stat-card__icon">
              <CheckCircleIcon />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card--warning">
          <div className="stat-card__content">
            <div>
              <div className="stat-card__value">{stats.totalAttemptsCount}</div>
              <div className="stat-card__label">{t('totalAttempts')}</div>
            </div>
            <div className="stat-card__icon">
              <TrendingUpIcon />
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard__grid-sections">
        {/* Assigned Quizzes */}
        <section className="section-card">
          <h2 className="section-card__header">
            <div className="section-card__header-icon">
              <AssignmentIcon />
            </div>
            {t('assignedQuizzes')}
          </h2>

          {assignedQuizzes.length === 0 ? (
            <div className="empty-state">
              <AssignmentIcon className="empty-state__icon" />
              <div className="empty-state__title">{t('noQuizzes')}</div>
              <div className="empty-state__subtitle">{t('noQuizzesSub')}</div>
            </div>
          ) : (
            <div>
              {assignedQuizzes.map((assignment) => {
                const incompleteAttempt = filteredUserQuizAttempts.find(
                  a => String(a.quiz_id) === String(assignment.quiz_id) && (!a.completed_at && a.status !== 'completed')
                );
                return (
                  <article key={assignment.id} className="list-item">
                    <div className="list-item__content">
                      <div className="list-item__header">
                        <QuizIcon className="list-item__icon" />
                        <h3 className="list-item__title">{tx(assignment.quiz?.name)}</h3>
                      </div>
                      <p className="list-item__desc">{tx(assignment.quiz?.description)}</p>
                      <div className="list-item__tags">
                        <span className="badge badge--primary">{tx(assignment.profile?.name)}</span>
                        {incompleteAttempt && (
                          <span className="badge badge--warning" style={{ display: 'flex', alignItems: 'center' }}>
                            <HourglassEmptyIcon sx={{ fontSize: 14, mr: 0.5 }} /> {t('pending')}
                          </span>
                        )}
                        {questionCounts[assignment.quiz_id] > 0 && (
                          <span className="badge badge--outline" style={{ display: 'flex', alignItems: 'center' }}>
                            <AccessTimeIcon sx={{ fontSize: 16, mr: 0.5 }} /> {estimateTimeLimit(questionCounts[assignment.quiz_id])}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="list-item__action">
                      <button
                        className="btn btn--primary"
                        onClick={() => window.open(`/attempt/${assignment.quiz_id}`, '_blank')}
                      >
                        {incompleteAttempt ? t('resumeAssessment') : t('startQuiz')} &rarr;
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Attempts */}
        <section className="section-card">
          <h2 className="section-card__header">
            <div className="section-card__header-icon" style={{ backgroundColor: '#8E66F1' }}>
              <TrendingUpIcon />
            </div>
            {t('recentAttempts')}
          </h2>

          {filteredUserQuizAttempts.length === 0 ? (
            <div className="empty-state">
              <TrendingUpIcon className="empty-state__icon" />
              <div className="empty-state__title">{t('noAttempts')}</div>
              <div className="empty-state__subtitle">{t('noAttemptsSub')}</div>
            </div>
          ) : (
            <div>
              {filteredUserQuizAttempts.slice(0, 5).map((attempt) => {
                const isCompleted = attempt.completed_at || attempt.status === 'completed';
                return (
                  <article key={attempt.id} className="list-item">
                    <div className="list-item__content">
                      <div className="list-item__header">
                        {isCompleted ? (
                          <CheckCircleIcon className="list-item__icon" style={{ color: '#8E66F1' }} />
                        ) : (
                          <ScheduleIcon className="list-item__icon" style={{ color: '#8E66F1' }} />
                        )}
                        <div>
                          <h3 className="list-item__title" style={{ marginBottom: '4px' }}>
                            {attempt.quiz?.name ? tx(attempt.quiz.name) : t('quiz')}
                          </h3>
                          <div className="text-sm text-muted" style={{ display: 'flex', alignItems: 'center' }}>
                            <EventIcon sx={{ fontSize: 16, mr: 0.5 }} /> {formatDate(attempt.started_at)}
                          </div>
                        </div>
                      </div>
                      <div className="list-item__tags" style={{ marginTop: '12px' }}>
                        <span className="badge badge--primary">{tx(attempt.profile?.name)}</span>
                        {isCompleted ? (
                          <span className="badge badge--success" style={{ display: 'flex', alignItems: 'center' }}>
                            <CheckCircleIcon sx={{ fontSize: 14, mr: 0.5 }} /> {t('completed')}
                          </span>
                        ) : (
                          <span className="badge badge--warning" style={{ display: 'flex', alignItems: 'center' }}>
                            <HourglassEmptyIcon sx={{ fontSize: 14, mr: 0.5 }} /> {t('pending')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="list-item__action">
                      {isCompleted ? (
                        <button
                          className="btn btn--secondary"
                          onClick={() => navigate(`/report/${attempt.quiz_id}/${attempt.id}`)}
                        >
                          <VisibilityIcon className="btn-icon" />
                          {t('viewReport')}
                        </button>
                      ) : (
                        <button
                          className="btn btn--primary"
                          onClick={() => window.open(`/attempt/${attempt.quiz_id}`, '_blank')}
                        >
                          {t('resume')} &rarr;
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}

              {filteredUserQuizAttempts.length > 5 && (
                <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
                  <button className="btn btn--outline" onClick={() => setTab && setTab(1)}>
                    {t('viewAll')} {filteredUserQuizAttempts.length} {t('attempts')} &rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default UserDashboard;
