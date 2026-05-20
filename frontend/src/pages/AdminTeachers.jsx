import React, { useState, useEffect } from 'react';
import { adminService } from '../services/api';

const AdminTeachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'teacher'
  });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadTeachers();
  }, []);

  const loadTeachers = async () => {
    try {
      const data = await adminService.getUsers('teacher');
      setTeachers(data);
    } catch (error) {
      console.error('Failed to load teachers:', error);
      setToast({ message: 'Failed to load teachers', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', email: '', password: '', role: 'teacher' });
    setShowModal(true);
  };

  const openEditModal = (teacher) => {
    setEditingId(teacher.id);
    setFormData({ name: teacher.name, email: teacher.email, password: '', role: 'teacher' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        const updateData = { name: formData.name, email: formData.email };
        if (formData.password) {
          updateData.password = formData.password;
        }
        await adminService.updateUser(editingId, updateData);
        setToast({ message: 'Teacher updated successfully!', type: 'success' });
      } else {
        await adminService.createUser(formData);
        setToast({ message: 'Teacher added successfully!', type: 'success' });
      }
      setShowModal(false);
      setFormData({ name: '', email: '', password: '', role: 'teacher' });
      setEditingId(null);
      loadTeachers();
    } catch (error) {
      setToast({ message: error.message, type: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this teacher? This will also delete their uploaded videos.')) return;
    try {
      await adminService.deleteUser(id);
      setToast({ message: 'Teacher deleted successfully', type: 'success' });
      loadTeachers();
    } catch (error) {
      setToast({ message: error.message, type: 'error' });
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner"></div></div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      {toast && (
        <div className={`toast ${toast.type}`} onClick={() => setToast(null)} style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '16px 24px',
          background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
          border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#10b981'}`,
          borderRadius: '8px',
          color: toast.type === 'error' ? '#991b1b' : '#166534',
          zIndex: 9999,
          cursor: 'pointer'
        }}>
          {toast.message}
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>👨‍🏫 Teacher Management</h1>
          <p>Add, edit, and manage teachers</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Add Teacher
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon teachers">👨‍🏫</div>
          <div className="stat-value">{teachers.length}</div>
          <div className="stat-label">Total Teachers</div>
        </div>
      </div>

      {/* Teachers Table */}
      <div className="table-container" style={{ marginTop: '24px' }}>
        {teachers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <p style={{ fontSize: '48px', marginBottom: '16px' }}>👨‍🏫</p>
            <p>No teachers found.</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>Add your first teacher to get started!</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Teacher Info</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(teacher => (
                <tr key={teacher.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '16px'
                      }}>
                        {teacher.name?.charAt(0).toUpperCase()}
                      </div>
                      <strong>{teacher.name}</strong>
                    </div>
                  </td>
                  <td>{teacher.email}</td>
                  <td>
                    <span className="badge badge-info">👨‍🏫 Teacher</span>
                  </td>
                  <td>{new Date(teacher.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEditModal(teacher)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(teacher.id)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Teacher Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? '✏️ Edit Teacher' : '➕ Add New Teacher'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#166534', margin: 0 }}>
                  💡 Teachers can upload videos and manage their course content
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Enter teacher name"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email *</label>
                <input
                  type="email"
                  className="form-input"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  placeholder="teacher@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Password {editingId && '(Leave empty to keep current)'}
                </label>
                <input
                  type="password"
                  className="form-input"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  placeholder={editingId ? "Enter new password to update" : "Enter password"}
                  required={!editingId}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingId ? 'Update Teacher' : 'Add Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTeachers;
