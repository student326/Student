const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdminController = require('../controllers/adminController');
const { auth, adminAuth } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.use(auth);
router.use(adminAuth);

// Dashboard
router.get('/stats', AdminController.getStats);

// Users
router.get('/users', AdminController.getUsers);
router.post('/users', AdminController.createUser);
router.put('/users/:id', AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);

// Categories (Courses)
router.get('/categories', AdminController.getCategories);
router.post('/categories', AdminController.createCategory);
router.put('/categories/:id', AdminController.updateCategory);
router.delete('/categories/:id', AdminController.deleteCategory);

// Enrollments
router.get('/enrollments', AdminController.getEnrollments);
router.post('/enrollments', AdminController.enrollStudent);
router.delete('/enrollments/:studentId/:categoryId', AdminController.removeEnrollment);

// Grant Access
router.post('/grant-access', AdminController.grantAccess);

// Purchases
router.get('/purchases', AdminController.getPurchases);
router.put('/purchases/:id', AdminController.updatePurchaseStatus);

// Attendance
router.get('/attendance', AdminController.getAttendance);
router.post('/attendance', AdminController.markAttendance);

// Videos
router.get('/videos', AdminController.getVideos);
router.delete('/videos/:id', AdminController.deleteVideo);

// Notifications
router.get('/notifications', AdminController.getNotifications);
router.put('/notifications/:id/read', AdminController.markNotificationRead);

module.exports = router;
