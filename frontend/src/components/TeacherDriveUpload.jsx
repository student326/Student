import { useState, useRef, useEffect } from 'react';

const API_URL = '/api';

const styles = {
  container: { padding: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' },
  dropzone: {
    border: '2px dashed #ccc', borderRadius: '12px', padding: '40px', textAlign: 'center',
    cursor: 'pointer', transition: 'all 0.3s', background: '#fafafa', marginBottom: '24px',
  },
  dropzoneActive: { borderColor: '#059669', background: '#f0fdf4' },
  progressBar: { width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #059669, #10b981)', borderRadius: '4px', transition: 'width 0.3s' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card: { border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: 'white' },
  cardBody: { padding: '16px' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 },
};

export default function TeacherDriveUpload({ courses: propCourses }) {
  const [videos, setVideos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const fileRef = useRef(null);
  const [form, setForm] = useState({ title: '', description: '', category_id: '' });

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const getTokenHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [vids, cats] = await Promise.all([
        fetch(`${API_URL}/videos/teacher`, { headers: getTokenHeaders() }).then(r => r.json()),
        fetch(`${API_URL}/categories`, { headers: getTokenHeaders() }).then(r => r.json()),
      ]);

      setVideos(Array.isArray(vids) ? vids : []);
      setCourses(Array.isArray(cats) ? cats : (Array.isArray(propCourses) ? propCourses : []));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const buildStreamUrl = (videoId) => {
    const token = localStorage.getItem('accessToken');
    return `${API_URL}/drive/stream/${videoId}?token=${token}`;
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !form.title || !form.category_id) {
      showToast('Please fill title, select a course, and choose a file', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('title', form.title);
      formData.append('description', form.description);
      formData.append('category_id', form.category_id);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/drive/upload`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };

      const result = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else {
            try { reject(new Error(JSON.parse(xhr.responseText).message)); }
            catch { reject(new Error('Upload failed')); }
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('accessToken')}`);
        xhr.send(formData);
      });

      showToast(`Uploaded securely to Drive folder: ${result.driveInfo?.folderName}`, 'success');
      setForm({ title: '', description: '', category_id: '' });
      if (fileRef.current) fileRef.current.value = '';
      setUploadProgress(0);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This removes it from Drive permanently.`)) return;
    try {
      const res = await fetch(`${API_URL}/drive/${id}`, {
        method: 'DELETE',
        headers: getTokenHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      showToast('Deleted', 'success');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  const isDriveVideo = (video) => {
    return video.video_url && video.video_url.includes('drive.google.com');
  };

  return (
    <div style={styles.container}>
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999, padding: '12px 24px',
          borderRadius: '8px', color: 'white',
          background: toast.type === 'error' ? '#ef4444' : '#059669',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast.message}
        </div>
      )}

      {previewVideo && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}
          onClick={() => setPreviewVideo(null)}
        >
          <div style={{ background: '#000', borderRadius: '12px', overflow: 'hidden', maxWidth: '90vw', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <video
              src={buildStreamUrl(previewVideo.id)}
              controls
              autoPlay
              style={{ width: '100%', maxHeight: '70vh', outline: 'none' }}
            />
          </div>
          <button
            onClick={() => setPreviewVideo(null)}
            style={{ marginTop: '12px', padding: '8px 24px', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: '14px' }}
          >
            Close
          </button>
        </div>
      )}

      <div style={styles.header}>
        <h3>📁 Google Drive Upload</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ ...styles.badge, background: '#fef3c7', color: '#d97706' }}>🔒 Private</span>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Videos are proxied through the portal — never directly exposed
          </span>
        </div>
      </div>

      <form onSubmit={handleUpload} style={{ marginBottom: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <input
            type="text" placeholder="Video title" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            required
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
          />
          <select
            value={form.category_id}
            onChange={e => setForm({ ...form, category_id: e.target.value })}
            required
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
          >
            <option value="">Select course...</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
        <input
          type="text" placeholder="Description (optional)" value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', width: '100%', marginBottom: '12px', boxSizing: 'border-box' }}
        />

        <div
          style={{ ...styles.dropzone, ...(dragOver ? styles.dropzoneActive : {}), borderColor: dragOver ? '#059669' : '#ccc' }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0 && fileRef.current) {
              fileRef.current.files = e.dataTransfer.files;
            }
          }}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔒</div>
          <p style={{ color: '#666' }}>Drop a video file here or click to browse</p>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>MP4, MOV, AVI, MKV, WEBM (max 500MB)</p>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files.length > 0) {
                const el = document.querySelector('[data-drive-file-name]');
                if (el) el.textContent = e.target.files[0].name;
              }
            }}
          />
          <div data-drive-file-name style={{ fontSize: '13px', color: '#059669', marginTop: '8px', fontWeight: 600 }}></div>
        </div>

        {uploadProgress > 0 && (
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${uploadProgress}%` }} />
          </div>
        )}

        <button
          type="submit"
          disabled={uploading}
          style={{
            width: '100%', padding: '12px', borderRadius: '8px', border: 'none', fontSize: '15px',
            fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', marginTop: '12px',
            background: uploading ? '#9ca3af' : '#059669', color: 'white',
          }}
        >
          {uploading ? `Uploading... ${uploadProgress}%` : '📤 Upload Securely to Drive'}
        </button>
      </form>

      <div style={{ ...styles.header, marginBottom: '12px' }}>
        <h3 style={{ margin: 0 }}>📋 Uploaded Videos</h3>
        <span style={{ fontSize: '13px', color: '#888' }}>
          Playback is proxied through portal — files stay private on Drive
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: '12px' }}>Loading videos...</p>
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <p>No videos uploaded yet.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {videos.map(video => {
            const isDrive = isDriveVideo(video);
            return (
              <div key={video.id} style={styles.card}>
                <div style={{ background: '#f0fdf4', padding: '20px', textAlign: 'center', fontSize: '32px' }}>
                  🎬
                </div>
                <div style={styles.cardBody}>
                  <h4 style={{ marginBottom: '4px', fontSize: '15px' }}>{video.title}</h4>
                  {video.description && (
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>{video.description}</p>
                  )}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <span style={{ ...styles.badge, background: '#f0fdf4', color: '#059669' }}>
                      📁 {video.category_name || 'Course'}
                    </span>
                    {isDrive && (
                      <span style={{ ...styles.badge, background: '#fef3c7', color: '#d97706' }}>🔒 Private</span>
                    )}
                    {video.file_size && (
                      <span style={{ ...styles.badge, background: '#f3f4f6', color: '#6b7280' }}>
                        {formatSize(video.file_size)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {isDrive && (
                      <button
                        onClick={() => setPreviewVideo(video)}
                        style={{
                          padding: '6px 12px', borderRadius: '6px', background: '#059669', color: 'white',
                          border: 'none', fontSize: '13px', cursor: 'pointer',
                        }}
                      >
                        ▶ Play (Secure)
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(video.id, video.title)}
                      style={{
                        padding: '6px 12px', borderRadius: '6px', background: '#fee2e2', color: '#dc2626',
                        border: 'none', fontSize: '13px', cursor: 'pointer',
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
