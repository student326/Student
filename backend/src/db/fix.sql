-- Run this SQL script in your PostgreSQL database to fix the missing columns

-- 1. Add missing columns to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT '📚';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#1e40af';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;

-- 3. Fix notifications table (drop and recreate to add from_user_id)
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  type VARCHAR(50) DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Fix course_purchases table (drop and recreate)
DROP TABLE IF EXISTS course_purchases;
CREATE TABLE course_purchases (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  invoice_password VARCHAR(50),
  purchased_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, category_id)
);

-- 5. Fix video_progress table
DROP TABLE IF EXISTS video_progress;
CREATE TABLE video_progress (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0,
  duration INTEGER DEFAULT 0,
  last_position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, video_id)
);

-- 6. Update existing categories with default values
UPDATE categories SET price = 0 WHERE price IS NULL;
UPDATE categories SET icon = '📚' WHERE icon IS NULL;
UPDATE categories SET color = '#1e40af' WHERE color IS NULL;
UPDATE categories SET is_active = true WHERE is_active IS NULL;

-- 7. Verify the columns were added
SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications';
SELECT column_name FROM information_schema.columns WHERE table_name = 'video_progress';
SELECT column_name FROM information_schema.columns WHERE table_name = 'course_purchases';

SELECT 'Database fix completed!' as status;
