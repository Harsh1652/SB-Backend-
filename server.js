import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n-latest-5p8o.onrender.com/webhook/2a14d77f-71f9-4ea7-b742-52eafea637da';

function extractFirstJsonObject(text) {
  if (typeof text !== 'string') return null;
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;
  for (let endIndex = text.length - 1; endIndex >= startIndex; endIndex -= 1) {
    if (text[endIndex] !== '}') continue;
    const candidate = text.slice(startIndex, endIndex + 1);
    try {
      const parsed = JSON.parse(candidate);
      return JSON.stringify(parsed);
    } catch {
      // keep shrinking until we find a valid JSON object
    }
  }
  return null;
}

function stripMarkdown(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .trim();
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body || {};

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid request: "message" must be a non-empty string.' });
    }

    // Forward to webhook and relay its response
    const webhookRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId })
    });

    const contentType = webhookRes.headers.get('content-type') || '';
    const status = webhookRes.status;

    if (!webhookRes.ok) {
      const errorText = await webhookRes.text().catch(() => '');
      return res.status(status).type('text/plain').send(errorText || 'Webhook error');
    }

    if (contentType.includes('application/json')) {
      const data = await webhookRes.json();
      return res.status(status).json(data);
    }

    const text = await webhookRes.text();
    return res.status(status).type('text/plain').send(text);
  } catch (error) {
    console.error('Error in /api/chat:', error);
    const status = error?.status || error?.statusCode || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Failed to get reply from webhook',
      details: process.env.NODE_ENV === 'production' ? undefined : String(error?.message || error)
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`ShaadiBot backend running on http://localhost:${PORT}`);
});


