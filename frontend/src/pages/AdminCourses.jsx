import React, { useState, useEffect } from 'react';
import { adminService } from '../services/api';

const AdminCourses = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    icon: '📚',
    color: '#1e40af'
  });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await adminService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', price: 0, icon: '📚', color: '#1e40af' });
    setShowModal(true);
  };

  const openEditModal = (cat) => {
    setEditingId(cat.id);
    setFormData({
      name: cat.name,
      description: cat.description || '',
      price: cat.price || 0,
      icon: cat.icon || '📚',
      color: cat.color || '#1e40af'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await adminService.updateCategory(editingId, formData);
        setToast({ message: 'Course updated successfully', type: 'success' });
      } else {
        await adminService.createCategory(formData);
        setToast({ message: 'Course created successfully', type: 'success' });
      }
      setShowModal(false);
      loadCategories();
    } catch (error) {
      setToast({ message: error.message, type: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this course?')) return;
    try {
      await adminService.deleteCategory(id);
      setToast({ message: 'Course deleted successfully', type: 'success' });
      loadCategories();
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
        <div className={`toast ${toast.type}`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Course Management</h1>
          <p>Manage courses and set prices</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Add Course
        </button>
      </div>

      <div className="video-grid" style={{ marginTop: '24px' }}>
        {categories.map(cat => (
          <div key={cat.id} className="video-card">
            <div className="video-thumbnail" style={{
              background: `linear-gradient(135deg, ${cat.color || '#1e40af'}, ${cat.color || '#3b82f6'})`
            }}>
              {cat.icon || '📚'}
            </div>
            <div className="video-info">
              <h3 className="video-title">{cat.name}</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
                {cat.description || 'No description'}
              </p>

              {/* Price Display */}
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                border: '2px solid #f59e0b',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: '600' }}>
                  COURSE PRICE
                </div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#b45309' }}>
                  RS {cat.price?.toLocaleString() || 0}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <span className="badge badge-primary">{cat.video_count || 0} videos</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(cat)} style={{ flex: 1 }}>
                  ✏️ Edit Price
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="card text-center" style={{ padding: '40px', marginTop: '24px' }}>
          <p style={{ color: '#666' }}>No courses yet. Create your first course!</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Course' : 'Add New Course'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label className="form-label">Course Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g., Web Development"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Course description"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Price (RS) *</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.price}
                  onChange={e => setFormData({...formData, price: parseInt(e.target.value) || 0})}
                  placeholder="0"
                  min="0"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Icon</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.icon}
                  onChange={e => setFormData({...formData, icon: e.target.value})}
                  placeholder="📚"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.color}
                  onChange={e => setFormData({...formData, color: e.target.value})}
                  placeholder="#1e40af"
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                {editingId ? 'Update Course' : 'Create Course'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCourses;
