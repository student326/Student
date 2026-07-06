import { useState, useRef, useEffect } from 'react';

const API_URL = '/api';

const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('accessToken');
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  };
  if (options.body instanceof FormData) delete config.headers['Content-Type'];
  const res = await fetch(`${API_URL}${endpoint}`, config);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(err.message);
  }
  return res.json();
};

const styles = {
  container: { padding: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' },
  dropzone: {
    border: '2px dashed #ccc', borderRadius: '12px', padding: '40px', textAlign: 'center',
    cursor: 'pointer', transition: 'all 0.3s', background: '#fafafa', marginBottom: '24px',
  },
  dropzoneActive: { borderColor: '#2563eb', background: '#eff6ff' },
  progressBar: { width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', borderRadius: '4px', transition: 'width 0.3s' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card: { border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: 'white' },
  cardBody: { padding: '16px' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: 'white', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto' },
};

export default function TeacherR2Videos({ courses: propCourses }) {
  const [tab, setTab] = useState('upload');
  const [videos, setVideos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState(null);
  const [editVideo, setEditVideo] = useState(null);
  const [showModuleModal, setShowModuleModal] = useState(false);

  const fileRef = useRef(null);
  const [form, setForm] = useState({ title: '', description: '', category_id: '', module_id: '' });
  const [moduleForm, setModuleForm] = useState({ category_id: '', name: '', description: '' });

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vids, cats] = await Promise.all([
        apiFetch('/r2/teacher'),
        apiFetch('/categories'),
      ]);
      setVideos(vids);
      setCourses(cats);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadModules = async (courseId) => {
    if (!courseId) { setModules([]); return; }
    try {
      const mods = await apiFetch(`/r2/modules/course/${courseId}`);
      setModules(mods);
    } catch { setModules([]); }
  };

  const handleUpload = async () => {
    if (!form.title || !form.category_id || !fileRef.current?.files?.[0]) {
      showToast('Title, course, and video file are required', 'error');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('category_id', form.category_id);
      fd.append('module_id', form.module_id);
      fd.append('video', fileRef.current.files[0]);

      const token = localStorage.getItem('accessToken');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/r2/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(JSON.parse(xhr.responseText).message || 'Upload failed'));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(fd);
      });

      showToast('Video uploaded successfully!', 'success');
      setForm({ title: '', description: '', category_id: '', module_id: '' });
      fileRef.current.value = '';
      setUploadProgress(0);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this video permanently?')) return;
    try {
      await apiFetch(`/r2/${id}`, { method: 'DELETE' });
      showToast('Video deleted', 'success');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEdit = async () => {
    if (!editVideo) return;
    try {
      await apiFetch(`/r2/${editVideo.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: editVideo.title, description: editVideo.description, module_id: editVideo.module_id || null }),
      });
      showToast('Video updated', 'success');
      setEditVideo(null);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateModule = async () => {
    if (!moduleForm.category_id || !moduleForm.name) {
      showToast('Course and module name are required', 'error');
      return;
    }
    try {
      await apiFetch('/r2/modules', {
        method: 'POST',
        body: JSON.stringify(moduleForm),
      });
      showToast('Module created', 'success');
      setModuleForm({ category_id: '', name: '', description: '' });
      setShowModuleModal(false);
      loadModules(moduleForm.category_id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString();
  const formatSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  const r2Videos = videos.filter(v => v.is_r2);

  return (
    <div style={styles.container}>
      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, padding: '12px 24px', borderRadius: '8px', color: 'white', background: toast.type === 'error' ? '#ef4444' : '#10b981', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button className={`btn ${tab === 'upload' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('upload')}>Upload Video</button>
        <button className={`btn ${tab === 'videos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('videos')}>My Videos ({r2Videos.length})</button>
        <button className={`btn ${tab === 'modules' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('modules')}>Modules</button>
      </div>

      {tab === 'upload' && (
        <div>
          <h3 style={{ marginBottom: '16px' }}>Upload Video to Cloudflare R2</h3>
          <div className="form-group">
            <label>Video Title</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Enter video title" required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Video description" rows={2} />
          </div>
          <div className="form-group">
            <label>Course</label>
            <select value={form.category_id} onChange={e => { setForm({ ...form, category_id: e.target.value, module_id: '' }); loadModules(e.target.value); }} required>
              <option value="">Select course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          {modules.length > 0 && (
            <div className="form-group">
              <label>Module (optional)</label>
              <select value={form.module_id} onChange={e => setForm({ ...form, module_id: e.target.value })}>
                <option value="">No module</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div
            style={{ ...styles.dropzone, ...(dragOver ? styles.dropzoneActive : {}), ...(uploading ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) { fileRef.current.files = e.dataTransfer.files; } }}
            onClick={() => !uploading && fileRef.current?.click()}
          >
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎬</div>
            <p style={{ fontWeight: 600, marginBottom: '4px' }}>{uploading ? 'Uploading...' : 'Drag & drop a video or click to browse'}</p>
            <p style={{ fontSize: '13px', color: '#666' }}>MP4, MOV, AVI, MKV, WEBM (max 500MB)</p>
            <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm" style={{ display: 'none' }} onChange={() => {}} />
          </div>
          {uploading && (
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${uploadProgress}%` }} />
            </div>
          )}
          {uploading && <p style={{ textAlign: 'center', marginTop: '8px', fontSize: '14px', color: '#666' }}>{uploadProgress}%</p>}
          <button className="btn btn-primary btn-block" onClick={handleUpload} disabled={uploading} style={{ marginTop: '16px' }}>
            {uploading ? `Uploading ${uploadProgress}%...` : 'Upload to Cloudflare R2'}
          </button>
        </div>
      )}

      {tab === 'videos' && (
        <div>
          <h3 style={{ marginBottom: '16px' }}>My R2 Videos</h3>
          {loading ? (
            <p>Loading...</p>
          ) : r2Videos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No R2 videos uploaded yet.</div>
          ) : (
            <div style={styles.grid}>
              {r2Videos.map(v => (
                <div key={v.id} style={styles.card}>
                  <div style={{ height: '160px', background: 'linear-gradient(135deg, #1e3a5f, #2d5a87)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>▶️</div>
                  <div style={styles.cardBody}>
                    <h4 style={{ marginBottom: '4px', fontSize: '15px' }}>{v.title}</h4>
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>{v.description?.slice(0, 80)}</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span style={styles.badge}>{v.category_name || v.category_id}</span>
                      {v.module_name && <span style={{ ...styles.badge, background: '#dbeafe', color: '#1d4ed8' }}>{v.module_name}</span>}
                      <span style={{ ...styles.badge, background: '#f3e8ff', color: '#7c3aed' }}>R2</span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>{formatSize(v.file_size)} • {formatDate(v.created_at)}</p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditVideo({ ...v })}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(v.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'modules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3>Course Modules</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModuleModal(true)}>+ New Module</button>
          </div>
          {courses.map(course => (
            <CourseModules key={course.id} course={course} onUpdate={loadData} showToast={showToast} />
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editVideo && (
        <div style={styles.modal} onClick={() => setEditVideo(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '16px' }}>Edit Video</h3>
            <div className="form-group">
              <label>Title</label>
              <input type="text" value={editVideo.title} onChange={e => setEditVideo({ ...editVideo, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={editVideo.description || ''} onChange={e => setEditVideo({ ...editVideo, description: e.target.value })} rows={2} />
            </div>
            <div className="form-group">
              <label>Module</label>
              <select value={editVideo.module_id || ''} onChange={e => setEditVideo({ ...editVideo, module_id: e.target.value })}>
                <option value="">No module</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditVideo(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Module Modal */}
      {showModuleModal && (
        <div style={styles.modal} onClick={() => setShowModuleModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '16px' }}>Create Module</h3>
            <div className="form-group">
              <label>Course</label>
              <select value={moduleForm.category_id} onChange={e => setModuleForm({ ...moduleForm, category_id: e.target.value })} required>
                <option value="">Select course...</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Module Name</label>
              <input type="text" value={moduleForm.name} onChange={e => setModuleForm({ ...moduleForm, name: e.target.value })} placeholder="e.g., Week 1: Introduction" />
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <textarea value={moduleForm.description} onChange={e => setModuleForm({ ...moduleForm, description: e.target.value })} rows={2} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModuleModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateModule}>Create Module</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseModules({ course, onUpdate, showToast }) {
  const [modules, setModules] = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded) {
      fetch(`/api/r2/modules/course/${course.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      }).then(r => r.json()).then(setModules).catch(() => {});
    }
  }, [course.id, expanded]);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '12px', overflow: 'hidden' }}>
      <div
        style={{ padding: '12px 16px', background: '#f9fafb', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontWeight: 600 }}>{course.icon} {course.name}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '12px 16px' }}>
          {modules.length === 0 ? (
            <p style={{ color: '#666', fontSize: '14px' }}>No modules yet.</p>
          ) : (
            modules.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div>
                  <strong style={{ fontSize: '14px' }}>{m.name}</strong>
                  {m.description && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>{m.description}</p>}
                </div>
                <button className="btn btn-danger btn-sm" onClick={async () => {
                  if (!confirm('Delete this module?')) return;
                  try {
                    await fetch(`/api/r2/modules/${m.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` } });
                    showToast('Module deleted', 'success');
                    setModules(modules.filter(x => x.id !== m.id));
                  } catch { showToast('Delete failed', 'error'); }
                }}>Delete</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
