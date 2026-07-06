const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { uploadVideo, deleteVideo, validateVideoFile, makeEmbedUrl, getStreamUrl } = require('../services/driveService');
const { isDriveConfigured, getDriveClient } = require('../config/drive');

const createRouter = (pool) => {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
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

  // ==================== UPLOAD TO GOOGLE DRIVE ====================

  router.post('/upload', authenticateToken, requireRole('admin', 'teacher'), upload.single('video'), async (req, res) => {
    try {
      const { title, description, category_id } = req.body;
      const videoFile = req.file;

      if (!title || !category_id || !videoFile) {
        return res.status(400).json({ message: 'Title, course, and video file are required' });
      }

      if (!isDriveConfigured()) {
        return res.status(500).json({ message: 'Google Drive is not configured. Set GOOGLE_DRIVE_SERVICE_KEY and GOOGLE_DRIVE_PARENT_FOLDER_ID.' });
      }

      validateVideoFile(videoFile.mimetype, videoFile.size);

      const courseRes = await pool.query('SELECT name FROM categories WHERE id = $1', [category_id]);
      if (courseRes.rows.length === 0) {
        return res.status(404).json({ message: 'Course not found' });
      }
      const courseName = courseRes.rows[0].name;

      const driveInfo = await uploadVideo(videoFile.buffer, videoFile.originalname, videoFile.mimetype, courseName);

      const embedUrl = makeEmbedUrl(driveInfo.driveFileId);

      const result = await pool.query(
        `INSERT INTO videos (title, description, category_id, teacher_id, video_url, file_size, mime_type, duration)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [title, description || '', category_id, req.user.id, embedUrl, videoFile.size, videoFile.mimetype, 0]
      );

      res.status(201).json({
        ...result.rows[0],
        driveInfo: {
          fileId: driveInfo.driveFileId,
          fileName: driveInfo.driveFileName,
          folderName: driveInfo.driveFolderName,
        },
      });
    } catch (error) {
      console.error('Drive upload error:', error);
      if (error.message.includes('Invalid video type') || error.message.includes('too large')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Upload to Google Drive failed: ' + error.message });
    }
  });

  // ==================== STREAM VIDEO (PROXIED THROUGH BACKEND) ====================

  router.get('/stream/:videoId', authenticateToken, async (req, res) => {
    try {
      const videoResult = await pool.query('SELECT * FROM videos WHERE id = $1', [req.params.videoId]);
      if (videoResult.rows.length === 0) return res.status(404).json({ message: 'Video not found' });

      const video = videoResult.rows[0];
      const embedUrl = video.video_url || '';
      const match = embedUrl.match(/\/file\/d\/([^/]+)/);
      if (!match) return res.status(400).json({ message: 'Not a Drive video' });

      const fileId = match[1];

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

      const drive = getDriveClient();
      if (!drive) return res.status(500).json({ message: 'Drive not configured' });

      const driveRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      res.setHeader('Content-Type', driveRes.data.mimeType || 'video/mp4');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, max-age=3600');

      driveRes.data.pipe(res);
    } catch (error) {
      console.error('Drive stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to stream video from Drive' });
      }
    }
  });

  // ==================== DELETE FROM DRIVE ====================

  router.delete('/:id', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const video = await pool.query('SELECT * FROM videos WHERE id = $1', [req.params.id]);
      if (video.rows.length === 0) return res.status(404).json({ message: 'Video not found' });
      if (req.user.role !== 'admin' && video.rows[0].teacher_id !== req.user.id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const embedUrl = video.rows[0].video_url || '';
      const match = embedUrl.match(/\/file\/d\/([^/]+)/);
      if (match) {
        await deleteVideo(match[1]);
      }

      await pool.query('DELETE FROM videos WHERE id = $1', [req.params.id]);
      res.json({ message: 'Video deleted' });
    } catch (error) {
      console.error('Delete Drive video error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ==================== LIST FOLDERS IN PARENT DRIVE ====================

  router.get('/folders', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      if (!isDriveConfigured()) {
        return res.status(500).json({ message: 'Google Drive is not configured' });
      }
      const drive = getDriveClient();
      const DRIVE_FOLDER_ID = require('../config/drive').DRIVE_FOLDER_ID;

      const listRes = await drive.files.list({
        q: `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'name',
      });

      res.json(listRes.data.files);
    } catch (error) {
      console.error('List Drive folders error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};

module.exports = { createRouter };
