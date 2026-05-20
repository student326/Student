const API_BASE_URL = '/api';

// Get stored token
const getToken = () => localStorage.getItem('token');

// Get stored user
const getUser = () => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

// Set auth data
const setAuth = (token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

// Clear auth data
const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// Generic fetch wrapper
const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    }
  };
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || 'An error occurred');
  }
  
  return response.json();
};

// Fetch with multipart form data (for file uploads)
const apiFetchMultipart = async (endpoint, formData) => {
  const token = getToken();
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || 'An error occurred');
  }
  
  return response.json();
};

// Auth API
export const authAPI = {
  login: (email, password) => apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  
  register: (data) => apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  getMe: () => apiFetch('/auth/me')
};

// Admin API
export const adminAPI = {
  getStats: () => apiFetch('/admin/stats'),
  getStudents: () => apiFetch('/admin/students'),
  createStudent: (data) => apiFetch('/admin/students', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateStudent: (id, data) => apiFetch(`/admin/students/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteStudent: (id) => apiFetch(`/admin/students/${id}`, {
    method: 'DELETE'
  }),
  getTeachers: () => apiFetch('/admin/teachers'),
  createTeacher: (data) => apiFetch('/admin/teachers', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateTeacher: (id, data) => apiFetch(`/admin/teachers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteTeacher: (id) => apiFetch(`/admin/teachers/${id}`, {
    method: 'DELETE'
  }),
  getCategories: () => apiFetch('/admin/categories'),
  createCategory: (data) => apiFetch('/admin/categories', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateCategory: (id, data) => apiFetch(`/admin/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteCategory: (id) => apiFetch(`/admin/categories/${id}`, {
    method: 'DELETE'
  }),
  getAttendance: (date) => apiFetch(`/admin/attendance${date ? `?date=${date}` : ''}`),
  markAttendance: (data) => apiFetch('/admin/attendance', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getVideos: () => apiFetch('/admin/videos'),
  createVideo: (data) => apiFetch('/admin/videos', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getEnrollments: () => apiFetch('/admin/enrollments'),
  enrollStudent: (data) => apiFetch('/admin/enrollments', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  removeEnrollment: (studentId, categoryId) => apiFetch(`/admin/enrollments/${studentId}/${categoryId}`, {
    method: 'DELETE'
  }),
  grantAccess: (data) => apiFetch('/admin/grant-access', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getPurchases: (status) => apiFetch(`/admin/purchases${status ? `?status=${status}` : ''}`),
  updatePurchaseStatus: (id, status) => apiFetch(`/admin/purchases/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }),
  
  // Notification APIs
  getNotifications: () => apiFetch('/admin/notifications'),
  getUnreadCount: () => apiFetch('/admin/notifications/unread-count'),
  markAsRead: (id) => apiFetch(`/admin/notifications/${id}/read`, {
    method: 'PUT'
  }),
  markAllAsRead: () => apiFetch('/admin/notifications/mark-all-read', {
    method: 'PUT'
  }),
  deleteNotification: (id) => apiFetch(`/admin/notifications/${id}`, {
    method: 'DELETE'
  }),
  
  // Admin Management APIs
  getAdmins: () => apiFetch('/admin/admins'),
  createAdmin: (data) => apiFetch('/admin/admins', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteAdmin: (id) => apiFetch(`/admin/admins/${id}`, {
    method: 'DELETE'
  }),
  getUsers: () => apiFetch('/admin/users'),
  promoteToAdmin: (id) => apiFetch(`/admin/users/${id}/promote`, {
    method: 'PUT'
  })
};

// Teacher API
export const teacherAPI = {
  getVideos: () => apiFetch('/teacher/videos'),
  getStats: () => apiFetch('/teacher/stats'),
  getCategories: () => apiFetch('/teacher/categories'),
  createVideo: async (data) => {
    // If there's a video file, use multipart form data
    if (data.videoFile) {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('description', data.description || '');
      formData.append('categoryId', data.categoryId || '');
      formData.append('videoFile', data.videoFile);
      if (data.thumbnailUrl) {
        formData.append('thumbnailUrl', data.thumbnailUrl);
      }
      return apiFetchMultipart('/teacher/videos', formData);
    }
    // Otherwise use regular JSON
    return apiFetch('/teacher/videos', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  updateVideo: (id, data) => apiFetch(`/teacher/videos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteVideo: (id) => apiFetch(`/teacher/videos/${id}`, {
    method: 'DELETE'
  }),
  getVideoViews: (id) => apiFetch(`/teacher/videos/${id}/views`)
};

// Student API
export const studentAPI = {
  getEnrollments: () => apiFetch('/student/enrollments'),
  getVideos: (categoryId) => apiFetch(`/student/videos${categoryId ? `?categoryId=${categoryId}` : ''}`),
  getVideo: (id) => apiFetch(`/student/videos/${id}`),
  recordView: (id) => apiFetch(`/student/videos/${id}/view`, {
    method: 'POST'
  }),
  getNotes: (videoId) => apiFetch(`/student/notes${videoId ? `?videoId=${videoId}` : ''}`),
  saveNote: (data) => apiFetch('/student/notes', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateNote: (id, data) => apiFetch(`/student/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  getAttendance: (month) => apiFetch(`/student/attendance${month ? `?month=${month}` : ''}`),
  getAvailableCourses: () => apiFetch('/student/available-courses'),
  purchaseCourse: (categoryId, paymentMethod, receiptNumber) => apiFetch('/student/purchase-course', {
    method: 'POST',
    body: JSON.stringify({ categoryId, paymentMethod, receiptNumber })
  }),
  getPurchaseStatus: (categoryId) => apiFetch(`/student/purchase-status/${categoryId}`),
  getPurchaseHistory: () => apiFetch('/student/purchase-history')
};

export { getToken, getUser, setAuth, clearAuth };
