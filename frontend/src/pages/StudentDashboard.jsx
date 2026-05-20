import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentService, getUser } from '../services/api';
import { paymentConfig } from '../config/paymentConfig';

const StudentDashboard = () => {
  const [availableCourses, setAvailableCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const user = getUser();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [courses, enrolled] = await Promise.all([
        studentService.getAvailableCourses(),
        studentService.getMyCourses()
      ]);
      setAvailableCourses(courses);
      setEnrollments(enrolled);
    } catch (error) {
      console.error('Failed to load data:', error);
      setToast({ message: error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const openInvoiceModal = (course) => {
    setSelectedCourse(course);
    setShowInvoiceModal(true);
  };

  const handleWhatsAppShare = async () => {
    setUploading(true);
    try {
      await studentService.createPurchase(selectedCourse.id);
      
      const message = `*Course Purchase Request*\n\n` +
        `Student: ${user?.name}\n` +
        `Email: ${user?.email}\n` +
        `Course: ${selectedCourse?.name}\n` +
        `Price: RS ${selectedCourse?.price?.toLocaleString() || 0}\n\n` +
        `Please find my payment receipt attached.`;
      
      const whatsappUrl = `https://wa.me/${paymentConfig.whatsapp.number}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      
      setToast({ message: 'Purchase request submitted! Please attach the receipt in WhatsApp.', type: 'success' });
      setShowInvoiceModal(false);
      loadData();
    } catch (error) {
      setToast({ message: error.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="student-dashboard">
      {toast && (
        <div className={`toast ${toast.type}`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}

      {/* Hero Section */}
      <div className="dashboard-hero">
        <div className="hero-pattern"></div>
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">Welcome back, {user?.name}!</h1>
            <p className="hero-subtitle">Continue your learning journey</p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-icon">📚</div>
              <div className="hero-stat-info">
                <span className="hero-stat-value">{enrollments.length}</span>
                <span className="hero-stat-label">Enrolled Courses</span>
              </div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-icon">🎬</div>
              <div className="hero-stat-info">
                <span className="hero-stat-value">
                  {enrollments.reduce((acc, c) => acc + (c.video_count || 0), 0)}
                </span>
                <span className="hero-stat-label">Total Videos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px' }}>
        {/* My Courses Section */}
        {enrollments.length > 0 && (
          <>
            <div className="section-header">
              <h2 className="section-title">📖 My Courses</h2>
            </div>
            <div className="course-grid">
              {enrollments.map((course) => (
                <div key={course.id} className="course-card">
                  <div className="course-thumbnail" style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}>
                    <div className="course-thumbnail-icon">📚</div>
                    <div className="enrolled-badge">✓ Enrolled</div>
                  </div>
                  <div className="course-content">
                    <h3 className="course-title">{course.name}</h3>
                    <p className="course-description">{course.description}</p>
                    <div className="course-meta">
                      <span>📹 {course.video_count || 0} videos</span>
                    </div>
                    <button 
                      className="btn btn-primary course-btn"
                      onClick={() => navigate(`/student/course/${course.id}`)}
                    >
                      Continue Learning →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Available Courses Section */}
        <div className="section-header" style={{ marginTop: '32px' }}>
          <h2 className="section-title">🛒 Available Courses</h2>
          <p style={{ color: '#666' }}>Browse and purchase courses to start learning</p>
        </div>

        {availableCourses.length === 0 ? (
          <div className="card text-center" style={{ padding: '40px' }}>
            <p style={{ color: '#666' }}>No courses available at the moment.</p>
          </div>
        ) : (
          <div className="course-grid">
            {availableCourses.map((course, index) => {
              const colors = ['#1e40af', '#7c3aed', '#059669', '#dc2626', '#ea580c'];
              const color = colors[index % colors.length];
              const isEnrolled = course.is_enrolled;
              const hasPending = course.purchase_status === 'pending';

              return (
                <div key={course.id} className={`course-card ${!isEnrolled ? 'locked-course' : ''}`}>
                  <div className="course-thumbnail" style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}>
                    <div className="course-thumbnail-icon">📚</div>
                    <div className="course-category-badge">{course.name}</div>
                    
                    {isEnrolled && <div className="enrolled-badge">✓ Enrolled</div>}
                    {hasPending && !isEnrolled && <div className="pending-badge">⏳ Pending</div>}
                    
                    {!isEnrolled && !hasPending && (
                      <div className="course-lock-overlay">
                        <div className="lock-content">
                          <span className="lock-icon">🔒</span>
                          <span className="lock-price">RS {course.price?.toLocaleString() || 0}</span>
                          <button 
                            className="buy-now-overlay-btn"
                            onClick={() => openInvoiceModal(course)}
                          >
                            Buy Now
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="course-content">
                    <h3 className="course-title">{course.name}</h3>
                    <p className="course-description">{course.description}</p>
                    
                    <div className="course-price-section">
                      <span>Price:</span>
                      <span className="course-price-value">
                        RS {course.price?.toLocaleString() || 0}
                      </span>
                    </div>

                    {isEnrolled ? (
                      <button className="btn btn-primary course-btn">
                        Continue Learning →
                      </button>
                    ) : hasPending ? (
                      <button className="btn btn-secondary course-btn" disabled>
                        ⏳ Awaiting Approval
                      </button>
                    ) : (
                      <button 
                        className="btn btn-primary course-btn buy-now-btn"
                        onClick={() => openInvoiceModal(course)}
                      >
                        🛒 Buy Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Purchase Request Modal */}
      {showInvoiceModal && (
        <div className="modal-overlay" onClick={() => setShowInvoiceModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🛒 Course Purchase</h2>
              <button className="modal-close" onClick={() => setShowInvoiceModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="card" style={{ marginBottom: '16px', background: '#fef3c7' }}>
                <h3>{selectedCourse?.name}</h3>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#b45309' }}>
                  RS {selectedCourse?.price?.toLocaleString() || 0}
                </p>
              </div>

              {/* Payment Instructions */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '8px' }}>💳 Bank Details:</h4>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>
                  <p><strong>Account Name:</strong> {paymentConfig.bank.accountName}</p>
                  <p><strong>Account Number:</strong> {paymentConfig.bank.accountNumber}</p>
                  <p><strong>Bank:</strong> {paymentConfig.bank.bankName}</p>
                  <p><strong>IFSC:</strong> {paymentConfig.bank.ifscCode}</p>
                </div>
                <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  UPI: {paymentConfig.upi.id}
                </p>
              </div>

              {/* WhatsApp Button */}
              <button
                className="btn btn-primary"
                style={{ width: '100%', background: '#25D366', borderColor: '#25D366' }}
                onClick={handleWhatsAppShare}
                disabled={uploading}
              >
                {uploading ? 'Processing...' : '📱 Send on WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
