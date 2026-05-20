require('dotenv').config();
const { Client } = require('pg');

const runFix = async () => {
  const client = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'student_portal',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('🔧 Running database fix...\n');

    // Add missing columns to categories
    await client.query(`
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0;
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT '📚';
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#1e40af';
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);
    console.log('✅ categories table fixed');

    // Add missing columns to users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
    `);
    console.log('✅ users table fixed');

    // Drop and recreate notifications with from_user_id
    await client.query(`DROP TABLE IF EXISTS notifications;`);
    await client.query(`
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
    `);
    console.log('✅ notifications table fixed');

    // Drop and recreate video_progress
    await client.query(`DROP TABLE IF EXISTS video_progress;`);
    await client.query(`
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
    `);
    console.log('✅ video_progress table fixed');

    // Drop and recreate course_purchases with all columns
    await client.query(`DROP TABLE IF EXISTS course_purchases;`);
    await client.query(`
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
    `);
    console.log('✅ course_purchases table fixed');

    // Update existing categories
    await client.query(`
      UPDATE categories SET price = 0 WHERE price IS NULL;
      UPDATE categories SET icon = '📚' WHERE icon IS NULL;
      UPDATE categories SET color = '#1e40af' WHERE color IS NULL;
      UPDATE categories SET is_active = true WHERE is_active IS NULL;
    `);
    console.log('✅ categories data updated');

    console.log('\n🎉 Database fix completed successfully!');
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  } finally {
    await client.end();
    process.exit(0);
  }
};

runFix();
