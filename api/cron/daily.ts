import type { IncomingMessage, ServerResponse } from 'http';
import app from '../../backend/src/index';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = '/api/cron/daily';
  return app(req, res);
}
