import express from 'express';
import cors from 'cors';
import { verifyGoogleToken, findOrCreateUser, generateSessionToken, authMiddleware, db } from './auth';

// Handle unhandled exceptions to prevent hard crashes
(process as any).on('uncaughtException', (err: any) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();

// --- 1. CRITICAL: HEALTH CHECK MUST BE FIRST ---
const healthHandler = (req: any, res: any) => {
    res.status(200).send('Magistory API Server is Running.');
};
app.get('/', healthHandler);
app.head('/', healthHandler);
app.get('/health', healthHandler);

// --- 2. CONFIGURATION ---
app.set('trust proxy', 1);

const rawPort = process.env.PORT || '3001';
const PORT = parseInt(rawPort, 10) || 3001;

console.log(`Initializing Server on Port: ${PORT}`);

// --- 3. MANUAL CORS MIDDLEWARE (MOST ROBUST) ---
// This guarantees headers are set correctly for Vercel -> Railway communication
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // Allow any origin that connects (Reflect Origin)
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // Fallback for tools like Postman or generic requests
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle Preflight immediately
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// --- 4. BODY PARSER ---
app.use(express.json({ limit: '10mb' }) as any);

// --- 5. LOGGING ---
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/health') return next();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip} | Origin: ${req.headers.origin || 'N/A'}`);
    next();
});

// --- AUTH ROUTES ---
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    
    console.log("Received Login Request.");

    if (!token) {
        return res.status(400).json({ error: "Missing token in request body" });
    }

    try {
        const payload = await verifyGoogleToken(token);
        if (!payload || !payload.email) throw new Error("Invalid Google Token payload");

        console.log(`Token verified for: ${payload.email}`);
        
        const user = await findOrCreateUser(payload.email, payload.name || 'User', payload.sub);
        const sessionToken = generateSessionToken(user);

        let displayCredits = user.credits;
        if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            displayCredits = 999999;
        }

        console.log(`Login successful: ${user.email}`);
        res.json({ token: sessionToken, user: { id: user.id, name: user.name, email: user.email, credits: displayCredits } });
    } catch (error: any) {
        console.error("Auth Route Error:", error.message);
        res.status(401).json({ error: "Authentication failed: " + error.message });
    }
});

app.get('/user/me', authMiddleware, async (req: any, res) => {
    try {
        const user = await db.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ error: "User not found" });

        let displayCredits = user.credits;
        if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            displayCredits = 999999;
        }

        res.json({ id: user.id, name: user.name, email: user.email, credits: displayCredits });
    } catch (error) {
        console.error("User Fetch Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// --- CREDIT SYSTEM ROUTES ---
app.post('/credits/deduct', authMiddleware, async (req: any, res) => {
    const { action, cost } = req.body;
    const userId = req.user.id;

    try {
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            return res.json({ success: true, remainingCredits: 999999 });
        }

        if (user.credits < cost) {
            return res.status(403).json({ error: "Insufficient credits", currentCredits: user.credits });
        }

        const updatedUser = await db.user.update({
            where: { id: userId },
            data: { credits: { decrement: cost } }
        });

        res.json({ success: true, remainingCredits: updatedUser.credits });
    } catch (error) {
        console.error("Credit Deduct Error:", error);
        res.status(500).json({ error: "Transaction failed" });
    }
});

// Start Server - BIND TO 0.0.0.0
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ API Server listening on 0.0.0.0:${PORT}`);
    
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn("⚠️ WARNING: GOOGLE_CLIENT_ID is not set.");
    }
});

server.on('error', (err: any) => {
    console.error("❌ SERVER FAILED TO START:", err);
    (process as any).exit(1);
});

// Keep-Alive Settings
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

// Graceful Shutdown
const shutdown = () => {
    console.log('SIGTERM/SIGINT received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        (process as any).exit(0);
    });
};

(process as any).on('SIGTERM', shutdown);
(process as any).on('SIGINT', shutdown);