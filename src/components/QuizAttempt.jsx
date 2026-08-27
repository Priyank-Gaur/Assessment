import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForward from '@mui/icons-material/ArrowForward';
import PersonIcon from '@mui/icons-material/Person';
import './QuizAttempt.css';
import { enrichQuizWithInstructions } from './QuizInstructionsMap';
import { LANGUAGES, DEFAULT_LANGUAGE } from '../constants/languages';
import { translateBatch } from '../services/translation';
import { useLanguage } from '../contexts/LanguageContext';
import { getAgeCategory } from '../utils/age';
import { emptyGuardianConsent, isConsentComplete, saveGuardianConsent, getGuardianConsent } from '../utils/guardianConsent';
import ParentGuardianConsent, { GUARDIAN_CONSENT_STRINGS, GUARDIAN_CONSENT_BLOCKED_MESSAGE } from './ParentGuardianConsent';

// All page-level static text that should be translated along with the quiz
// content. Keys are referenced via the `t()` helper inside the component so
// selecting a language swaps every visible string, not just questions/options.
const UI_STRINGS = {
  languageLabel: 'Language:',
  descTitle: 'Why should I take this quiz?',
  descP1: 'Life is made up of many small and big moments, some exciting, some stressful, and some that test our patience.',
  descP2: "From experiencing joy to feeling overwhelmed by responsibilities or uncertainty to having tough conversations, making big decisions, challenges come our way every day. How we deal with them depends not just on what we know, but on how well we understand and manage our emotions while connecting with others.",
  descP3: "That's what Emotional Intelligence (EQ) means, it's simply being smart about feelings: knowing your own emotions and understanding others.",
  descP4: 'This assessment will help you discover your strengths, identify areas to improve to help yourself handle overall life and manage relationships with more ease. Just a few minutes can create lasting change in both your personal happiness and professional success.',
  descP5: 'The better you understand your emotions, the better you live, connect and grow!!',
  descP6: "Don't forget to turn your assessment insights into action by booking a report reading session on receiving the report. You have access to our experts to gain deeper clarity and create your roadmap forward.",
  instructionsTitle: 'Instructions:',
  instr1: 'Read each statement carefully',
  instr2: 'There is no right and wrong answer, so no judgement',
  instr3: '1 in the likert scale represent Strongly Disagree and 5 represents Strongly Agree',
  instr4: 'Please avoid marking the neutral response and share real time experiences',
  instr5: 'Please answer all the questions with your natural instinct',
  instr6: 'Your responses will be kept 100% confidential',
  startBtn: 'Start Quiz',
  chooseLang: 'Choose your own Language',
  previous: 'Previous',
  next: 'Next',
  submit: 'Submit Quiz',
  poweredBy: 'Powered by HappiMynd',
};

// Kept at module scope so it can be translated in one batch with everything
// else; the translated copy is picked when a non-English language is active.
const MOTIVATIONAL_MESSAGES = [
  "You're doing great! Keep going!",
  "Excellent progress! You're on the right track!",
  "Fantastic work so far! Almost there!",
  "You're crushing it! Keep up the good work!",
  "Amazing effort! You're nearly finished!",
  "Well done! Your dedication is paying off!",
  "Impressive progress! You're doing brilliantly!",
  "You're on fire! Keep pushing forward!",
  "Outstanding! You're making great strides!",
  "Superb! You're almost at the finish line!",
  "Brilliant! Your persistence is admirable!",
  "Wonderful! You're making excellent progress!",
  "Terrific! You're doing better than expected!",
  "Incredible! Your focus is really showing!",
  "Remarkable! You're making steady progress!"
];

// Helper function to get readable packet names
const getPacketName = (packetId) => {
  const nameMap = {
    'ei_self_awareness': 'Self Image',
    'ei_managing_emotions': 'Emotional Regulation',
    'ei_motivating_oneself': 'Self Drive',
    'ei_empathy_new': 'Understanding Others',
    'ei_social_skills': 'Interpersonal Effectiveness'
  };
  return nameMap[packetId] || packetId;
};

const QuizAttempt = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [quizAssignment, setQuizAssignment] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedOption, setSelectedOption] = useState('');
  const [questionAnimationKey, setQuestionAnimationKey] = useState(0);
  const [showQuizDescription, setShowQuizDescription] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [attemptId, setAttemptId] = useState(null);

  // Parent/Guardian Information & Consent — required before a 13-17 year old
  // can start the assessment. Age is derived from the account's date of
  // birth (never a manual minor/adult toggle), so this triggers the same way
  // regardless of which quiz route brought the user here.
  const [guardianConsent, setGuardianConsent] = useState(emptyGuardianConsent());
  const [showGuardianValidation, setShowGuardianValidation] = useState(false);
  const guardianConsentRef = useRef(null);

  // ── Language / translation state ───────────────────────────
  // `language` is the selected target code ('en' = original backend content).
  // It comes from the app-wide LanguageContext rather than local state, so the
  // quiz opens in the language the user chose at sign-up, and changing it from
  // the picker below updates that same preference — which is what ReportViewer
  // reads. That shared source of truth is what keeps a quiz taken in Hindi from
  // producing an English report.
  // `translations` caches per-language translated copies so re-selecting a
  // language is instant and never re-hits the API. `translating` drives the
  // in-header loading indicator while a translation request is in flight.
  const { language, setLanguage } = useLanguage();
  const [translating, setTranslating] = useState(false);
  const [translations, setTranslations] = useState({});
  // Toggles the language picker shown from the "Choose your own Language"
  // button on the start screen.
  const [showLangPicker, setShowLangPicker] = useState(false);
  // Mirror of attemptId for synchronous access in saveProgress. Using state alone
  // risks a race: if the user answers before the create request resolves, the
  // state may still be null and the answer would silently fail to save.
  const attemptIdRef = useRef(null);
  const setAttempt = (id) => { attemptIdRef.current = id; setAttemptId(id); };

  // Latest answers, kept in a ref so async saves always persist the current set
  // even across rapid changes / navigation.
  const answersRef = useRef({});

  // Timestamp captured when the user actually starts the quiz
  const startedAtRef = useRef(null);

  // Pending auto-advance timers, so manual navigation can cancel them
  const advanceTimers = useRef([]);
  const clearAdvance = () => {
    advanceTimers.current.forEach(clearTimeout);
    advanceTimers.current = [];
  };
  // Cancel any pending timers on unmount
  useEffect(() => () => clearAdvance(), []);

  useEffect(() => {
    // Get current user from localStorage
    const getCurrentUser = () => {
      try {
        const userData = localStorage.getItem('currentUser');
        if (userData) {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          return parsedUser;
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
      return null;
    };

    const loadQuiz = async () => {
      try {
        setLoading(true);
        setError('');

        const currentUser = getCurrentUser();
        if (!currentUser) {
          setAccessDenied(true);
          setError('Please log in to access this quiz.');
          return;
        }

        // Load quiz data
        const [quizRes, questionsRes, profilesRes, assignmentsRes, attemptsRes] = await Promise.all([
          fetch(`/api/quizzes/${quizId}`),
          fetch(`/api/questions?quiz_id=${quizId}`),
          fetch('/api/profiles'),
          fetch('/api/quiz-assignments'),
          fetch(`/api/users/${currentUser.id}/quiz-attempts`)
        ]);

        if (!quizRes.ok || !questionsRes.ok) {
          throw new Error('Failed to load quiz data');
        }

        const quizData = await quizRes.json();
        enrichQuizWithInstructions(quizData);
        const questionsData = await questionsRes.json();
        const profilesData = profilesRes.ok ? await profilesRes.json() : [];
        const assignmentsData = assignmentsRes.ok ? await assignmentsRes.json() : [];
        const attemptsData = attemptsRes.ok ? await attemptsRes.json() : [];

        // Find user's profile and assignment - try multiple matching strategies
        const foundProfile = profilesData.find(p => 
          p.user_id === currentUser.id || 
          p.user_id === String(currentUser.id) ||
          p.user_id === Number(currentUser.id) ||
          p.email === currentUser.email
        );
        
        const assignment = assignmentsData.find(a => 
          a.quiz_id === quizId && (
            a.profile_id === foundProfile?.id ||
            a.user_id === currentUser.id ||
            a.user_id === String(currentUser.id) ||
            a.user_id === Number(currentUser.id)
          )
        );

        // Debug logging
        console.log('Current user:', currentUser);
        console.log('User profiles:', profilesData);
        console.log('Profile details:', profilesData.map(p => ({ id: p.id, user_id: p.user_id, name: p.name, email: p.email })));
        console.log('Quiz assignments:', assignmentsData);
        console.log('Assignment details:', assignmentsData.map(a => ({ id: a.id, quiz_id: a.quiz_id, profile_id: a.profile_id, user_id: a.user_id })));
        console.log('Looking for user_id:', currentUser.id, 'type:', typeof currentUser.id);
        console.log('Found user profile:', foundProfile);
        console.log('Found assignment:', assignment);

        // More flexible access control - allow access if user exists and quiz exists
        if (!currentUser) {
          setAccessDenied(true);
          setError('Please log in to access this quiz.');
          return;
        }

        // If no profile exists, create a default one or allow access anyway
        if (!foundProfile) {
          console.log('No user profile found, allowing access with default profile');
          const defaultProfile = {
            id: `profile_${currentUser.id}`,
            user_id: currentUser.id,
            name: currentUser.user_name || currentUser.email || 'User',
            email: currentUser.email
          };
          setUserProfile(defaultProfile);
        } else {
          setUserProfile(foundProfile);
        }

        // If no assignment exists, create a default one or allow access anyway
        if (!assignment) {
          console.log('No quiz assignment found, allowing access with default assignment');
          const defaultAssignment = {
            id: `assignment_${currentUser.id}_${quizId}`,
            quiz_id: quizId,
            profile_id: foundProfile?.id || `profile_${currentUser.id}`,
            user_id: currentUser.id,
            assigned_at: new Date().toISOString()
          };
          setQuizAssignment(defaultAssignment);
        } else {
          setQuizAssignment(assignment);
        }

        console.log('Quiz data:', quizData);
        console.log('Questions data:', questionsData);
        
        // Validate quiz and questions data
        if (!quizData || !quizData.id) {
          throw new Error('Invalid quiz data received');
        }
        
        if (!questionsData || !Array.isArray(questionsData) || questionsData.length === 0) {
          throw new Error('No questions found for this quiz');
        }
        
        setQuiz(quizData);
        setQuestions(questionsData);

        // Normalize a stored answers payload into a plain object. Depending on the
        // backend, `answers` may arrive as an object or as a JSON string; either
        // way we want an object keyed by question id so saved answers show up as
        // selected when the user navigates back.
        const parseAnswers = (raw) => {
          if (!raw) return {};
          if (typeof raw === 'string') {
            try { return JSON.parse(raw) || {}; } catch { return {}; }
          }
          return raw;
        };
        const answerCount = (a) => Object.keys(parseAnswers(a.answers)).length;

        // Check for active incomplete attempt(s). There can be more than one
        // (e.g. from earlier abandoned runs), so pick the MOST-progressed one —
        // the one with the most saved answers, then the furthest question index.
        // Using the first match could otherwise resume a stale, empty attempt and
        // make earlier answers appear missing.
        const incompleteAttempt = attemptsData
          .filter(a =>
            String(a.quiz_id) === String(quizId) &&
            (!a.completed_at && a.status !== 'completed')
          )
          .sort((a, b) => {
            const ans = answerCount(b) - answerCount(a)
            if (ans !== 0) return ans
            return (b.current_question_index || 0) - (a.current_question_index || 0)
          })[0];

        if (incompleteAttempt) {
          const resumedAnswers = parseAnswers(incompleteAttempt.answers);
          console.log('Resuming incomplete attempt:', incompleteAttempt, 'answers:', resumedAnswers);
          setAttempt(incompleteAttempt.id);
          setAnswers(resumedAnswers);
          answersRef.current = resumedAnswers;
          // Resume from the next unanswered question. Compute it from the saved
          // answers so it's correct even if the stored index lags; fall back to
          // the saved index, then the start.
          const firstUnanswered = questionsData.findIndex(q => !(q.id in resumedAnswers));
          const resumeIndex = firstUnanswered !== -1
            ? firstUnanswered
            : (incompleteAttempt.current_question_index || 0);
          setCurrentQuestionIndex(resumeIndex);
          startedAtRef.current = incompleteAttempt.started_at;
          setShowQuizDescription(false);
        } else {
          // Fallback start time: ensures started_at is recorded even if the
          // description screen is skipped. The Start button refines this.
          if (!startedAtRef.current) {
            startedAtRef.current = new Date().toISOString();
          }
        }

        console.log('Quiz and questions set successfully');
      } catch (err) {
        console.error('Error loading quiz:', err);
        setError(err.message || 'Failed to load quiz');
      } finally {
        setLoading(false);
      }
    };

    loadQuiz();
  }, [quizId, accessDenied]);

  // Once the account is known, derive minor status from its age and preload
  // any parent/guardian consent already captured for this email (e.g. at
  // signup), so a minor who already has consent on file isn't asked again.
  const existingGuardianConsent = user?.email ? getGuardianConsent(user.email) : null;
  const rawUserAge = user?.age ?? existingGuardianConsent?.age ?? null;
  const userAge = rawUserAge !== null && rawUserAge !== undefined ? Number(rawUserAge) : null;
  const isMinorUser = getAgeCategory(userAge) === 'minor';
  const guardianConsentOnFile = isMinorUser && isConsentComplete(existingGuardianConsent);

  useEffect(() => {
    if (!user) return;
    const existing = user.email ? getGuardianConsent(user.email) : null;
    if (existing) {
      setGuardianConsent({ ...emptyGuardianConsent(), ...existing });
    }
  }, [user]);

  const saveProgress = async (updatedAnswers, index) => {
    const id = attemptIdRef.current;
    if (!id) return;
    answersRef.current = updatedAnswers;
    try {
      await fetch(`/api/quiz-attempts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answers: updatedAnswers,
          current_question_index: index,
          status: 'in_progress'
        })
      });
    } catch (err) {
      console.error('Error auto-saving progress:', err);
    }
  };

  const handleChange = (qid, value) => {
    setSelectedOption(value);
    // Whether this question already had an answer. When it did, the user is
    // reviewing/editing a previous answer (e.g. after using Previous to go back),
    // so we must NOT auto-advance — otherwise changing an earlier answer would
    // immediately yank them forward and make editing impossible.
    const isEditingExisting = Object.prototype.hasOwnProperty.call(answers, qid);
    const updatedAnswers = { ...answers, [qid]: value };
    setAnswers(updatedAnswers);
    answersRef.current = updatedAnswers;

    // Save progress to database
    saveProgress(updatedAnswers, currentQuestionIndex);

    // Only auto-advance when answering a question for the first time and not on
    // the last question. Editing an existing answer keeps the user in place.
    if (!isEditingExisting && currentQuestionIndex < questions.length - 1) {
      clearAdvance();
      const t1 = setTimeout(() => {
        setIsTransitioning(true);

        const t2 = setTimeout(() => {
          const nextIndex = currentQuestionIndex + 1;
          setCurrentQuestionIndex(nextIndex);
          setQuestionAnimationKey(prev => prev + 1);
          setIsTransitioning(false);
          setSelectedOption('');

          // Also save progress with the new index
          saveProgress(updatedAnswers, nextIndex);

          // Show motivational notification after every 10 questions
          showMotivationalNotification(nextIndex);
        }, 400);
        advanceTimers.current.push(t2);
      }, 500);
      advanceTimers.current.push(t1);
    } else {
      setSelectedOption('');
    }
  };

  // Navigate between questions so users can go back to review/change earlier
  // answers and move forward again. The index changes immediately (the question
  // card re-mounts via questionAnimationKey to play a fade-in), so rapid clicks
  // are never swallowed — earlier this waited behind a 300ms transition that
  // disabled the buttons, making Previous feel like it "wasn't working".
  // Cancels any pending auto-advance so manual navigation always wins.
  const goToQuestion = (index) => {
    if (index < 0 || index > questions.length - 1) return;
    clearAdvance();
    setIsTransitioning(false);
    setCurrentQuestionIndex(index);
    setQuestionAnimationKey(prev => prev + 1);
    setSelectedOption('');

    // Save progress to database with the new index
    saveProgress(answers, index);

    showMotivationalNotification(index);
  };

  const handlePrevious = () => goToQuestion(currentQuestionIndex - 1);
  const handleNext = () => goToQuestion(currentQuestionIndex + 1);

  const handleSubmit = async () => {
    try {
      console.log('Starting quiz submission...');
      console.log('Quiz Data:', quiz);
      console.log('Questions Data:', questions);
      console.log('User Answers:', answers);
      
      // Calculate marks based on selected options' pre-assigned marks
      let totalMarks = 0;
      const packetMarks = {};
      
      // Process questions by packets
      questions.forEach((question, index) => {
        console.log(`\nProcessing Question ${index + 1}:`, question);
        
        const answer = answers[question.id];
        console.log('Answer for this question:', answer);
        
        // Get packet information
        const packetId = question.packet_id;
        const packetName = question.packet_name;
        console.log('Packet ID:', packetId, 'Packet Name:', packetName);
        
        if (answer && packetId) {
          // Initialize packet if not exists
          if (!packetMarks[packetId]) {
            packetMarks[packetId] = {
              marks: 0,
              questions: 0,
              name: packetName
            };
          }
          
          // Find the selected option and get its pre-assigned marks
          console.log('Question Options:', question.options);
          let marksAwarded = 0;
          
          if (question.options && Array.isArray(question.options)) {
            if (typeof question.options[0] === 'object' && question.options[0].hasOwnProperty('marks')) {
              let selectedOpt = null;
              selectedOpt = question.options.find(opt => opt.text === answer);
              if (!selectedOpt) {
                selectedOpt = question.options.find(opt => 
                  opt.text && answer && opt.text.toLowerCase() === answer.toLowerCase()
                );
              }
              if (selectedOpt) {
                marksAwarded = selectedOpt.marks || 0;
              }
            } else {
              marksAwarded = question.marks || 1;
            }
          } else {
            marksAwarded = question.marks || 1;
          }
          
          console.log('Marks awarded for this answer:', marksAwarded);
          packetMarks[packetId].marks += marksAwarded;
          totalMarks += marksAwarded;
          packetMarks[packetId].questions += 1;
        }
      });
      
      console.log('\nFinal Results:');
      console.log('Total Marks:', totalMarks);
      console.log('Packet Marks:', packetMarks);

      const totalQuestions = questions.length;
      
      // Calculate maximum possible marks dynamically based on question format
      let maxPossibleMarks = 0;
      questions.forEach(question => {
        if (question.options && Array.isArray(question.options)) {
          if (typeof question.options[0] === 'object' && question.options[0].hasOwnProperty('marks')) {
            const optionMarks = question.options.map(opt => opt.marks || 0);
            maxPossibleMarks += Math.max(...optionMarks, 0);
          } else {
            maxPossibleMarks += question.marks || 1;
          }
        } else {
          maxPossibleMarks += question.marks || 1;
        }
      });
      
      const score = maxPossibleMarks > 0 ? Math.round((totalMarks / maxPossibleMarks) * 100) : 0;

      // Create attempt data
      const currentTime = new Date().toISOString();
      console.log('Preparing attempt data...');
      
      // Map packet IDs to their names and format the data structure
      const formattedPacketMarks = {};
      
      // Get unique packet names and their questions
      const packetGroups = questions.reduce((acc, q) => {
        const packetId = q.packet_id;
        if (!acc[packetId]) {
          acc[packetId] = {
            name: q.packet_name || getPacketName(packetId),
            questions: [],
            marks: 0
          };
        }
        acc[packetId].questions.push(q);
        return acc;
      }, {});

      // Calculate marks for each packet
      Object.entries(packetMarks).forEach(([packetId, data]) => {
        const packet = packetGroups[packetId];
        if (packet) {
          let packetMaxMarks = 0;
          if (packet.questions) {
            packet.questions.forEach(q => {
              if (q.options && Array.isArray(q.options)) {
                if (typeof q.options[0] === 'object' && q.options[0].hasOwnProperty('marks')) {
                  const optionMarks = q.options.map(opt => opt.marks || 0);
                  packetMaxMarks += Math.max(...optionMarks, 0);
                } else {
                  packetMaxMarks += q.marks || 1;
                }
              } else {
                packetMaxMarks += q.marks || 1;
              }
            });
          }
          
          formattedPacketMarks[packet.name] = {
            marks: data.marks,
            questions: data.questions,
            total: packetMaxMarks
          };
        }
      });

      console.log('Formatted Packet Marks:', formattedPacketMarks);
      
      const attemptData = {
        quiz_id: quizId,
        profile_id: quizAssignment?.profile_id || userProfile?.id || `profile_${user?.id}`,
        user_id: user?.id,
        // Persist the taker's identity on the attempt so reports/dashboards show
        // the correct name and email even if the user lookup later fails.
        user_name: user?.user_name || user?.email || null,
        user_email: user?.email || null,
        score: score,
        total_questions: totalQuestions,
        correct_answers: totalMarks,
        total_marks: totalMarks,
        packet_marks: formattedPacketMarks,
        answers: answers,
        status: 'completed',
        started_at: startedAtRef.current || currentTime,
        completed_at: currentTime,
        time_taken: startedAtRef.current
          ? Math.max(0, Math.round((new Date(currentTime) - new Date(startedAtRef.current)) / 1000))
          : null,
        updated_at: currentTime
      };

      // Log the final structure
      console.log('Attempt Data Structure:', {
        totalMarks,
        totalQuestions,
        score,
        packetMarks: formattedPacketMarks
      });
      
      console.log('Final Attempt Data:', attemptData);

      let attemptResponse;
      const submitId = attemptIdRef.current || attemptId;
      if (submitId) {
        // Update existing attempt to completed
        attemptResponse = await fetch(`/api/quiz-attempts/${submitId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(attemptData)
        });
      } else {
        // Fallback POST if attemptId is missing
        attemptResponse = await fetch('/api/quiz-attempts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...attemptData,
            id: Date.now().toString(),
            created_at: currentTime
          })
        });
      }

      if (!attemptResponse.ok) {
        throw new Error('Failed to save quiz attempt');
      }

      const response = await attemptResponse.json();
      
      // Show success message and redirect to report
      alert('Quiz submitted successfully! Redirecting to your report...');
      
      // Redirect to report after a short delay
      setTimeout(() => {
        navigate(`/report/${quizId}/${response.id}`);
      }, 1500);
      
    } catch (err) {
      console.error('Error submitting quiz:', err);
      alert('Failed to submit quiz. Please try again.');
    }
  };

  // Active translation bundle for the selected language (null while English).
  const tr = language !== DEFAULT_LANGUAGE ? translations[language] : null;

  // Translate a static UI string: use the translated copy when available,
  // otherwise fall back to the original English text.
  const t = (key) => tr?.ui?.[key] ?? UI_STRINGS[key];

  // Translate any Parent/Guardian Information & Consent string (looked up by
  // its original English text rather than a key, matching how
  // ParentGuardianConsent calls tx()).
  const gcTx = (s) => tr?.guardianConsent?.[s] ?? s;

  // Handle language selection. Updating the app-wide preference is all this
  // needs to do — the effect below notices the new language and fetches the
  // translation, which is the same path used when the quiz first loads in a
  // preferred language that isn't English.
  const handleLanguageChange = (lang) => setLanguage(lang);

  // Translate the quiz into `lang`. English restores the original backend
  // content (we never translate translated text back). For any other language
  // we translate everything once, cache it, and re-render immediately — no page
  // refresh. Answers are unaffected because option *values* stay in English
  // (only the displayed *text* is translated); see renderOptions below.
  const translateQuiz = async (lang) => {
    try {
      setTranslating(true);

      // Build one ordered list of every string to translate, remembering where
      // each result belongs so we can reassemble the structured bundle.
      const texts = [];
      const push = (s) => { const i = texts.length; texts.push(s ?? ''); return i; };

      const uiKeys = Object.keys(UI_STRINGS);
      const uiIdx = uiKeys.map((k) => push(UI_STRINGS[k]));
      const motivIdx = MOTIVATIONAL_MESSAGES.map((m) => push(m));
      const gcIdx = GUARDIAN_CONSENT_STRINGS.map((s) => push(s));
      const quizNameIdx = push(quiz?.name);
      const quizInstrIdx = push(quiz?.start_instructions);

      const questionPlan = questions.map((q) => {
        const qtIdx = push(q.question_text);
        let optIdx = [];
        if (q.question_type === 'true_false' && !q.options) {
          optIdx = [push('True'), push('False')];
        } else if (Array.isArray(q.options)) {
          optIdx = q.options.map((opt) => push(typeof opt === 'object' ? opt.text : opt));
        }
        return { id: q.id, qtIdx, optIdx };
      });

      const out = await translateBatch(texts, lang);

      const ui = {};
      uiKeys.forEach((k, i) => { ui[k] = out[uiIdx[i]]; });

      const guardianConsentMap = {};
      GUARDIAN_CONSENT_STRINGS.forEach((s, i) => { guardianConsentMap[s] = out[gcIdx[i]]; });

      const questionMap = {};
      questionPlan.forEach((p) => {
        questionMap[p.id] = {
          question_text: out[p.qtIdx],
          options: p.optIdx.map((i) => out[i]),
        };
      });

      setTranslations((prev) => ({
        ...prev,
        [lang]: {
          ui,
          guardianConsent: guardianConsentMap,
          motivational: motivIdx.map((i) => out[i]),
          quiz: {
            name: out[quizNameIdx],
            start_instructions: out[quizInstrIdx],
          },
          questions: questionMap,
        },
      }));
    } catch (err) {
      console.error('Translation failed:', err);
      alert('Could not translate the quiz. Please check the Google Translate API key in your .env file, then try again.');
      // Deliberately does NOT reset the language here. `language` is now the
      // user's saved app-wide preference, and wiping it because one API call
      // failed would silently change a setting they chose at sign-up. With no
      // cached bundle the render already falls back to the English source, so
      // the quiz stays usable and a retry is one picker click away.
    } finally {
      setTranslating(false);
    }
  };

  // Fetch the translation whenever the active language has no cached bundle
  // yet. This covers both the picker and — the case that was broken before —
  // the quiz first loading in a preferred language that isn't English, where
  // nothing ever called into the translation path.
  useEffect(() => {
    if (language === DEFAULT_LANGUAGE) return;
    if (translations[language]) return;
    if (!quiz || questions.length === 0) return;
    translateQuiz(language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, quiz, questions, translations]);

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="quiz-attempt__loading">
        <div className="quiz-attempt__spinner" />
        <span className="quiz-attempt__loading-text">Loading your quiz...</span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (error) {
    return (
      <div className="quiz-attempt__error">
        <div className="quiz-attempt__error-card">
          <h3>Error Loading Quiz</h3>
          <p>{error}</p>
          <button className="btn--outline" onClick={() => navigate('/')}>
            <ArrowBack style={{ width: 18, height: 18 }} />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz not found ─────────────────────────────────────────
  if (!quiz) {
    return (
      <div className="quiz-attempt__error">
        <div className="quiz-attempt__error-card">
          <h3>Quiz Not Found</h3>
          <p>The requested quiz could not be found.</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  // Calculate progress percentage
  const calculateProgress = () => {
    if (!questions || questions.length === 0) return 0;
    const answeredCount = Object.keys(answers).length;
    return Math.round((answeredCount / questions.length) * 100);
  };

  const progress = calculateProgress();
  
  // Motivational messages (uses the translated copy when a language is active)
  const getMotivationalMessage = () => {
    const messages = tr?.motivational?.length ? tr.motivational : MOTIVATIONAL_MESSAGES;
    return messages[Math.floor(Math.random() * messages.length)];
  };
  
  // Show notification after every 10 questions
  const showMotivationalNotification = (currentIdx) => {
    if ((currentIdx + 1) % 10 === 0 && 
        currentIdx < questions.length - 1 &&
        !showQuizDescription) {
      const message = getMotivationalMessage();
      setNotificationMessage(message);
      setShowNotification(true);
      setTimeout(() => {
        setShowNotification(false);
      }, 3000);
    }
  };

  // Render options for any question type
  const renderOptions = () => {
    if (!currentQuestion) return null;

    let options = [];
    const qType = currentQuestion.question_type;

    if (qType === 'true_false' && !currentQuestion.options) {
      options = [
        { text: 'True', value: 'true' },
        { text: 'False', value: 'false' }
      ];
    } else if (currentQuestion.options && Array.isArray(currentQuestion.options)) {
      options = currentQuestion.options.map(opt => {
        const text = typeof opt === 'object' ? opt.text : opt;
        const value = qType === 'true_false' ? text.toLowerCase() : text;
        return { text, value };
      });
    }

    // Overlay translated option TEXT for display, but keep each option's
    // original English `value`. This is what makes translation safe: answers
    // are stored/scored against the original values, so switching language
    // never changes what gets saved or how marks are calculated.
    const translatedOpts = tr?.questions?.[currentQuestion.id]?.options;
    if (translatedOpts) {
      options = options.map((opt, i) => ({
        text: translatedOpts[i] ?? opt.text,
        value: opt.value,
      }));
    }

    return (
      <div className="quiz-attempt__options">
        {options.map((opt, i) => {
          // Compare as strings so a previously-saved answer reliably shows as
          // selected when navigating back, regardless of stored value type.
          const saved = answers[currentQuestion.id];
          const isSelected = saved !== undefined && saved !== null && String(saved) === String(opt.value);
          return (
            <div
              key={i}
              className={`quiz-attempt__option${isSelected ? ' quiz-attempt__option--selected' : ''}`}
              onClick={() => handleChange(currentQuestion.id, opt.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleChange(currentQuestion.id, opt.value); }}
            >
              <span className="quiz-attempt__option-radio" />
              <span className="quiz-attempt__option-label">{opt.text}</span>
            </div>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="quiz-attempt">
      {/* Global CSS override for this component */}
      <style>
        {`
          #root {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100vh !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
        `}
      </style>
      
      {/* Motivational Notification Toast */}
      <div className={`quiz-attempt__toast${showNotification ? ' quiz-attempt__toast--visible' : ''}`}>
        {notificationMessage}
      </div>
      
      {/* Header */}
      <div className="quiz-attempt__header">
        <button className="quiz-attempt__back-btn" onClick={() => navigate('/')} title="Back to Dashboard">
          <ArrowBack style={{ width: 20, height: 20 }} />
        </button>

        <div className="quiz-attempt__header-info">
          <span className="quiz-attempt__quiz-name">{tr?.quiz?.name || quiz?.name || 'Quiz'}</span>
          <span className="quiz-attempt__header-divider" />
          <span className="quiz-attempt__user-badge">
            <PersonIcon style={{ fontSize: 18 }} />
            <span className="quiz-attempt__user-name">
              {userProfile?.name || user?.user_name || user?.email || 'User'}
            </span>
          </span>
        </div>

        {/* Language selector — translates the whole assessment on the fly */}
        <div className="quiz-attempt__lang">
          <label htmlFor="quiz-attempt-lang" className="quiz-attempt__lang-label">
            {t('languageLabel')}
          </label>
          <select
            id="quiz-attempt-lang"
            className="quiz-attempt__lang-select"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={translating}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          {translating && <span className="quiz-attempt__lang-spinner" aria-label="Translating" />}
        </div>
      </div>
      
      {/* Progress Bar */}
      {/* Progress Bar hidden per requirements */}

      {/* Main Content */}
      <div className="quiz-attempt__body">
        {showQuizDescription ? (
          /* ── Description Card ── */
          <div className="quiz-attempt__desc-wrap">
            <div className="quiz-attempt__desc-card">
              <div className="quiz-attempt__desc-inner">
                <img 
                  src="https://happimynd.com/assets/Frontend/images/happimynd_logo.png"
                  alt="HappiMynd Logo"
                  className="quiz-attempt__desc-logo"
                />
                <h2 className="quiz-attempt__desc-title">
                  {t('descTitle')}
                </h2>
                {quiz?.start_instructions ? (
                  <div className="quiz-attempt__desc-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {tr?.quiz?.start_instructions || quiz.start_instructions}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <>
                    <div className="quiz-attempt__desc-body">
                      <p>{t('descP1')}</p>
                      <p>{t('descP2')}</p>
                      <p>{t('descP3')}</p>
                      <p>{t('descP4')}</p>
                      <p className="underline">{t('descP5')}</p>
                      <p>{t('descP6')}</p>
                    </div>

                    <h3 className="quiz-attempt__instructions-title">{t('instructionsTitle')}</h3>

                    <ul className="quiz-attempt__instructions-list">
                      <li>{t('instr1')}</li>
                      <li>{t('instr2')}</li>
                      <li>{t('instr3')}</li>
                      <li>{t('instr4')}</li>
                      <li>{t('instr5')}</li>
                      <li>{t('instr6')}</li>
                    </ul>
                  </>
                )}

                {isMinorUser && !guardianConsentOnFile && (
                  <div ref={guardianConsentRef}>
                    <ParentGuardianConsent
                      value={guardianConsent}
                      onChange={setGuardianConsent}
                      showValidation={showGuardianValidation}
                      tx={gcTx}
                    />
                  </div>
                )}

                {isMinorUser && !guardianConsentOnFile && showGuardianValidation && !isConsentComplete(guardianConsent) && (
                  <p className="quiz-attempt__guardian-warning" role="alert">
                    {gcTx(GUARDIAN_CONSENT_BLOCKED_MESSAGE)}
                  </p>
                )}

                <div className="quiz-attempt__start-actions">
                <button
                  className="quiz-attempt__start-btn"
                  onClick={async () => {
                    if (isMinorUser && !guardianConsentOnFile && !isConsentComplete(guardianConsent)) {
                      setShowGuardianValidation(true);
                      guardianConsentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      return;
                    }
                    if (isMinorUser && !guardianConsentOnFile) {
                      saveGuardianConsent(user.email, { ...guardianConsent, age: userAge });
                    }

                    const startTime = new Date().toISOString();
                    startedAtRef.current = startTime;

                    // Create an incomplete attempt immediately in database if one does not exist yet
                    try {
                      if (!attemptIdRef.current) {
                        const newAttemptResponse = await fetch('/api/quiz-attempts', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            quiz_id: quizId,
                            profile_id: quizAssignment?.profile_id || userProfile?.id || `profile_${user?.id}`,
                            user_id: user?.id,
                            user_name: user?.user_name || user?.email || null,
                            user_email: user?.email || null,
                            score: 0,
                            total_questions: questions.length,
                            correct_answers: 0,
                            started_at: startTime,
                            status: 'in_progress',
                            answers: {},
                            current_question_index: 0
                          })
                        });
                        
                        if (newAttemptResponse.ok) {
                          const newAttempt = await newAttemptResponse.json();
                          setAttempt(newAttempt.id);
                        }
                      }
                    } catch (e) {
                      console.error('Error creating quiz attempt:', e);
                    }
                    
                    setShowQuizDescription(false);
                  }}
                >
                  {t('startBtn')}
                </button>

                  <button
                    type="button"
                    className="quiz-attempt__choose-lang-btn"
                    onClick={() => setShowLangPicker((v) => !v)}
                    disabled={translating}
                  >
                     {t('chooseLang')}
                  </button>
                </div>

                {showLangPicker && (
                  <div className="quiz-attempt__lang-grid">
                    {LANGUAGES.map((l) => {
                      const isActive = language === l.code;
                      const isBusy = translating && isActive;
                      return (
                        <button
                          key={l.code}
                          type="button"
                          className={`quiz-attempt__lang-card${isActive ? ' quiz-attempt__lang-card--active' : ''}`}
                          onClick={() => handleLanguageChange(l.code)}
                          disabled={translating}
                        >
                          <span className="quiz-attempt__lang-card-label">{l.label}</span>
                          {isBusy && <span className="quiz-attempt__lang-spinner" aria-label="Translating" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Question Card ── */
          <div
            key={questionAnimationKey}
            className={`quiz-attempt__question-wrap${isTransitioning ? ' quiz-attempt__question-wrap--transitioning' : ''}`}
          >
            <div className="quiz-attempt__question-card">
              <div className="quiz-attempt__question-inner">
                {currentQuestion && (
                  <>
                    <h2 className="quiz-attempt__question-text">
                      {tr?.questions?.[currentQuestion.id]?.question_text || currentQuestion.question_text}
                    </h2>
                    {renderOptions()}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Bottom bar: sits in normal flow below the body so it can never
          overlap the content or the badge, whatever height it grows to */}
      {!showQuizDescription && (
        <div className="quiz-attempt__footer">
          {/* Powered by HappiMynd */}
          <div className="quiz-attempt__powered">
            <img
              src="https://happimynd.com/assets/Frontend/images/happimynd_logo.png"
              alt="HappiMynd Logo"
            />
            <span>{t('poweredBy')}</span>
          </div>

          {/* Question navigation: go back to change answers, move forward, or submit */}
          <div className="quiz-attempt__nav">
            <button
              className="quiz-attempt__nav-btn"
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
            >
              <ArrowBack style={{ width: 18, height: 18 }} />
              {t('previous')}
            </button>

            {/* Question counter metrics hidden per requirements */}

            {isLastQuestion ? (
              <button
                className="quiz-attempt__submit-btn"
                onClick={handleSubmit}
                disabled={Object.keys(answers).length < questions.length}
              >
                {t('submit')}
                <CheckCircle style={{ width: 20, height: 20 }} />
              </button>
            ) : (
              <button
                className="quiz-attempt__nav-btn quiz-attempt__nav-btn--next"
                onClick={handleNext}
              >
                {t('next')}
                <ArrowForward style={{ width: 18, height: 18 }} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizAttempt;