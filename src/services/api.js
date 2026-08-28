// API service to replace direct SQLite calls in the browser
// const API_BASE = import.meta.env.DEV
//   ? '/api'
//   : 'https://happimynd.com/new_api';
const API_BASE = 'https://happimynd.com/new_api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// Identify the current actor to the backend so it can enforce role-based
// access (Super Admin / Admin / user). The server reads the x-user-id header.
function authHeaders() {
  try {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      const user = JSON.parse(stored);
      if (user && user.id) {
        return { 'x-user-id': String(user.id), 'x-user-role': user.role || '' };
      }
    }
  } catch {
    /* ignore malformed currentUser */
  }
  return {};
}

async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...authHeaders(),
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      let errMsg = `HTTP ${response.status}`;
      if (errorData.error) {
        errMsg = errorData.error;
      } else if (errorData.message) {
        errMsg = errorData.message;
      } else if (errorData.detail) {
        errMsg = typeof errorData.detail === 'string'
          ? errorData.detail
          : JSON.stringify(errorData.detail);
      }
      throw new ApiError(errMsg, response.status);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('API call failed:', error);
    throw new ApiError('Network error - please check your connection', 0);
  }
}

// Auth API
export const authApi = {
  async signUp(email, password, role = 'user', user_name, profile, onboardingCode) {
    return await apiCall('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, role, user_name, profile, onboardingCode }),
    });
  },

  async verifyOnboardingCode(code) {
    return await apiCall(`/auth/verify-code?code=${encodeURIComponent(code)}`);
  },

  async signIn(email, password) {
    return await apiCall('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async signOut() {
    return await apiCall('/auth/signout', { method: 'POST' });
  },

  async getUser() {
    return await apiCall('/auth/user');
  }
};

// Profile API
export const profileApi = {
  async getAllProfiles() {
    return await apiCall('/profiles');
  },

  async createProfile(profile) {
    return await apiCall('/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  },

  async updateProfile(id, updates) {
    return await apiCall(`/profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteProfile(id) {
    return await apiCall(`/profiles/${id}`, { method: 'DELETE' });
  }
};

// Organization API
export const organizationApi = {
  async getAllOrganizations() {
    return await apiCall('/organizations');
  },

  async createOrganization(org) {
    return await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify(org),
    });
  },

  async updateOrganization(id, updates) {
    return await apiCall(`/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteOrganization(id) {
    return await apiCall(`/organizations/${id}`, { method: 'DELETE' });
  },

  async regenerateOnboardingCode(id) {
    return await apiCall(`/organizations/${id}/regenerate-code`, { method: 'POST' });
  }
};

// Employee API
export const employeeApi = {
  async getEmployeesByOrg(orgId) {
    return await apiCall(`/organizations/${orgId}/employees`);
  },

  async importEmployees(orgId, employees) {
    return await apiCall(`/organizations/${orgId}/employees/import`, {
      method: 'POST',
      body: JSON.stringify({ employees })
    });
  },

  async deleteEmployee(id) {
    return await apiCall(`/employees/${id}`, { method: 'DELETE' });
  }
};

// Code Generation API
export const codeGenerationApi = {
  // Create a new custom or random multi-use signup code for an org
  async createCode(orgId, { codeType, customCode, maxSignups }) {
    return await apiCall(`/organizations/${orgId}/codes`, {
      method: 'POST',
      body: JSON.stringify({ codeType, customCode, maxSignups }),
    });
  },

  // List all generated codes for an org
  async getCodesByOrg(orgId) {
    return await apiCall(`/organizations/${orgId}/codes`);
  },

  // Activate or deactivate a generated code
  async updateCodeStatus(orgId, codeId, status) {
    return await apiCall(`/organizations/${orgId}/codes/${codeId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },
};

// Packet API
export const packetApi = {
  async getAllPackets() {
    return await apiCall('/packets');
  },

  async createPacket(packet) {
    return await apiCall('/packets', {
      method: 'POST',
      body: JSON.stringify(packet),
    });
  },

  async updatePacket(id, updates) {
    return await apiCall(`/packets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deletePacket(id) {
    return await apiCall(`/packets/${id}`, { method: 'DELETE' });
  }
};

// Question API
export const questionApi = {
  async getQuestions(packetId) {
    return await apiCall(`/questions?packet_id=${packetId}`);
  },

  async createQuestion(question) {
    return await apiCall('/questions', {
      method: 'POST',
      body: JSON.stringify(question),
    });
  },

  async updateQuestion(id, updates) {
    return await apiCall(`/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteQuestion(id) {
    return await apiCall(`/questions/${id}`, { method: 'DELETE' });
  }
};

// Quiz API
export const quizApi = {
  async getAllQuizzes() {
    return await apiCall('/quizzes');
  },

  async getQuizById(id) {
    return await apiCall(`/quizzes/${id}`);
  },

  async createQuiz(quiz) {
    return await apiCall('/quizzes', {
      method: 'POST',
      body: JSON.stringify(quiz),
    });
  },

  async updateQuiz(id, updates) {
    return await apiCall(`/quizzes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteQuiz(id) {
    return await apiCall(`/quizzes/${id}`, { method: 'DELETE' });
  },

  async getAllQuizAssignments() {
    return await apiCall('/quiz-assignments');
  },

  async assignQuizToProfiles(quizId, profileIds) {
    return await apiCall('/quiz-assignments', {
      method: 'POST',
      body: JSON.stringify({ quizId, quiz_id: quizId, profileIds }),
    });
  },

  async removeQuizAssignment(profileId, quizId) {
    return await apiCall(`/quiz-assignments/profile/${profileId}/quiz/${quizId}`, {
      method: 'DELETE',
    });
  },

  async assignQuizToUsers(quizId, userIds) {
    return await apiCall('/quiz-assignments', {
      method: 'POST',
      body: JSON.stringify({ quizId, quiz_id: quizId, userIds }),
    });
  },

  async removeUserQuizAssignment(userId, quizId) {
    return await apiCall(`/quiz-assignments/user/${userId}/quiz/${quizId}`, {
      method: 'DELETE',
    });
  }
};

// Quiz Packet API
export const quizPacketApi = {
  async getQuizPackets(quizId) {
    return await apiCall(`/quiz-packets/${quizId}`);
  },

  async addPacketsToQuiz(quizId, packetIds) {
    return await apiCall(`/quiz-packets/${quizId}`, {
      method: 'POST',
      body: JSON.stringify({ packetIds }),
    });
  },

  async removePacketsFromQuiz(quizId, packetIds) {
    return await apiCall(`/quiz-packets/${quizId}`, {
      method: 'DELETE',
      body: JSON.stringify({ packetIds }),
    });
  }
};

// User API
export const userApi = {
  async getAllUsers() {
    return await apiCall('/users');
  },

  async getUserById(id) {
    return await apiCall(`/users/${id}`);
  },

  async getUserQuizAttempts(userId) {
    return await apiCall(`/users/${userId}/quiz-attempts`);
  },

  async getAllQuizAttempts() {
    return await apiCall('/quiz-attempts');
  },

  async getUserStats(userId) {
    return await apiCall(`/users/${userId}/stats`);
  },

  async getAssignedQuizzesForUser(userId) {
    return await apiCall(`/users/${userId}/assigned-quizzes`);
  },

  async createQuizAttempt(attemptData) {
    return await apiCall('/quiz-attempts', {
      method: 'POST',
      body: JSON.stringify(attemptData),
    });
  },

  async updateQuizAttempt(id, attemptData) {
    return await apiCall(`/quiz-attempts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(attemptData),
    });
  },

  // --- Access-control: user management (role-gated on the server) ---

  // Admin/Super Admin: add a user with initial password + dashboard views.
  async createUser({ email, password, user_name, profile, role = 'user', permissions = [], organization_id = null, gender }) {
    return await apiCall('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email, password, user_name, profile, role, permissions, organization_id,
        ...(gender ? { gender } : {}),
      }),
    });
  },

  // Update a user's dashboard view permissions (locked changes need Super Admin).
  async updateUserPermissions(userId, permissions) {
    return await apiCall(`/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  },

  // Set onboarding password (Admin, once) or reset it (Super Admin).
  async setUserPassword(userId, password) {
    return await apiCall(`/users/${userId}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  // Remove a user (Super Admin only).
  async deleteUser(userId) {
    return await apiCall(`/users/${userId}`, { method: 'DELETE' });
  },

  // Read the permission-action audit log (Super Admin only).
  async getAuditLog() {
    return await apiCall('/audit-log');
  }
};

// PDF Template API
export const pdfTemplateApi = {
  async getTemplate(quizId) {
    return await apiCall(`/pdf-templates/${quizId}`);
  }
};
