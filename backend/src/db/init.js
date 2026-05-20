require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const initDatabase = async () => {
  console.log('🔄 Initializing database...\n');

  let adminClient;
  let appClient;

  try {
    // Connect to postgres database first to create our database
    adminClient = new Client({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
    });

    await adminClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create database if not exists
    const dbName = process.env.DB_NAME || 'student_portal';
    const dbCheck = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (dbCheck.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database '${dbName}' created`);
    } else {
      console.log(`ℹ️  Database '${dbName}' already exists`);
    }

    await adminClient.end();
    adminClient = null;

    // Connect to our database
    appClient = new Client({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: dbName,
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
    });

    await appClient.connect();
    console.log(`✅ Connected to database '${dbName}'\n`);

    // Create tables
    console.log('📦 Creating tables...');

    await appClient.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
        reset_token_hash VARCHAR(64),
        reset_token_expires_at TIMESTAMP,
        locked_until TIMESTAMP,
        last_login TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ users table');

    // Create refresh_tokens table
    await appClient.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ refresh_tokens table');

    // Create indexes for refresh_tokens
    await appClient.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`);
    await appClient.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)`);
    console.log('  ✓ refresh_tokens indexes');

    await appClient.query(`
      -- Categories table (Course Categories)
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price INTEGER DEFAULT 0,
        icon VARCHAR(50) DEFAULT '📚',
        color VARCHAR(50) DEFAULT '#1e40af',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ categories table');

    await appClient.query(`
      -- Videos table
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        video_url VARCHAR(500),
        thumbnail_url VARCHAR(500),
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        views INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ videos table');

    await appClient.query(`
      -- Student enrollments table
      CREATE TABLE IF NOT EXISTS student_enrollments (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, category_id)
      );
    `);
    console.log('  ✓ student_enrollments table');

    await appClient.query(`
      -- Notes table
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ notes table');

    await appClient.query(`
      -- Video views tracking
      CREATE TABLE IF NOT EXISTS video_views (
        id SERIAL PRIMARY KEY,
        video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(video_id, student_id)
      );
    `);
    console.log('  ✓ video_views table');

    await appClient.query(`
      -- Attendance table
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        status VARCHAR(50) NOT NULL CHECK (status IN ('present', 'absent', 'late')),
        marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, date)
      );
    `);
    console.log('  ✓ attendance table');

    await appClient.query(`
      -- Course purchases table
      CREATE TABLE IF NOT EXISTS course_purchases (
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
    console.log('  ✓ course_purchases table');

    await appClient.query(`
      -- Video progress tracking
      CREATE TABLE IF NOT EXISTS video_progress (
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
    console.log('  ✓ video_progress table');

    await appClient.query(`
      -- Notifications table
      CREATE TABLE IF NOT EXISTS notifications (
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
    console.log('  ✓ notifications table');

    console.log('\n📊 Creating default users...');

    // Create or update default admin
    const adminEmail = 'admin@portal.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456';
    const adminExists = await appClient.query(
      `SELECT 1 FROM users WHERE email = $1`,
      [adminEmail]
    );

    const hashedAdminPassword = await bcrypt.hash(adminPassword, 12);
    if (adminExists.rows.length === 0) {
      await appClient.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        ['Administrator', adminEmail, hashedAdminPassword, 'admin']
      );
      console.log(`  ✓ Admin created: ${adminEmail} / ${adminPassword}`);
    } else {
      await appClient.query(
        `UPDATE users SET password_hash = $1 WHERE email = $2`,
        [hashedAdminPassword, adminEmail]
      );
      console.log(`  ✓ Admin password updated: ${adminEmail} / ${adminPassword}`);
    }

    // Create or update default teacher
    const teacherEmail = 'teacher@portal.com';
    const teacherPassword = process.env.DEFAULT_TEACHER_PASSWORD || 'Teacher@123';
    const teacherExists = await appClient.query(
      `SELECT 1 FROM users WHERE email = $1`,
      [teacherEmail]
    );

    const hashedTeacherPassword = await bcrypt.hash(teacherPassword, 12);
    if (teacherExists.rows.length === 0) {
      await appClient.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        ['Demo Teacher', teacherEmail, hashedTeacherPassword, 'teacher']
      );
      console.log(`  ✓ Teacher created: ${teacherEmail} / ${teacherPassword}`);
    } else {
      await appClient.query(
        `UPDATE users SET password_hash = $1 WHERE email = $2`,
        [hashedTeacherPassword, teacherEmail]
      );
      console.log(`  ✓ Teacher password updated: ${teacherEmail} / ${teacherPassword}`);
    }

    // Create or update default student
    const studentEmail = 'student@portal.com';
    const studentPassword = process.env.DEFAULT_STUDENT_PASSWORD || 'Student@123';
    const studentExists = await appClient.query(
      `SELECT 1 FROM users WHERE email = $1`,
      [studentEmail]
    );

    const hashedStudentPassword = await bcrypt.hash(studentPassword, 12);
    if (studentExists.rows.length === 0) {
      await appClient.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        ['Demo Student', studentEmail, hashedStudentPassword, 'student']
      );
      console.log(`  ✓ Student created: ${studentEmail} / ${studentPassword}`);
    } else {
      await appClient.query(
        `UPDATE users SET password_hash = $1 WHERE email = $2`,
        [hashedStudentPassword, studentEmail]
      );
      console.log(`  ✓ Student password updated: ${studentEmail} / ${studentPassword}`);
    }

    // Create default categories
    console.log('\n📚 Creating default course categories...');

    const categories = [
      { name: 'Amazon Web Services', description: 'Cloud computing and AWS services', price: 4999, icon: '☁️', color: '#FF9900' },
      { name: 'Artificial Intelligence', description: 'Machine learning and AI fundamentals', price: 7999, icon: '🤖', color: '#9B59B6' },
      { name: 'Web Development', description: 'Full stack web development', price: 5999, icon: '🌐', color: '#3498DB' },
      { name: 'Data Science', description: 'Data analysis and visualization', price: 6999, icon: '📊', color: '#2ECC71' },
      { name: 'Python Programming', description: 'Python fundamentals and advanced', price: 3999, icon: '🐍', color: '#306998' }
    ];

    for (const cat of categories) {
      const catExists = await appClient.query(
        `SELECT 1 FROM categories WHERE name = $1`,
        [cat.name]
      );

      if (catExists.rows.length === 0) {
        await appClient.query(
          `INSERT INTO categories (name, description, price, icon, color) VALUES ($1, $2, $3, $4, $5)`,
          [cat.name, cat.description, cat.price, cat.icon, cat.color]
        );
        console.log(`  ✓ ${cat.icon} ${cat.name} - RS ${cat.price}`);
      }
    }

    console.log('\n🎉 Database initialization complete!\n');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  } finally {
    if (adminClient) await adminClient.end();
    if (appClient) await appClient.end();
    process.exit(0);
  }
};

initDatabase();
