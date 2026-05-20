const bcrypt = require('bcryptjs');
const Models = require('../models/Models');

class AdminController {
  // Dashboard stats
  static async getStats(req, res) {
    try {
      const students = await Models.getAllUsers('student');
      const teachers = await Models.getAllUsers('teacher');
      const categories = await Models.getAllCategories();
      const purchases = await Models.getPurchasesByStatus('pending');

      let totalViews = 0;
      const allVideos = await pool.query('SELECT SUM(views) as total FROM videos');
      totalViews = allVideos.rows[0]?.total || 0;

      res.json({
        students: students.length,
        teachers: teachers.length,
        courses: categories.length,
        pendingPurchases: purchases.length,
        totalViews: parseInt(totalViews)
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // User management
  static async getUsers(req, res) {
    try {
      const { role } = req.query;
      const users = await Models.getAllUsers(role);
      res.json(users);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async createUser(req, res) {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !email || !password || !role) {
        return res.status(400).json({ message: 'All fields are required' });
      }

      if (!['admin', 'teacher', 'student'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const existingUser = await Models.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await Models.createUser(name, email, passwordHash, role);

      res.status(201).json({
        message: 'User created successfully',
        user
      });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { name, email } = req.body;

      const user = await Models.updateUser(id, { name, email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Prevent self-deletion
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      const result = await Models.deleteUser(id);
      if (!result) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Category (Course) management
  static async getCategories(req, res) {
    try {
      const categories = await Models.getAllCategories();
      res.json(categories);
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async createCategory(req, res) {
    try {
      const { name, description, price, is_published } = req.body;

      if (!name) {
        return res.status(400).json({ message: 'Course name is required' });
      }

      const category = await Models.createCategory(name, description, price, is_published);
      res.status(201).json(category);
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const { name, description, price, is_published } = req.body;

      const category = await Models.updateCategory(id, { name, description, price, is_published });
      if (!category) {
        return res.status(404).json({ message: 'Course not found' });
      }

      res.json(category);
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await Models.deleteCategory(id);
      if (!result) {
        return res.status(404).json({ message: 'Course not found' });
      }
      res.json({ message: 'Course deleted successfully' });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Enrollment management
  static async getEnrollments(req, res) {
    try {
      const pool = require('../config/database');
      const result = await pool.query(`
        SELECT se.*, u.name as student_name, u.email as student_email, 
               c.name as course_name
        FROM student_enrollments se
        JOIN users u ON se.student_id = u.id
        JOIN categories c ON se.category_id = c.id
        ORDER BY se.enrolled_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('Get enrollments error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async enrollStudent(req, res) {
    try {
      const { studentId, categoryId } = req.body;

      if (!studentId || !categoryId) {
        return res.status(400).json({ message: 'Student ID and Category ID are required' });
      }

      await Models.enrollStudent(studentId, categoryId);
      res.status(201).json({ message: 'Student enrolled successfully' });
    } catch (error) {
      console.error('Enroll student error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async removeEnrollment(req, res) {
    try {
      const { studentId, categoryId } = req.params;
      await Models.removeEnrollment(studentId, categoryId);
      res.json({ message: 'Enrollment removed successfully' });
    } catch (error) {
      console.error('Remove enrollment error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Grant course access
  static async grantAccess(req, res) {
    try {
      const { studentId, categoryId, amount } = req.body;

      if (!studentId || !categoryId) {
        return res.status(400).json({ message: 'Student ID and Category ID are required' });
      }

      const category = await Models.getCategoryById(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Create completed purchase
      const purchase = await require('../config/database').query(
        `INSERT INTO course_purchases (student_id, category_id, amount, status, payment_method, transaction_id)
         VALUES ($1, $2, $3, 'completed', 'manual', $4)
         ON CONFLICT (student_id, category_id) DO UPDATE SET status = 'completed', amount = $3, purchased_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [studentId, categoryId, amount || category.price, `MANUAL-${Date.now()}`]
      );

      // Enroll student
      await Models.enrollStudent(studentId, categoryId);

      // Create notification
      await Models.createNotification(
        req.user.id,
        'Course Access Granted',
        `Access granted to student for course: ${category.name}`,
        'success',
        purchase.rows[0].id
      );

      res.json({
        message: 'Course access granted successfully',
        purchase: purchase.rows[0]
      });
    } catch (error) {
      console.error('Grant access error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Purchase management
  static async getPurchases(req, res) {
    try {
      const { status } = req.query;
      const purchases = await Models.getPurchasesByStatus(status);
      res.json(purchases);
    } catch (error) {
      console.error('Get purchases error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async updatePurchaseStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'completed', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const purchase = await Models.updatePurchaseStatus(id, status);

      // If approved, enroll student
      if (status === 'completed') {
        await Models.enrollStudent(purchase.student_id, purchase.category_id);

        const category = await Models.getCategoryById(purchase.category_id);
        await Models.createNotification(
          req.user.id,
          'Purchase Approved',
          `Purchase for ${category.name} has been approved`,
          'success',
          id
        );
      }

      // If rejected, notify student
      if (status === 'rejected') {
        await Models.createNotification(
          req.user.id,
          'Purchase Rejected',
          `Your purchase request has been rejected. Please contact support.`,
          'error',
          id
        );
      }

      res.json(purchase);
    } catch (error) {
      console.error('Update purchase status error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Attendance management
  static async getAttendance(req, res) {
    try {
      const { date } = req.query;
      const attendance = await Models.getAttendanceByDate(date || new Date().toISOString().split('T')[0]);
      res.json(attendance);
    } catch (error) {
      console.error('Get attendance error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async markAttendance(req, res) {
    try {
      const { studentId, date, status } = req.body;

      if (!studentId || !date || !status) {
        return res.status(400).json({ message: 'All fields are required' });
      }

      if (!['present', 'absent', 'late'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const attendance = await Models.markAttendance(studentId, date, status, req.user.id);
      res.json(attendance);
    } catch (error) {
      console.error('Mark attendance error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Videos management
  static async getVideos(req, res) {
    try {
      const pool = require('../config/database');
      const result = await pool.query(`
        SELECT v.*, c.name as category_name, u.name as teacher_name
        FROM videos v
        JOIN categories c ON v.category_id = c.id
        JOIN users u ON v.teacher_id = u.id
        ORDER BY v.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('Get videos error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async deleteVideo(req, res) {
    try {
      const { id } = req.params;
      const result = await Models.deleteVideo(id);
      if (!result) {
        return res.status(404).json({ message: 'Video not found' });
      }
      res.json({ message: 'Video deleted successfully' });
    } catch (error) {
      console.error('Delete video error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Notifications
  static async getNotifications(req, res) {
    try {
      const notifications = await Models.getNotifications(req.user.id);
      const unreadCount = await Models.getUnreadNotificationCount(req.user.id);
      res.json({ notifications, unreadCount });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async markNotificationRead(req, res) {
    try {
      const { id } = req.params;
      await Models.markNotificationRead(id);
      res.json({ message: 'Notification marked as read' });
    } catch (error) {
      console.error('Mark notification read error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
}

module.exports = AdminController;
