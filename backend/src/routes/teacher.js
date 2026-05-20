const express = require('express');
const router = express.Router();
const multer = require('multer');
const TeacherController = require('../controllers/teacherController');
const { auth, teacherAuth } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

router.use(auth);
router.use(teacherAuth);

// Videos
router.get('/videos', TeacherController.getMyVideos);
router.post('/videos', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), TeacherController.uploadVideo);
router.delete('/videos/:id', TeacherController.deleteVideo);

// Categories
router.get('/categories', TeacherController.getCategories);

// Analytics
router.get('/analytics', TeacherController.getVideoAnalytics);

module.exports = router;
