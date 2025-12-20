
import express from 'express';
import cors from 'cors';
import { verifyGoogleToken, findOrCreateUser, generateSessionToken, authMiddleware, db } from './auth';

// Handle unhandled exceptions to prevent hard crashes without logs
(process as any).on('uncaughtException', (err: any) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();

// Enable Trust Proxy for Railway/Heroku (Important for correct IP logging behind LB)
app.set('trust proxy', 1);

// CRITICAL: Railway assigns a random port in process.env.PORT. 
const PORT = parseInt(process.env.PORT || '3001');

console.log(`Starting API Server initialization... Port will be: ${PORT}`);

// Increase limit for uploads
app.use(express.json({ limit: '10mb' }) as any);

// Middleware: Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    next();
});

// CORS Configuration - Permissive for troubleshooting
app.use(cors({
    origin: '*', // Allow all origins to fix "Network Error" due to CORS
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- HEALTH CHECK ---
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
    console.log("Auth attempt received.");

    if (!process.env.GOOGLE_CLIENT_ID) {
        console.error("LOGIN FAILED: GOOGLE_CLIENT_ID is missing.");
        return res.status(500).json({ error: "Server misconfiguration: Missing Google Client ID." });
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

// Start Server without explicit host (allows IPv6/IPv4 binding)
const server = app.listen(PORT, () => {
    console.log("==================================================");
    console.log(`✅ API Server successfully started on port ${PORT}`);
    console.log("==================================================");
    
    // Config Checks
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.error("❌ CRITICAL WARNING: GOOGLE_CLIENT_ID is not set in Railway variables.");
    } else {
        console.log("✅ Google Auth: Configured");
    }

    if (!process.env.DATABASE_URL) {
        console.log("⚠️  NOTICE: DATABASE_URL is not set. Using local JSON DB.");
    } else {
        console.log("✅ Database: Connected");
    }
});

// --- CRITICAL FIX FOR 502 BAD GATEWAY ---
// Increase Keep-Alive timeout to be larger than the Load Balancer's timeout (usually 60s)
// This prevents the Node server from abruptly closing connections that the LB thinks are open.
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
