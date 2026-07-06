import { useState, useEffect, useRef } from 'react';

const API_URL = '/api';

const styles = {
  container: { padding: '24px' },
  playerWrapper: { position: 'relative', width: '100%', background: '#000', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' },
  video: { width: '100%', maxHeight: '500px', outline: 'none' },
  moduleGroup: { marginBottom: '24px' },
  moduleTitle: { fontSize: '16px', fontWeight: 700, color: '#1e40af', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' },
  videoItem: {
    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
    borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s',
    border: '1px solid #f3f4f6', marginBottom: '6px',
  },
  videoItemActive: { background: '#eff6ff', borderColor: '#2563eb' },
  progressDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
};

export default function StudentR2Player({ courseId, courseName }) {
  const [videos, setVideos] = useState([]);
  const [modules, setModules] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState(null);
  const videoRef = useRef(null);

  const showToast = (msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadVideos();
  }, [courseId]);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { 'Authorization': `Bearer ${token}` };

      const endpoint = courseId
        ? `${API_URL}/r2/course/${courseId}`
        : `${API_URL}/r2/my/all`;

      const [vids, mods] = await Promise.all([
        fetch(endpoint, { headers }).then(r => r.json()),
        courseId
          ? fetch(`${API_URL}/r2/modules/course/${courseId}`, { headers }).then(r => r.json())
          : Promise.resolve([]),
      ]);

      const r2Vids = (Array.isArray(vids) ? vids : []).filter(v => v.is_r2);
      setVideos(r2Vids);
      setModules(Array.isArray(mods) ? mods : []);

      if (r2Vids.length > 0) {
        selectVideo(r2Vids[0]);
      }
    } catch (err) {
      showToast('Failed to load videos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectVideo = async (video) => {
    setCurrentVideo(video);
    setStreamUrl(null);
    setPlaying(false);
    setProgress(0);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/r2/stream/${video.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Stream unavailable');
      const data = await res.json();
      setStreamUrl(data.streamUrl);
    } catch (err) {
      showToast('Failed to load video stream', 'error');
    }
  };

  const saveProgress = async () => {
    if (!currentVideo || !videoRef.current) return;
    try {
      const v = videoRef.current;
      const pct = Math.round((v.currentTime / (v.duration || 1)) * 100);
      await fetch(`${API_URL}/r2/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          video_id: currentVideo.id,
          progress: pct,
          last_position: Math.round(v.currentTime),
          duration: Math.round(v.duration || 0),
        }),
      });
    } catch {}
  };

  const groupedVideos = {};
  if (courseId) {
    modules.forEach(m => { groupedVideos[m.id] = { module: m, videos: [] }; });
    videos.forEach(v => {
      const key = v.module_id || 'ungrouped';
      if (!groupedVideos[key]) groupedVideos[key] = { module: { name: 'Ungrouped' }, videos: [] };
      groupedVideos[key].videos.push(v);
    });
  } else {
    videos.forEach(v => {
      const key = v.course_name || 'General';
      if (!groupedVideos[key]) groupedVideos[key] = { module: { name: key }, videos: [] };
      groupedVideos[key].videos.push(v);
    });
  }

  return (
    <div style={styles.container}>
      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, padding: '12px 24px', borderRadius: '8px', color: 'white', background: toast.type === 'error' ? '#ef4444' : '#10b981', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}

      <h3 style={{ marginBottom: '20px' }}>📹 {courseName || 'Course Videos'}</h3>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: '12px', color: '#666' }}>Loading videos...</p>
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📹</div>
          <p>No videos available for this course yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '24px', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
          {/* Video Player */}
          <div style={{ flex: 2 }}>
            {currentVideo && streamUrl ? (
              <div>
                <div style={styles.playerWrapper}>
                  <video
                    ref={videoRef}
                    src={streamUrl}
                    controls
                    autoPlay
                    style={styles.video}
                    onPlay={() => setPlaying(true)}
                    onPause={() => { setPlaying(false); saveProgress(); }}
                    onTimeUpdate={() => {
                      if (videoRef.current) {
                        setProgress(Math.round((videoRef.current.currentTime / (videoRef.current.duration || 1)) * 100));
                      }
                    }}
                    onEnded={() => { setPlaying(false); saveProgress(); }}
                  />
                </div>
                <h4 style={{ marginBottom: '4px' }}>{currentVideo.title}</h4>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{currentVideo.description}</p>
                <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: '#888' }}>
                  <span>📖 {currentVideo.module_name || 'General'}</span>
                  <span>👨‍🏫 {currentVideo.teacher_name || 'Teacher'}</span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '100px', background: '#f9fafb', borderRadius: '12px' }}>
                <p style={{ color: '#666' }}>Select a video to watch</p>
              </div>
            )}
          </div>

          {/* Video List */}
          <div style={{ flex: 1, maxHeight: '600px', overflowY: 'auto' }}>
            {Object.entries(groupedVideos).map(([key, group]) => (
              <div key={key} style={styles.moduleGroup}>
                <div style={styles.moduleTitle}>{group.module.name}</div>
                {group.videos.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999' }}>No videos</p>
                ) : (
                  group.videos.map(v => (
                    <div
                      key={v.id}
                      style={{ ...styles.videoItem, ...(currentVideo?.id === v.id ? styles.videoItemActive : {}) }}
                      onClick={() => selectVideo(v)}
                    >
                      <div style={{ ...styles.progressDot, background: currentVideo?.id === v.id ? '#2563eb' : '#d1d5db' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: currentVideo?.id === v.id ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {v.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#999' }}>{v.teacher_name}</div>
                      </div>
                      {currentVideo?.id === v.id && <span style={{ fontSize: '20px' }}>▶️</span>}
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
