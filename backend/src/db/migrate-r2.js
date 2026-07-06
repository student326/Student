require('dotenv').config();
const { Pool } = require('pg');

const runMigration = async () => {
  const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'student_portal',
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
      });

  try {
    console.log('Running R2 video migration...\n');

    // Create modules table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS modules (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ modules table created');

    // Add R2 columns to existing videos table
    const columns = [
      { name: 'module_id', type: 'INTEGER REFERENCES modules(id) ON DELETE SET NULL' },
      { name: 'video_key', type: 'VARCHAR(500)' },
      { name: 'file_size', type: 'BIGINT DEFAULT 0' },
      { name: 'mime_type', type: 'VARCHAR(100)' },
      { name: 'is_r2', type: 'BOOLEAN DEFAULT false' },
    ];

    for (const col of columns) {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'videos' AND column_name = '${col.name}'
          ) THEN
            ALTER TABLE videos ADD COLUMN ${col.name} ${col.type};
          END IF;
        END $$;
      `);
    }
    console.log('  ✓ R2 columns added to videos table');

    // Index for modules
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_modules_category_id ON modules(category_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_videos_module_id ON videos(module_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_videos_is_r2 ON videos(is_r2)`);
    console.log('  ✓ indexes created');

    console.log('\n✅ R2 migration complete!\n');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
};

runMigration();
