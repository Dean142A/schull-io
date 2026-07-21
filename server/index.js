import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';

import authRoutes from './routes/auth.js';
import resultsRoutes from './routes/results.js';
import tokensRoutes from './routes/tokens.js';
import auditRoutes from './routes/audit.js';
import securityRoutes from './routes/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Database
initDb();

// Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[schull.io API] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/tokens', tokensRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/security', securityRoutes);

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'schull.io', timestamp: new Date().toISOString() });
});

// Serve static frontend assets in production mode if dist exists
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) {
        res.status(404).send(`
          <div style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #4100F4;">schull.io Frontend Build Not Ready</h2>
            <p>The production frontend bundle was not found. Please run:</p>
            <pre style="background: #eee; padding: 12px; display: inline-block;">npm run build</pre>
            <p>Or for active development, run:</p>
            <pre style="background: #eee; padding: 12px; display: inline-block;">npm run dev</pre>
          </div>
        `);
      }
    });
  }
});

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`[schull.io] Server running on http://localhost:${portToTry}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[schull.io] Port ${portToTry} in use, trying http://localhost:${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error(err);
    }
  });
}

startServer(PORT);

