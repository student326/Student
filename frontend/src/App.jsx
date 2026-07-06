import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { paymentConfig } from './config/paymentConfig';
import './App.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, LineElement, PointElement);

// ==================== API CONFIG ====================
const API_URL = '/api';

// Token refresh state
let isRefreshing = false;
let refreshSubscribers = [];

// Subscribe to token refresh
const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

// Notify all subscribers when token is refreshed
const onTokenRefreshed = (token) => {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
};

// API fetch with auto-refresh
const apiFetch = async (endpoint, options = {}) => {
  let token = localStorage.getItem('accessToken');
  
  const config = {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    }
  };
  
  let response = await fetch(`${API_URL}${endpoint}`, config);
  
  // If token expired, try to refresh
  if (response.status === 401 && token) {
    if (!isRefreshing) {
      isRefreshing = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          token = data.accessToken;
          onTokenRefreshed(token);
        } else {
          // Refresh failed - logout
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
          throw new Error('Session expired');
        }
      } catch (err) {
        throw err;
      } finally {
        isRefreshing = false;
      }
    } else {
      // Wait for token refresh
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          const retryConfig = {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newToken}`,
              ...options.headers
            }
          };
          fetch(`${API_URL}${endpoint}`, retryConfig)
            .then(resolve)
            .catch(reject);
        });
      });
    }
    
    // Retry with new token
    const retryConfig = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    };
    response = await fetch(`${API_URL}${endpoint}`, retryConfig);
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message);
  }
  return response.json();
};

// API upload with auth
const apiUpload = async (endpoint, formData) => {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
    body: formData
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message);
  }
  return response.json();
};

// ==================== AUTH CONTEXT ====================
const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const userData = await apiFetch('/auth/me');
          setUser(userData);
          localStorage.setItem('user', JSON.stringify(userData));
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (email, password) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }
    
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext);

// ==================== THEME CONTEXT ====================
const ThemeContext = createContext(null);

const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(!darkMode);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

const useTheme = () => useContext(ThemeContext);

// ==================== THEME TOGGLE ====================
const ThemeToggle = () => {
  const { darkMode, toggleTheme } = useTheme();
  
  return (
    <button className="theme-toggle" onClick={toggleTheme} title={darkMode ? 'Light Mode' : 'Dark Mode'}>
      {darkMode ? '☀️' : '🌙'}
    </button>
  );
};

// ==================== NOTIFICATION CONTEXT ====================
const NotificationContext = createContext(null);

const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const { user } = useAuth();

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/notifications');
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user, fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, showDropdown, setShowDropdown, markAsRead, fetchNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
};

const useNotifications = () => useContext(NotificationContext);

// ==================== NOTIFICATION BELL ====================
const NotificationBell = () => {
  const { notifications, unreadCount, showDropdown, setShowDropdown, markAsRead } = useNotifications();
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowDropdown]);

  if (!notifications.length) return null;

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button className="notification-bell" onClick={() => setShowDropdown(!showDropdown)}>
        🔔
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>
      {showDropdown && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>Notifications</h4>
          </div>
          <div className="notification-list">
            {notifications.slice(0, 10).map(notif => (
              <div 
                key={notif.id} 
                className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                onClick={() => !notif.is_read && markAsRead(notif.id)}
              >
                <div className="notification-icon">{notif.type === 'enrollment' ? '✅' : notif.type === 'payment' ? '💰' : 'ℹ️'}</div>
                <div className="notification-content">
                  <p>{notif.message}</p>
                  <small>{new Date(notif.created_at).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== TOAST COMPONENT ====================
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button onClick={onClose}>×</button>
    </div>
  );
};

// ==================== LOADING SPINNER ====================
const LoadingSpinner = () => (
  <div className="loading-container">
    <div className="spinner"></div>
    <p>Loading...</p>
  </div>
);

// ==================== PROTECTED ROUTE ====================
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />;
  }
  return children;
};

// ==================== LOGIN PAGE ====================
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(`/${user.role}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="logo"><img src="/mp360-logo.png" alt="Markpro360 Student Portal" /></div>
          <p>Learning Management System</p>
        </div>
        
        {error && <div className="alert alert-danger animate-shake">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        

      </div>
    </div>
  );
};

// ==================== ADMIN DASHBOARD ====================
const AdminDashboard = () => {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await apiFetch('/admin/stats');
      setStats(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type) => setToast({ message, type });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
        {mobileMenuOpen ? '✕' : '☰'}
      </button>
      <div className={`sidebar-overlay ${mobileMenuOpen ? 'show' : ''}`} onClick={() => setMobileMenuOpen(false)} />
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src="/mp360-logo.png" alt="Markpro360 Student Portal" className="sidebar-logo" />
        </div>
        <nav className="nav-menu" onClick={() => setMobileMenuOpen(false)}>
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
            📊 Dashboard
          </button>
          <button className={activeTab === 'categories' ? 'active' : ''} onClick={() => setActiveTab('categories')}>
            📚 Courses
          </button>
          <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
            👥 Users
          </button>
          <button className={activeTab === 'enrollments' ? 'active' : ''} onClick={() => setActiveTab('enrollments')}>
            🎓 Enrollments
          </button>

          <button className={activeTab === 'purchases' ? 'active' : ''} onClick={() => setActiveTab('purchases')}>
            💰 Purchases {stats.pendingPurchases > 0 && <span className="badge">{stats.pendingPurchases}</span>}
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <span>{user?.name}</span>
            <small>Administrator</small>
          </div>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </aside>
      
      <main className="main-content">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        
        <div className="top-bar">
          <h1>{activeTab === 'dashboard' ? 'Dashboard Overview' : activeTab === 'categories' ? 'Courses' : activeTab === 'users' ? 'User Management' : activeTab === 'enrollments' ? 'Enrollments' : activeTab === 'purchases' ? 'Purchase Requests' : ''}</h1>
          <div className="top-bar-actions">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
        
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>👨‍🎓</div>
                <div className="stat-info">
                  <h3>{stats.students || 0}</h3>
                  <p>Students</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f093fb, #f5576c)' }}>👨‍🏫</div>
                <div className="stat-info">
                  <h3>{stats.teachers || 0}</h3>
                  <p>Teachers</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #4facfe, #00f2fe)' }}>📚</div>
                <div className="stat-info">
                  <h3>{stats.courses || 0}</h3>
                  <p>Courses</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)' }}>🎬</div>
                <div className="stat-info">
                  <h3>{stats.videos || 0}</h3>
                  <p>Videos</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #fa709a, #fee140)' }}>👁️</div>
                <div className="stat-info">
                  <h3>{stats.totalViews || 0}</h3>
                  <p>Total Views</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' }}>⏳</div>
                <div className="stat-info">
                  <h3>{stats.pendingPurchases || 0}</h3>
                  <p>Pending</p>
                </div>
              </div>
            </div>

            <div className="charts-grid">
              <div className="chart-card">
                <h3>Platform Overview</h3>
                <div className="chart-container">
                  <Bar data={{
                    labels: ['Students', 'Teachers', 'Courses', 'Videos'],
                    datasets: [{
                      label: 'Count',
                      data: [stats.students || 0, stats.teachers || 0, stats.courses || 0, stats.videos || 0],
                      backgroundColor: ['#667eea', '#f5576c', '#4facfe', '#43e97b']
                    }]
                  }} options={{ responsive: true, maintainAspectRatio: true }} />
                </div>
              </div>
              <div className="chart-card">
                <h3>Content Distribution</h3>
                <div className="chart-container doughnut">
                  <Doughnut data={{
                    labels: ['Students', 'Teachers', 'Courses'],
                    datasets: [{
                      data: [stats.students || 0, stats.teachers || 0, stats.courses || 0],
                      backgroundColor: ['#667eea', '#f5576c', '#4facfe']
                    }]
                  }} options={{ responsive: true, maintainAspectRatio: true }} />
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'categories' && <CategoriesTab showToast={showToast} onUpdate={loadStats} />}
        {activeTab === 'users' && <UsersTab showToast={showToast} />}
        {activeTab === 'enrollments' && <EnrollmentsTab showToast={showToast} />}

        {activeTab === 'purchases' && <PurchasesTab showToast={showToast} onUpdate={loadStats} />}
      </main>
    </div>
  );
};

// ==================== CATEGORIES TAB ====================
const CategoriesTab = ({ showToast, onUpdate }) => {
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', price: 0, icon: '📚', color: '#1e40af' });

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    try {
      const data = await apiFetch('/categories');
      setCategories(data);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await apiFetch(`/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        showToast('Course updated successfully!', 'success');
      } else {
        await apiFetch('/categories', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        showToast('Course created successfully!', 'success');
      }
      setShowModal(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '', price: 0, icon: '📚', color: '#1e40af' });
      loadCategories();
      onUpdate();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this course?')) return;
    try {
      await apiFetch(`/categories/${id}`, { method: 'DELETE' });
      showToast('Course deleted successfully!', 'success');
      loadCategories();
      onUpdate();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openEdit = (cat) => {
    setEditingCategory(cat);
    setFormData({ name: cat.name, description: cat.description, price: cat.price, icon: cat.icon, color: cat.color });
    setShowModal(true);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Courses</h1>
        <button className="btn btn-primary" onClick={() => { setEditingCategory(null); setShowModal(true); }}>
          + Add Course
        </button>
      </div>

      <div className="categories-grid">
        {categories.map(cat => (
          <div key={cat.id} className="category-card" style={{ borderLeftColor: cat.color }}>
            <div className="category-header" style={{ background: cat.color }}>
              <span className="category-icon">{cat.icon}</span>
              <h3>{cat.name}</h3>
            </div>
            <div className="category-body">
              <p>{cat.description}</p>
              <div className="category-meta">
                <span className="price">RS {cat.price?.toLocaleString()}</span>
                <span>{cat.video_count} videos</span>
              </div>
            </div>
            <div className="category-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(cat)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCategory ? 'Edit Course' : 'Add New Course'}</h2>
              <button onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Course Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Amazon Web Services"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Course description"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Price (RS)</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={e => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                  min="0"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Icon (Emoji)</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="📚"
                    maxLength={2}
                  />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-block">
                {editingCategory ? 'Update Course' : 'Create Course'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== USERS TAB ====================
const UsersTab = ({ showToast }) => {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'student' });

  useEffect(() => { loadUsers(); }, [filter]);

  const loadUsers = async () => {
    try {
      const endpoint = filter === 'all' ? '/admin/users' : `/admin/users?role=${filter}`;
      const data = await apiFetch(endpoint);
      setUsers(data);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const updateData = { name: formData.name, email: formData.email };
        if (formData.password) updateData.password = formData.password;
        await apiFetch(`/admin/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(updateData)
        });
        showToast('User updated successfully!', 'success');
      } else {
        await apiFetch('/admin/users', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        showToast('User created successfully!', 'success');
      }
      setShowModal(false);
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', role: 'student' });
      loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
      showToast('User deleted successfully!', 'success');
      loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({ name: user.name, email: user.email, password: '', role: user.role });
    setShowModal(true);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>User Management</h1>
        <button className="btn btn-primary" onClick={() => { setEditingUser(null); setShowModal(true); }}>
          + Add User
        </button>
      </div>

      <div className="filter-tabs">
        {['all', 'student', 'teacher', 'admin'].map(role => (
          <button
            key={role}
            className={filter === role ? 'active' : ''}
            onClick={() => setFilter(role)}
          >
            {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1) + 's'}
          </button>
        ))}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="user-cell">
                    <div className="avatar" style={{
                      background: u.role === 'admin' ? '#9B59B6' : u.role === 'teacher' ? '#3498DB' : '#2ECC71'
                    }}>
                      {u.name.charAt(0)}
                    </div>
                    <span>{u.name}</span>
                  </div>
                </td>
                <td>{u.email}</td>
                <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password {editingUser && '(leave empty to keep current)'}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  disabled={editingUser?.role === 'admin'}
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-block">
                {editingUser ? 'Update User' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== ENROLLMENTS TAB ====================
const EnrollmentsTab = ({ showToast }) => {
  const [enrollments, setEnrollments] = useState([]);
  const [students, setStudents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ student_id: '', category_id: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [enrollData, usersData, catsData] = await Promise.all([
        apiFetch('/admin/enrollments'),
        apiFetch('/admin/users?role=student'),
        apiFetch('/categories')
      ]);
      setEnrollments(enrollData);
      setStudents(usersData);
      setCategories(catsData);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/enrollments', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      showToast('Student enrolled successfully!', 'success');
      setShowModal(false);
      setFormData({ student_id: '', category_id: '' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemove = async (studentId, categoryId) => {
    if (!confirm('Remove this enrollment?')) return;
    try {
      await apiFetch(`/admin/enrollments/${studentId}/${categoryId}`, { method: 'DELETE' });
      showToast('Enrollment removed!', 'success');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Course Enrollments</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Enroll Student
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Email</th>
              <th>Course</th>
              <th>Enrolled Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map(en => (
              <tr key={en.id}>
                <td>{en.student_name}</td>
                <td>{en.student_email}</td>
                <td>{en.course_name}</td>
                <td>{new Date(en.enrolled_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRemove(en.student_id, en.category_id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Enroll Student in Course</h2>
              <button onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleEnroll}>
              <div className="form-group">
                <label>Select Student</label>
                <select
                  value={formData.student_id}
                  onChange={e => setFormData({ ...formData, student_id: e.target.value })}
                  required
                >
                  <option value="">Choose a student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Select Course</label>
                <select
                  value={formData.category_id}
                  onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                  required
                >
                  <option value="">Choose a course...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-block">
                Enroll Student
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== ATTENDANCE TAB ====================
const AttendanceTab = ({ showToast }) => {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [formData, setFormData] = useState({ student_id: '', status: 'present' });

  useEffect(() => { loadData(); }, [selectedDate]);

  const loadData = async () => {
    try {
      const [usersData, attData] = await Promise.all([
        apiFetch('/admin/users?role=student'),
        apiFetch(`/admin/attendance?date=${selectedDate}`)
      ]);
      setStudents(usersData);
      setAttendance(attData);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleMark = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/attendance', {
        method: 'POST',
        body: JSON.stringify({ ...formData, date: selectedDate })
      });
      showToast('Attendance marked!', 'success');
      setFormData({ student_id: '', status: 'present' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const getStatusForStudent = (studentId) => {
    const record = attendance.find(a => a.student_id === studentId);
    return record?.status || null;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Attendance Management</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="date-input"
        />
      </div>

      <div className="attendance-section">
        <div className="mark-attendance">
          <h3>Mark Attendance</h3>
          <form onSubmit={handleMark} className="attendance-form">
            <select
              value={formData.student_id}
              onChange={e => setFormData({ ...formData, student_id: e.target.value })}
              required
            >
              <option value="">Select Student</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
            </select>
            <button type="submit" className="btn btn-primary">Mark</button>
          </form>
        </div>

        <div className="attendance-list">
          <h3>Attendance for {new Date(selectedDate).toLocaleDateString()}</h3>
          <div className="attendance-grid">
            {students.map(s => {
              const status = getStatusForStudent(s.id);
              return (
                <div key={s.id} className={`attendance-card ${status || ' unmarked'}`}>
                  <div className="avatar">{s.name.charAt(0)}</div>
                  <span className="name">{s.name}</span>
                  {status && (
                    <span className={`status status-${status}`}>
                      {status === 'present' ? '✓' : status === 'absent' ? '✗' : '⏰'} {status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== PURCHASES TAB ====================
const PurchasesTab = ({ showToast, onUpdate }) => {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadPurchases();
  }, []);

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/purchases');
      console.log('Purchases data:', data);
      setPurchases(data);
    } catch (err) {
      console.error('Load purchases error:', err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id, studentId, categoryId) => {
    try {
      await apiFetch(`/admin/purchases/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'approved' })
      });
      showToast('Purchase approved and student enrolled!', 'success');
      loadPurchases();
      onUpdate();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReject = async (id) => {
    if (!confirm('Are you sure you want to reject this purchase?')) return;
    try {
      await apiFetch(`/admin/purchases/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'rejected' })
      });
      showToast('Purchase rejected', 'success');
      loadPurchases();
      onUpdate();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const filteredPurchases = filter === 'all' 
    ? purchases 
    : purchases.filter(p => p.status === filter);

  if (loading) return <LoadingSpinner />;

  const pendingCount = purchases.filter(p => p.status === 'pending').length;
  const approvedCount = purchases.filter(p => p.status === 'approved').length;
  const rejectedCount = purchases.filter(p => p.status === 'rejected').length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button className="btn btn-secondary" onClick={loadPurchases}>
          🔄 Refresh
        </button>
      </div>
      <div className="stats-row">
        <div className="stat-card small" onClick={() => setFilter('pending')} style={{ cursor: 'pointer' }}>
          <h3 style={{ color: '#f59e0b' }}>{pendingCount}</h3>
          <p>Pending</p>
        </div>
        <div className="stat-card small" onClick={() => setFilter('approved')} style={{ cursor: 'pointer' }}>
          <h3 style={{ color: '#10b981' }}>{approvedCount}</h3>
          <p>Approved</p>
        </div>
        <div className="stat-card small" onClick={() => setFilter('rejected')} style={{ cursor: 'pointer' }}>
          <h3 style={{ color: '#ef4444' }}>{rejectedCount}</h3>
          <p>Rejected</p>
        </div>
        <div className="stat-card small" onClick={() => setFilter('all')} style={{ cursor: 'pointer' }}>
          <h3>{purchases.length}</h3>
          <p>Total</p>
        </div>
      </div>

      {filteredPurchases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>No {filter === 'all' ? '' : filter} purchases found</h3>
          <p>Purchase requests will appear here</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Email</th>
                <th>Course</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Receipt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map(purchase => (
                <tr key={purchase.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{purchase.student_name?.charAt(0).toUpperCase()}</div>
                      <span>{purchase.student_name}</span>
                    </div>
                  </td>
                  <td>{purchase.student_email}</td>
                  <td>
                    <span className="category-badge" style={{ background: purchase.category_color }}>
                      {purchase.category_icon} {purchase.category_name}
                    </span>
                  </td>
                  <td><strong>RS {purchase.amount?.toLocaleString()}</strong></td>
                  <td>
                    <span className={`status-badge status-${purchase.status}`}>
                      {purchase.status === 'pending' && '⏳ Pending'}
                      {purchase.status === 'approved' && '✅ Approved'}
                      {purchase.status === 'rejected' && '❌ Rejected'}
                    </span>
                  </td>
                  <td>{new Date(purchase.created_at).toLocaleDateString()}</td>
                  <td>
                    {purchase.payment_receipt ? (
                      <a 
                        href={`${API_URL}${purchase.payment_receipt}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="receipt-link"
                        title="Click to view full image"
                      >
                        🖼️ View Receipt
                      </a>
                    ) : (
                      <span className="text-muted">No Receipt</span>
                    )}
                  </td>
                  <td>
                    {purchase.status === 'pending' && (
                      <div className="action-buttons">
                        <button 
                          className="btn btn-success btn-sm"
                          onClick={() => handleApprove(purchase.id, purchase.student_id, purchase.category_id)}
                        >
                          Approve
                        </button>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleReject(purchase.id)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {purchase.status !== 'pending' && (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== TEACHER DASHBOARD ====================
const TeacherDashboard = () => {
  const [activeTab, setActiveTab] = useState('videos');
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', category_id: '' });
  const [liveFormData, setLiveFormData] = useState({ title: '', description: '', meetingUrl: '', startTime: '', categoryId: '' });
  const [videoFile, setVideoFile] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [videosData, catsData, liveData] = await Promise.all([
        apiFetch('/teacher/videos'),
        apiFetch('/categories'),
        apiFetch('/live-classes')
      ]);
      setVideos(videosData);
      setCategories(catsData);
      setLiveClasses(liveData);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type) => setToast({ message, type });

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!videoFile) {
      showToast('Please select a video file', 'error');
      return;
    }

    setUploading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('category_id', formData.category_id);
      formDataToSend.append('video', videoFile);

      await apiUpload('/videos', formDataToSend);
      showToast('Video uploaded successfully!', 'success');
      setShowModal(false);
      setFormData({ title: '', description: '', category_id: '' });
      setVideoFile(null);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this video?')) return;
    try {
      await apiFetch(`/videos/${id}`, { method: 'DELETE' });
      showToast('Video deleted!', 'success');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteLiveClass = async (id) => {
    if (!confirm('Delete this live class?')) return;
    try {
      await apiFetch(`/live-classes/${id}`, { method: 'DELETE' });
      showToast('Live class deleted!', 'success');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleScheduleLiveClass = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/live-classes', {
        method: 'POST',
        body: JSON.stringify({ ...liveFormData, startTime: new Date(liveFormData.startTime).toISOString() })
      });
      showToast('Live Class Scheduled!', 'success');
      setShowLiveModal(false);
      setLiveFormData({ title: '', description: '', meetingUrl: '', startTime: '', categoryId: '' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleGenerateTranscript = async () => {
    if (!selectedVideoId) return;
    try {
      // Mock AI generation
      const mockTranscripts = [
        { startSec: 0, endSec: 5, text: "Welcome to this lecture." },
        { startSec: 5, endSec: 10, text: "Today we will discuss an important topic." },
        { startSec: 10, endSec: 20, text: "Let's dive into the core concepts." }
      ];
      await apiFetch(`/videos/${selectedVideoId}/transcripts`, {
        method: 'POST',
        body: JSON.stringify({ transcripts: mockTranscripts })
      });
      showToast('Transcripts generated and saved successfully!', 'success');
      setShowTranscriptModal(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
        {mobileMenuOpen ? '✕' : '☰'}
      </button>
      <div className={`sidebar-overlay ${mobileMenuOpen ? 'show' : ''}`} onClick={() => setMobileMenuOpen(false)} />
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src="/mp360-logo.png" alt="Markpro360 Student Portal" className="sidebar-logo" />
        </div>
        <nav className="nav-menu" onClick={() => setMobileMenuOpen(false)}>
          <button className={activeTab === 'videos' ? 'active' : ''} onClick={() => setActiveTab('videos')}>📊 Videos</button>
          <button className={activeTab === 'live' ? 'active' : ''} onClick={() => setActiveTab('live')}>📡 Live Classes</button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <span>{user?.name}</span>
            <small>Teacher</small>
          </div>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </aside>
      
      <main className="main-content">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        
        <div className="top-bar">
          <h1>{activeTab === 'videos' ? 'My Videos' : 'My Live Classes'}</h1>
          <div className="top-bar-actions">
            {activeTab === 'videos' ? (
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                + Upload Video
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowLiveModal(true)}>
                + Schedule Class
              </button>
            )}
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        <div className="animate-fade-in">
          <div className="stats-row">
            <div className="stat-card small">
              <h3>{videos.length}</h3>
              <p>Total Videos</p>
            </div>
            <div className="stat-card small">
              <h3>{videos.reduce((acc, v) => acc + (v.views || 0), 0)}</h3>
              <p>Total Views</p>
            </div>
          </div>

          <div className="videos-grid">
            {activeTab === 'videos' ? videos.map(video => (
              <div key={video.id} className="video-card">
                <div className="video-thumbnail" style={{ background: video.category_color || '#1e40af' }}>
                  <span className="play-icon">▶</span>
                  <span className="video-icon">{video.category_icon}</span>
                </div>
                <div className="video-info">
                  <h3>{video.title}</h3>
                  <p className="category-tag">{video.category_name}</p>
                  <div className="video-meta">
                    <span>👁️ {video.views || 0} views</span>
                  </div>
                  <div className="video-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedVideoId(video.id); setShowTranscriptModal(true); }}>
                      Transcripts
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(video.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )) : liveClasses.map(lc => (
              <div key={lc.id} className="video-card">
                <div className="video-info" style={{ padding: '1rem' }}>
                  <h3>{lc.title}</h3>
                  <p className="category-tag">{lc.category_name}</p>
                  <div className="video-meta">
                    <span>📅 {new Date(lc.start_time).toLocaleString()}</span>
                  </div>
                  <a href={lc.meeting_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem', display: 'block', textAlign: 'center' }}>
                    Join Meeting
                  </a>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLiveClass(lc.id)} style={{ marginTop: '0.5rem', width: '100%' }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Upload Video Lecture</h2>
                <button onClick={() => setShowModal(false)}>×</button>
              </div>
              <form onSubmit={handleUpload}>
                <div className="form-group">
                  <label>Video Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Enter video title"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Video description"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={formData.category_id}
                    onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                    required
                  >
                    <option value="">Select category...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Video File</label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={e => setVideoFile(e.target.files[0])}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload Video'}
                </button>
              </form>
            </div>
          </div>
        )}

        {showLiveModal && (
          <div className="modal-overlay" onClick={() => setShowLiveModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Schedule Live Class</h2>
                <button onClick={() => setShowLiveModal(false)}>×</button>
              </div>
              <form onSubmit={handleScheduleLiveClass}>
                <div className="form-group">
                  <label>Title</label>
                  <input type="text" value={liveFormData.title} onChange={e => setLiveFormData({ ...liveFormData, title: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea value={liveFormData.description} onChange={e => setLiveFormData({ ...liveFormData, description: e.target.value })} rows={2} />
                </div>
                <div className="form-group">
                  <label>Course</label>
                  <select value={liveFormData.categoryId} onChange={e => setLiveFormData({ ...liveFormData, categoryId: e.target.value })} required>
                    <option value="">Select course...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Start Time</label>
                  <input type="datetime-local" value={liveFormData.startTime} onChange={e => setLiveFormData({ ...liveFormData, startTime: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Meeting URL (Zoom/Meet)</label>
                  <input type="url" value={liveFormData.meetingUrl} onChange={e => setLiveFormData({ ...liveFormData, meetingUrl: e.target.value })} required />
                </div>
                <button type="submit" className="btn btn-primary btn-block">Schedule Class</button>
              </form>
            </div>
          </div>
        )}

        {showTranscriptModal && (
          <div className="modal-overlay" onClick={() => setShowTranscriptModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Manage Transcripts</h2>
                <button onClick={() => setShowTranscriptModal(false)}>×</button>
              </div>
              <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
                <p>Use AI to automatically generate transcripts for this video based on its audio content.</p>
                <button className="btn btn-primary" onClick={handleGenerateTranscript}>
                  ✨ Auto-Generate Transcript (Mock)
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ==================== STUDENT DASHBOARD ====================
const StudentDashboard = () => {
  const [activeTab, setActiveTab] = useState('courses');
  const [enrollments, setEnrollments] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [liveClasses, setLiveClasses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseVideos, setCourseVideos] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [notes, setNotes] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(-1);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [selectedLiveClass, setSelectedLiveClass] = useState(null);
  const videoRef = useRef(null);
  const chatEndRef = useRef(null);
  const transcriptRef = useRef(null);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [enrollData, coursesData, liveData] = await Promise.all([
        apiFetch('/student/enrollments'),
        apiFetch('/student/available-courses'),
        apiFetch('/live-classes')
      ]);
      setEnrollments(enrollData);
      setAvailableCourses(coursesData.filter(c => !c.is_enrolled));
      
      // Filter live classes based on enrollments
      const enrolledCategoryIds = enrollData.map(e => e.id);
      setLiveClasses(liveData.filter(lc => enrolledCategoryIds.includes(lc.category_id)));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type) => setToast({ message, type });

  const loadCourseVideos = async (categoryId) => {
    try {
      const videos = await apiFetch(`/student/course/${categoryId}/videos`);
      setCourseVideos(videos);
      if (videos.length > 0) {
        setCurrentVideo(videos[0]);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadNotes = async (videoId) => {
    try {
      const notesData = await apiFetch('/student/notes');
      setNotes(notesData.filter(n => n.video_id === videoId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleEnroll = async (categoryId) => {
    try {
      await apiFetch('/student/purchases', {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId })
      });
      showToast('Enrollment request submitted! Admin will approve shortly.', 'success');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleVideoProgress = (isEnded = false) => {
    if (!videoRef.current || !currentVideo) return;
    
    const video = videoRef.current;
    const progress = isEnded ? 100 : (video.currentTime / video.duration) * 100;
    setVideoProgress(progress);

    // Sync transcript
    const currentTime = video.currentTime;
    const activeIndex = transcripts.findIndex(t => currentTime >= t.start_sec && currentTime < t.end_sec);
    if (activeIndex !== -1 && activeIndex !== activeTranscriptIndex) {
      setActiveTranscriptIndex(activeIndex);
      // Auto-scroll transcript
      if (transcriptRef.current) {
        const activeElement = transcriptRef.current.children[activeIndex];
        if (activeElement) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
    
    if (isEnded || Math.floor(progress) % 10 === 0) {
      apiFetch('/student/video-progress', {
        method: 'POST',
        body: JSON.stringify({ 
          video_id: currentVideo.id, 
          progress: Math.floor(progress),
          duration: video.duration || 0
        })
      }).catch(console.error);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim() || !currentVideo) return;
    try {
      await apiFetch('/student/notes', {
        method: 'POST',
        body: JSON.stringify({ video_id: currentVideo.id, content: newNote })
      });
      showToast('Note added!', 'success');
      setNewNote('');
      loadNotes(currentVideo.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await apiFetch(`/student/notes/${noteId}`, { method: 'DELETE' });
      showToast('Note deleted!', 'success');
      if (currentVideo) loadNotes(currentVideo.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openCourse = (course) => {
    setSelectedCourse(course);
    loadCourseVideos(course.id);
  };

  const closeCourse = () => {
    setSelectedCourse(null);
    setCourseVideos([]);
    setCurrentVideo(null);
    setNotes([]);
    setBookmarks([]);
    setTranscripts([]);
    setSelectedLiveClass(null);
  };

  const selectVideo = async (video) => {
    setCurrentVideo(video);
    loadNotes(video.id);
    
    // Load advanced features
    try {
      const [bks, ts] = await Promise.all([
        apiFetch(`/videos/${video.id}/bookmarks`),
        apiFetch(`/videos/${video.id}/transcripts`)
      ]);
      setBookmarks(bks);
      setTranscripts(ts);
    } catch (err) {
      console.error(err);
    }
  };

  // --- Advanced Player Features ---
  const changeSpeed = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoRef.current.requestPictureInPicture();
    }
  };

  const addBookmark = async () => {
    if (!videoRef.current || !currentVideo) return;
    const timestamp = Math.floor(videoRef.current.currentTime);
    const label = prompt('Enter a label for this bookmark:');
    if (!label) return;

    try {
      await apiFetch(`/videos/${currentVideo.id}/bookmarks`, {
        method: 'POST',
        body: JSON.stringify({ timestampSec: timestamp, label })
      });
      showToast('Bookmark added!', 'success');
      // Reload bookmarks
      const bks = await apiFetch(`/videos/${currentVideo.id}/bookmarks`);
      setBookmarks(bks);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const jumpToTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  // --- Live Chat Features ---
  const joinLiveClass = async (lc) => {
    setSelectedLiveClass(lc);
    loadChat(lc.id);
    // Polling mock (in real app, use WebSockets)
    const interval = setInterval(() => {
      if (selectedLiveClass?.id === lc.id) loadChat(lc.id);
    }, 5000);
    return () => clearInterval(interval);
  };

  const loadChat = async (id) => {
    try {
      const msgs = await apiFetch(`/live-classes/${id}/chat`);
      setChatMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error(err);
    }
  };

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !selectedLiveClass) return;
    try {
      await apiFetch(`/live-classes/${selectedLiveClass.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: newChatMessage })
      });
      setNewChatMessage('');
      loadChat(selectedLiveClass.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
        {mobileMenuOpen ? '✕' : '☰'}
      </button>
      <div className={`sidebar-overlay ${mobileMenuOpen ? 'show' : ''}`} onClick={() => setMobileMenuOpen(false)} />
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src="/mp360-logo.png" alt="Markpro360 Student Portal" className="sidebar-logo" />
        </div>
        <nav className="nav-menu" onClick={() => setMobileMenuOpen(false)}>
          <button className={activeTab === 'courses' ? 'active' : ''} onClick={() => { setActiveTab('courses'); closeCourse(); }}>📚 My Courses</button>
          <button className={activeTab === 'live-classes' ? 'active' : ''} onClick={() => { setActiveTab('live-classes'); closeCourse(); }}>📡 Live Classes</button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <span>{user?.name}</span>
            <small>Student</small>
          </div>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </aside>
      
      <main className="main-content">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        
        <div className="top-bar">
          <h1>{selectedCourse ? selectedCourse.name : 'My Learning Dashboard'}</h1>
          <div className="top-bar-actions">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        {activeTab === 'live-classes' ? (
          <div className="animate-fade-in">
            {selectedLiveClass ? (
              <div className="live-class-view">
                <button className="btn btn-secondary back-btn" onClick={() => setSelectedLiveClass(null)}>
                  ← Back to Live Classes
                </button>
                <h2>{selectedLiveClass.title}</h2>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <div style={{ flex: 2 }}>
                    <div className="video-player" style={{ background: '#000', padding: '2rem', textAlign: 'center', borderRadius: '12px' }}>
                      <h3 style={{ color: '#fff' }}>Streaming on External Platform</h3>
                      <p style={{ color: '#aaa', marginBottom: '1rem' }}>Please join the meeting using the link below.</p>
                      <a href={selectedLiveClass.meeting_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-lg">
                        Join Live Meeting
                      </a>
                    </div>
                  </div>
                  <div style={{ flex: 1, background: '#fff', padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '500px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                    <h3>Live Chat</h3>
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', padding: '0.5rem', border: '1px solid #eee', borderRadius: '8px' }}>
                      {chatMessages.map(msg => (
                        <div key={msg.id} style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: msg.user_role === 'teacher' ? '#3498DB' : '#333' }}>{msg.user_name}</strong>: {msg.message}
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        value={newChatMessage} 
                        onChange={e => setNewChatMessage(e.target.value)} 
                        placeholder="Say something..."
                        style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                      <button type="submit" className="btn btn-primary">Send</button>
                    </form>
                  </div>
                </div>
              </div>
            ) : (
              <section className="courses-section">
                <h2>📡 Upcoming Live Classes</h2>
                {liveClasses.length === 0 ? (
                  <p>No upcoming live classes for your enrolled courses.</p>
                ) : (
                  <div className="courses-grid">
                    {liveClasses.map(lc => (
                      <div key={lc.id} className="course-card">
                        <div className="course-header" style={{ background: '#e74c3c' }}>
                          <h3>{lc.title}</h3>
                        </div>
                        <div className="course-body">
                          <p>{lc.description}</p>
                          <p><strong>Course:</strong> {lc.category_name}</p>
                          <p><strong>Start Time:</strong> {new Date(lc.start_time).toLocaleString()}</p>
                          <button className="btn btn-primary btn-block" onClick={() => joinLiveClass(lc)}>
                            Enter Class
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        ) : !selectedCourse ? (
          <div className="animate-fade-in">
            {enrollments.length > 0 && (
              <section className="courses-section">
                <h2>📚 My Enrolled Courses ({enrollments.length})</h2>
                <div className="courses-grid">
                  {enrollments.map(course => {
                    const completionPercent = course.video_count > 0 
                      ? Math.round((course.completed_videos / course.video_count) * 100) 
                      : 0;
                    return (
                      <div key={course.id} className="course-card" style={{ borderTopColor: course.color }}>
                        <div className="course-header" style={{ background: course.color }}>
                          <span className="course-icon">{course.icon}</span>
                          <h3>{course.name}</h3>
                        </div>
                        <div className="course-body">
                          <p>{course.description}</p>
                          <div className="course-progress">
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{ width: `${completionPercent}%` }}
                              />
                            </div>
                            <div className="progress-stats">
                              <span>{course.completed_videos || 0}/{course.video_count || 0} videos</span>
                              <span className="completion-badge">{completionPercent}% Complete</span>
                            </div>
                          </div>
                          <button
                            className="btn btn-primary btn-block"
                            onClick={() => openCourse(course)}
                          >
                            {completionPercent > 0 ? 'Continue Learning' : 'Start Learning'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {availableCourses.length > 0 && (
              <section className="courses-section">
                <h2>🛒 Available Courses</h2>
                <div className="courses-grid">
                  {availableCourses.map(course => (
                    <div key={course.id} className="course-card course-card-locked" style={{ borderTopColor: course.color }}>
                      <div className="course-header" style={{ background: course.color }}>
                        <span className="course-icon">{course.icon}</span>
                        <h3>{course.name}</h3>
                      </div>
                      <div className="course-body">
                        <p>{course.description}</p>
                        <div className="course-price">
                          <span className="price">RS {course.price?.toLocaleString()}</span>
                        </div>
                        <button
                          className="btn btn-buy btn-block"
                          onClick={() => navigate(`/student/payment/${course.id}`, { state: { course } })}
                        >
                          Buy Now
                        </button>
                      </div>
                      <div className="course-overlay">
                        <div className="overlay-content">
                          <span className="overlay-icon">{course.icon}</span>
                          <h3>{course.name}</h3>
                          <div className="overlay-price">RS {course.price?.toLocaleString()}</div>
                          <button
                            className="btn btn-primary"
                            onClick={() => navigate(`/student/payment/${course.id}`, { state: { course } })}
                          >
                            Buy Now
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {enrollments.length === 0 && availableCourses.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📚</div>
                <h3>No Courses Available</h3>
                <p>Check back later for new courses!</p>
              </div>
            )}
          </div>
        ) : (
          <div className="course-view animate-fade-in">
            <button className="btn btn-secondary back-btn" onClick={closeCourse}>
              ← Back to Dashboard
            </button>

            <div className="course-view-header" style={{ background: selectedCourse.color }}>
              <span className="course-icon">{selectedCourse.icon}</span>
              <h2>{selectedCourse.name}</h2>
              <p>{selectedCourse.description}</p>
            </div>

            <div className="course-view-content">
              <div className="video-player-section" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 3 }}>
                  {currentVideo ? (
                    <>
                      <div className="video-player" style={{ position: 'relative' }}>
                        <video
                          ref={videoRef}
                          src={currentVideo.video_url}
                          controls
                          autoPlay
                          onTimeUpdate={handleVideoProgress}
                          onEnded={() => handleVideoProgress(true)}
                        />
                        <div className="video-progress-bar">
                          <div 
                            className="video-progress-fill" 
                            style={{ width: `${videoProgress}%` }}
                          />
                        </div>
                        {/* Custom Controls Bar */}
                        <div className="custom-controls" style={{ display: 'flex', gap: '10px', padding: '10px', background: '#f8f9fa', borderRadius: '0 0 12px 12px', alignItems: 'center' }}>
                          <select value={playbackSpeed} onChange={e => changeSpeed(Number(e.target.value))} style={{ padding: '4px', borderRadius: '4px' }}>
                            <option value={0.5}>0.5x</option>
                            <option value={1}>1.0x</option>
                            <option value={1.25}>1.25x</option>
                            <option value={1.5}>1.5x</option>
                            <option value={2}>2.0x</option>
                          </select>
                          <button className="btn btn-secondary btn-sm" onClick={togglePiP}>PiP Mode</button>
                          <button className="btn btn-primary btn-sm" onClick={addBookmark}>+ Add Bookmark</button>
                        </div>
                      </div>
                      
                      <div className="video-details" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ flex: 1 }}>
                          <h3>{currentVideo.title}</h3>
                          <p>{currentVideo.description}</p>
                          
                          <div className="notes-section" style={{ marginTop: '2rem' }}>
                            <h3>📝 My Notes</h3>
                            <form onSubmit={handleAddNote} className="note-form">
                              <textarea
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                                placeholder="Write your notes here..."
                                rows={3}
                              />
                              <button type="submit" className="btn btn-primary btn-sm">Add Note</button>
                            </form>
                            <div className="notes-list">
                              {notes.map(note => (
                                <div key={note.id} className="note-card">
                                  <p>{note.content}</p>
                                  <small>{new Date(note.created_at).toLocaleString()}</small>
                                  <button onClick={() => handleDeleteNote(note.id)}>×</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Bookmarks Panel */}
                        <div style={{ flex: 1, background: '#fff', padding: '1rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                          <h3>📌 Bookmarks</h3>
                          {bookmarks.length === 0 ? (
                            <p style={{ color: '#aaa' }}>No bookmarks yet.</p>
                          ) : (
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                              {bookmarks.map(bk => (
                                <li key={bk.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                                  <span style={{ cursor: 'pointer', color: '#1e40af' }} onClick={() => jumpToTime(bk.timestamp_sec)}>
                                    ⏱️ {Math.floor(bk.timestamp_sec / 60)}:{(bk.timestamp_sec % 60).toString().padStart(2, '0')} - {bk.label}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="no-video">
                      <p>No videos in this course yet.</p>
                    </div>
                  )}
                </div>

                {/* Transcripts Panel */}
                {currentVideo && (
                  <div style={{ flex: 1, background: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '600px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                    <h3 style={{ padding: '1rem', borderBottom: '1px solid #eee', margin: 0 }}>Interactive Transcript</h3>
                    <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                      {transcripts.length === 0 ? (
                        <p style={{ color: '#aaa' }}>No transcript available.</p>
                      ) : (
                        transcripts.map((t, i) => (
                          <div 
                            key={t.id} 
                            onClick={() => jumpToTime(t.start_sec)}
                            style={{ 
                              padding: '0.5rem', 
                              cursor: 'pointer', 
                              borderRadius: '4px',
                              marginBottom: '0.5rem',
                              background: activeTranscriptIndex === i ? '#ebf5ff' : 'transparent',
                              borderLeft: activeTranscriptIndex === i ? '4px solid #3b82f6' : '4px solid transparent',
                              transition: 'all 0.2s'
                            }}
                          >
                            <span style={{ fontSize: '0.8rem', color: '#666', display: 'block' }}>
                              {Math.floor(t.start_sec / 60)}:{(t.start_sec % 60).toString().padStart(2, '0')}
                            </span>
                            {t.text}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="videos-list-section" style={{ marginTop: '2rem' }}>
                <h3>📋 Course Videos ({courseVideos.length})</h3>
                <div className="videos-list">
                  {courseVideos.map(video => (
                    <div
                      key={video.id}
                      className={`video-list-item ${currentVideo?.id === video.id ? 'active' : ''}`}
                      onClick={() => selectVideo(video)}
                    >
                      <div className="video-thumb">
                        {video.is_watched ? '✓' : '▶'}
                      </div>
                      <div className="video-info">
                        <span className="video-title">{video.title}</span>
                        <span className="video-views">{video.views || 0} views</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ==================== FORGOT PASSWORD PAGE ====================
const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const data = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="logo"><img src="/mp360-logo.png" alt="Markpro360 Student Portal" /></div>
          <h1>Reset Password</h1>
          <p>Enter your email to receive reset instructions</p>
        </div>
        
        {error && <div className="alert alert-danger animate-shake">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
        
        <div className="login-footer">
          <p>Remember your password? <a href="/login">Sign In</a></p>
        </div>
      </div>
    </div>
  );
};

// ==================== RESET PASSWORD PAGE ====================
const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const token = new URLSearchParams(location.search).get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password })
      });
      setMessage('Password reset successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card animate-fade-in">
          <div className="login-header">
<div className="logo"><img src="/mp360-logo.png" alt="Markpro360 Student Portal" /></div>
            <h1>Invalid Link</h1>
            <p>This password reset link is invalid or expired</p>
          </div>
          <div className="login-footer">
            <p><a href="/forgot-password">Request new reset link</a></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="logo"><img src="/mp360-logo.png" alt="Markpro360 Student Portal" /></div>
          <h1>Set New Password</h1>
          <p>Enter your new password</p>
        </div>
        
        {error && <div className="alert alert-danger animate-shake">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              required
              minLength={6}
            />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        
        <div className="login-footer">
          <p><a href="/login">Back to Sign In</a></p>
        </div>
      </div>
    </div>
  );
};

// ==================== PAYMENT PAGE ====================
const PaymentPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const course = location.state?.course;
  const [toast, setToast] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type) => setToast({ message, type });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      showToast('Please select an image or PDF file', 'error');
      return;
    }

    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setReceiptPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview('pdf'); // Special flag for PDF
    }
  };

  if (!course) {
    return (
      <div className="dashboard">
        <main className="main-content">
          <div className="empty-state">
            <div className="empty-icon">❌</div>
            <h3>Course Not Found</h3>
            <button className="btn btn-primary" onClick={() => navigate('/student')}>
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  const handlePayment = async () => {
    if (!receiptFile) {
      showToast('Please upload your payment receipt first', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category_id', course.id);
      formData.append('receipt', receiptFile);

      const response = await apiFetch('/student/purchases', {
        method: 'POST',
        body: formData
      });
      
      const message = `${paymentConfig.whatsapp.message}\n\n` +
        `Student: ${user?.name}\n` +
        `Email: ${user?.email}\n` +
        `Course: ${course.name}\n` +
        `Price: RS ${course.price?.toLocaleString() || 0}`;

      const whatsappUrl = `https://wa.me/${paymentConfig.whatsapp.number}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      
      showToast('Request submitted! Now please ATTACH the receipt in WhatsApp.', 'success');
      setTimeout(() => navigate('/student'), 5000);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
        {mobileMenuOpen ? '✕' : '☰'}
      </button>
      <div className={`sidebar-overlay ${mobileMenuOpen ? 'show' : ''}`} onClick={() => setMobileMenuOpen(false)} />
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src="/mp360-logo.png" alt="Markpro360 Student Portal" className="sidebar-logo" />
        </div>
        <nav className="nav-menu" onClick={() => setMobileMenuOpen(false)}>
          <button onClick={() => navigate('/student')}>📚 My Courses</button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <span>{user?.name}</span>
            <small>Student</small>
          </div>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </aside>
      
      <main className="main-content">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        
        <div className="payment-page animate-fade-in">
          <button className="btn btn-secondary back-btn" onClick={() => navigate('/student')}>
            ← Back to Dashboard
          </button>

          <div className="payment-container">
            <div className="payment-card">
              <div className="payment-header" style={{ background: course.color }}>
                <span className="course-icon">{course.icon}</span>
                <h2>{course.name}</h2>
              </div>

              <div className="payment-body">
                <div className="price-section">
                  <span className="price-label">Total Amount</span>
                  <span className="price-amount">RS {course.price?.toLocaleString()}</span>
                </div>

                <div className="payment-divider">
                  <span>Pay Using</span>
                </div>

                <div className="payment-methods">
                  <div className="payment-method">
                    <div className="method-icon">🏦</div>
                    <div className="method-info">
                      <h4>Bank Transfer</h4>
                      <p>Transfer directly to our bank account</p>
                    </div>
                  </div>

                  <div className="bank-details">
                    <div className="detail-row">
                      <span className="detail-label">Bank Name</span>
                      <span className="detail-value">{paymentConfig.bank.bankName}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Account Name</span>
                      <span className="detail-value">{paymentConfig.bank.accountName}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Account Number</span>
                      <span className="detail-value copy-value" onClick={() => navigator.clipboard.writeText(paymentConfig.bank.accountNumber)}>
                        {paymentConfig.bank.accountNumber} <span className="copy-icon">📋</span>
                      </span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Branch</span>
                      <span className="detail-value">{paymentConfig.bank.branch}</span>
                    </div>
                  </div>

                  <div className="payment-divider">
                    <span>OR</span>
                  </div>

                  <div className="payment-method upi-method">
                    <div className="method-icon">📱</div>
                    <div className="method-info">
                      <h4>Mobile Payments</h4>
                      <p>Pay using Easypaisa or any Mobile Wallet</p>
                    </div>
                  </div>

                  <div className="upi-details">
                    <div className="detail-row">
                      <span className="detail-label">Payment ID (Easypaisa/Mobile Payments)</span>
                      <span className="detail-value copy-value" onClick={() => navigator.clipboard.writeText(paymentConfig.Easypaisa?.id || '')}>
                        {paymentConfig.Easypaisa?.id || 'N/A'} <span className="copy-icon">📋</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="payment-note">
                  <p>✅ <strong>Step 1:</strong> Pay the amount via Bank or Easypaisa.</p>
                  <p>✅ <strong>Step 2:</strong> Upload the screenshot/PDF above.</p>
                  <p>✅ <strong>Step 3:</strong> Click "I Have Paid" to open WhatsApp.</p>
                  <p>⚠️ <strong>Step 4:</strong> Once WhatsApp opens, <strong>manually attach</strong> the same receipt to the message.</p>
                </div>

                <div className="receipt-upload-section">
                  <label className="receipt-label">Upload Payment Receipt</label>
                  <div className={`receipt-dropzone ${receiptPreview ? 'has-preview' : ''}`}>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleFileChange}
                      id="receipt-input"
                      hidden
                    />
                    <label htmlFor="receipt-input" className="dropzone-inner">
                      {receiptPreview ? (
                        <div className="preview-container">
                          {receiptPreview === 'pdf' ? (
                            <div className="pdf-preview">
                              <div className="pdf-icon">📄</div>
                              <span>{receiptFile.name}</span>
                            </div>
                          ) : (
                            <img src={receiptPreview} alt="Receipt Preview" />
                          )}
                          <div className="preview-overlay">
                            <span>Change File</span>
                          </div>
                        </div>
                      ) : (
                        <div className="upload-placeholder">
                          <div className="upload-icon">📸</div>
                          <span>Click to upload receipt (Photo or PDF)</span>
                          <small>Supports: JPG, PNG, WEBP, PDF</small>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <button 
                  className="btn btn-primary btn-block btn-lg" 
                  onClick={handlePayment}
                  disabled={isSubmitting || !receiptFile}
                >
                  {isSubmitting ? 'Submitting...' : 'I Have Paid'}
                </button>

                <p className="payment-help">
                  Need help? Send message on WhatsApp: {paymentConfig.whatsapp.displayNumber}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== MAIN APP ====================
const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              <Route path="/teacher" element={
                <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                  <TeacherDashboard />
                </ProtectedRoute>
              } />
              <Route path="/student" element={
                <ProtectedRoute allowedRoles={['student']}>
                  <StudentDashboard />
                </ProtectedRoute>
              } />
              <Route path="/student/payment/:courseId" element={
                <ProtectedRoute allowedRoles={['student']}>
                  <PaymentPage />
                </ProtectedRoute>
              } />
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
