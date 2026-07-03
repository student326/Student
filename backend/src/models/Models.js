const pool = require('../config/database');

class Models {
  // ==================== USERS ====================
  static async createUser(name, email, passwordHash, role) {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role]
    );
    return result.rows[0];
  }

  static async findUserByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findUserById(id) {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async getAllUsers(role = null) {
    let query = 'SELECT id, name, email, role, created_at FROM users';
    const params = [];
    if (role) {
      query += ' WHERE role = $1';
      params.push(role);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async deleteUser(id) {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
  }

  static async updateUser(id, data) {
    const { name, email, password_hash } = data;
    const updates = [];
    const values = [];
    let i = 1;

    if (name) { updates.push(`name = $${i++}`); values.push(name); }
    if (email) { updates.push(`email = $${i++}`); values.push(email); }
    if (password_hash) { updates.push(`password_hash = $${i++}`); values.push(password_hash); }

    if (updates.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, name, email, role, created_at`,
      values
    );
    return result.rows[0];
  }

  // ==================== CATEGORIES (COURSES) ====================
  static async createCategory(name, description, price, isPublished = true) {
    const result = await pool.query(
      `INSERT INTO categories (name, description, price, is_published) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || '', price || 0, isPublished]
    );
    return result.rows[0];
  }

  static async getAllCategories() {
    const result = await pool.query(
      `SELECT c.*, COUNT(v.id) as video_count 
       FROM categories c 
       LEFT JOIN videos v ON c.id = v.category_id 
       GROUP BY c.id 
       ORDER BY c.created_at DESC`
    );
    return result.rows;
  }

  static async getCategoryById(id) {
    const result = await pool.query(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async updateCategory(id, data) {
    const { name, description, price, is_published } = data;
    const updates = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description = $${i++}`); values.push(description); }
    if (price !== undefined) { updates.push(`price = $${i++}`); values.push(price); }
    if (is_published !== undefined) { updates.push(`is_published = $${i++}`); values.push(is_published); }

    if (updates.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async deleteCategory(id) {
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
  }

  static async getPublishedCategories() {
    const result = await pool.query(
      `SELECT c.*, COUNT(v.id) as video_count 
       FROM categories c 
       LEFT JOIN videos v ON c.id = v.category_id 
       WHERE c.is_published = true
       GROUP BY c.id 
       ORDER BY c.created_at DESC`
    );
    return result.rows;
  }

  // ==================== VIDEOS ====================
  static async createVideo(title, description, videoUrl, thumbnailUrl, categoryId, teacherId, duration = 0) {
    const result = await pool.query(
      `INSERT INTO videos (title, description, video_url, thumbnail_url, category_id, teacher_id, duration) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, description || '', videoUrl, thumbnailUrl, categoryId, teacherId, duration]
    );
    return result.rows[0];
  }

  static async getVideosByCategory(categoryId) {
    const result = await pool.query(
      `SELECT v.*, c.name as category_name, u.name as teacher_name 
       FROM videos v 
       JOIN categories c ON v.category_id = c.id 
       JOIN users u ON v.teacher_id = u.id 
       WHERE v.category_id = $1 
       ORDER BY v.created_at DESC`,
      [categoryId]
    );
    return result.rows;
  }

  static async getVideoById(id) {
    const result = await pool.query(
      `SELECT v.*, c.name as category_name, u.name as teacher_name 
       FROM videos v 
       JOIN categories c ON v.category_id = c.id 
       JOIN users u ON v.teacher_id = u.id 
       WHERE v.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async getVideosByTeacher(teacherId) {
    const result = await pool.query(
      `SELECT v.*, c.name as category_name 
       FROM videos v 
       JOIN categories c ON v.category_id = c.id 
       WHERE v.teacher_id = $1 
       ORDER BY v.created_at DESC`,
      [teacherId]
    );
    return result.rows;
  }

  static async deleteVideo(id) {
    const result = await pool.query(
      'DELETE FROM videos WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
  }

  static async incrementVideoViews(id) {
    await pool.query(
      'UPDATE videos SET views = views + 1 WHERE id = $1',
      [id]
    );
  }

  // ==================== ENROLLMENTS ====================
  static async enrollStudent(studentId, categoryId) {
    const result = await pool.query(
      `INSERT INTO student_enrollments (student_id, category_id) 
       VALUES ($1, $2) 
       ON CONFLICT (student_id, category_id) DO NOTHING 
       RETURNING *`,
      [studentId, categoryId]
    );
    return result.rows[0];
  }

  static async getStudentEnrollments(studentId) {
    const result = await pool.query(
      `SELECT se.*, c.name, c.description, c.price, 
              COUNT(v.id) as video_count,
              COALESCE((SELECT COUNT(*) FROM video_views vv WHERE vv.student_id = se.student_id AND vv.video_id IN (SELECT id FROM videos WHERE category_id = c.id)), 0) as completed_videos
       FROM student_enrollments se
       JOIN categories c ON se.category_id = c.id
       LEFT JOIN videos v ON c.id = v.category_id
       WHERE se.student_id = $1
       GROUP BY se.id, c.id`,
      [studentId]
    );
    return result.rows;
  }

  static async isStudentEnrolled(studentId, categoryId) {
    const result = await pool.query(
      'SELECT 1 FROM student_enrollments WHERE student_id = $1 AND category_id = $2',
      [studentId, categoryId]
    );
    return result.rows.length > 0;
  }

  static async removeEnrollment(studentId, categoryId) {
    await pool.query(
      'DELETE FROM student_enrollments WHERE student_id = $1 AND category_id = $2',
      [studentId, categoryId]
    );
  }

  // ==================== COURSE PURCHASES ====================
  static async createPurchase(studentId, categoryId, amount, paymentMethod, transactionId) {
    const result = await pool.query(
      `INSERT INTO course_purchases (student_id, category_id, amount, status, payment_method, transaction_id) 
       VALUES ($1, $2, $3, 'pending', $4, $5) 
       RETURNING *`,
      [studentId, categoryId, amount, paymentMethod, transactionId]
    );
    return result.rows[0];
  }

  static async updatePurchaseStatus(id, status, invoicePassword = null) {
    const result = await pool.query(
      `UPDATE course_purchases SET status = $1, invoice_password = $2, purchased_at = CURRENT_TIMESTAMP 
       WHERE id = $3 RETURNING *`,
      [status, invoicePassword, id]
    );
    return result.rows[0];
  }

  static async getPurchasesByStatus(status = null) {
    let query = `
      SELECT cp.*, u.name as student_name, u.email as student_email, 
             c.name as course_name, c.price as course_price
      FROM course_purchases cp
      JOIN users u ON cp.student_id = u.id
      JOIN categories c ON cp.category_id = c.id
    `;
    const params = [];
    if (status) {
      query += ' WHERE cp.status = $1';
      params.push(status);
    }
    query += ' ORDER BY cp.purchased_at DESC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getStudentPurchases(studentId) {
    const result = await pool.query(
      `SELECT cp.*, c.name as course_name, c.price as course_price
       FROM course_purchases cp
       JOIN categories c ON cp.category_id = c.id
       WHERE cp.student_id = $1
       ORDER BY cp.purchased_at DESC`,
      [studentId]
    );
    return result.rows;
  }

  static async saveInvoice(id, invoicePath, invoicePassword) {
    const result = await pool.query(
      `UPDATE course_purchases SET invoice_path = $1, invoice_password = $2, status = 'pending_review' 
       WHERE id = $3 RETURNING *`,
      [invoicePath, invoicePassword, id]
    );
    return result.rows[0];
  }

  // ==================== ATTENDANCE ====================
  static async markAttendance(studentId, date, status, markedBy) {
    const result = await pool.query(
      `INSERT INTO attendance (student_id, date, status, marked_by) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, date) DO UPDATE SET status = $3, marked_by = $4
       RETURNING *`,
      [studentId, date, status, markedBy]
    );
    return result.rows[0];
  }

  static async getAttendanceByDate(date) {
    const result = await pool.query(
      `SELECT a.*, u.name as student_name, u.email as student_email
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       WHERE a.date = $1`,
      [date]
    );
    return result.rows;
  }

  static async getStudentAttendance(studentId) {
    const result = await pool.query(
      `SELECT * FROM attendance WHERE student_id = $1 ORDER BY date DESC`,
      [studentId]
    );
    return result.rows;
  }

  // ==================== NOTES ====================
  static async createNote(studentId, videoId, content) {
    const result = await pool.query(
      `INSERT INTO notes (student_id, video_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [studentId, videoId, content]
    );
    return result.rows[0];
  }

  static async getNotesByStudent(studentId) {
    const result = await pool.query(
      `SELECT n.*, v.title as video_title, c.name as category_name
       FROM notes n
       JOIN videos v ON n.video_id = v.id
       JOIN categories c ON v.category_id = c.id
       WHERE n.student_id = $1
       ORDER BY n.created_at DESC`,
      [studentId]
    );
    return result.rows;
  }

  static async deleteNote(id) {
    await pool.query('DELETE FROM notes WHERE id = $1', [id]);
  }

  // ==================== VIDEO VIEWS ====================
  static async recordVideoView(videoId, studentId) {
    await pool.query(
      `INSERT INTO video_views (video_id, student_id) VALUES ($1, $2)`,
      [videoId, studentId]
    );
  }

  // ==================== LIVE CLASSES ====================
  static async createLiveClass(title, description, meetingUrl, startTime, categoryId, teacherId) {
    const result = await pool.query(
      `INSERT INTO live_classes (title, description, meeting_url, start_time, category_id, teacher_id) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description || '', meetingUrl, startTime, categoryId, teacherId]
    );
    return result.rows[0];
  }

  static async getLiveClasses(categoryId = null) {
    let query = `
      SELECT lc.*, c.name as category_name, u.name as teacher_name 
      FROM live_classes lc
      JOIN categories c ON lc.category_id = c.id
      JOIN users u ON lc.teacher_id = u.id
    `;
    const params = [];
    if (categoryId) {
      query += ' WHERE lc.category_id = $1';
      params.push(categoryId);
    }
    query += ' ORDER BY lc.start_time ASC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getLiveClassesByTeacher(teacherId) {
    const result = await pool.query(
      `SELECT lc.*, c.name as category_name 
       FROM live_classes lc
       JOIN categories c ON lc.category_id = c.id
       WHERE lc.teacher_id = $1 
       ORDER BY lc.start_time DESC`,
      [teacherId]
    );
    return result.rows;
  }

  // ==================== LIVE CHATS ====================
  static async createLiveChat(liveClassId, userId, message) {
    const result = await pool.query(
      `INSERT INTO live_chats (live_class_id, user_id, message) 
       VALUES ($1, $2, $3) RETURNING *`,
      [liveClassId, userId, message]
    );
    return result.rows[0];
  }

  static async getLiveChats(liveClassId) {
    const result = await pool.query(
      `SELECT lc.*, u.name as user_name, u.role as user_role
       FROM live_chats lc
       JOIN users u ON lc.user_id = u.id
       WHERE lc.live_class_id = $1
       ORDER BY lc.created_at ASC`,
      [liveClassId]
    );
    return result.rows;
  }

  // ==================== VIDEO BOOKMARKS ====================
  static async createVideoBookmark(studentId, videoId, timestampSec, label) {
    const result = await pool.query(
      `INSERT INTO video_bookmarks (student_id, video_id, timestamp_sec, label) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [studentId, videoId, timestampSec, label]
    );
    return result.rows[0];
  }

  static async getVideoBookmarks(studentId, videoId) {
    const result = await pool.query(
      `SELECT * FROM video_bookmarks 
       WHERE student_id = $1 AND video_id = $2
       ORDER BY timestamp_sec ASC`,
      [studentId, videoId]
    );
    return result.rows;
  }

  static async deleteVideoBookmark(id) {
    await pool.query('DELETE FROM video_bookmarks WHERE id = $1', [id]);
  }

  // ==================== VIDEO TRANSCRIPTS ====================
  static async createVideoTranscript(videoId, startSec, endSec, text) {
    const result = await pool.query(
      `INSERT INTO video_transcripts (video_id, start_sec, end_sec, text) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [videoId, startSec, endSec, text]
    );
    return result.rows[0];
  }

  static async getVideoTranscripts(videoId) {
    const result = await pool.query(
      `SELECT * FROM video_transcripts 
       WHERE video_id = $1 
       ORDER BY start_sec ASC`,
      [videoId]
    );
    return result.rows;
  }

  static async clearVideoTranscripts(videoId) {
    await pool.query('DELETE FROM video_transcripts WHERE video_id = $1', [videoId]);
  }

  // ==================== NOTIFICATIONS ====================
  static async createNotification(adminId, title, message, type = 'info', purchaseId = null) {
    const result = await pool.query(
      `INSERT INTO notifications (admin_id, title, message, type, purchase_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [adminId, title, message, type, purchaseId]
    );
    return result.rows[0];
  }

  static async getNotifications(adminId) {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE admin_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [adminId]
    );
    return result.rows;
  }

  static async markNotificationRead(id) {
    await pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
  }

  static async getUnreadNotificationCount(adminId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE admin_id = $1 AND is_read = false',
      [adminId]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = Models;
