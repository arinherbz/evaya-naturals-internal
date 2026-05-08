import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { initializeDatabase } from './db/init';
import authRoutes from './routes/auth';
import catalogRoutes from './routes/catalog';
import posRoutes from './routes/pos';
import settingsRoutes from './routes/settings';
import { appEnv, logServerError } from './env';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use('*', cors({
    origin: appEnv.clientUrl,
    credentials: true,
  }));

  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api', (c) => {
    return c.json({
      name: 'Evaya Naturals Internal API',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        catalog: '/api/catalog',
        pos: '/api/pos',
        settings: '/api/settings',
      },
    });
  });

  app.route('/api/auth', authRoutes);
  app.route('/api/catalog', catalogRoutes);
  app.route('/api/pos', posRoutes);
  app.route('/api/settings', settingsRoutes);

  app.onError((err: Error, c) => {
    logServerError('Unhandled request', err);
    return c.json(
      { error: appEnv.isProduction ? 'Internal server error' : err.message },
      500
    );
  });

  return app;
}

const app = createApp();

// Start server
const port = appEnv.port;

if (appEnv.nodeEnv !== 'test') {
  initializeDatabase().then(() => {
    console.log('Database initialized');
    
    serve({
      fetch: app.fetch,
      port,
    }, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }).catch((err) => {
    logServerError('Database initialization', err);
    process.exit(1);
  });
}

export default app;
