import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Socket.io initialization
  const userSocketMap = new Map<string, string>(); // userId -> socketId

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register-user', (userId) => {
      userSocketMap.set(userId, socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    socket.on('join-room', (roomId) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
    });

    socket.on('send-message', (data) => {
      io.to(data.roomId).emit('receive-message', data);
    });

    socket.on('typing', ({ roomId, userId, isTyping }) => {
      socket.to(roomId).emit('user-typing', { userId, isTyping });
    });

    // WebRTC Signaling
    socket.on('call-user', ({ userToCall, signalData, from, name, type }) => {
      console.log(`[Socket] Call request from ${from} to ${userToCall} (${type})`);
      const targetSocketId = userSocketMap.get(userToCall);
      if (targetSocketId) {
        console.log(`[Socket] Forwarding call to socket ${targetSocketId}`);
        io.to(targetSocketId).emit('incoming-call', {
          signal: signalData,
          from,
          name,
          type // 'voice' or 'video'
        });
      } else {
        console.warn(`[Socket] Target user ${userToCall} not registered or offline`);
      }
    });

    socket.on('answer-call', (data) => {
      console.log(`[Socket] Call answer from to ${data.to}`);
      const targetSocketId = userSocketMap.get(data.to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-accepted', data.signal);
      }
    });

    socket.on('ice-candidate', (data) => {
      console.log(`[Socket] ICE Candidate for ${data.to}`);
      const targetSocketId = userSocketMap.get(data.to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', data.candidate);
      }
    });

    socket.on('end-call', ({ to }) => {
      const targetSocketId = userSocketMap.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-ended');
      }
    });

    socket.on('disconnect', () => {
      // Find and remove from map
      for (const [userId, socketId] of userSocketMap.entries()) {
        if (socketId === socket.id) {
          userSocketMap.delete(userId);
          break;
        }
      }
      console.log('User disconnected:', socket.id);
    });
  });

  // Fitbit OAuth Configuration
  const FITBIT_CLIENT_ID = process.env.FITBIT_CLIENT_ID;
  const FITBIT_CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET;
  const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
  const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';

  // Helper to get redirect URI
  const getRedirectUri = (req: express.Request) => {
    const host = req.get('host');
    const protocol = req.protocol === 'http' && host?.includes('run.app') ? 'https' : req.protocol;
    return `${protocol}://${host}/auth/fitbit/callback`;
  };

  // 1. Get Fitbit Auth URL
  app.get('/api/auth/fitbit/url', (req, res) => {
    if (!FITBIT_CLIENT_ID) {
      return res.status(500).json({ error: 'FITBIT_CLIENT_ID not configured' });
    }

    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'User ID required' });

    const params = new URLSearchParams({
      client_id: FITBIT_CLIENT_ID,
      response_type: 'code',
      scope: 'activity heartrate sleep profile',
      redirect_uri: getRedirectUri(req),
      state: uid as string, // Pass UID in state to link account
    });

    res.json({ url: `${FITBIT_AUTH_URL}?${params.toString()}` });
  });

  // 2. Fitbit Callback
  app.get(['/auth/fitbit/callback', '/auth/fitbit/callback/'], async (req, res) => {
    const { code, state: uid } = req.query;

    if (!code || !uid) {
      return res.status(400).send('Missing code or state');
    }

    try {
      const authHeader = Buffer.from(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).toString('base64');
      
      const response = await axios.post(FITBIT_TOKEN_URL, new URLSearchParams({
        client_id: FITBIT_CLIENT_ID!,
        grant_type: 'authorization_code',
        redirect_uri: getRedirectUri(req),
        code: code as string,
      }), {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, refresh_token, user_id: fitbitUserId } = response.data;

      // In a real app, we would save these to Firestore securely.
      // For this demo, we'll send a success message to the client.
      // The client will then update the user profile to mark as connected.
      
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #fef9f1;">
            <div style="background: white; padding: 40px; border-radius: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.05); text-align: center;">
              <h2 style="color: #00440c; margin-bottom: 16px;">Fitbit Connected!</h2>
              <p style="color: #757870; margin-bottom: 24px;">Your health data will now be synced automatically.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'FITBIT_AUTH_SUCCESS', 
                    fitbitUserId: '${fitbitUserId}',
                    accessToken: '${access_token}' // In real app, don't send token to client like this
                  }, '*');
                  setTimeout(() => window.close(), 2000);
                }
              </script>
              <p style="font-size: 12px; color: #outline;">This window will close automatically.</p>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Fitbit OAuth Error:', error.response?.data || error.message);
      res.status(500).send('Failed to exchange code for tokens');
    }
  });

  // 3. Sync Fitbit Data
  app.get('/api/fitbit/sync', async (req, res) => {
    const { accessToken } = req.query;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
      // Fetch steps for today
      const stepsRes = await axios.get('https://api.fitbit.com/1/user/-/activities/date/today.json', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // Fetch heart rate for today
      const hrRes = await axios.get('https://api.fitbit.com/1/user/-/activities/heart/date/today/1d.json', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // Fetch sleep for today
      const sleepRes = await axios.get('https://api.fitbit.com/1.2/user/-/sleep/date/today.json', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      const summary = {
        steps: stepsRes.data.summary.steps,
        heartRate: hrRes.data['activities-heart'][0]?.value?.restingHeartRate || 72,
        sleepHours: sleepRes.data.summary.totalMinutesAsleep / 60,
        timestamp: new Date().toISOString()
      };

      res.json(summary);
    } catch (error: any) {
      console.error('Fitbit Sync Error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to sync data' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
