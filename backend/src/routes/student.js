const express = require('express');
const router = express.Router();
const multer = require('multer');
const StudentController = require('../controllers/studentController');
const { auth, studentAuth } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.use(auth);
router.use(studentAuth);

// Courses
router.get('/courses/available', StudentController.getAvailableCourses);
router.get('/courses/enrolled', StudentController.getMyCourses);

// Videos
router.get('/videos', StudentController.getVideos);
router.get('/videos/:id', StudentController.getVideo);
router.post('/videos/:id/view', StudentController.recordView);

// Invoice Upload
router.post('/upload-invoice', upload.single('invoice'), StudentController.uploadInvoice);

// Purchases
router.get('/purchases', StudentController.getMyPurchases);

// Notes
router.get('/notes', StudentController.getNotes);
router.post('/notes', StudentController.createNote);
router.delete('/notes/:id', StudentController.deleteNote);

// Attendance
router.get('/attendance', StudentController.getAttendance);

module.exports = router;
