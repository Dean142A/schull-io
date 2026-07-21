import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    // Check SQLite Connection
    const test = db.prepare('SELECT 1 as alive').get();
    if (!test || test.alive !== 1) {
      throw new Error('Database integrity check failed');
    }

    // Check row count for sanity checks
    const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
    const settingsCount = db.prepare('SELECT count(*) as count FROM security_settings').get().count;

    res.json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      diagnostics: {
        database: 'CONNECTED',
        users_count: userCount,
        settings_count: settingsCount
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'DOWN',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
