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

// Enable Trust Proxy for Railway/Heroku/Render
app.set('trust proxy', 1);

// CRITICAL: Railway/Render assigns a random port in process.env.PORT. 
// Handle potential parsing errors or empty strings safely.
const rawPort = process.env.PORT || '3001';
const PORT = parseInt(rawPort, 10) || 3001;

console.log(`Starting API Server initialization... Configured Port: ${PORT}`);

// Increase limit for uploads (e.g. base64 images)
app.use(express.json({ limit: '10mb' }) as any);

// Middleware: Logger
app.use((req, res, next) => {
    // Health checks can be spammy, log them less visibly or skip if needed
    if (req.url !== '/health') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    }
    next();
});

// CORS Configuration - Allow all to prevent blocking
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- HEALTH CHECK (Must be first to ensure load balancers see 200 OK immediately) ---
const healthHandler = (req: any, res: any) => {
    res.status(200).send('Magistory API Server is Running.');
};

app.get('/', healthHandler);
app.head('/', healthHandler);
app.get('/health', healthHandler);

// --- AUTH ROUTES ---
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    
    // Warn but don't crash if ID is missing (useful for dev/offline mode testing)
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn("LOGIN WARNING: GOOGLE_CLIENT_ID is missing. Verification might fail if strict.");
    }

    try {
        const payload = await verifyGoogleToken(token);
        if (!payload || !payload.email) throw new Error("Invalid Google Token payload");

        const user = await findOrCreateUser(payload.email, payload.name || 'User', payload.sub);
        const sessionToken = generateSessionToken(user);

        let displayCredits = user.credits;
        if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            displayCredits = 999999;
        }

        console.log(`User logged in: ${user.email}`);
        res.json({ token: sessionToken, user: { id: user.id, name: user.name, email: user.email, credits: displayCredits } });
    } catch (error: any) {
        console.error("Auth Error:", error.message);
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
            console.log(`Admin action by ${user.email}: ${action} (Cost bypassed)`);
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
    console.log("==================================================");
    console.log(`✅ API Server successfully started on port ${PORT} (0.0.0.0)`);
    console.log("==================================================");
    
    // Config Checks
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn("⚠️ WARNING: GOOGLE_CLIENT_ID is not set.");
    } else {
        console.log("✅ Google Auth: Configured");
    }

    if (!process.env.DATABASE_URL) {
        console.log("ℹ️ INFO: DATABASE_URL is not set. Running in Fallback Mode (Memory/JSON).");
    } else {
        console.log("✅ Database URL Detected (Attempting Prisma Mode)");
    }
});

// Handle startup errors (like EADDRINUSE)
server.on('error', (err: any) => {
    console.error("❌ SERVER FAILED TO START:", err);
    (process as any).exit(1);
});

// --- KEEP-ALIVE TIMEOUT FIX FOR 502s ---
// Ensure Node's keep-alive is slightly longer than the Load Balancer's timeout (usually 60s)
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