const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Models = require('../models/Models');

class StudentController {
  // Get available courses (published, not enrolled)
  static async getAvailableCourses(req, res) {
    try {
      const pool = require('../config/database');
      
      // Get all published categories with video counts
      const result = await pool.query(`
        SELECT c.*, COUNT(v.id) as video_count
        FROM categories c
        LEFT JOIN videos v ON c.id = v.category_id
        WHERE c.is_published = true
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `);

      // Check enrollment status for each course
      const coursesWithStatus = await Promise.all(result.rows.map(async (course) => {
        const isEnrolled = await Models.isStudentEnrolled(req.user.id, course.id);
        const purchases = await Models.getStudentPurchases(req.user.id);
        const purchase = purchases.find(p => p.category_id === course.id);

        return {
          ...course,
          is_enrolled: isEnrolled,
          purchase_status: purchase?.status || null,
          purchase_id: purchase?.id || null,
          has_invoice: !!purchase?.invoice_path
        };
      }));

      res.json(coursesWithStatus);
    } catch (error) {
      console.error('Get available courses error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get enrolled courses
  static async getMyCourses(req, res) {
    try {
      const enrollments = await Models.getStudentEnrollments(req.user.id);
      res.json(enrollments);
    } catch (error) {
      console.error('Get my courses error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get videos by category (for enrolled students)
  static async getVideos(req, res) {
    try {
      const { categoryId } = req.query;
      const pool = require('../config/database');

      let query = `
        SELECT v.*, c.name as category_name, u.name as teacher_name
        FROM videos v
        JOIN categories c ON v.category_id = c.id
        JOIN users u ON v.teacher_id = u.id
      `;

      const params = [];
      
      if (categoryId) {
        // Check if student is enrolled in this category
        const isEnrolled = await Models.isStudentEnrolled(req.user.id, categoryId);
        if (!isEnrolled) {
          return res.status(403).json({ message: 'You are not enrolled in this course' });
        }
        query += ' WHERE v.category_id = $1';
        params.push(categoryId);
      } else {
        // Get all videos from enrolled courses
        query = `
          SELECT v.*, c.name as category_name, u.name as teacher_name,
                 EXISTS(SELECT 1 FROM student_enrollments se WHERE se.student_id = $1 AND se.category_id = v.category_id) as is_enrolled
          FROM videos v
          JOIN categories c ON v.category_id = c.id
          JOIN users u ON v.teacher_id = u.id
          WHERE v.category_id IN (SELECT category_id FROM student_enrollments WHERE student_id = $1)
          ORDER BY c.name, v.created_at DESC
        `;
        params.push(req.user.id);
      }

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error('Get videos error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get single video
  static async getVideo(req, res) {
    try {
      const { id } = req.params;
      const video = await Models.getVideoById(id);

      if (!video) {
        return res.status(404).json({ message: 'Video not found' });
      }

      // Check if student is enrolled
      const isEnrolled = await Models.isStudentEnrolled(req.user.id, video.category_id);
      if (!isEnrolled) {
        return res.status(403).json({ message: 'You are not enrolled in this course' });
      }

      // Increment views
      await Models.incrementVideoViews(id);
      await Models.recordVideoView(id, req.user.id);

      res.json(video);
    } catch (error) {
      console.error('Get video error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Upload invoice with password protection
  static async uploadInvoice(req, res) {
    try {
      const { courseId } = req.body;
      const invoiceFile = req.files?.invoice;

      if (!courseId) {
        return res.status(400).json({ message: 'Course ID is required' });
      }

      if (!invoiceFile) {
        return res.status(400).json({ message: 'Invoice file is required' });
      }

      // Validate file type
      const ext = path.extname(invoiceFile.name).toLowerCase();
      const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
      if (!allowedTypes.includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type. Allowed: PDF, JPG, PNG' });
      }

      // Check if student is enrolled
      const isEnrolled = await Models.isStudentEnrolled(req.user.id, courseId);
      if (isEnrolled) {
        return res.status(400).json({ message: 'You are already enrolled in this course' });
      }

      // Get course price
      const course = await Models.getCategoryById(courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Generate password for invoice protection
      const invoicePassword = crypto.randomBytes(4).toString('hex').toUpperCase();

      // Create purchase record first
      const purchase = await Models.createPurchase(
        req.user.id,
        courseId,
        course.price,
        'bank_transfer',
        `TXN-${Date.now()}`
      );

      // Save invoice file
      const filename = `invoice-${purchase.id}-${Date.now()}${ext}`;
      const invoicePath = `/uploads/invoices/${filename}`;
      const fullPath = path.join(__dirname, '../../uploads/invoices', filename);
      
      await invoiceFile.mv(fullPath);

      // Save invoice info to purchase
      await Models.saveInvoice(purchase.id, invoicePath, invoicePassword);

      // Create notification for admin
      await Models.createNotification(
        1, // Default admin ID - in production, get from config
        'New Invoice Uploaded',
        `Student ${req.user.email} has uploaded payment invoice for ${course.name}. Invoice Password: ${invoicePassword}`,
        'info',
        purchase.id
      );

      res.json({
        message: 'Invoice uploaded successfully. Admin will review and approve your enrollment.',
        purchaseId: purchase.id,
        invoicePassword: invoicePassword // Sending password to student (in production, send via email)
      });
    } catch (error) {
      console.error('Upload invoice error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get my purchases
  static async getMyPurchases(req, res) {
    try {
      const purchases = await Models.getStudentPurchases(req.user.id);
      res.json(purchases);
    } catch (error) {
      console.error('Get purchases error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get notes
  static async getNotes(req, res) {
    try {
      const notes = await Models.getNotesByStudent(req.user.id);
      res.json(notes);
    } catch (error) {
      console.error('Get notes error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Create note
  static async createNote(req, res) {
    try {
      const { videoId, content } = req.body;

      if (!videoId || !content) {
        return res.status(400).json({ message: 'Video ID and content are required' });
      }

      // Check if student has access to this video
      const video = await Models.getVideoById(videoId);
      if (!video) {
        return res.status(404).json({ message: 'Video not found' });
      }

      const isEnrolled = await Models.isStudentEnrolled(req.user.id, video.category_id);
      if (!isEnrolled) {
        return res.status(403).json({ message: 'You do not have access to this video' });
      }

      const note = await Models.createNote(req.user.id, videoId, content);
      res.status(201).json(note);
    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Delete note
  static async deleteNote(req, res) {
    try {
      const { id } = req.params;
      await Models.deleteNote(id);
      res.json({ message: 'Note deleted successfully' });
    } catch (error) {
      console.error('Delete note error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Get attendance
  static async getAttendance(req, res) {
    try {
      const records = await Models.getStudentAttendance(req.user.id);

      // Calculate stats
      const stats = {
        present: records.filter(r => r.status === 'present').length,
        absent: records.filter(r => r.status === 'absent').length,
        late: records.filter(r => r.status === 'late').length,
        total: records.length
      };
      stats.attendancePercentage = stats.total > 0 
        ? Math.round(((stats.present + stats.late) / stats.total) * 100) 
        : 0;

      res.json({ stats, records });
    } catch (error) {
      console.error('Get attendance error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Record video view
  static async recordView(req, res) {
    try {
      const { id } = req.params;
      await Models.recordVideoView(id, req.user.id);
      res.json({ message: 'View recorded' });
    } catch (error) {
      console.error('Record view error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
}

module.exports = StudentController;
