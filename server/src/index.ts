import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import dotenv from 'dotenv';
import { db } from './db/index';
import { initializeDatabase } from './db/init';
import authRoutes from './routes/auth';

dotenv.config();

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (c) => {
  return c.json({
    name: 'Evaya Naturals Internal API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
    },
  });
});

// Auth routes
app.route('/api/auth', authRoutes);

// Error handling
app.onError((err: Error, c) => {
  console.error('Error:', err);
  return c.json(
    { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message },
    500
  );
});

// Start server
const port = parseInt(process.env.PORT || '3001', 10);

// Initialize database before starting
initializeDatabase().then(() => {
  console.log('Database initialized');
  
  serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`Server running on http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

export default app;