require('dotenv').config();
const { Client } = require('pg');

const migrateDatabase = async () => {
  console.log('🔄 Migrating database...\n');

  const client = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'student_portal',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check and add missing columns to categories table
    console.log('📦 Checking categories table...');
    
    // Check if price column exists
    const priceCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'categories' AND column_name = 'price'
    `);
    
    if (priceCheck.rows.length === 0) {
      await client.query(`ALTER TABLE categories ADD COLUMN price INTEGER DEFAULT 0`);
      console.log('  ✅ Added price column');
    } else {
      console.log('  ℹ️  price column already exists');
    }

    // Check if icon column exists
    const iconCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'categories' AND column_name = 'icon'
    `);
    
    if (iconCheck.rows.length === 0) {
      await client.query(`ALTER TABLE categories ADD COLUMN icon VARCHAR(50) DEFAULT '📚'`);
      console.log('  ✅ Added icon column');
    } else {
      console.log('  ℹ️  icon column already exists');
    }

    // Check if color column exists
    const colorCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'categories' AND column_name = 'color'
    `);
    
    if (colorCheck.rows.length === 0) {
      await client.query(`ALTER TABLE categories ADD COLUMN color VARCHAR(50) DEFAULT '#1e40af'`);
      console.log('  ✅ Added color column');
    } else {
      console.log('  ℹ️  color column already exists');
    }

    // Check if is_active column exists
    const isActiveCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'categories' AND column_name = 'is_active'
    `);
    
    if (isActiveCheck.rows.length === 0) {
      await client.query(`ALTER TABLE categories ADD COLUMN is_active BOOLEAN DEFAULT true`);
      console.log('  ✅ Added is_active column');
    } else {
      console.log('  ℹ️  is_active column already exists');
    }

    // Check if invoice_password column exists in course_purchases
    const invoiceCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'course_purchases' AND column_name = 'invoice_password'
    `);
    
    if (invoiceCheck.rows.length === 0) {
      await client.query(`ALTER TABLE course_purchases ADD COLUMN invoice_password VARCHAR(50)`);
      console.log('  ✅ Added invoice_password column');
    } else {
      console.log('  ℹ️  invoice_password column already exists');
    }

    // Show current categories
    console.log('\n📋 Current categories in database:');
    const categories = await client.query('SELECT id, name, description, price, icon, color FROM categories ORDER BY id');
    if (categories.rows.length === 0) {
      console.log('  No categories found');
    } else {
      categories.rows.forEach(cat => {
        console.log(`  ${cat.id}. ${cat.icon || '📚'} ${cat.name} - RS ${cat.price || 0}`);
      });
    }

    console.log('\n🎉 Database migration complete!\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await client.end();
    process.exit(0);
  }
};

migrateDatabase();
