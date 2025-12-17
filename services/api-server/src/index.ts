
import express from 'express';
import cors from 'cors';
import { verifyGoogleToken, findOrCreateUser, generateSessionToken, authMiddleware, db } from './auth';
import fs from 'fs';
import path from 'path';

// Handle unhandled exceptions
(process as any).on('uncaughtException', (err: any) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});

// Pastikan folder data tersedia sebelum server berjalan (Krusial untuk JSON-DB)
const DATA_DIR = path.join((process as any).cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`✅ Data directory created at: ${DATA_DIR}`);
    } catch (err) {
        console.error("❌ Failed to create data directory:", err);
    }
}

const app = express();
app.enable('trust proxy');

// Railway menggunakan variabel PORT
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

app.use(express.json({ limit: '10mb' }) as any);

app.use((req, res, next) => {
    if (req.url !== '/health' && req.url !== '/') {
        console.log(`[API] ${req.method} ${req.url}`);
    }
    next();
});

app.use(cors({
    origin: true, 
    credentials: true
}) as any);

app.get('/', (req, res) => {
    res.status(200).send('Magistory API Server is Running.');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    
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

app.listen(PORT, '0.0.0.0', () => {
    console.log("==================================================");
    console.log(`🚀 API Server successfully started on port ${PORT}`);
    console.log("==================================================");
    
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.error("❌ GOOGLE_CLIENT_ID is not set.");
    }
    if (!process.env.DATABASE_URL) {
        console.log("⚠️ Running in LOCAL JSON PERSISTENCE mode.");
    }
});
