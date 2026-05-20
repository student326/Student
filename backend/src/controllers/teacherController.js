const path = require('path');
const fs = require('fs');
const Models = require('../models/Models');

class TeacherController {
  // Get teacher's videos
  static async getMyVideos(req, res) {
    try {
      const videos = await Models.getVideosByTeacher(req.user.id);
      res.json(videos);
    } catch (error) {
      console.error('Get my videos error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Upload video
  static async uploadVideo(req, res) {
    try {
      const { title, description, categoryId, duration } = req.body;
      const videoFile = req.files?.video;
      const thumbnailFile = req.files?.thumbnail;

      if (!title || !categoryId || !videoFile) {
        return res.status(400).json({ message: 'Title, category, and video file are required' });
      }

      // Validate video file type
      const videoExt = path.extname(videoFile.name).toLowerCase();
      const allowedVideoTypes = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
      if (!allowedVideoTypes.includes(videoExt)) {
        return res.status(400).json({ message: 'Invalid video format. Allowed: MP4, WebM, MOV, AVI, MKV' });
      }

      // Generate unique filename
      const videoFilename = `${Date.now()}-${videoFile.name}`;
      const videoPath = `/uploads/videos/${videoFilename}`;

      // Save video file
      const videoFullPath = path.join(__dirname, '../../uploads/videos', videoFilename);
      await videoFile.mv(videoFullPath);

      // Handle thumbnail
      let thumbnailPath = null;
      if (thumbnailFile) {
        const thumbExt = path.extname(thumbnailFile.name).toLowerCase();
        const allowedThumbTypes = ['.jpg', '.jpeg', '.png', '.webp'];
        if (allowedThumbTypes.includes(thumbExt)) {
          const thumbFilename = `${Date.now()}-thumb-${thumbnailFile.name}`;
          thumbnailPath = `/uploads/videos/${thumbFilename}`;
          const thumbFullPath = path.join(__dirname, '../../uploads/videos', thumbFilename);
          await thumbnailFile.mv(thumbFullPath);
        }
      }

      const video = await Models.createVideo(
        title,
        description,
        videoPath,
        thumbnailPath,
        categoryId,
        req.user.id,
        parseInt(duration) || 0
      );

      res.status(201).json({
        message: 'Video uploaded successfully',
        video
      });
    } catch (error) {
      console.error('Upload video error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Delete video
  static async deleteVideo(req, res) {
    try {
      const { id } = req.params;

      // Get video to check ownership
      const pool = require('../config/database');
      const videoResult = await pool.query(
        'SELECT * FROM videos WHERE id = $1 AND teacher_id = $2',
        [id, req.user.id]
      );

      if (videoResult.rows.length === 0) {
        return res.status(404).json({ message: 'Video not found or you do not own this video' });
      }

      const video = videoResult.rows[0];

      // Delete video file
      if (video.video_url) {
        const videoFullPath = path.join(__dirname, '../..', video.video_url);
        if (fs.existsSync(videoFullPath)) {
          fs.unlinkSync(videoFullPath);
        }
      }

      // Delete thumbnail
      if (video.thumbnail_url) {
        const thumbFullPath = path.join(__dirname, '../..', video.thumbnail_url);
        if (fs.existsSync(thumbFullPath)) {
          fs.unlinkSync(thumbFullPath);
        }
      }

      // Delete from database
      await Models.deleteVideo(id);

      res.json({ message: 'Video deleted successfully' });
    } catch (error) {
      console.error('Delete video error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get categories (for teacher's use)
  static async getCategories(req, res) {
    try {
      const categories = await Models.getPublishedCategories();
      res.json(categories);
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get video analytics
  static async getVideoAnalytics(req, res) {
    try {
      const pool = require('../config/database');
      const result = await pool.query(`
        SELECT v.id, v.title, v.views, 
               COUNT(DISTINCT vv.student_id) as unique_viewers,
               COUNT(DISTINCT n.id) as notes_count
        FROM videos v
        LEFT JOIN video_views vv ON v.id = vv.video_id
        LEFT JOIN notes n ON v.id = n.video_id
        WHERE v.teacher_id = $1
        GROUP BY v.id
        ORDER BY v.views DESC
      `, [req.user.id]);

      res.json(result.rows);
    } catch (error) {
      console.error('Get video analytics error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
}

module.exports = TeacherController;
