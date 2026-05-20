import React, { useState, useEffect } from 'react';
import { adminService, clearAuth, apiFetch } from '../services/api';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
  const [stats, setStats] = useState({ students: 0, teachers: 0, courses: 0, pendingPurchases: 0, totalViews: 0 });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, notifData] = await Promise.all([
        adminService.getStats(),
        apiFetch('/api/notifications')
      ]);
      setStats(statsData);
      setNotifications(notifData);
      setUnreadCount(notifData.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div style={{ padding: '24px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Admin Dashboard</h1>
          <p>Manage your portal from here</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ position: 'relative' }}
          >
            🔔 Notifications
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: 'red',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {unreadCount}
              </span>
            )}
          </button>
          <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon students">👨‍🎓</div>
          <div className="stat-value">{stats.students}</div>
          <div className="stat-label">Students</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon teachers">👨‍🏫</div>
          <div className="stat-value">{stats.teachers}</div>
          <div className="stat-label">Teachers</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon videos">📚</div>
          <div className="stat-value">{stats.courses}</div>
          <div className="stat-label">Courses</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon views">⏳</div>
          <div className="stat-value">{stats.pendingPurchases}</div>
          <div className="stat-label">Pending Approvals</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section-header">
        <h2>Quick Actions</h2>
      </div>
      <div className="grid-3">
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/students')}>
          <h3>👨‍🎓 Manage Students</h3>
          <p>Add, edit, or remove students</p>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/teachers')}>
          <h3>👨‍🏫 Manage Teachers</h3>
          <p>Add, edit, or remove teachers</p>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/courses')}>
          <h3>📚 Manage Courses</h3>
          <p>Add courses and set prices</p>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/purchases')}>
          <h3>💳 Purchase Requests</h3>
          <p>Review invoice approvals</p>
          {stats.pendingPurchases > 0 && (
            <span style={{ 
              background: '#ef4444', 
              color: 'white', 
              padding: '4px 8px', 
              borderRadius: '12px',
              fontSize: '12px'
            }}>
              {stats.pendingPurchases} pending
            </span>
          )}
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/enrollments')}>
          <h3>🎓 Enrollments</h3>
          <p>Manage course enrollments</p>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/attendance')}>
          <h3>✅ Attendance</h3>
          <p>Track student attendance</p>
        </div>
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          width: '400px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 1000,
          maxHeight: '500px',
          overflow: 'auto'
        }}>
          <div style={{ 
            padding: '16px', 
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3>Notifications</h3>
            <button onClick={() => setShowNotifications(false)}>×</button>
          </div>
          {notifications.length === 0 ? (
            <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              No notifications yet
            </p>
          ) : (
            notifications.map(notif => (
              <div key={notif.id} style={{
                padding: '12px 16px',
                borderBottom: '1px solid #e2e8f0',
                background: notif.is_read ? 'white' : '#f0f9ff'
              }}>
                <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>{notif.title}</p>
                <p style={{ fontSize: '13px', color: '#666' }}>{notif.message}</p>
                <p style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  {new Date(notif.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
