const API_BASE_URL = '/api';

const getToken = () => localStorage.getItem('token');
const getUser = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};

const setAuth = (token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

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

export const authService = {
  login: (email, password) => apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  register: (data) => apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMe: () => apiFetch('/auth/me'),
  changePassword: (data) => apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};

export const adminService = {
  getStats: () => apiFetch('/admin/stats'),
  getUsers: (role) => apiFetch(`/admin/users${role ? `?role=${role}` : ''}`),
  createUser: (data) => apiFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateUser: (id, data) => apiFetch(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteUser: (id) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
  
  getCategories: () => apiFetch('/categories'),
  createCategory: (data) => apiFetch('/categories', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateCategory: (id, data) => apiFetch(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteCategory: (id) => apiFetch(`/categories/${id}`, { method: 'DELETE' }),
  
  getEnrollments: () => apiFetch('/admin/enrollments'),
  enrollStudent: (data) => apiFetch('/admin/enrollments', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  removeEnrollment: (studentId, categoryId) => apiFetch(`/admin/enrollments/${studentId}/${categoryId}`, {
    method: 'DELETE'
  }),
  
  getPurchases: (status) => apiFetch(`/admin/purchases${status ? `?status=${status}` : ''}`),
  updatePurchaseStatus: (id, status) => apiFetch(`/admin/purchases/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }),
  
  getAttendance: (date) => apiFetch(`/admin/attendance${date ? `?date=${date}` : ''}`),
  markAttendance: (data) => apiFetch('/admin/attendance', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};

export const teacherService = {
  getVideos: () => apiFetch('/teacher/videos'),
  uploadVideo: (formData) => apiFetchMultipart('/videos', formData),
  deleteVideo: (id) => apiFetch(`/videos/${id}`, { method: 'DELETE' }),
  getCategories: () => apiFetch('/categories')
};

export const studentService = {
  getAvailableCourses: () => apiFetch('/student/available-courses'),
  getMyCourses: () => apiFetch('/student/enrollments'),
  getVideos: (categoryId) => apiFetch(`/student/course/${categoryId}/videos`),
  getVideo: (id) => apiFetch(`/student/videos/${id}`),
  recordView: (id) => apiFetch(`/videos/${id}/view`, { method: 'POST' }),
  saveVideoProgress: (data) => apiFetch('/student/video-progress', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getVideoProgress: (courseId) => apiFetch(`/student/course/${courseId}/progress`),
  
  getPurchases: () => apiFetch('/student/purchases'),
  createPurchase: (categoryId) => apiFetch('/student/purchases', {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId })
  }),
  
  getNotes: () => apiFetch('/student/notes'),
  createNote: (data) => apiFetch('/student/notes', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateNote: (id, data) => apiFetch(`/student/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteNote: (id) => apiFetch(`/student/notes/${id}`, { method: 'DELETE' }),
  
  getAttendance: () => apiFetch('/student/attendance')
};

export { getUser, getToken, setAuth, clearAuth, apiFetch };
