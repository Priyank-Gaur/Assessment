import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Data file path
const DATA_FILE = path.join(process.cwd(), 'mock-data.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

console.log('🚀 Starting auth test server...');

// Data persistence functions
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      data.quizzes = (data.quizzes || []).map(q => ({
        ...q,
        start_instructions: q.start_instructions !== undefined ? q.start_instructions : ''
      }));
      return {
        users: data.users || [],
        profiles: data.profiles || [],
        organizations: data.organizations || [],
        employees: data.employees || [],
        packets: data.packets || [],
        questions: data.questions || [],
        quizzes: data.quizzes,
        quizAssignments: data.quizAssignments || [],
        quizAttempts: data.quizAttempts || [],
        auditLog: data.auditLog || []
      };
    }
  } catch (error) {
    console.log('⚠️ Error loading data, using defaults:', error.message);
  }
  
  // Default data
  return {
    users: [
      { id: '1', email: 'admin@assessment.local', password: 'admin123', role: 'admin' },
      { id: '2', email: 'user@assessment.local', password: 'user123', role: 'user' }
    ],
    profiles: [
      {
        id: '1755719138905',
        name: 'Senior Citizen',
        email: 'new@example.com',
        role: 'general',
        created_at: new Date().toISOString()
      },
      {
        id: '1755719178991',
        name: 'CU Student',
        email: 'new@example.com',
        role: 'student',
        created_at: new Date().toISOString()
      },
      {
        id: '1755719209738',
        name: 'HCL',
        email: 'new@example.com',
        role: 'employee',
        created_at: new Date().toISOString()
      }
    ],
    organizations: [],
    packets: [
      { 
        id: '1755719317656', 
        name: 'Logical Reasoning', 
        description: 'Logical reasoning and analytical thinking questions',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '1755719366320', 
        name: 'General Question', 
        description: 'General knowledge and basic concepts',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '1755719404031', 
        name: 'Work Life Balance', 
        description: 'Questions about maintaining work-life balance',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    questions: [
      { 
        id: '1', 
        packet_id: '1755719317656',
        question: 'If all roses are flowers and some flowers fade quickly, which statement is true?', 
        question_text: 'If all roses are flowers and some flowers fade quickly, which statement is true?',
        type: 'multiple_choice',
        question_type: 'mcq',
        options: [
          { text: 'All flowers are roses', marks: 1, isCorrect: false },
          { text: 'Some roses fade quickly', marks: 3, isCorrect: true },
          { text: 'All flowers fade quickly', marks: 2, isCorrect: false },
          { text: 'None of the above', marks: 1, isCorrect: false }
        ],
        correct_answer: 'Some roses fade quickly',
        marks: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '2', 
        packet_id: '1755719317656',
        question: 'Find the missing number: 2, 6, 12, 20, ?', 
        question_text: 'Find the missing number: 2, 6, 12, 20, ?',
        type: 'multiple_choice',
        question_type: 'mcq',
        options: [ '28', '20', '30', '32' ],
        correct_answer: '28',
        marks: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '3', 
        packet_id: '1755719317656',
        question: 'In a certain code, CAT = 24 and DOG = 26. What is BAT?', 
        question_text: 'In a certain code, CAT = 24 and DOG = 26. What is BAT?',
        type: 'multiple_choice',
        question_type: 'mcq',
        options: [ '22', '23', '24', '25' ],
        correct_answer: '23',
        marks: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '4', 
        packet_id: '1755719317656',
        question: 'If A is B\'s father, B is C\'s brother, and C is D\'s mother, what is A\'s relation to D?', 
        question_text: 'If A is B\'s father, B is C\'s brother, and C is D\'s mother, what is A\'s relation to D?',
        type: 'multiple_choice',
        question_type: 'mcq',
        options: [ 'Grandfather', 'Father', 'Uncle', 'Cannot be determined' ],
        correct_answer: 'Grandfather',
        marks: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '5', 
        packet_id: '1755719317656',
        question: 'In syllogisms, if all A are B and all B are C, then all A are C.', 
        question_text: 'In syllogisms, if all A are B and all B are C, then all A are C.',
        type: 'true_false',
        question_type: 'true_false',
        options: [
          { text: 'True', marks: 3, isCorrect: true },
          { text: 'False', marks: 2, isCorrect: false }
        ],
        correct_answer: 'true',
        marks: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '6', 
        packet_id: '1755719317656',
        question: 'If the average of three numbers is 20, their total is 60.', 
        question_text: 'If the average of three numbers is 20, their total is 60.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'true',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '7', 
        packet_id: '1755719317656',
        question: 'An even number multiplied by an odd number is always odd.', 
        question_text: 'An even number multiplied by an odd number is always odd.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'false',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '8', 
        packet_id: '1755719366320',
        question: 'Who is known as the "Father of Computers"?', 
        question_text: 'Who is known as the "Father of Computers"?',
        type: 'multiple_choice',
        question_type: 'mcq',
        options: [ 'Charles Babbage', 'Alan Turing', 'Bill Gates', 'Steve Jobs' ],
        correct_answer: 'Charles Babbage',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '9', 
        packet_id: '1755719366320',
        question: 'Which planet is known as the Red Planet?', 
        question_text: 'Which planet is known as the Red Planet?',
        type: 'multiple_choice',
        question_type: 'mcq',
        options: [ 'Venus', 'Mars', 'Jupiter', 'Saturn' ],
        correct_answer: 'Mars',
        marks: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '10', 
        packet_id: '1755719366320',
        question: 'The Sun rises in the west.', 
        question_text: 'The Sun rises in the west.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'false',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '11', 
        packet_id: '1755719366320',
        question: 'Water boils at 100°C at sea level.', 
        question_text: 'Water boils at 100°C at sea level.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'true',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '12', 
        packet_id: '1755719366320',
        question: 'Mount Everest is the highest peak on Earth.', 
        question_text: 'Mount Everest is the highest peak on Earth.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'true',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '13', 
        packet_id: '1755719404031',
        question: 'Which of the following best describes work-life balance?', 
        question_text: 'Which of the following best describes work-life balance?',
        type: 'multiple_choice',
        question_type: 'mcq',
        options: [
          'Spending equal hours on work and personal life',
          'Prioritizing work over personal life',
          'Maintaining harmony between work and personal responsibilities',
          'Avoiding work completely'
        ],
        correct_answer: 'Maintaining harmony between work and personal responsibilities',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '14', 
        packet_id: '1755719404031',
        question: 'Work-life balance is the same for everyone.', 
        question_text: 'Work-life balance is the same for everyone.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'false',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '15', 
        packet_id: '1755719404031',
        question: 'Remote work can sometimes improve work-life balance.', 
        question_text: 'Remote work can sometimes improve work-life balance.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'true',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: '16', 
        packet_id: '1755719404031',
        question: 'More working hours always mean better productivity.', 
        question_text: 'More working hours always mean better productivity.',
        type: 'true_false',
        question_type: 'true_false',
        options: null,
        correct_answer: 'false',
        marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    quizzes: [
      { 
        id: '1755720038805', 
        name: 'Happi Test', 
        description: 'Comprehensive assessment covering multiple topics',
        time_limit: null,
        total_questions: 16,
        passing_score: 70,
        packet_ids: ['1755719317656', '1755719366320', '1755719404031'],
        report_header: '',
        report_footer: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
         quizAssignments: [
       { 
         id: '1', 
         quiz_id: '1',
         profile_id: '1',
         assigned_at: new Date().toISOString(),
         due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
         status: 'assigned',
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString()
       }
     ],
                    quizAttempts: [],
                    employees: [],
                    auditLog: []
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('💾 Data saved successfully');
  } catch (error) {
    console.log('❌ Error saving data:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Role-Based Access Control (HappiMynd)
//   super_admin : Internal HappiMynd team — full system access & override rights.
//   admin       : Client admins (HR / Dept managers), scoped to their organization:
//                   * may add users + assign dashboard views, but cannot delete users
//                   * may set a password ONCE at onboarding, not reset it later
//                   * may set view permissions during setup, but not modify once locked
//   user        : End users — access only the modules assigned during onboarding.
// ---------------------------------------------------------------------------
const ROLES = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', USER: 'user' };

// Dashboard "views" an admin can grant to a member during setup.
const DASHBOARD_VIEWS = [
  'admin_dashboard', 'organizations', 'profiles', 'packets', 'quiz_builder',
  'assigned_quizzes', 'results', 'reports', 'active_tracking', 'pdf_templates'
];

function isSuperAdmin(u) { return !!u && u.role === ROLES.SUPER_ADMIN; }
function isAdmin(u) { return !!u && (u.role === ROLES.ADMIN || u.role === ROLES.SUPER_ADMIN); }

// Identify the user making the request via the x-user-id header set by the client.
function getActor(req) {
  const id = req.header('x-user-id');
  if (!id) return null;
  return mockData.users.find(u => String(u.id) === String(id)) || null;
}

// Resolve the display name, email and organization for a quiz attempt. Prefers
// the identity snapshot stored on the attempt itself, then falls back to the
// users/employees records (matched type-safely, since ids may be number/string).
function resolveAttemptUser(attempt) {
  const user = mockData.users.find(u => String(u.id) === String(attempt.user_id)) || null;
  const email = attempt.user_email || user?.email || null;
  const employee = email
    ? mockData.employees.find(e => String(e.email).toLowerCase() === String(email).toLowerCase())
    : null;
  const org = user?.organization_id
    ? mockData.organizations.find(o => String(o.id) === String(user.organization_id))
    : null;
  const name =
    attempt.user_name ||
    employee?.name ||
    user?.user_name ||
    (email ? String(email).split('@')[0] : null) ||
    `User ${attempt.user_id || 'Unknown'}`;
  return {
    user_name: name,
    name,
    email,
    organization: org?.name || 'Individual'
  };
}

// Organization scope check. Super Admin bypasses entirely. An admin with no
// organization is treated as an unscoped/global admin (legacy default), while
// an admin assigned to an organization is confined to that organization.
function sameOrg(actor, targetOrgId) {
  if (isSuperAdmin(actor)) return true;
  if (!actor || !actor.organization_id) return true; // unscoped/global admin
  return String(actor.organization_id) === String(targetOrgId || '');
}

// Append a permission-related action to the audit log.
function logAction(actor, action, target, details = {}) {
  if (!mockData.auditLog) mockData.auditLog = [];
  const entry = {
    id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
    actor_id: actor ? actor.id : null,
    actor_email: actor ? actor.email : null,
    actor_role: actor ? actor.role : null,
    action,
    target_user_id: target ? (target.id || target) : null,
    target_email: target && target.email ? target.email : null,
    details,
    created_at: new Date().toISOString()
  };
  mockData.auditLog.push(entry);
  saveData(mockData);
  console.log(`📝 audit: ${entry.actor_email || 'anon'} → ${action} (${entry.target_email || entry.target_user_id || '-'})`);
  return entry;
}

// Middleware: require an authenticated Super Admin.
function requireSuperAdmin(req, res, next) {
  const actor = getActor(req);
  if (!isSuperAdmin(actor)) {
    return res.status(403).json({ error: 'Only Super Admin (HappiMynd) can perform this action.' });
  }
  req.actor = actor;
  next();
}

// Middleware: require an authenticated Admin or Super Admin.
function requireAdmin(req, res, next) {
  const actor = getActor(req);
  if (!isAdmin(actor)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  req.actor = actor;
  next();
}

function generateOnboardingCode(organizations = []) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const exists = organizations.some(o => o.onboarding_code === code);
    if (!exists) {
      isUnique = true;
    }
  }
  return code;
}

function generateUniqueEmployeeCode(employees = []) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const exists = employees.some(e => e.code && e.code.toUpperCase() === code);
    if (!exists) {
      isUnique = true;
    }
  }
  return code;
}

// Load initial data
let mockData = loadData();

// Migrate mockData organizations to add onboarding_code and onboarded_at
if (mockData.organizations) {
  let migrated = false;
  mockData.organizations.forEach(o => {
    if (!o.onboarding_code) {
      o.onboarding_code = generateOnboardingCode(mockData.organizations);
      migrated = true;
    }
    if (!o.onboarded_at) {
      o.onboarded_at = o.created_at || new Date().toISOString();
      migrated = true;
    }
  });
  if (migrated) {
    console.log('⚠️ Migrating mockData: Assigned onboarding codes and dates to existing organizations');
    saveData(mockData);
  }
}

// Migrate mockData employees to add code
if (mockData.employees) {
  let migrated = false;
  mockData.employees.forEach(e => {
    if (!e.code) {
      e.code = generateUniqueEmployeeCode(mockData.employees);
      migrated = true;
    }
  });
  if (migrated) {
    console.log('⚠️ Migrating mockData: Assigned unique codes to existing employees');
    saveData(mockData);
  }
}

// Migrate users to the RBAC model: seed a generic Super Admin and backfill fields.
// Credentials are configurable via env and documented in MIGRATION_SUMMARY.md.
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@happimynd.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123';
(function migrateAccessControl() {
  let changed = false;

  // Seed a single generic Super Admin if none exists.
  if (!mockData.users.some(u => u.role === ROLES.SUPER_ADMIN)) {
    mockData.users.push({
      id: 'super-admin',
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      role: ROLES.SUPER_ADMIN,
      user_name: 'Super Admin',
      organization_id: null,
      permissions: DASHBOARD_VIEWS.slice(),
      permissions_locked: true,
      password_set_by_admin: false,
      created_by: 'system',
      created_at: new Date().toISOString()
    });
    changed = true;
  }

  // Backfill RBAC fields on any pre-existing users.
  mockData.users.forEach(u => {
    if (u.permissions === undefined) {
      u.permissions = isAdmin(u) ? DASHBOARD_VIEWS.slice() : [];
      changed = true;
    }
    if (u.permissions_locked === undefined) {
      u.permissions_locked = isAdmin(u); // existing admins are considered configured
      changed = true;
    }
    if (u.password_set_by_admin === undefined) {
      u.password_set_by_admin = false;
      changed = true;
    }
    if (u.organization_id === undefined) {
      u.organization_id = null;
      changed = true;
    }
  });

  if (changed) {
    console.log(`⚠️ Migrated users to RBAC model (Super Admin: ${SUPER_ADMIN_EMAIL}, fields backfilled)`);
    saveData(mockData);
  }
})();

// Ensure all user passwords are hashed with bcrypt
(function hashPlainPasswords() {
  if (mockData.users) {
    let migrated = false;
    mockData.users.forEach(u => {
      if (u.password && typeof u.password === 'string') {
        const isHashed = u.password.startsWith('$2a$') || u.password.startsWith('$2b$') || u.password.startsWith('$2y$');
        if (!isHashed) {
          console.log(`🔐 Hashing password for user: ${u.email}`);
          u.password = bcrypt.hashSync(u.password, 10);
          migrated = true;
        }
      }
    });
    if (migrated) {
      console.log('✅ Migrating mockData: Hashed all plain text user passwords');
      saveData(mockData);
    }
  }
})();


console.log('📂 Loaded persistent data:', {
  users: mockData.users.length,
  profiles: mockData.profiles.length,
  packets: mockData.packets.length,
  questions: mockData.questions.length,
  quizzes: mockData.quizzes.length
});

// Simple test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Auth server is working!', timestamp: new Date().toISOString() });
});

// Server-side proxy for Google Cloud Translation. The API key lives only on the
// server (GOOGLE_TRANSLATE_API_KEY, NOT a VITE_ var) so it is never shipped to
// the browser or visible in the Network tab. The client posts { q, target,
// format } and we forward it to Google with the key attached here.
app.post('/api/translate', async (req, res) => {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Translation is not configured on the server.' });
  }

  const { q, target, format = 'text' } = req.body || {};
  if (!Array.isArray(q) || q.length === 0 || !target) {
    return res.status(400).json({ error: 'Request must include a non-empty `q` array and a `target` language.' });
  }

  try {
    const googleRes = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, target, format }),
      }
    );

    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      const detail = data?.error?.message || '';
      console.error(`❌ Translation upstream error (${googleRes.status}): ${detail}`);
      // Don't leak the upstream key/URL to the client; return a clean status.
      return res.status(googleRes.status === 400 ? 400 : 502).json({
        error: `Translation request failed (${googleRes.status}).`,
      });
    }

    const translations = (data?.data?.translations || []).map((t) => t.translatedText);
    res.json({ translations });
  } catch (err) {
    console.error('❌ Translation proxy error:', err.message);
    res.status(502).json({ error: 'Translation request failed.' });
  }
});

// Auth routes
app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  console.log(`🔐 Sign in attempt: ${email}`);
  
  const user = mockData.users.find(u => u.email && u.email.toLowerCase() === (email || '').trim().toLowerCase());
  
  let isValid = false;
  if (user && password && user.password) {
    const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
    if (isHashed) {
      isValid = await bcrypt.compare(password, user.password);
    } else {
      isValid = user.password === password;
    }
  }
  
  if (isValid) {
    const { password: _, ...userWithoutPassword } = user;
    console.log(`✅ Login successful for: ${email}`);
    res.json({
      user: userWithoutPassword,
      session: { id: 'mock-session-' + user.id },
      error: null
    });
  } else {
    console.log(`❌ Login failed for: ${email}`);
    res.status(401).json({
      user: null,
      session: null,
      error: 'Invalid email or password'
    });
  }
});


app.get('/api/auth/verify-code', (req, res) => {
  const { code } = req.query;
  console.log(`🔑 Verify employee user code: ${code}`);
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }
  if (!mockData.employees) {
    mockData.employees = [];
  }
  const emp = mockData.employees.find(e => e.code && e.code.toUpperCase() === code.trim().toUpperCase());
  if (!emp) {
    return res.status(404).json({ error: 'Invalid user code' });
  }
  if (!mockData.organizations) {
    mockData.organizations = [];
  }
  const org = mockData.organizations.find(o => o.id === emp.organization_id);
  if (!org) {
    return res.status(404).json({ error: 'Associated organization not found' });
  }
  if (org.status !== 'active') {
    return res.status(400).json({ error: 'Your organization is currently inactive' });
  }
  res.json({ id: org.id, name: org.name, email: emp.email, userName: emp.name });
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, role = 'user', userName, user_name, profile, userCode } = req.body;
  const targetUserName = userName || user_name;
  const code = (userCode || '').trim();
  console.log(`📝 Sign up attempt: ${email}${code ? ` with company code ${code}` : ' (individual)'}`);

  if (!email || !email.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required for signup' });
  }

  // Check if user already exists
  const existingUser = mockData.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existingUser) {
    return res.status(400).json({
      user: null,
      session: null,
      error: 'User already exists'
    });
  }

  // Resolve the selected profile. Individuals (and any new profile coming from
  // the signup form) are accepted rather than rejected — the profile record is
  // created on the fly if it doesn't exist yet, so signup never fails over it.
  const profileName = (profile && profile.trim()) ? profile.trim() : 'Individual';
  if (!mockData.profiles) {
    mockData.profiles = [];
  }
  let existingProfile = mockData.profiles.find(
    p => p.name.toLowerCase() === profileName.toLowerCase()
  );
  if (!existingProfile) {
    existingProfile = {
      id: String(Date.now()),
      name: profileName,
      email: 'new@example.com',
      role: 'student',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockData.profiles.push(existingProfile);
  }

  // The company code is optional. When provided it must resolve to a valid,
  // active organization and match the pre-registered employee email. When
  // omitted, the user signs up as an individual (no organization).
  let organizationId = null;
  let organizationName = 'Individual';

  if (code) {
    if (!mockData.employees) mockData.employees = [];
    if (!mockData.generated_codes) mockData.generated_codes = [];

    // 1. First check pre-existing single-employee code
    let emp = mockData.employees.find(e => e.code && e.code.toUpperCase() === code.toUpperCase());
    if (emp) {
      if (emp.email.toLowerCase() !== email.trim().toLowerCase()) {
        let metadata = emp.metadata || {};
        if (typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
        }
        metadata.personal_email = email.trim();
        emp.metadata = metadata;
      }
      emp.registered = 1;
      const org = mockData.organizations.find(o => o.id === emp.organization_id);
      if (!org) return res.status(400).json({ error: 'Associated organization not found' });
      if (org.status !== 'active') return res.status(400).json({ error: 'This organization is currently inactive' });
      organizationId = org.id;
      organizationName = org.name;
    } else {
      // 2. Check multi-use generated code
      const genCode = mockData.generated_codes.find(gc => gc.code === code);
      if (!genCode) {
        return res.status(400).json({ error: 'Invalid company code' });
      }
      if (genCode.status !== 'active') {
        return res.status(400).json({ error: 'This sign-up code is currently inactive' });
      }
      if (genCode.signups_used >= genCode.max_signups) {
        return res.status(400).json({ error: 'This sign-up code has reached its maximum allowed signups.' });
      }

      const org = mockData.organizations.find(o => o.id === genCode.organization_id);
      if (!org) return res.status(400).json({ error: 'Associated organization not found' });
      if (org.status !== 'active') return res.status(400).json({ error: 'This organization is currently inactive' });

      // Increment multi-use code count
      genCode.signups_used = (genCode.signups_used || 0) + 1;
      if (genCode.signups_used >= genCode.max_signups) {
        genCode.status = 'depleted';
      }

      // Generate a UNIQUE personal code for this employee
      const personalUserCode = generateUniqueEmployeeCode(mockData.employees);

      // Create new Employee Directory record with distinct personal User Code & Common Signup Code
      const newEmp = {
        id: String(Date.now()) + Math.random().toString().slice(2, 6),
        organization_id: org.id,
        name: targetUserName || email.split('@')[0],
        email: email.trim(),
        code: personalUserCode, // Unique personal User Code
        signup_code: genCode.code, // Common Multi-Use Code used to join
        registered: 1,
        metadata: { signup_code: genCode.code },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockData.employees.push(newEmp);

      organizationId = org.id;
      organizationName = org.name;
    }
  }

  // Hash password before saving
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const userId = String(Date.now());
  const newUser = {
    id: userId,
    email,
    password: hashedPassword,
    role: ROLES.USER,
    user_name: targetUserName || email.split('@')[0],
    profile: existingProfile.name,
    organization_id: organizationId,
    organization: organizationName,
    permissions: [],
    permissions_locked: false,
    password_set_by_admin: false,
    created_by: 'self',
    created_at: new Date().toISOString()
  };
  mockData.users.push(newUser);
  
  // Save data
  saveData(mockData);
  
  const { password: _, ...userWithoutPassword } = newUser;
  res.json({
    user: userWithoutPassword,
    session: { id: 'mock-session-' + newUser.id },
    error: null
  });
});


app.post('/api/auth/signout', (req, res) => {
  console.log('👋 Sign out');
  res.json({ error: null });
});

app.get('/api/auth/user', (req, res) => {
  console.log('🔍 Get current user');
  // For now, return null - no persistent session management
  res.json({
    data: { user: null },
    error: null
  });
});

// Mock data endpoints to prevent errors
app.get('/api/users', (req, res) => {
  console.log('👥 Get all users');
  const safeUsers = mockData.users.map(u => {
    const { password, ...withoutPassword } = u;
    return withoutPassword;
  });
  res.json(safeUsers);
});

app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  console.log(`👤 Get user ${userId}`);

  const user = mockData.users.find(u => String(u.id) === String(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Return user data without password, enriched with the employee name (if any)
  // so callers get a usable display name rather than just an email.
  const { password, ...userWithoutPassword } = user;
  const employee = user.email
    ? mockData.employees.find(e => String(e.email).toLowerCase() === String(user.email).toLowerCase())
    : null;
  res.json({
    ...userWithoutPassword,
    user_name: user.user_name || employee?.name || (user.email ? user.email.split('@')[0] : `User ${user.id}`)
  });
});

app.get('/api/local-users/:id', (req, res) => {
  const userId = req.params.id;
  console.log(`👤 Get local user ${userId}`);

  const user = mockData.users.find(u => String(u.id) === String(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Return user data without password
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// ---------------------------------------------------------------------------
// RBAC: user management (Super Admin / Admin rules) + audit log
// ---------------------------------------------------------------------------

// Admin (or Super Admin) adds a new user with an initial password and the set
// of dashboard views they may see. Permissions are locked immediately after
// this initial setup; only a Super Admin can change them afterwards. Admins are
// scoped to their own organization and may only create regular users.
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { email, password, user_name, profile, role = ROLES.USER, permissions = [], organization_id = null } = req.body;
  console.log(`➕ ${req.actor.role} (${req.actor.email}) creating user: ${email}`);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (mockData.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User already exists.' });
  }
  // Only a Super Admin may create admins or other super admins.
  if ((role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) && !isSuperAdmin(req.actor)) {
    return res.status(403).json({ error: 'Only Super Admin can assign Admin or Super Admin roles.' });
  }
  const finalRole = [ROLES.USER, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(role) ? role : ROLES.USER;
  // Admins can only place users inside their own organization; Super Admin may target any.
  const finalOrgId = isSuperAdmin(req.actor) ? organization_id : (req.actor.organization_id || null);
  const sanitizedPerms = (Array.isArray(permissions) ? permissions : []).filter(p => DASHBOARD_VIEWS.includes(p));

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = {
    id: String(Date.now()),
    email,
    password: hashedPassword,
    role: finalRole,
    user_name: user_name || email.split('@')[0],
    profile: profile || null,
    organization_id: finalOrgId,
    permissions: sanitizedPerms,
    permissions_locked: true,      // locked after initial setup
    password_set_by_admin: true,   // onboarding password has been set
    created_by: req.actor.id,
    created_at: new Date().toISOString()
  };
  mockData.users.push(newUser);
  saveData(mockData);
  logAction(req.actor, 'user.create', newUser, { role: finalRole, permissions: sanitizedPerms, organization_id: finalOrgId });

  const { password: _pw, ...safe } = newUser;
  res.status(201).json(safe);
});


// Update a user's dashboard view permissions.
//   Super Admin : always allowed.
//   Admin       : allowed only while permissions are still unlocked (i.e. the
//                 one-time initial setup) AND the target is in their org;
//                 locked changes require Super Admin.
app.put('/api/users/:id/permissions', requireAdmin, (req, res) => {
  const actor = req.actor;
  const user = mockData.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (!sameOrg(actor, user.organization_id)) {
    return res.status(403).json({ error: 'You can only manage users within your organization.' });
  }
  const sanitized = (Array.isArray(req.body.permissions) ? req.body.permissions : []).filter(p => DASHBOARD_VIEWS.includes(p));

  if (!isSuperAdmin(actor) && user.permissions_locked) {
    return res.status(403).json({
      error: 'View permissions are locked after initial setup. Any changes require Super Admin approval.'
    });
  }

  const before = user.permissions;
  user.permissions = sanitized;
  user.permissions_locked = true;
  saveData(mockData);
  logAction(actor, 'permissions.update', user, { before, after: sanitized });
  res.json({ success: true, permissions: user.permissions, permissions_locked: user.permissions_locked });
});

// Set or reset a user's password.
//   Super Admin : may reset at any time.
//   Admin       : may set the password ONCE during onboarding (own org only);
//                 any subsequent reset must be routed to Super Admin.
app.post('/api/users/:id/password', requireAdmin, async (req, res) => {
  const actor = req.actor;
  const user = mockData.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (!sameOrg(actor, user.organization_id)) {
    return res.status(403).json({ error: 'You can only manage users within your organization.' });
  }
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  if (isSuperAdmin(actor)) {
    user.password = hashedPassword;
    user.password_set_by_admin = false; // super admin reset clears the admin lock
    saveData(mockData);
    logAction(actor, 'password.reset', user, {});
    return res.json({ success: true, message: 'Password reset successfully.' });
  }

  // Admin path: one-time onboarding set only.
  if (user.password_set_by_admin) {
    return res.status(403).json({
      error: 'Password was already set during onboarding. For any further password changes or resets, please connect with Super Admin (HappiMynd).'
    });
  }
  user.password = hashedPassword;
  user.password_set_by_admin = true;
  saveData(mockData);
  logAction(actor, 'password.set', user, { onboarding: true });
  res.json({ success: true, message: 'Onboarding password set successfully.' });
});


// Delete a user. Admins cannot remove users — only a Super Admin can.
app.delete('/api/users/:id', (req, res) => {
  const actor = getActor(req);
  if (!isAdmin(actor)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  if (!isSuperAdmin(actor)) {
    return res.status(403).json({
      error: 'Admin cannot remove users. User removal requests must be routed to Super Admin (HappiMynd).'
    });
  }
  const idx = mockData.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (mockData.users[idx].role === ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Super Admin accounts cannot be deleted.' });
  }
  const [removed] = mockData.users.splice(idx, 1);
  saveData(mockData);
  logAction(actor, 'user.delete', removed, { role: removed.role });
  res.json({ success: true, message: `User ${removed.email} removed successfully.`, deleted_id: removed.id });
});

// Audit log — Super Admin only.
app.get('/api/audit-log', requireSuperAdmin, (req, res) => {
  const log = (mockData.auditLog || []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  res.json(log);
});

app.get('/api/profiles', (req, res) => {
  console.log('📋 Get profiles');
  res.json(mockData.profiles);
});

// Create new profile route
app.post('/api/profiles', (req, res) => {
  const newProfile = req.body;
  const newId = String(Date.now()); // Generate a simple ID
  console.log(`➕ Create new profile:`, newProfile);
  
  const profile = {
    id: newId,
    name: newProfile.name || 'New Profile',
    email: newProfile.email || 'new@example.com',
    role: newProfile.role || 'student',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  mockData.profiles.push(profile);
  saveData(mockData);
  
  res.status(201).json(profile);
});

// Update profile route
app.put('/api/profiles/:id', (req, res) => {
  const profileId = req.params.id;
  const updateData = req.body;
  console.log(`✏️ Update profile ${profileId}:`, updateData);
  
  const profileIndex = mockData.profiles.findIndex(p => p.id === profileId);
  if (profileIndex === -1) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  mockData.profiles[profileIndex] = {
    ...mockData.profiles[profileIndex],
    name: updateData.name || mockData.profiles[profileIndex].name,
    email: updateData.email || mockData.profiles[profileIndex].email,
    role: updateData.role || mockData.profiles[profileIndex].role,
    updated_at: new Date().toISOString()
  };
  
  saveData(mockData);
  res.json(mockData.profiles[profileIndex]);
});

// Delete profile route
app.delete('/api/profiles/:id', (req, res) => {
  const profileId = req.params.id;
  console.log(`🗑️ Delete profile ${profileId}`);
  
  const profileIndex = mockData.profiles.findIndex(p => p.id === profileId);
  if (profileIndex === -1) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  mockData.profiles.splice(profileIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Profile ${profileId} deleted successfully`,
    deleted_id: profileId
  });
});

// Organization CRUD operations.
// This list is fetched during app bootstrap (before login too), so it never
// 403s — it returns data scoped to the caller instead:
//   Super Admin / legacy org-less admin -> all orgs
//   Org-scoped admin                     -> their own org
//   Non-admin / anonymous                -> empty list
app.get('/api/organizations', (req, res) => {
  console.log('🏢 Get organizations');
  const actor = getActor(req);
  
  // Start with a copy of defined organizations
  const all = [...(mockData.organizations || [])];
  
  // Dynamically scan user profiles to find and include legacy/previous organizations (e.g. Nuvoco, PCL)
  const userOrgs = [...new Set(mockData.users.map(u => u.organization).filter(Boolean))];
  userOrgs.forEach(orgName => {
    if (orgName !== 'Individual' && !all.some(o => o.name.toLowerCase() === orgName.toLowerCase())) {
      all.push({
        id: 'legacy-' + orgName.toLowerCase().replace(/\s+/g, '-'),
        name: orgName,
        description: 'Auto-recovered legacy organization',
        status: 'active',
        onboarding_code: 'LEGACY-' + orgName.toUpperCase().replace(/\s+/g, ''),
        onboarded_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
    }
  });

  if (!isAdmin(actor)) {
    return res.json([]);
  }
  if (isSuperAdmin(actor) || !actor.organization_id) {
    return res.json(all);
  }
  res.json(all.filter(o => String(o.id) === String(actor.organization_id)));
});

// Organization management (create/update/delete/regenerate code) is reserved
// for Super Admin per the access-control policy.
app.post('/api/organizations', requireSuperAdmin, (req, res) => {
  const org = req.body;
  console.log('🏢 Create organization', org);
  
  if (!org.name) {
    return res.status(400).json({ error: 'Organization name is required' });
  }

  const exists = (mockData.organizations || []).some(o => o.name.toLowerCase() === org.name.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Organization name already exists' });
  }

  const newOrg = {
    id: String(Date.now()),
    name: org.name,
    description: org.description || '',
    status: org.status || 'active',
    onboarding_code: generateOnboardingCode(mockData.organizations || []),
    onboarded_at: org.onboarded_at || new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (!mockData.organizations) {
    mockData.organizations = [];
  }
  
  mockData.organizations.push(newOrg);
  saveData(mockData);

  res.status(201).json(newOrg);
});

app.put('/api/organizations/:id', requireSuperAdmin, (req, res) => {
  const orgId = req.params.id;
  const updates = req.body;
  console.log(`🏢 Update organization ${orgId}`, updates);

  if (!mockData.organizations) {
    mockData.organizations = [];
  }

  const orgIndex = mockData.organizations.findIndex(o => o.id === orgId);
  if (orgIndex === -1) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  if (updates.name && updates.name.toLowerCase() !== mockData.organizations[orgIndex].name.toLowerCase()) {
    const exists = mockData.organizations.some(o => o.name.toLowerCase() === updates.name.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Organization name already exists' });
    }
  }

  const updatedOrg = {
    ...mockData.organizations[orgIndex],
    ...updates,
    updated_at: new Date().toISOString()
  };

  mockData.organizations[orgIndex] = updatedOrg;
  saveData(mockData);

  res.json(updatedOrg);
});

app.delete('/api/organizations/:id', requireSuperAdmin, (req, res) => {
  const orgId = req.params.id;
  console.log(`🏢 Delete organization ${orgId}`);

  if (!mockData.organizations) {
    mockData.organizations = [];
  }

  const orgIndex = mockData.organizations.findIndex(o => o.id === orgId);
  if (orgIndex === -1) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  mockData.organizations.splice(orgIndex, 1);
  saveData(mockData);

  res.json({
    success: true,
    message: `Organization ${orgId} deleted successfully`,
    deleted_id: orgId
  });
});

app.post('/api/organizations/:id/regenerate-code', requireSuperAdmin, (req, res) => {
  const orgId = req.params.id;
  console.log(`🏢 Regenerate onboarding code for organization ${orgId}`);
  if (!mockData.organizations) {
    mockData.organizations = [];
  }
  const org = mockData.organizations.find(o => o.id === orgId);
  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }
  const code = generateOnboardingCode(mockData.organizations);
  org.onboarding_code = code;
  org.updated_at = new Date().toISOString();
  saveData(mockData);
  res.json({ onboarding_code: code });
});

// Employees CRUD and Bulk Import operations.
// Managing the org directory is "managing users within allowed scope": Admins
// may do it for their own organization, Super Admin for any.
app.get('/api/organizations/:orgId/employees', requireAdmin, (req, res) => {
  const orgId = req.params.orgId;
  if (!sameOrg(req.actor, orgId)) {
    return res.status(403).json({ error: 'You can only manage users within your organization.' });
  }
  console.log(`👥 Get employees for organization ${orgId}`);
  if (!mockData.employees) {
    mockData.employees = [];
  }
  const orgEmployees = mockData.employees.filter(e => e.organization_id === orgId);
  const enriched = orgEmployees.map(emp => {
    let metadata = emp.metadata || {};
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
    }
    const personalEmail = (metadata.personal_email || '').toLowerCase();
    const isRegistered = mockData.users && mockData.users.some(u => 
      (u.email.toLowerCase() === emp.email.toLowerCase() || (personalEmail && u.email.toLowerCase() === personalEmail)) && 
      String(u.organization_id) === String(emp.organization_id)
    );
    return {
      ...emp,
      personal_email: metadata.personal_email || '',
      registered: isRegistered ? 1 : 0
    };
  });
  res.json(enriched);
});

app.post('/api/organizations/:orgId/employees/import', requireAdmin, (req, res) => {
  const orgId = req.params.orgId;
  if (!sameOrg(req.actor, orgId)) {
    return res.status(403).json({ error: 'You can only manage users within your organization.' });
  }
  console.log(`👥 Import employees for organization ${orgId}`);
  const { employees } = req.body;

  if (!employees || !Array.isArray(employees)) {
    return res.status(400).json({ error: 'Invalid payload: employees array is required' });
  }

  if (!mockData.employees) {
    mockData.employees = [];
  }

  const existingEmails = mockData.employees
    .filter(e => e.organization_id === orgId)
    .map(e => e.email.toLowerCase());

  // Employee codes are unique system-wide, matching generateUniqueEmployeeCode's scope.
  const existingCodes = mockData.employees
    .filter(e => e.code)
    .map(e => e.code.toUpperCase());

  const imported = [];
  const allCurrentEmployees = [...(mockData.employees || [])];
  for (const emp of employees) {
    if (!emp.name || !emp.email) {
      return res.status(400).json({ error: 'Name and Email are mandatory fields' });
    }
    if (existingEmails.includes(emp.email.toLowerCase())) {
      return res.status(400).json({ error: `Email ${emp.email} already exists in this organization` });
    }

    // Preserve the supplied code exactly as given - only trim whitespace.
    // Uniqueness is still checked case-insensitively so "abc123"/"ABC123"
    // aren't treated as different codes.
    const suppliedCode = emp.code ? String(emp.code).trim() : '';
    if (suppliedCode && existingCodes.includes(suppliedCode.toUpperCase())) {
      return res.status(400).json({ error: `Code ${suppliedCode} already exists` });
    }

    const code = suppliedCode || generateUniqueEmployeeCode(allCurrentEmployees);
    const newEmp = {
      id: String(Date.now() + Math.random()),
      organization_id: orgId,
      name: emp.name.trim(),
      email: emp.email.trim(),
      code,
      metadata: emp.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    imported.push(newEmp);
    allCurrentEmployees.push(newEmp);
    existingEmails.push(newEmp.email.toLowerCase());
    existingCodes.push(code.toUpperCase());
  }

  mockData.employees.push(...imported);
  saveData(mockData);

  res.json(imported);
});

app.delete('/api/employees/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  console.log(`👥 Delete employee ${id}`);
  if (!mockData.employees) {
    mockData.employees = [];
  }
  const index = mockData.employees.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  const emp = mockData.employees[index];
  if (!sameOrg(req.actor, emp.organization_id)) {
    return res.status(403).json({ error: 'You can only manage users within your organization.' });
  }
  // If the directory entry has already become a registered user account, its
  // removal is a user removal — reserved for Super Admin.
  let metadata = emp.metadata || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const personalEmail = (metadata.personal_email || '').toLowerCase();
  const isRegisteredUser = (mockData.users || []).some(u =>
    (u.email.toLowerCase() === emp.email.toLowerCase() || (personalEmail && u.email.toLowerCase() === personalEmail)) &&
    String(u.organization_id) === String(emp.organization_id)
  );
  if (isRegisteredUser && !isSuperAdmin(req.actor)) {
    return res.status(403).json({
      error: 'This member is a registered user. User removal requests must be routed to Super Admin (HappiMynd).'
    });
  }
  mockData.employees.splice(index, 1);
  saveData(mockData);
  logAction(req.actor, 'employee.delete', { id: emp.id, email: emp.email }, { organization_id: emp.organization_id });
  res.json({ success: true, message: `Employee ${id} deleted successfully` });
});

// Packets CRUD operations
app.get('/api/packets', (req, res) => {
  console.log('📦 Get packets');
  
  // Add questions to each packet and preserve all packet fields including scoringScale
  const packetsWithQuestions = mockData.packets.map(packet => {
    const packetQuestions = mockData.questions.filter(q => q.packet_id === packet.id);
    return {
      ...packet, // This preserves all fields including scoringScale, enableScoringScale
      questions: packetQuestions
    };
  });
  
  res.json(packetsWithQuestions);
});

app.post('/api/packets', (req, res) => {
  const newPacket = req.body;
  const newId = String(Date.now());
  console.log(`➕ Create new packet:`, newPacket);
  
  const packet = {
    id: newId,
    name: newPacket.name || 'New Packet',
    description: newPacket.description || 'New description',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  mockData.packets.push(packet);
  saveData(mockData);
  
  res.status(201).json(packet);
});

app.put('/api/packets/:id', (req, res) => {
  const packetId = req.params.id;
  const updateData = req.body;
  console.log(`✏️ Update packet ${packetId}:`, updateData);
  console.log(`📊 Scoring scale data:`, updateData.scoringScale);
  console.log(`🔧 Enable scoring scale:`, updateData.enableScoringScale);
  
  // Debug: Log the current packet before update
  const currentPacket = mockData.packets.find(p => p.id === packetId);
  console.log(`🔍 Current packet before update:`, {
    id: currentPacket?.id,
    name: currentPacket?.name,
    description: currentPacket?.description,
    questionCount: currentPacket?.questions?.length || 0,
    hasScoringScale: !!currentPacket?.scoringScale
  });
  
  const packetIndex = mockData.packets.findIndex(p => p.id === packetId);
  if (packetIndex === -1) {
    return res.status(404).json({ error: 'Packet not found' });
  }
  
  // Create a safe update that preserves all existing fields
  const existingPacket = mockData.packets[packetIndex];
  const updatedPacket = {
    ...existingPacket, // Preserve ALL existing fields including questions
    updated_at: new Date().toISOString()
  };
  
  // Only update the fields that are provided in updateData
  if (updateData.name !== undefined) updatedPacket.name = updateData.name;
  if (updateData.description !== undefined) updatedPacket.description = updateData.description;
  if (updateData.scoringScale !== undefined) updatedPacket.scoringScale = updateData.scoringScale;
  if (updateData.enableScoringScale !== undefined) updatedPacket.enableScoringScale = updateData.enableScoringScale;
  
  // Ensure questions are preserved by fetching them from the questions array
  const packetQuestions = mockData.questions.filter(q => q.packet_id === packetId);
  updatedPacket.questions = packetQuestions;
  
  mockData.packets[packetIndex] = updatedPacket;
  
  saveData(mockData);
  
  // Debug: Log the updated packet after update
  const finalPacket = mockData.packets[packetIndex];
  console.log(`✅ Packet updated successfully. New data:`, {
    id: finalPacket.id,
    name: finalPacket.name,
    description: finalPacket.description,
    questionCount: finalPacket.questions?.length || 0,
    hasScoringScale: !!finalPacket.scoringScale,
    scoringScaleLength: finalPacket.scoringScale?.length || 0
  });
  
  res.json(finalPacket);
});

app.delete('/api/packets/:id', (req, res) => {
  const packetId = req.params.id;
  console.log(`🗑️ Delete packet ${packetId}`);
  
  const packetIndex = mockData.packets.findIndex(p => p.id === packetId);
  if (packetIndex === -1) {
    return res.status(404).json({ error: 'Packet not found' });
  }
  
  mockData.packets.splice(packetIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Packet ${packetId} deleted successfully`,
    deleted_id: packetId
  });
});

// Questions CRUD operations
app.get('/api/questions', (req, res) => {
  console.log('❓ Get questions');
  
  const { packet_id, quiz_id } = req.query;
  
  let filteredQuestions = [];
  
  if (quiz_id) {
    // Filter questions by quiz_id
    // First, get packet IDs associated with this quiz
    const quiz = mockData.quizzes.find(q => q.id === quiz_id);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const packetIds = quiz.packet_ids || [];
    filteredQuestions = mockData.questions.filter(q => packetIds.includes(q.packet_id));
  } else if (packet_id) {
    // Filter questions by packet_id
    filteredQuestions = mockData.questions.filter(q => q.packet_id === packet_id);
  } else {
    // Return all questions
    filteredQuestions = mockData.questions;
  }
  
  // Enrich questions with packet name information
  const enrichedQuestions = filteredQuestions.map(question => {
    if (question.packet_id) {
      const packet = mockData.packets.find(p => p.id === question.packet_id);
      if (packet) {
        return {
          ...question,
          packet_name: packet.name
        };
      }
    }
    return question;
  });
  
  res.json(enrichedQuestions);
});

app.post('/api/questions', (req, res) => {
  const newQuestion = req.body;
  const newId = String(Date.now());
  console.log(`➕ Create new question:`, newQuestion);
  console.log(`🔍 Question type:`, newQuestion.question_type);
  console.log(`🔍 Options array:`, newQuestion.options);
  console.log(`🔍 Options length:`, newQuestion.options?.length);
  console.log(`🔍 Options is array:`, Array.isArray(newQuestion.options));
  console.log(`🔍 Each option:`, newQuestion.options?.map(opt => ({ text: opt.text, marks: opt.marks, type: typeof opt.marks })));
  
  // Handle both frontend field names and expected format
  const questionText = newQuestion.question_text || newQuestion.question || 'New Question';
  const questionType = newQuestion.question_type || newQuestion.type || 'multiple_choice';
  const packetId = newQuestion.packet_id || null;
  
  // Handle options with individual marks
  let options = [];
  let totalMarks = 0;
  
  if (newQuestion.options && Array.isArray(newQuestion.options) && newQuestion.options.length > 0) {
    // New format with individual option marks
    console.log('🔍 Processing options with marks:', newQuestion.options.map(opt => ({ text: opt.text, marks: opt.marks, type: typeof opt.marks })));
    console.log('🔍 First option structure:', newQuestion.options[0]);
    console.log('🔍 Has text property:', newQuestion.options[0]?.hasOwnProperty('text'));
    console.log('🔍 Has marks property:', newQuestion.options[0]?.hasOwnProperty('marks'));
    
    // Additional validation to ensure options have the correct structure
    const hasValidStructure = newQuestion.options.every(opt => 
      opt && typeof opt === 'object' && 
      opt.hasOwnProperty('text') && 
      opt.hasOwnProperty('marks')
    );
    
    console.log('🔍 Options have valid structure:', hasValidStructure);
    
    if (hasValidStructure) {
      options = newQuestion.options.map(opt => {
        const parsedMarks = parseInt(opt.marks);
        const finalMarks = isNaN(parsedMarks) ? 0 : parsedMarks;
        console.log(`🔍 Option "${opt.text}": original=${opt.marks}, parsed=${parsedMarks}, final=${finalMarks}`);
        return {
          text: opt.text || opt,
          marks: finalMarks
        };
      });
      totalMarks = options.reduce((sum, opt) => sum + opt.marks, 0);
      console.log('🔍 Final options:', options);
      console.log('🔍 Total marks calculated:', totalMarks);
    } else {
      console.log('🔍 Options structure invalid, falling back to old format');
      // Fall back to old format
      if (questionType === 'mcq' || questionType === 'multiple_choice') {
        options = ['Option A', 'Option B', 'Option C', 'Option D'];
      } else if (questionType === 'true_false') {
        options = ['True', 'False'];
      }
      totalMarks = newQuestion.marks || 0;
    }
  } else {
    console.log('🔍 Falling back to old format - options not recognized');
    console.log('🔍 Options received:', newQuestion.options);
    console.log('🔍 Options type:', typeof newQuestion.options);
    console.log('🔍 Options is array:', Array.isArray(newQuestion.options));
    console.log('🔍 Options length:', newQuestion.options?.length);
    // Fallback to old format
    if (questionType === 'mcq' || questionType === 'multiple_choice') {
      options = ['Option A', 'Option B', 'Option C', 'Option D'];
    } else if (questionType === 'true_false') {
      options = ['True', 'False'];
    }
    totalMarks = newQuestion.marks || 0;
  }
  
  const question = {
    id: newId,
    packet_id: packetId,
    question: questionText,
    question_text: questionText,
    type: questionType,
    question_type: questionType,
    options: options,
    marks: totalMarks, // Total marks for the question
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  mockData.questions.push(question);
  saveData(mockData);
  
  res.status(201).json(question);
});

app.put('/api/questions/:id', (req, res) => {
  const questionId = req.params.id;
  const updateData = req.body;
  console.log(`✏️ Update question ${questionId}:`, updateData);
  console.log(`🔍 Question type:`, updateData.question_type);
  console.log(`🔍 Options array:`, updateData.options);
  console.log(`🔍 Options length:`, updateData.options?.length);
  console.log(`🔍 Options is array:`, Array.isArray(updateData.options));
  console.log(`🔍 Each option:`, updateData.options?.map(opt => ({ text: opt.text, marks: opt.marks, type: typeof opt.marks })));
  
  // Handle both frontend field names and expected format
  const questionText = updateData.question_text || updateData.question || 'Updated Question';
  const questionType = updateData.question_type || updateData.type || 'multiple_choice';
  const packetId = updateData.packet_id || null;
  
  // Debug: Check all available question IDs
  console.log(`🔍 Available question IDs:`, mockData.questions.map(q => q.id));
  console.log(`🔍 Looking for question ID:`, questionId);
  console.log(`🔍 Question ID type:`, typeof questionId);
  
  // Find the question index first
  const questionIndex = mockData.questions.findIndex(q => {
    console.log(`🔍 Comparing ${q.id} (${typeof q.id}) with ${questionId} (${typeof questionId})`);
    return q.id === questionId;
  });
  
  console.log(`🔍 Question index found:`, questionIndex);
  
  if (questionIndex === -1) {
    console.log(`❌ Question not found with ID: ${questionId}`);
    console.log(`❌ Available IDs:`, mockData.questions.map(q => q.id));
    return res.status(404).json({ error: 'Question not found' });
  }
  
  // Handle options with individual marks
  let options = [];
  let totalMarks = 0;
  
  if (updateData.options && Array.isArray(updateData.options) && updateData.options.length > 0) {
    // New format with individual option marks
    console.log('🔍 Processing update options with marks:', updateData.options.map(opt => ({ text: opt.text, marks: opt.marks, type: typeof opt.marks })));
    console.log('🔍 First update option structure:', updateData.options[0]);
    console.log('🔍 Has text property:', updateData.options[0]?.hasOwnProperty('text'));
    console.log('🔍 Has marks property:', updateData.options[0]?.hasOwnProperty('marks'));
    
    // Additional validation to ensure options have the correct structure
    const hasValidStructure = updateData.options.every(opt => 
      opt && typeof opt === 'object' && 
      opt.hasOwnProperty('text') && 
      opt.hasOwnProperty('marks')
    );
    
    console.log('🔍 Update options have valid structure:', hasValidStructure);
    
    if (hasValidStructure) {
      options = updateData.options.map(opt => {
        const parsedMarks = parseInt(opt.marks);
        const finalMarks = isNaN(parsedMarks) ? 0 : parsedMarks;
        console.log(`🔍 Update option "${opt.text}": original=${opt.marks}, parsed=${parsedMarks}, final=${finalMarks}`);
        return {
          text: opt.text || opt,
          marks: finalMarks
        };
      });
      totalMarks = options.reduce((sum, opt) => sum + opt.marks, 0);
      console.log('🔍 Final update options:', options);
      console.log('🔍 Total update marks calculated:', totalMarks);
    } else {
      console.log('🔍 Update options structure invalid, falling back to old format');
      // Fall back to old format
      if (questionType === 'mcq' || questionType === 'multiple_choice') {
        options = ['Option A', 'Option B', 'Option C', 'Option D'];
      } else if (questionType === 'true_false') {
        options = ['True', 'False'];
      }
      totalMarks = updateData.marks || mockData.questions[questionIndex]?.marks || 0;
    }
  } else {
    console.log('🔍 Falling back to old format for update - options not recognized');
    console.log('🔍 Update options received:', updateData.options);
    console.log('🔍 Update options type:', typeof updateData.options);
    console.log('🔍 Update options is array:', Array.isArray(updateData.options));
    console.log('🔍 Update options length:', updateData.options?.length);
    // Fallback to old format
    if (questionType === 'mcq' || questionType === 'multiple_choice') {
      options = ['Option A', 'Option B', 'Option C', 'Option D'];
    } else if (questionType === 'true_false') {
      options = ['True', 'False'];
    }
    totalMarks = updateData.marks || mockData.questions[questionIndex]?.marks || 0;
  }
  if (questionIndex === -1) {
    return res.status(404).json({ error: 'Question not found' });
  }
  
  mockData.questions[questionIndex] = {
    ...mockData.questions[questionIndex],
    packet_id: packetId,
    question: questionText,
    question_text: questionText,
    type: questionType,
    question_type: questionType,
    options: options,
    marks: totalMarks, // Total marks for the question
    updated_at: new Date().toISOString()
  };
  
  saveData(mockData);
  res.json(mockData.questions[questionIndex]);
});

app.delete('/api/questions/:id', (req, res) => {
  const questionId = req.params.id;
  console.log(`🗑️ Delete question ${questionId}`);
  
  const questionIndex = mockData.questions.findIndex(q => q.id === questionId);
  if (questionIndex === -1) {
    return res.status(404).json({ error: 'Question not found' });
  }
  
  mockData.questions.splice(questionIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Question ${questionId} deleted successfully`,
    deleted_id: questionId
  });
});

// Quizzes CRUD operations
app.get('/api/quizzes', (req, res) => {
  console.log('📝 Get quizzes');
  res.json(mockData.quizzes);
});

app.get('/api/quizzes/:id', (req, res) => {
  const quizId = req.params.id;
  console.log(`📝 Get quiz ${quizId}`);
  
  const quiz = mockData.quizzes.find(q => q.id === quizId);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  
  res.json(quiz);
});

app.post('/api/quizzes', (req, res) => {
  const newQuiz = req.body;
  const newId = String(Date.now());
  console.log(`➕ Create new quiz:`, newQuiz);
  
  const quiz = {
    id: newId,
    name: newQuiz.name || 'New Quiz',
    description: newQuiz.description || 'New quiz description',
    time_limit: newQuiz.time_limit || 30,
    total_questions: newQuiz.total_questions || 0,
    passing_score: newQuiz.passing_score || 70,
    report_header: newQuiz.report_header || '',
    report_footer: newQuiz.report_footer || '',
    start_instructions: newQuiz.start_instructions || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  mockData.quizzes.push(quiz);
  saveData(mockData);
  
  res.status(201).json(quiz);
});

app.put('/api/quizzes/:id', (req, res) => {
  const quizId = req.params.id;
  const updateData = req.body;
  console.log(`✏️ Update quiz ${quizId}:`, updateData);
  
  const quizIndex = mockData.quizzes.findIndex(q => q.id === quizId);
  if (quizIndex === -1) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  
  mockData.quizzes[quizIndex] = {
    ...mockData.quizzes[quizIndex],
    name: updateData.name || mockData.quizzes[quizIndex].name,
    description: updateData.description || mockData.quizzes[quizIndex].description,
    time_limit: updateData.time_limit || mockData.quizzes[quizIndex].time_limit,
    total_questions: updateData.total_questions || mockData.quizzes[quizIndex].total_questions,
    passing_score: updateData.passing_score || mockData.quizzes[quizIndex].passing_score,
    report_header: updateData.report_header !== undefined ? updateData.report_header : mockData.quizzes[quizIndex].report_header,
    report_footer: updateData.report_footer !== undefined ? updateData.report_footer : mockData.quizzes[quizIndex].report_footer,
    start_instructions: updateData.start_instructions !== undefined ? updateData.start_instructions : mockData.quizzes[quizIndex].start_instructions,
    updated_at: new Date().toISOString()
  };
  
  saveData(mockData);
  res.json(mockData.quizzes[quizIndex]);
});

app.delete('/api/quizzes/:id', (req, res) => {
  const quizId = req.params.id;
  console.log(`🗑️ Delete quiz ${quizId}`);
  
  const quizIndex = mockData.quizzes.findIndex(q => q.id === quizId);
  if (quizIndex === -1) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  
  mockData.quizzes.splice(quizIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Quiz ${quizId} deleted successfully`,
    deleted_id: quizId
  });
});

// Quiz Packets CRUD operations (for linking quizzes to packets)
app.get('/api/quiz-packets/:quizId', (req, res) => {
  const quizId = req.params.quizId;
  console.log(`📦 Get quiz packets for quiz ${quizId}`);
  
  // Find the quiz
  const quiz = mockData.quizzes.find(q => q.id === quizId);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  
  // Get the packets associated with this quiz
  const packetIds = quiz.packet_ids || [];
  const packets = mockData.packets.filter(p => packetIds.includes(p.id));
  
  // Add questions to each packet (similar to the /api/packets endpoint)
  const packetsWithQuestions = packets.map(packet => {
    const packetQuestions = mockData.questions.filter(q => q.packet_id === packet.id);
    return {
      ...packet,
      questions: packetQuestions
    };
  });
  
  res.json(packetsWithQuestions);
});

app.post('/api/quiz-packets/:quizId', (req, res) => {
  const quizId = req.params.quizId;
  const { packetIds } = req.body;
  console.log(`🔗 Link quiz ${quizId} to packets:`, packetIds);
  
  // Find the quiz
  const quizIndex = mockData.quizzes.findIndex(q => q.id === quizId);
  if (quizIndex === -1) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  
  // Update quiz with packet association
  mockData.quizzes[quizIndex] = {
    ...mockData.quizzes[quizIndex],
    packet_ids: packetIds || [],
    updated_at: new Date().toISOString()
  };
  
  saveData(mockData);
  
  res.status(201).json({
    success: true,
    message: `Quiz ${quizId} linked to packets successfully`,
    quiz: mockData.quizzes[quizIndex]
  });
});

app.delete('/api/quiz-packets/:quizId', (req, res) => {
  const quizId = req.params.quizId;
  const { packetIds } = req.body;
  console.log(`🗑️ Remove packets from quiz ${quizId}:`, packetIds);
  
  // Find the quiz
  const quizIndex = mockData.quizzes.findIndex(q => q.id === quizId);
  if (quizIndex === -1) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  
  // Remove the specified packet IDs from the quiz
  const currentPacketIds = mockData.quizzes[quizIndex].packet_ids || [];
  const updatedPacketIds = currentPacketIds.filter(id => !packetIds.includes(id));
  
  // Update quiz with new packet association
  mockData.quizzes[quizIndex] = {
    ...mockData.quizzes[quizIndex],
    packet_ids: updatedPacketIds,
    updated_at: new Date().toISOString()
  };
  
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Packets removed from quiz ${quizId} successfully`,
    quiz: mockData.quizzes[quizIndex]
  });
});

// Quiz Assignments CRUD operations
app.get('/api/quiz-assignments', (req, res) => {
  console.log('📋 Get quiz assignments');
  res.json(mockData.quizAssignments);
});

app.post('/api/quiz-assignments', (req, res) => {
  const { quizId, quiz_id, profileIds, profileId, userIds, userId, due_date, dueDate, status } = req.body;
  const qId = quizId || quiz_id || '1';
  const resolvedDueDate = due_date || dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const resolvedStatus = status || 'assigned';
  
  console.log(`➕ Create new quiz assignments for quiz ${qId}:`, { profileIds, profileId, userIds, userId });
  
  const createdAssignments = [];
  let baseTime = Date.now();
  
  // 1. Process profile assignments
  const profilesToAssign = [];
  if (Array.isArray(profileIds)) {
    profilesToAssign.push(...profileIds);
  } else if (profileId) {
    profilesToAssign.push(profileId);
  }
  
  profilesToAssign.forEach((pId, index) => {
    // Check if duplicate assignment exists (matching both profile_id and quiz_id, and with NO user_id)
    const exists = mockData.quizAssignments.some(a => a.quiz_id === qId && a.profile_id === pId && !a.user_id);
    if (!exists) {
      const assignment = {
        id: String(baseTime + index),
        quiz_id: qId,
        profile_id: pId,
        user_id: null,
        assigned_at: new Date().toISOString(),
        due_date: resolvedDueDate,
        status: resolvedStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockData.quizAssignments.push(assignment);
      createdAssignments.push(assignment);
    }
  });
  
  // 2. Process user assignments
  const usersToAssign = [];
  if (Array.isArray(userIds)) {
    usersToAssign.push(...userIds);
  } else if (userId) {
    usersToAssign.push(userId);
  }
  
  usersToAssign.forEach((uId, index) => {
    // Check if duplicate assignment exists
    const exists = mockData.quizAssignments.some(a => a.quiz_id === qId && a.user_id === uId);
    if (!exists) {
      const userObj = mockData.users.find(u => u.id === uId);
      const userProfile = userObj ? mockData.profiles.find(p => p.name === userObj.profile) : null;
      
      const assignment = {
        id: String(baseTime + profilesToAssign.length + index),
        quiz_id: qId,
        profile_id: userProfile ? userProfile.id : null,
        user_id: uId,
        assigned_at: new Date().toISOString(),
        due_date: resolvedDueDate,
        status: resolvedStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockData.quizAssignments.push(assignment);
      createdAssignments.push(assignment);
    }
  });
  
  saveData(mockData);
  
  res.status(201).json(createdAssignments.length > 0 ? createdAssignments[0] : { success: true });
});

app.put('/api/quiz-assignments/:id', (req, res) => {
  const assignmentId = req.params.id;
  const updateData = req.body;
  console.log(`✏️ Update quiz assignment ${assignmentId}:`, updateData);
  
  const assignmentIndex = mockData.quizAssignments.findIndex(a => a.id === assignmentId);
  if (assignmentIndex === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }
  
  mockData.quizAssignments[assignmentIndex] = {
    ...mockData.quizAssignments[assignmentIndex],
    quiz_id: updateData.quiz_id || mockData.quizAssignments[assignmentIndex].quiz_id,
    profile_id: updateData.profile_id || mockData.quizAssignments[assignmentIndex].profile_id,
    status: updateData.status || mockData.quizAssignments[assignmentIndex].status,
    updated_at: new Date().toISOString()
  };
  
  saveData(mockData);
  res.json(mockData.quizAssignments[assignmentIndex]);
});

app.delete('/api/quiz-assignments/:id', (req, res) => {
  const assignmentId = req.params.id;
  console.log(`🗑️ Delete quiz assignment ${assignmentId}`);
  
  const assignmentIndex = mockData.quizAssignments.findIndex(a => a.id === assignmentId);
  if (assignmentIndex === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }
  
  mockData.quizAssignments.splice(assignmentIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Quiz assignment ${assignmentId} deleted successfully`,
    deleted_id: assignmentId
  });
});

// Remove assignment by profile and quiz ID
app.delete('/api/quiz-assignments/profile/:profileId/quiz/:quizId', (req, res) => {
  const { profileId, quizId } = req.params;
  console.log(`🗑️ Delete quiz assignment for profile ${profileId} and quiz ${quizId}`);
  
  const assignmentIndex = mockData.quizAssignments.findIndex(
    a => a.profile_id === profileId && a.quiz_id === quizId && !a.user_id
  );
  
  if (assignmentIndex === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }
  
  const deletedAssignment = mockData.quizAssignments[assignmentIndex];
  mockData.quizAssignments.splice(assignmentIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Quiz assignment removed successfully`,
    deleted_assignment: deletedAssignment
  });
});

// Remove assignment by user and quiz ID
app.delete('/api/quiz-assignments/user/:userId/quiz/:quizId', (req, res) => {
  const { userId, quizId } = req.params;
  console.log(`🗑️ Delete quiz assignment for user ${userId} and quiz ${quizId}`);
  
  const assignmentIndex = mockData.quizAssignments.findIndex(
    a => a.user_id === userId && a.quiz_id === quizId
  );
  
  if (assignmentIndex === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }
  
  const deletedAssignment = mockData.quizAssignments[assignmentIndex];
  mockData.quizAssignments.splice(assignmentIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Quiz assignment removed successfully`,
    deleted_assignment: deletedAssignment
  });
});

// Quiz Attempts CRUD operations
app.get('/api/quiz-attempts', (req, res) => {
  console.log('📝 Get quiz attempts');
  
  const { quiz_id } = req.query;

  // Attach a resolved user (name + email) to every attempt so dashboards and
  // reports render the real identity instead of a "User {id}" placeholder.
  const withUser = (attempts) =>
    attempts.map(a => ({ ...a, user: resolveAttemptUser(a) }));

  let attemptsList = mockData.quizAttempts || [];
  if (quiz_id) {
    attemptsList = attemptsList.filter(a => a.quiz_id === quiz_id);
  }

  const sortedAttempts = [...attemptsList].sort((a, b) => {
    const timeA = new Date(a.completed_at || a.updated_at || a.started_at || a.created_at || 0).getTime();
    const timeB = new Date(b.completed_at || b.updated_at || b.started_at || b.created_at || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
  });

  res.json(withUser(sortedAttempts));
});

app.post('/api/quiz-attempts', (req, res) => {
  const newAttempt = req.body;
  const newId = String(Date.now());
  console.log(`➕ Create new quiz attempt:`, newAttempt);
  
  const attempt = {
    id: newId,
    quiz_id: newAttempt.quiz_id || '1',
    profile_id: newAttempt.profile_id || newAttempt.user_id || '1',
    user_id: newAttempt.user_id || newAttempt.profile_id || '1', // Add user_id for dashboard
    // Snapshot the taker's identity so the dashboard/report can show the correct
    // name and email even when the user record can't be resolved later.
    user_name: newAttempt.user_name || null,
    user_email: newAttempt.user_email || null,
    score: newAttempt.score || 0,
    total_questions: newAttempt.total_questions || 10,
    correct_answers: newAttempt.correct_answers || 0,
    // New fields for marks-based scoring
    total_marks: newAttempt.total_marks || 0,
    packet_marks: newAttempt.packet_marks || {},
    // Persist progress fields so a resumed attempt restores the saved answers and
    // the position to continue from / navigate back through.
    answers: newAttempt.answers || {},
    current_question_index: newAttempt.current_question_index || 0,
    started_at: new Date().toISOString(),
    completed_at: newAttempt.completed_at || null,
    status: newAttempt.status || 'in_progress',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  mockData.quizAttempts.push(attempt);
  saveData(mockData);
  
  // Log that PDF report can be generated
  console.log('✅ Quiz attempt created:', newId);
  console.log('📊 PDF Report can now be generated for this submission in Quiz Report section');
  
  res.status(201).json(attempt);
});

app.put('/api/quiz-attempts/:id', (req, res) => {
  const attemptId = req.params.id;
  const updateData = req.body;
  console.log(`✏️ Update quiz attempt ${attemptId}:`, updateData);
  
  const attemptIndex = mockData.quizAttempts.findIndex(a => a.id === attemptId);
  if (attemptIndex === -1) {
    return res.status(404).json({ error: 'Attempt not found' });
  }
  
  mockData.quizAttempts[attemptIndex] = {
    ...mockData.quizAttempts[attemptIndex],
    quiz_id: updateData.quiz_id || mockData.quizAttempts[attemptIndex].quiz_id,
    profile_id: updateData.profile_id || updateData.user_id || mockData.quizAttempts[attemptIndex].profile_id,
    user_id: updateData.user_id || updateData.profile_id || mockData.quizAttempts[attemptIndex].user_id,
    user_name: updateData.user_name || mockData.quizAttempts[attemptIndex].user_name || null,
    user_email: updateData.user_email || mockData.quizAttempts[attemptIndex].user_email || null,
    score: updateData.score !== undefined ? updateData.score : mockData.quizAttempts[attemptIndex].score,
    total_questions: updateData.total_questions !== undefined ? updateData.total_questions : mockData.quizAttempts[attemptIndex].total_questions,
    correct_answers: updateData.correct_answers !== undefined ? updateData.correct_answers : mockData.quizAttempts[attemptIndex].correct_answers,
    // New fields for marks-based scoring
    total_marks: updateData.total_marks !== undefined ? updateData.total_marks : mockData.quizAttempts[attemptIndex].total_marks,
    packet_marks: updateData.packet_marks !== undefined ? updateData.packet_marks : mockData.quizAttempts[attemptIndex].packet_marks,
    completed_at: updateData.completed_at !== undefined ? updateData.completed_at : mockData.quizAttempts[attemptIndex].completed_at,
    status: updateData.status || mockData.quizAttempts[attemptIndex].status,
    answers: updateData.answers !== undefined ? updateData.answers : mockData.quizAttempts[attemptIndex].answers,
    current_question_index: updateData.current_question_index !== undefined ? updateData.current_question_index : mockData.quizAttempts[attemptIndex].current_question_index,
    updated_at: new Date().toISOString()
  };
  
  saveData(mockData);
  res.json(mockData.quizAttempts[attemptIndex]);
});

app.delete('/api/quiz-attempts/:id', (req, res) => {
  const attemptId = req.params.id;
  console.log(`🗑️ Delete quiz attempt ${attemptId}`);
  
  const attemptIndex = mockData.quizAttempts.findIndex(a => a.id === attemptId);
  if (attemptIndex === -1) {
    return res.status(404).json({ error: 'Attempt not found' });
  }
  
  mockData.quizAttempts.splice(attemptIndex, 1);
  saveData(mockData);
  
  res.json({
    success: true,
    message: `Quiz attempt ${attemptId} deleted successfully`,
    deleted_id: attemptId
  });
});

// Clear all quiz attempts
app.delete('/api/quiz-attempts', (req, res) => {
  console.log('🗑️ Clearing all quiz attempts');
  
  const deletedCount = mockData.quizAttempts.length;
  mockData.quizAttempts = [];
  saveData(mockData);
  
  res.json({
    success: true,
    message: `All ${deletedCount} quiz attempts cleared successfully`,
    deleted_count: deletedCount
  });
});

// Clear all quiz attempts (alternative endpoint for easier access)
app.post('/api/clear-all-attempts', (req, res) => {
  console.log('🗑️ Clearing all quiz attempts via POST endpoint');
  
  const deletedCount = mockData.quizAttempts.length;
  mockData.quizAttempts = [];
  saveData(mockData);
  
  res.json({
    success: true,
    message: `All ${deletedCount} quiz attempts cleared successfully`,
    deleted_count: deletedCount
  });
});

// User stats and attempts routes that dashboard needs
app.get('/api/users/:userId/stats', (req, res) => {
  console.log(`📊 Get user stats for user ${req.params.userId}`);
  
  // Calculate actual stats from quiz attempts
  const userAttempts = mockData.quizAttempts.filter(a => a.user_id === req.params.userId);
  const completedAttempts = userAttempts.filter(a => a.status === 'completed');
  
  const totalQuizzes = userAttempts.length;
  const completedQuizzes = completedAttempts.length;
  const averageScore = completedAttempts.length > 0 
    ? Math.round(completedAttempts.reduce((sum, a) => sum + a.score, 0) / completedAttempts.length)
    : 0;
  const completionRate = totalQuizzes > 0 ? Math.round((completedQuizzes / totalQuizzes) * 100) : 0;
  
  res.json({
    totalQuizzes,
    completedQuizzes,
    averageScore,
    completionRate,
    lastActivity: userAttempts.length > 0 ? userAttempts[userAttempts.length - 1].updated_at : null
  });
});

app.get('/api/users/:userId/quiz-attempts', (req, res) => {
  const userId = req.params.userId;
  console.log(`📝 Get quiz attempts for user ${userId}`);
  
  // Get attempts for this user and enrich with quiz and profile data
  const userAttempts = mockData.quizAttempts.filter(a => a.user_id === userId);
  
  const enrichedAttempts = userAttempts.map(attempt => {
    const quiz = mockData.quizzes.find(q => q.id === attempt.quiz_id);
    const profile = mockData.profiles.find(p => p.id === attempt.profile_id);
    
    return {
      ...attempt,
      quiz,
      profile
    };
  });
  
  res.json(enrichedAttempts);
});

app.get('/api/users/:userId/assigned-quizzes', (req, res) => {
  const userId = req.params.userId;
  console.log(`📋 Get assigned quizzes for user ${userId}`);
  
  // Find the user to get their profile name
  const user = mockData.users.find(u => u.id === userId);
  const userProfileName = user ? user.profile : null;
  const userProfile = userProfileName ? mockData.profiles.find(p => p.name === userProfileName) : null;
  
  // Get assignments: matching the user's ID OR the user's profile ID
  const userAssignments = mockData.quizAssignments.filter(a => 
    (a.user_id && String(a.user_id) === String(userId)) ||
    (!a.user_id && userProfile && String(a.profile_id) === String(userProfile.id))
  );
  
  const enrichedAssignments = userAssignments.map(assignment => {
    const quiz = mockData.quizzes.find(q => q.id === assignment.quiz_id);
    const profile = mockData.profiles.find(p => p.id === assignment.profile_id);
    
    return {
      ...assignment,
      quiz,
      profile
    };
  });
  
  res.json(enrichedAssignments);
});

// PDF Templates API
app.get('/api/pdf-templates/:quizId', (req, res) => {
  const { quizId } = req.params;
  console.log(`📄 Get PDF template for quiz ${quizId}`);
  
  try {
    // Check if a saved template exists for this quiz
    const templateFilePath = path.join(__dirname, 'data', `pdf-template-${quizId}.json`);
    
    if (fs.existsSync(templateFilePath)) {
      const savedTemplate = JSON.parse(fs.readFileSync(templateFilePath, 'utf8'));
      console.log('✅ Loaded saved PDF template for quiz:', quizId);
      res.json({ template: savedTemplate });
    } else {
      // Return default template wrapped in the expected format
      const defaultTemplate = getDefaultPDFTemplate();
      console.log('📋 Returning default PDF template for quiz:', quizId);
      res.json({ template: defaultTemplate });
    }
  } catch (error) {
    console.error('Error getting PDF template:', error);
    res.status(500).json({ error: 'Failed to get PDF template' });
  }
});

app.put('/api/pdf-templates/:quizId', (req, res) => {
  const { quizId } = req.params;
  const template = req.body;
  console.log(`💾 Save PDF template for quiz ${quizId}`);
  
  try {
    // Ensure the data directory exists
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Save template to file
    const templateFilePath = path.join(dataDir, `pdf-template-${quizId}.json`);
    fs.writeFileSync(templateFilePath, JSON.stringify(template, null, 2));
    
    console.log('✅ PDF template saved successfully to:', templateFilePath);
    res.json({ message: 'PDF template saved successfully' });
  } catch (error) {
    console.error('Error saving PDF template:', error);
    res.status(500).json({ error: 'Failed to save PDF template' });
  }
});

// Helper function to get default PDF template
function getDefaultPDFTemplate() {
  return {
    header: { 
      enabled: true, 
      backgroundColor: '#895BF5', 
      textColor: '#ffffff',
      title: 'Quiz Performance Report',
      subtitle: 'Comprehensive Analysis Report',
      logoPosition: 'left',
      showDate: true,
      dateFormat: 'MMM DD, YYYY'
    },
    userInfo: { 
      enabled: true, 
      order: 1,
      backgroundColor: '#f8fafc',
      borderColor: '#e5e7eb',
      borderRadius: 8,
      padding: 20,
      marginBottom: 20,
      showFields: {
        name: true,
        email: true,
        completionDate: true,
        completionTime: true,
        duration: true,
        attempts: true
      }
    },
    overallScore: { 
      enabled: true, 
      order: 2,
      backgroundColor: '#f8fafc',
      borderColor: '#e5e7eb',
      borderRadius: 8,
      padding: 20,
      marginBottom: 20
    },
    charts: { 
      enabled: true, 
      order: 3,
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      borderRadius: 8,
      padding: 20,
      marginBottom: 20,
      layout: 'grid',
      gridColumns: 2
    },
    sectionAnalysis: { 
      enabled: true, 
      order: 4,
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      borderRadius: 8,
      padding: 20,
      marginBottom: 20
    },
    performanceInsights: { 
      enabled: true, 
      order: 5,
      backgroundColor: '#f0f9ff',
      borderColor: '#0ea5e9',
      borderRadius: 8,
      padding: 20,
      marginBottom: 20
    },
    recommendations: { 
      enabled: true, 
      order: 6,
      backgroundColor: '#fef3c7',
      borderColor: '#f59e0b',
      borderRadius: 8,
      padding: 20,
      marginBottom: 20
    },
    footer: { 
      enabled: true, 
      order: 7,
      backgroundColor: '#f8fafc',
      borderColor: '#e5e7eb',
      padding: 20,
      marginTop: 30
    },
    page: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 30, bottom: 30, left: 30, right: 30 },
      backgroundColor: '#ffffff',
      showPageNumbers: true,
      pageNumberPosition: 'bottom-center'
    },
    typography: {
      primaryFont: 'Helvetica',
      secondaryFont: 'Arial',
      fontSizes: { h1: 28, h2: 24, h3: 20, h4: 18, h5: 16, body: 12, small: 10 }
    },
    colors: {
      primary: '#895BF5',
      secondary: '#6b7280',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#06b6d4',
      light: '#f8fafc',
      dark: '#111827',
      white: '#ffffff',
      black: '#000000'
    },
    watermark: {
      enabled: false,
      text: 'CONFIDENTIAL',
      color: 'rgba(0, 0, 0, 0.1)',
      fontSize: 48,
      rotation: -45,
      position: 'center'
    }
  };
}

// 404 handler
app.use((req, res) => {
  console.log(`❌ Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found', path: req.path });
});

app.listen(PORT, () => {
  console.log(`🚀 Auth test server running on port ${PORT}`);
  console.log(`📊 Test API at http://localhost:${PORT}/api/test`);
  console.log(`🔐 Auth API available at http://localhost:${PORT}/api/auth/*`);
  console.log(`👤 Default admin: admin@assessment.local / admin123`);
  console.log(`👤 Default user: user@assessment.local / user123`);
});

export default app;
