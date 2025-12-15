
import express from 'express';
import cors from 'cors';
import { verifyGoogleToken, findOrCreateUser, generateSessionToken, authMiddleware, db } from './auth';

// Handle unhandled exceptions
(process as any).on('uncaughtException', (err: any) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// --- CONFIGURATION ---
// Comma-separated list of admin emails who get unlimited credits
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// Increase limit for uploads
app.use(express.json({ limit: '5mb' }) as any);

// CORS Configuration
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        // Allow all origins for simplicity in demo/dev
        return callback(null, true);
    },
    credentials: true
}) as any);

// --- AUTH ROUTES ---

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const payload = await verifyGoogleToken(token);
        if (!payload || !payload.email) throw new Error("Invalid Google Token");

        const user = await findOrCreateUser(payload.email, payload.name || 'User', payload.sub);
        const sessionToken = generateSessionToken(user);

        // Check for admin status to return display credits
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

        // Override credits for display if admin
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

// Deduct credits for an action
app.post('/credits/deduct', authMiddleware, async (req: any, res) => {
    const { action, cost, details } = req.body;
    const userId = req.user.id;

    try {
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        // ADMIN BYPASS LOGIC
        if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            console.log(`Admin action by ${user.email}: ${action} (Cost bypassed)`);
            return res.json({ success: true, remainingCredits: 999999 });
        }

        if (user.credits < cost) {
            return res.status(403).json({ error: "Insufficient credits", currentCredits: user.credits });
        }

        // Transaction: Update user & log history
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

app.get('/', (req, res) => {
    res.send('Magistory API Server is Running.');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Server running on port ${PORT}`);
    
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn("WARNING: GOOGLE_CLIENT_ID is not set. Google Login will fail.");
    }
});
