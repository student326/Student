require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const seedDatabase = async () => {
  console.log('🌱 Seeding database with default users...\n');
  
  const client = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'student_portal',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Create default admin user if not exists
    const adminEmail = 'admin@portal.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    
    const adminCheck = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [adminEmail]
    );

    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        ['Administrator', adminEmail, hashedPassword, 'admin']
      );
      console.log(`✅ Created admin: ${adminEmail} / ${adminPassword}`);
    } else {
      console.log(`⚠️  Admin already exists: ${adminEmail}`);
    }

    // Create default student user if not exists
    const studentEmail = 'student@portal.com';
    const studentPassword = process.env.DEFAULT_STUDENT_PASSWORD || 'student123';
    
    const studentCheck = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [studentEmail]
    );

    if (studentCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(studentPassword, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        ['Demo Student', studentEmail, hashedPassword, 'student']
      );
      console.log(`✅ Created student: ${studentEmail} / ${studentPassword}`);
    } else {
      console.log(`⚠️  Student already exists: ${studentEmail}`);
    }

    // Create a test teacher
    const teacherEmail = 'teacher@portal.com';
    const teacherPassword = 'teacher123';
    
    const teacherCheck = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [teacherEmail]
    );

    if (teacherCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(teacherPassword, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        ['Demo Teacher', teacherEmail, hashedPassword, 'teacher']
      );
      console.log(`✅ Created teacher: ${teacherEmail} / ${teacherPassword}`);
    } else {
      console.log(`⚠️  Teacher already exists: ${teacherEmail}`);
    }

    // Show all users
    const users = await client.query(`SELECT id, name, email, role FROM users ORDER BY id`);
    console.log('\n📋 All users in database:');
    users.rows.forEach(u => {
      console.log(`   ${u.id}. ${u.name} (${u.email}) - ${u.role}`);
    });

    console.log('\n🎉 Database seeding complete!\n');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
  } finally {
    await client.end();
    process.exit(0);
  }
};

seedDatabase();
