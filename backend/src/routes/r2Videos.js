const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { uploadVideo, deleteVideo, generateStreamUrl, validateVideoFile } = require('../services/r2Service');

const createRouter = (pool) => {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ message: 'Invalid or expired token' });
      req.user = user;
      next();
    });
  };

  const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };

  // ==================== MODULES ====================

  router.get('/modules/course/:courseId', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM modules WHERE category_id = $1 ORDER BY sort_order ASC, id ASC',
        [req.params.courseId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Get modules error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/modules', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const { category_id, name, description } = req.body;
      if (!category_id || !name) return res.status(400).json({ message: 'Course ID and module name are required' });
      const result = await pool.query(
        'INSERT INTO modules (category_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [category_id, name, description || '']
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create module error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.put('/modules/:id', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const { name, description, sort_order } = req.body;
      const result = await pool.query(
        'UPDATE modules SET name = COALESCE($1, name), description = COALESCE($2, description), sort_order = COALESCE($3, sort_order), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
        [name, description, sort_order, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: 'Module not found' });
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update module error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.delete('/modules/:id', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM modules WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ message: 'Module not found' });
      res.json({ message: 'Module deleted' });
    } catch (error) {
      console.error('Delete module error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ==================== R2 VIDEO UPLOAD ====================

  router.post('/upload', authenticateToken, requireRole('admin', 'teacher'), upload.single('video'), async (req, res) => {
    try {
      const { title, description, module_id, category_id } = req.body;
      const videoFile = req.file;

      if (!title || !category_id || !videoFile) {
        return res.status(400).json({ message: 'Title, course, and video file are required' });
      }

      validateVideoFile(videoFile.mimetype, videoFile.size);

      const videoKey = await uploadVideo(videoFile.buffer, videoFile.originalname, videoFile.mimetype, req.user.id);

      const result = await pool.query(
        `INSERT INTO videos (title, description, category_id, module_id, teacher_id, video_key, file_size, mime_type, is_r2, duration)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9) RETURNING *`,
        [title, description || '', category_id, module_id || null, req.user.id, videoKey, videoFile.size, videoFile.mimetype, 0]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('R2 upload error:', error);
      if (error.message.includes('Invalid video type') || error.message.includes('too large')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Upload failed' });
    }
  });

  // ==================== STREAMING ====================

  router.get('/stream/:id', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM videos WHERE id = $1 AND is_r2 = true', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ message: 'Video not found' });

      const video = result.rows[0];

      if (req.user.role === 'student') {
        const enrollment = await pool.query(
          'SELECT 1 FROM student_enrollments WHERE student_id = $1 AND category_id = $2',
          [req.user.id, video.category_id]
        );
        if (enrollment.rows.length === 0) return res.status(403).json({ message: 'Not enrolled in this course' });
      }

      if (req.user.role === 'teacher' && video.teacher_id !== req.user.id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const streamUrl = await generateStreamUrl(video.video_key);
      res.json({ streamUrl, expiresIn: 3600 });
    } catch (error) {
      console.error('Stream URL error:', error);
      res.status(500).json({ message: 'Failed to generate stream URL' });
    }
  });

  // ==================== CRUD ====================

  router.get('/course/:courseId', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT v.*, u.name as teacher_name, m.name as module_name, m.sort_order as module_sort
         FROM videos v
         LEFT JOIN users u ON v.teacher_id = u.id
         LEFT JOIN modules m ON v.module_id = m.id
         WHERE v.category_id = $1 AND v.is_r2 = true
         ORDER BY m.sort_order ASC NULLS LAST, v.created_at DESC`,
        [req.params.courseId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Get course videos error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.get('/my/all', authenticateToken, async (req, res) => {
    try {
      if (req.user.role === 'student') {
        const result = await pool.query(
          `SELECT v.*, u.name as teacher_name, m.name as module_name, m.sort_order as module_sort,
                  c.name as course_name, c.color as course_color
           FROM videos v
           INNER JOIN student_enrollments e ON v.category_id = e.category_id AND e.student_id = $1
           LEFT JOIN users u ON v.teacher_id = u.id
           LEFT JOIN modules m ON v.module_id = m.id
           LEFT JOIN categories c ON v.category_id = c.id
           WHERE v.is_r2 = true
           ORDER BY c.name, m.sort_order ASC NULLS LAST, v.created_at DESC`,
          [req.user.id]
        );
        return res.json(result.rows);
      }
      const result = await pool.query(
        `SELECT v.*, u.name as teacher_name, m.name as module_name, m.sort_order as module_sort,
                c.name as course_name, c.color as course_color
         FROM videos v
         LEFT JOIN users u ON v.teacher_id = u.id
         LEFT JOIN modules m ON v.module_id = m.id
         LEFT JOIN categories c ON v.category_id = c.id
         WHERE v.is_r2 = true
         ORDER BY c.name, m.sort_order ASC NULLS LAST, v.created_at DESC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Get all R2 videos error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.get('/teacher', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT v.*, c.name as category_name, m.name as module_name
         FROM videos v
         LEFT JOIN categories c ON v.category_id = c.id
         LEFT JOIN modules m ON v.module_id = m.id
         WHERE v.is_r2 = true AND v.teacher_id = $1
         ORDER BY v.created_at DESC`,
        [req.user.id]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Get teacher R2 videos error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.put('/:id', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const { title, description, module_id } = req.body;
      const result = await pool.query(
        `UPDATE videos SET title = COALESCE($1, title), description = COALESCE($2, description),
         module_id = COALESCE($3, module_id)
         WHERE id = $4 AND is_r2 = true AND teacher_id = $5 RETURNING *`,
        [title, description, module_id, req.params.id, req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: 'Video not found or not authorized' });
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update R2 video error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.delete('/:id', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const video = await pool.query('SELECT * FROM videos WHERE id = $1 AND is_r2 = true', [req.params.id]);
      if (video.rows.length === 0) return res.status(404).json({ message: 'Video not found' });
      if (req.user.role !== 'admin' && video.rows[0].teacher_id !== req.user.id) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      await deleteVideo(video.rows[0].video_key);
      await pool.query('DELETE FROM videos WHERE id = $1', [req.params.id]);
      res.json({ message: 'Video deleted' });
    } catch (error) {
      console.error('Delete R2 video error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ==================== PROGRESS ====================

  router.post('/progress', authenticateToken, requireRole('student'), async (req, res) => {
    try {
      const { video_id, progress, last_position, duration } = req.body;
      const result = await pool.query(
        `INSERT INTO video_progress (student_id, video_id, progress, last_position, duration)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, video_id)
         DO UPDATE SET progress = $3, last_position = $4, duration = $5
         RETURNING *`,
        [req.user.id, video_id, progress || 0, last_position || 0, duration || 0]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Save progress error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.get('/progress/:videoId', authenticateToken, requireRole('student'), async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM video_progress WHERE student_id = $1 AND video_id = $2',
        [req.user.id, req.params.videoId]
      );
      res.json(result.rows[0] || { progress: 0, last_position: 0 });
    } catch (error) {
      console.error('Get progress error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};

module.exports = { createRouter };
