require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const app = express();

// ==================== SECURITY MIDDLEWARE ====================

// Rate limiting for login attempts (in-memory store)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Global API rate limiting (100 requests per minute per IP)
const apiRateLimits = new Map();
const API_RATE_LIMIT = 100;
const API_RATE_WINDOW = 60 * 1000; // 1 minute

// Token blacklist for logout
const tokenBlacklist = new Set();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of loginAttempts) {
    if (now > data.lockoutUntil) {
      loginAttempts.delete(email);
    }
  }
  // Clean API rate limits
  for (const [ip, data] of apiRateLimits) {
    if (now > data.resetAt) {
      apiRateLimits.delete(ip);
    }
  }
}, 60000); // Clean every minute

// Global API rate limiter middleware
const apiRateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  let rateData = apiRateLimits.get(ip) || { count: 0, resetAt: now + API_RATE_WINDOW };
  
  if (now > rateData.resetAt) {
    rateData = { count: 0, resetAt: now + API_RATE_WINDOW };
  }
  
  rateData.count++;
  apiRateLimits.set(ip, rateData);
  
  if (rateData.count > API_RATE_LIMIT) {
    return res.status(429).json({ 
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((rateData.resetAt - now) / 1000)
    });
  }
  
  next();
};

// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

// ==================== SECURITY HEADERS ====================

// Security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;");
  next();
});

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.VERCEL) return callback(null, true);
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Database connection (supports both DATABASE_URL for Vercel/Neon and individual params)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'student_portal',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
    });

// ==================== SECURITY CONFIG ====================

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('⚠️  WARNING: JWT_SECRET not set in environment variables!');
  console.error('⚠️  Please set a strong, random secret in your .env file');
}

// Token expiry times (in seconds)
const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour
const REFRESH_TOKEN_EXPIRY = 60 * 60 * 24 * 7; // 7 days
const RESET_TOKEN_EXPIRY = 15 * 60; // 15 minutes

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIRE_UPPERCASE = true;
const PASSWORD_REQUIRE_LOWERCASE = true;
const PASSWORD_REQUIRE_NUMBER = true;
const PASSWORD_REQUIRE_SPECIAL = true;

// ==================== HELPER FUNCTIONS ====================

// Input validation and sanitization
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  // Remove null bytes and trim
  return input.replace(/\0/g, '').trim();
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateInteger = (value) => {
  const parsed = parseInt(value);
  return !isNaN(parsed) && parsed > 0;
};

// Validate password strength
const validatePassword = (password) => {
  const errors = [];
  
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  if (PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (PASSWORD_REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (PASSWORD_REQUIRE_NUMBER && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return errors;
};

// Secure random token generator
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Hash token for storage
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Check if token is blacklisted
const isTokenBlacklisted = (token) => {
  return tokenBlacklist.has(hashToken(token));
};

// Sanitize user data for response
const sanitizeUser = (user) => {
  const { password_hash, reset_token, reset_token_expiry, ...safeUser } = user;
  return safeUser;
};

// Record login attempt
const recordLoginAttempt = (email, success) => {
  const now = Date.now();
  const attempts = loginAttempts.get(email) || { count: 0, lockoutUntil: 0 };
  
  if (success) {
    loginAttempts.delete(email);
    return true;
  }
  
  attempts.count += 1;
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockoutUntil = now + LOGIN_LOCKOUT_TIME;
  }
  
  loginAttempts.set(email, attempts);
  return attempts.lockoutUntil > now;
};

// Get login attempt info
const getLoginAttemptInfo = (email) => {
  const attempts = loginAttempts.get(email);
  if (!attempts) return { attempts: 0, locked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  
  const now = Date.now();
  const locked = attempts.lockoutUntil > now;
  const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - attempts.count);
  
  return { attempts: attempts.count, locked, remainingAttempts, lockoutRemaining: locked ? Math.ceil((attempts.lockoutUntil - now) / 60000) : 0 };
};

// ==================== AUTH MIDDLEWARE ====================

// Authenticate token with blacklist check
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  // Check blacklist
  if (isTokenBlacklisted(token)) {
    return res.status(401).json({ message: 'Token has been invalidated' });
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token has expired. Please refresh your session.' });
      }
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    req.token = token;
    next();
  });
};

// Role check middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'thumbnails';
    if (file.fieldname === 'video') subDir = 'videos';
    else if (file.fieldname === 'receipt') subDir = 'receipts';
    
    const dir = path.join(__dirname, 'uploads', subDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      const allowedTypes = /mp4|webm|avi|mov|mkv/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      if (extname) {
        return cb(null, true);
      }
      cb(new Error('Video format not supported'));
    } else {
      cb(null, true);
    }
  }
});

// ==================== AUTH ROUTES ====================

// Login with rate limiting
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Sanitize email
    const sanitizedEmail = email.toLowerCase().trim();

    // Check for account lockout
    const attemptInfo = getLoginAttemptInfo(sanitizedEmail);
    if (attemptInfo.locked) {
      return res.status(429).json({ 
        message: `Account temporarily locked due to too many failed attempts. Try again in ${attemptInfo.lockoutRemaining} minutes.`,
        lockoutRemaining: attemptInfo.lockoutRemaining
      });
    }

    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [sanitizedEmail]
    );

    if (result.rows.length === 0) {
      recordLoginAttempt(sanitizedEmail, false);
      return res.status(401).json({ 
        message: 'Invalid email or password',
        remainingAttempts: attemptInfo.remainingAttempts - 1
      });
    }

    const user = result.rows[0];

    // Check if account is locked in database
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockoutRemaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(429).json({ 
        message: `Account is locked. Try again in ${lockoutRemaining} minutes.`,
        lockoutRemaining
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      const isLocked = recordLoginAttempt(sanitizedEmail, false);
      
      if (isLocked) {
        // Lock account in database
        const lockoutUntil = new Date(Date.now() + LOGIN_LOCKOUT_TIME);
        await pool.query(
          'UPDATE users SET locked_until = $1 WHERE id = $2',
          [lockoutUntil, user.id]
        );
        return res.status(429).json({ 
          message: 'Account locked due to too many failed attempts. Try again in 15 minutes.',
          lockoutRemaining: 15
        });
      }

      return res.status(401).json({ 
        message: 'Invalid email or password',
        remainingAttempts: attemptInfo.remainingAttempts - 1
      });
    }

    // Clear login attempts on successful login
    recordLoginAttempt(sanitizedEmail, true);
    
    // Clear lockout in database
    if (user.locked_until) {
      await pool.query('UPDATE users SET locked_until = NULL WHERE id = $1', [user.id]);
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Generate tokens
    const accessToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        name: user.name,
        type: 'access',
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' }
    );

    const refreshToken = generateSecureToken();
    const refreshTokenHash = hashToken(refreshToken);
    const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000);

    // Store refresh token in database
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, refreshTokenHash, refreshTokenExpiry]
    );

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Refresh token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const tokenHash = hashToken(refreshToken);
    
    // Find valid refresh token
    const result = await pool.query(
      `SELECT rt.*, u.id as user_id, u.email, u.role, u.name, u.locked_until
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW() AND rt.revoked = false`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const tokenData = result.rows[0];

    // Check if user account is locked
    if (tokenData.locked_until && new Date(tokenData.locked_until) > new Date()) {
      return res.status(429).json({ message: 'Account is locked' });
    }

    // Revoke old refresh token
    await pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
      [tokenHash]
    );

    // Generate new access token
    const accessToken = jwt.sign(
      { 
        id: tokenData.user_id, 
        email: tokenData.email, 
        role: tokenData.role, 
        name: tokenData.name,
        type: 'access',
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' }
    );

    // Generate new refresh token
    const newRefreshToken = generateSecureToken();
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const newRefreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [tokenData.user_id, newRefreshTokenHash, newRefreshTokenExpiry]
    );

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout - invalidate token
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    // Add token to blacklist
    tokenBlacklist.add(hashToken(req.token));
    
    // Revoke refresh tokens for this user
    await pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false',
      [req.user.id]
    );

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change password (authenticated user)
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Validate new password strength
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Password does not meet requirements',
        errors: passwordErrors
      });
    }

    // Get current user
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    // Revoke all refresh tokens for this user (force re-login)
    await pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ message: 'Password changed successfully. Please login again.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Password Reset Request
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const sanitizedEmail = email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [sanitizedEmail]);
    
    if (result.rows.length > 0) {
      // Generate reset token
      const resetToken = generateSecureToken(48);
      const resetTokenHash = hashToken(resetToken);
      const resetExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY * 1000);

      await pool.query(
        'UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE email = $3',
        [resetTokenHash, resetExpiry, sanitizedEmail]
      );

      // In production, send email here
      // For now, log the reset link (REMOVE IN PRODUCTION!)
      console.log(`🔑 Password reset link for ${sanitizedEmail}: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`);
      
      // TODO: Send actual email with reset link
      // await sendEmail(sanitizedEmail, 'Password Reset', `Your reset link: ${resetLink}`);
    }

    // Always return success to prevent email enumeration
    res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset Password with Token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    // Validate password strength
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Password does not meet requirements',
        errors: passwordErrors
      });
    }

    const tokenHash = hashToken(token);
    
    const result = await pool.query(
      'SELECT id, email FROM users WHERE reset_token_hash = $1 AND reset_token_expires_at > NOW()',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, user.id]
    );

    // Revoke all refresh tokens (force re-login)
    await pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
      [user.id]
    );

    res.json({ message: 'Password reset successfully. Please login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ADD DATABASE TABLES FOR SECURITY ====================

// This will be called on server start to ensure tables exist
const initializeSecurityTables = async () => {
  try {
    // Create refresh_tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ refresh_tokens table created');

    // Add security columns to users table
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'locked_until') THEN
          ALTER TABLE users ADD COLUMN locked_until TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
          ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'reset_token_hash') THEN
          ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(64);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'reset_token_expires_at') THEN
          ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
          ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `);
    console.log('  ✓ Security columns added to users table');

    // Create index on refresh_tokens
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)
    `);

  } catch (error) {
    console.error('Failed to initialize security tables:', error);
  }
};

// ==================== NOTIFICATIONS (unchanged) ====================

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    let result;
    
    if (req.user.role === 'student') {
      result = await pool.query(`
        SELECT n.*, u.name as from_user_name
        FROM notifications n
        LEFT JOIN users u ON n.from_user_id = u.id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT 50
      `, [req.user.id]);
    } else if (req.user.role === 'admin') {
      result = await pool.query(`
        SELECT n.*, u.name as from_user_name
        FROM notifications n
        LEFT JOIN users u ON n.from_user_id = u.id
        ORDER BY n.created_at DESC
        LIMIT 50
      `);
    } else {
      result = await pool.query(`
        SELECT n.*, u.name as from_user_name
        FROM notifications n
        LEFT JOIN users u ON n.from_user_id = u.id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT 50
      `, [req.user.id]);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== VIDEO PROGRESS (unchanged) ====================

app.post('/api/student/video-progress', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { video_id, progress, duration } = req.body;
    
    if (!video_id || typeof progress !== 'number') {
      return res.status(400).json({ message: 'Valid video_id and progress are required' });
    }

    // Validate video belongs to enrolled course (IDOR protection)
    const videoCheck = await pool.query(
      `SELECT v.id FROM videos v 
       JOIN student_enrollments e ON v.category_id = e.category_id 
       WHERE v.id = $1 AND e.student_id = $2`,
      [video_id, req.user.id]
    );

    if (videoCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You can only track progress for enrolled courses' });
    }
    
    await pool.query(`
      INSERT INTO video_progress (student_id, video_id, progress, duration, last_position)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (student_id, video_id) 
      DO UPDATE SET 
        progress = GREATEST(video_progress.progress, $3),
        last_position = $5,
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.id, video_id, progress, duration, Math.floor((progress / 100) * duration)]);

    res.json({ message: 'Progress saved' });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/student/course/:courseId/progress', authenticateToken, requireRole('student'), async (req, res) => {
  const { courseId } = req.params;

  // Validate student is enrolled in this course (IDOR protection)
  const enrollmentCheck = await pool.query(
    'SELECT 1 FROM student_enrollments WHERE student_id = $1 AND category_id = $2',
    [req.user.id, courseId]
  );

  if (enrollmentCheck.rows.length === 0) {
    return res.status(403).json({ message: 'Not enrolled in this course' });
  }

  try {
    const result = await pool.query(`
      SELECT vp.*, v.title
      FROM video_progress vp
      JOIN videos v ON vp.video_id = v.id
      WHERE vp.student_id = $1 AND v.category_id = $2
    `, [req.user.id, courseId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ADMIN STATS ====================

app.get('/api/admin/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [
      students, teachers, categories, videos, 
      totalViews, pendingPurchases, enrollments
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'student'"),
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher'"),
      pool.query('SELECT COUNT(*) FROM categories WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM videos'),
      pool.query('SELECT COALESCE(SUM(views), 0) FROM videos'),
      pool.query("SELECT COUNT(*) FROM course_purchases WHERE status = 'pending'"),
      pool.query('SELECT COUNT(*) FROM student_enrollments')
    ]);

    res.json({
      students: parseInt(students.rows[0].count),
      teachers: parseInt(teachers.rows[0].count),
      courses: parseInt(categories.rows[0].count),
      videos: parseInt(videos.rows[0].count),
      totalViews: parseInt(totalViews.rows[0].sum),
      pendingPurchases: parseInt(pendingPurchases.rows[0].count),
      enrollments: parseInt(enrollments.rows[0].count)
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ADMIN USERS ====================

app.get('/api/admin/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.query;
    let query = 'SELECT id, name, email, role, created_at, last_login FROM users';
    const params = [];
    
    if (role) {
      query += ' WHERE role = $1';
      params.push(role);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/admin/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!['admin', 'teacher', 'student'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Validate password strength
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Password does not meet requirements',
        errors: passwordErrors
      });
    }

    // Check if email exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email.toLowerCase(), hashedPassword, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/admin/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (email) {
      updates.push(`email = $${paramIndex++}`);
      params.push(email.toLowerCase());
    }
    if (role) {
      if (!['admin', 'teacher', 'student'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING id, name, email, role, created_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== CATEGORIES ====================

app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/categories', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { name, description, price, icon, color } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const result = await pool.query(
      'INSERT INTO categories (name, description, price, icon, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, price || 0, icon || '📚', color || '#1e40af']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, icon, color, is_active } = req.body;

    const result = await pool.query(
      'UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), price = COALESCE($3, price), icon = COALESCE($4, icon), color = COALESCE($5, color), is_active = COALESCE($6, is_active) WHERE id = $7 RETURNING *',
      [name, description, price, icon, color, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== VIDEOS ====================

app.get('/api/videos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
             u.name as teacher_name
      FROM videos v
      LEFT JOIN categories c ON v.category_id = c.id
      LEFT JOIN users u ON v.teacher_id = u.id
      ORDER BY v.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/teacher/videos', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM videos v
      LEFT JOIN categories c ON v.category_id = c.id
      WHERE v.teacher_id = $1
      ORDER BY v.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get teacher videos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/videos', authenticateToken, requireRole('admin', 'teacher'), upload.fields([{ name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, description, category_id, duration } = req.body;
    const videoFile = req.files?.video?.[0];

    if (!title || !category_id) {
      return res.status(400).json({ message: 'Title and category are required' });
    }

    const videoUrl = videoFile ? `/uploads/videos/${videoFile.filename}` : null;

    const result = await pool.query(
      'INSERT INTO videos (title, description, video_url, category_id, teacher_id, duration) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, videoUrl, category_id, req.user.id, duration || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/videos/:id', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category_id, duration } = req.body;

    const result = await pool.query(
      'UPDATE videos SET title = COALESCE($1, title), description = COALESCE($2, description), category_id = COALESCE($3, category_id), duration = COALESCE($4, duration) WHERE id = $5 RETURNING *',
      [title, description, category_id, duration, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Video not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/videos/:id', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM videos WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Video not found' });
    }

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/videos/:id/view', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'INSERT INTO video_views (video_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, req.user.id]
    );
    
    await pool.query('UPDATE videos SET views = views + 1 WHERE id = $1', [id]);

    res.json({ message: 'View recorded' });
  } catch (error) {
    console.error('Record view error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== STUDENT ENROLLMENTS ====================

app.get('/api/student/enrollments', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM videos WHERE category_id = c.id) as video_count,
             (SELECT COUNT(*) FROM video_progress vp JOIN videos v ON vp.video_id = v.id WHERE v.category_id = c.id AND vp.student_id = $1 AND vp.progress >= 80) as completed_videos
      FROM categories c
      JOIN student_enrollments e ON c.id = e.category_id
      WHERE e.student_id = $1 AND c.is_active = true
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/student/available-courses', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM videos WHERE category_id = c.id) as video_count,
             EXISTS(SELECT 1 FROM student_enrollments WHERE student_id = $1 AND category_id = c.id) as is_enrolled
      FROM categories c
      WHERE c.is_active = true
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get available courses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/student/course/:categoryId/videos', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Check enrollment
    const enrollment = await pool.query(
      'SELECT 1 FROM student_enrollments WHERE student_id = $1 AND category_id = $2',
      [req.user.id, categoryId]
    );

    if (enrollment.rows.length === 0) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    const result = await pool.query(
      'SELECT * FROM videos WHERE category_id = $1 ORDER BY created_at',
      [categoryId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get course videos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ADMIN ENROLLMENTS ====================

app.get('/api/admin/enrollments', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, u.name as student_name, u.email as student_email,
             c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM student_enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN categories c ON e.category_id = c.id
      ORDER BY e.enrolled_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/admin/enrollments', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { student_id, category_id } = req.body;

    await pool.query(
      'INSERT INTO student_enrollments (student_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [student_id, category_id]
    );

    // Create notification
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)',
      [student_id, 'Course Enrolled', 'You have been enrolled in a new course!', 'enrollment']
    );

    res.status(201).json({ message: 'Student enrolled successfully' });
  } catch (error) {
    console.error('Create enrollment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/admin/enrollments/:studentId/:categoryId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { studentId, categoryId } = req.params;
    await pool.query(
      'DELETE FROM student_enrollments WHERE student_id = $1 AND category_id = $2',
      [studentId, categoryId]
    );
    res.json({ message: 'Enrollment removed' });
  } catch (error) {
    console.error('Delete enrollment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== STUDENT NOTES ====================

app.get('/api/student/notes', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notes WHERE student_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/student/notes', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { video_id, content } = req.body;

    if (!video_id || !content) {
      return res.status(400).json({ message: 'Video ID and content are required' });
    }

    // Validate content length
    if (content.length > 10000) {
      return res.status(400).json({ message: 'Note content exceeds maximum length of 10000 characters' });
    }

    // Validate video belongs to enrolled course (IDOR protection)
    const videoCheck = await pool.query(
      `SELECT v.id FROM videos v 
       JOIN student_enrollments e ON v.category_id = e.category_id 
       WHERE v.id = $1 AND e.student_id = $2`,
      [video_id, req.user.id]
    );

    if (videoCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You can only add notes for enrolled courses' });
    }

    const result = await pool.query(
      'INSERT INTO notes (student_id, video_id, content) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, video_id, content.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/student/notes/:id', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const result = await pool.query(
      'UPDATE notes SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND student_id = $3 RETURNING *',
      [content, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/student/notes/:id', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM notes WHERE id = $1 AND student_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.json({ message: 'Note deleted' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ATTENDANCE ====================

app.post('/api/admin/attendance', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { student_id, date, status } = req.body;

    if (!student_id || !date || !status) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!['present', 'absent', 'late'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    await pool.query(
      `INSERT INTO attendance (student_id, date, status, marked_by) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (student_id, date) DO UPDATE SET status = $3, marked_by = $4`,
      [student_id, date, status, req.user.id]
    );

    res.json({ message: 'Attendance marked' });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/admin/attendance', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { date } = req.query;
    let query = `
      SELECT a.*, u.name as student_name, u.email as student_email
      FROM attendance a
      JOIN users u ON a.student_id = u.id
    `;
    const params = [];

    if (date) {
      query += ' WHERE a.date = $1';
      params.push(date);
    }

    query += ' ORDER BY a.date DESC, u.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/student/attendance', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM attendance WHERE student_id = $1 ORDER BY date DESC LIMIT 30',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== PURCHASES ====================

app.post('/api/student/purchases', authenticateToken, requireRole('student'), upload.single('receipt'), async (req, res) => {
  try {
    const { category_id } = req.body;
    const receiptPath = req.file ? `/uploads/receipts/${req.file.filename}` : null;

    if (!category_id) {
      return res.status(400).json({ message: 'Category ID is required' });
    }

    const catId = parseInt(category_id);
    if (isNaN(catId)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const studentId = parseInt(req.user.id);

    // Check if already enrolled
    const enrolled = await pool.query(
      'SELECT 1 FROM student_enrollments WHERE student_id = $1 AND category_id = $2',
      [studentId, catId]
    );

    if (enrolled.rows.length > 0) {
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }

    // Check existing pending purchase
    const existing = await pool.query(
      "SELECT 1 FROM course_purchases WHERE student_id = $1 AND category_id = $2 AND status = 'pending'",
      [studentId, catId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Purchase request already pending' });
    }

    const category = await pool.query('SELECT price FROM categories WHERE id = $1', [catId]);
    if (category.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const result = await pool.query(
      `INSERT INTO course_purchases (student_id, category_id, amount, status, payment_receipt)
       VALUES ($1, $2, $3, 'pending', $4) 
       ON CONFLICT (student_id, category_id) 
       DO UPDATE SET status = 'pending', payment_receipt = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, catId, category.rows[0].price || 0, receiptPath]
    );

    // Notify admin - fault tolerant
    try {
      const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins.rows) {
        await pool.query(
          'INSERT INTO notifications (user_id, from_user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)',
          [admin.id, studentId, 'New Purchase Request', `${req.user.name || 'A student'} requested course access`, 'payment']
        ).catch(err => console.error('Notification error:', err.message));
      }
    } catch (notifErr) {
      console.error('Admin notification loop error:', notifErr.message);
    }

    res.status(201).json({
      ...result.rows[0],
      message: 'Purchase request submitted. Admin will review shortly.'
    });
  } catch (error) {
    console.error('Create purchase error:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'A purchase request for this course already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/student/purchases', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cp.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM course_purchases cp
      JOIN categories c ON cp.category_id = c.id
      WHERE cp.student_id = $1
      ORDER BY cp.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== ADMIN PURCHASES ====================

app.get('/api/admin/purchases', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT cp.id, cp.status, cp.amount, cp.created_at, cp.updated_at,
             u.id as student_id, u.name as student_name, u.email as student_email,
             c.id as category_id, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM course_purchases cp
      JOIN users u ON cp.student_id = u.id
      JOIN categories c ON cp.category_id = c.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE cp.status = $1';
      params.push(status);
    }

    query += ' ORDER BY cp.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/admin/purchases/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const purchase = await pool.query('SELECT * FROM course_purchases WHERE id = $1', [id]);
    if (purchase.rows.length === 0) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    await pool.query(
      'UPDATE course_purchases SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, id]
    );

    // If approved, enroll student
    if (status === 'approved') {
      await pool.query(
        'INSERT INTO student_enrollments (student_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [purchase.rows[0].student_id, purchase.rows[0].category_id]
      );

      // Notify student
      await pool.query(
        'INSERT INTO notifications (user_id, from_user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)',
        [purchase.rows[0].student_id, req.user.id, 'Purchase Approved', 'Your course purchase has been approved!', 'enrollment']
      );
    } else if (status === 'rejected') {
      // Notify student
      await pool.query(
        'INSERT INTO notifications (user_id, from_user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)',
        [purchase.rows[0].student_id, req.user.id, 'Purchase Rejected', 'Your course purchase has been rejected.', 'payment']
      );
    }

    res.json({ message: `Purchase ${status} successfully` });
  } catch (error) {
    console.error('Update purchase error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== LIVE CLASSES & CHAT ====================

app.get('/api/live-classes', authenticateToken, async (req, res) => {
  try {
    const { categoryId } = req.query;
    let query = `
      SELECT lc.*, c.name as category_name, u.name as teacher_name 
      FROM live_classes lc
      JOIN categories c ON lc.category_id = c.id
      JOIN users u ON lc.teacher_id = u.id
    `;
    const params = [];
    if (req.user.role === 'teacher') {
      query += ' WHERE lc.teacher_id = $1';
      params.push(req.user.id);
    } else if (categoryId) {
      query += ' WHERE lc.category_id = $1';
      params.push(categoryId);
    }
    query += ' ORDER BY lc.start_time ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get live classes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/live-classes', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const { title, description, meetingUrl, startTime, categoryId } = req.body;
    const result = await pool.query(
      `INSERT INTO live_classes (title, description, meeting_url, start_time, category_id, teacher_id) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description || '', meetingUrl, startTime, categoryId, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create live class error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/live-classes/:id/chat', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lc.*, u.name as user_name, u.role as user_role
       FROM live_chats lc
       JOIN users u ON lc.user_id = u.id
       WHERE lc.live_class_id = $1
       ORDER BY lc.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get live chat error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/live-classes/:id/chat', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    const result = await pool.query(
      `INSERT INTO live_chats (live_class_id, user_id, message) 
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.user.id, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Post live chat error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== VIDEO BOOKMARKS & TRANSCRIPTS ====================

app.get('/api/videos/:id/bookmarks', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM video_bookmarks 
       WHERE student_id = $1 AND video_id = $2
       ORDER BY timestamp_sec ASC`,
      [req.user.id, req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/videos/:id/bookmarks', authenticateToken, async (req, res) => {
  try {
    const { timestampSec, label } = req.body;
    const result = await pool.query(
      `INSERT INTO video_bookmarks (student_id, video_id, timestamp_sec, label) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, req.params.id, timestampSec, label]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create bookmark error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/bookmarks/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM video_bookmarks WHERE id = $1 AND student_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Bookmark deleted' });
  } catch (error) {
    console.error('Delete bookmark error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/videos/:id/transcripts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM video_transcripts 
       WHERE video_id = $1 
       ORDER BY start_sec ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get transcripts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/videos/:id/transcripts', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const { transcripts } = req.body; // Expect an array of { startSec, endSec, text }
    await pool.query('BEGIN');
    await pool.query('DELETE FROM video_transcripts WHERE video_id = $1', [req.params.id]);
    for (const t of transcripts) {
      await pool.query(
        `INSERT INTO video_transcripts (video_id, start_sec, end_sec, text) VALUES ($1, $2, $3, $4)`,
        [req.params.id, t.startSec, t.endSec, t.text]
      );
    }
    await pool.query('COMMIT');
    res.status(201).json({ message: 'Transcripts saved' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Save transcripts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Initialize security tables
  await initializeSecurityTables();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 JWT Secret: ${JWT_SECRET ? 'Configured' : 'NOT SET - Add JWT_SECRET to .env!'}`);
  });
};

// Only start the HTTP server in local dev; on Vercel the app is exported as a serverless function
if (!process.env.VERCEL) {
  startServer();
}

module.exports = app;
