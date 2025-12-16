
import express from 'express';
import cors from 'cors';
import { verifyGoogleToken, findOrCreateUser, generateSessionToken, authMiddleware, db } from './auth';

// Handle unhandled exceptions to prevent hard crashes without logs
(process as any).on('uncaughtException', (err: any) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});

const app = express();

// CRITICAL: Railway assigns a random port in process.env.PORT. 
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Increase limit for uploads
app.use(express.json({ limit: '5mb' }) as any);

// CORS Configuration
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, true);
    },
    credentials: true
}) as any);

// --- HEALTH CHECK (Required for Railway) ---
app.get('/', (req, res) => {
    res.status(200).send('Magistory API Server is Running.');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// --- AUTH ROUTES ---
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    
    // Debugging log for auth attempts
    console.log("Auth attempt received.");

    if (!process.env.GOOGLE_CLIENT_ID) {
        console.error("LOGIN FAILED: GOOGLE_CLIENT_ID is missing in server environment variables.");
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

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log("==================================================");
    console.log(`✅ API Server successfully started on port ${PORT}`);
    console.log("==================================================");
    
    // Config Checks
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.error("❌ CRITICAL WARNING: GOOGLE_CLIENT_ID is not set in Railway variables.");
        console.error("   Google Login will FAIL (return 500) until this is set.");
    } else {
        console.log("✅ Google Auth: Configured");
    }

    if (!process.env.DATABASE_URL) {
        console.log("⚠️  NOTICE: DATABASE_URL is not set.");
        console.log("   App is running in LOCAL JSON MODE. Data will reset on redeploy.");
    } else {
        console.log("✅ Database: Connected");
    }

    if (PORT === 3001 && process.env.RAILWAY_STATIC_URL) {
        console.log("⚠️  WARNING: Running on default port 3001 in Railway environment.");
        console.log("   If the Health Check fails, remove the 'PORT' variable from Railway settings");
        console.log("   to let Railway assign a dynamic port automatically.");
    }
});
