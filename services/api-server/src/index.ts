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

// --- 1. HEALTH CHECK (Fastest Response) ---
const healthHandler = (req: any, res: any) => {
    res.status(200).send('Magistory API Server is Running.');
};
app.get('/', healthHandler);
app.head('/', healthHandler);
app.get('/health', healthHandler);

// --- 2. ROBUST CORS MIDDLEWARE ---
// Fixing the "Network Error" by handling Origin and Credentials correctly per browser spec.
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // If an origin is sent, we reflect it and allow credentials.
    // This allows Vercel, Localhost, or any client to connect reliably.
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        // If no origin (e.g. Postman), allow wildcard but NO credentials
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

    // Handle Preflight OPTIONS immediately
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// --- 3. CONFIGURATION ---
app.set('trust proxy', 1);
const rawPort = process.env.PORT || '3001';
const PORT = parseInt(rawPort, 10) || 3001;

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
        // Verify token (with fallback to simple decode if env vars are missing)
        const payload = await verifyGoogleToken(token);
        
        if (!payload || !payload.email) {
            console.error("Token payload invalid:", payload);
            throw new Error("Invalid Google Token payload");
        }

        console.log(`Token accepted for: ${payload.email}`);
        
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

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ API Server listening on 0.0.0.0:${PORT}`);
    
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn("⚠️ WARNING: GOOGLE_CLIENT_ID is not set in API env.");
        console.log("   Login will default to insecure decoding to allow app to function.");
    }
});

server.on('error', (err: any) => {
    console.error("❌ SERVER FAILED TO START:", err);
    (process as any).exit(1);
});

// Keep-Alive Settings (Fixes some load balancer 502s)
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