import React, { useState, useEffect } from 'react';
import { teacherService, clearAuth } from '../services/api';
import { useNavigate } from 'react-router-dom';

const TeacherDashboard = () => {
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categoryId: '',
    duration: ''
  });
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [videosData, categoriesData] = await Promise.all([
        teacherService.getVideos(),
        teacherService.getCategories()
      ]);
      setVideos(videosData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!videoFile || !formData.title || !formData.categoryId) {
      alert('Please fill all required fields');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('title', formData.title);
      form.append('description', formData.description);
      form.append('category_id', formData.categoryId);
      form.append('duration', formData.duration);
      form.append('video', videoFile);
      if (thumbnailFile) form.append('thumbnail', thumbnailFile);

      await teacherService.uploadVideo(form);
      alert('Video uploaded successfully!');
      setShowUploadModal(false);
      setFormData({ title: '', description: '', categoryId: '', duration: '' });
      setVideoFile(null);
      setThumbnailFile(null);
      loadData();
    } catch (error) {
      alert(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this video?')) return;
    try {
      await teacherService.deleteVideo(id);
      loadData();
    } catch (error) {
      alert(error.message);
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner"></div></div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Teacher Dashboard</h1>
          <p>Upload and manage your lecture videos</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            + Upload Video
          </button>
          <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon videos">🎬</div>
          <div className="stat-value">{videos.length}</div>
          <div className="stat-label">Total Videos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon views">👁️</div>
          <div className="stat-value">{videos.reduce((acc, v) => acc + (v.views || 0), 0)}</div>
          <div className="stat-label">Total Views</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon students">📚</div>
          <div className="stat-value">{categories.length}</div>
          <div className="stat-label">Courses</div>
        </div>
      </div>

      {/* Videos List */}
      <div className="section-header" style={{ marginTop: '32px' }}>
        <h2>My Videos</h2>
      </div>

      {videos.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}>
          <p style={{ color: '#666', marginBottom: '16px' }}>No videos uploaded yet.</p>
          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            Upload Your First Video
          </button>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map(video => (
            <div key={video.id} className="video-card">
              <div className="video-thumbnail">
                🎬
                <span style={{ 
                  position: 'absolute', 
                  bottom: '8px', 
                  right: '8px',
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  {video.views || 0} views
                </span>
              </div>
              <div className="video-info">
                <h3 className="video-title">{video.title}</h3>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                  📚 {video.category_name}
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(video.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>📤 Upload Video</h2>
              <button className="modal-close" onClick={() => setShowUploadModal(false)}>×</button>
            </div>
            <form onSubmit={handleUpload} className="modal-body">
              <div className="form-group">
                <label className="form-label">Video Title *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="Enter video title"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Enter video description"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Course *</label>
                <select
                  className="form-input"
                  value={formData.categoryId}
                  onChange={e => setFormData({...formData, categoryId: e.target.value})}
                  required
                >
                  <option value="">Select Course</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Video Duration (seconds)</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.duration}
                  onChange={e => setFormData({...formData, duration: e.target.value})}
                  placeholder="e.g., 3600 for 1 hour"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Video File *</label>
                <input
                  type="file"
                  className="form-input"
                  accept="video/*"
                  onChange={e => setVideoFile(e.target.files[0])}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Thumbnail (Optional)</label>
                <input
                  type="file"
                  className="form-input"
                  accept="image/*"
                  onChange={e => setThumbnailFile(e.target.files[0])}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : '📤 Upload Video'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
