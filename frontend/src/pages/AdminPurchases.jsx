import React, { useState, useEffect } from 'react';
import { adminService } from '../services/api';

const AdminPurchases = () => {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadPurchases();
  }, [filter]);

  const loadPurchases = async () => {
    try {
      const status = filter === 'all' ? undefined : filter;
      const data = await adminService.getPurchases(status);
      setPurchases(data);
    } catch (error) {
      console.error('Failed to load purchases:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await adminService.updatePurchaseStatus(id, status);
      setToast({ 
        message: status === 'approved' 
          ? 'Purchase approved! Student enrolled.' 
          : 'Purchase rejected.',
        type: status === 'approved' ? 'success' : 'info'
      });
      loadPurchases();
    } catch (error) {
      setToast({ message: error.message, type: 'error' });
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: '#fef3c7', color: '#92400e' },
      approved: { bg: '#dcfce7', color: '#166534' },
      rejected: { bg: '#fee2e2', color: '#991b1b' }
    };
    const style = styles[status] || styles.pending;
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600'
      }}>
        {status}
      </span>
    );
  };

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner"></div></div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      {toast && (
        <div className={`toast ${toast.type}`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}

      <div className="page-header">
        <h1>Purchase Management</h1>
        <p>Review invoice uploads and manage enrollments</p>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['all', 'pending', 'approved', 'rejected'].map(status => (
          <button
            key={status}
            className={`btn ${filter === status ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Purchases Table */}
      <div className="table-container">
        {purchases.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            No purchase requests found.
          </div>
        ) : (
          <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
            <tbody>
              {purchases.map(purchase => (
                <tr key={purchase.id}>
                  <td>
                    <div>
                      <strong>{purchase.student_name}</strong>
                      <p style={{ fontSize: '12px', color: '#666' }}>{purchase.student_email}</p>
                    </div>
                  </td>
                  <td>{purchase.course_name}</td>
                  <td><strong>RS {purchase.amount?.toLocaleString() || 0}</strong></td>
                  <td>{getStatusBadge(purchase.status)}</td>
                  <td>{new Date(purchase.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {purchase.status === 'pending' && (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleStatusUpdate(purchase.id, 'approved')}
                          >
                            ✓ Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleStatusUpdate(purchase.id, 'rejected')}
                          >
                            ✕ Reject
                          </button>
                        </>
                      )}
                      {purchase.status === 'approved' && (
                        <span style={{ color: '#16a34a' }}>✓ Enrolled</span>
                      )}
                      {purchase.status === 'rejected' && (
                        <span style={{ color: '#ef4444' }}>Rejected</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminPurchases;
