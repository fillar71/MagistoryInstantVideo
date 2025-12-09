
import express from 'express';
import cors from 'cors';
import { renderVideo } from './renderer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { verifyGoogleToken, findOrCreateUser, generateSessionToken, authMiddleware, db } from './auth';

// Handle unhandled exceptions
(process as any).on('uncaughtException', (err: any) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Increase limit for uploads
app.use(express.json({ limit: '500mb' }));

// CORS Configuration
const allowedOrigins = [
    'http://localhost:5173', 
    'http://localhost:3000',
    process.env.FRONTEND_URL 
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!process.env.FRONTEND_URL || allowedOrigins.includes(origin)) {
             return callback(null, true);
        } else {
            return callback(null, true);
        }
    },
    credentials: true
}) as any);


const TEMP_DIR = path.join((process as any).cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// --- AUTH ROUTES ---

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const payload = await verifyGoogleToken(token);
        if (!payload || !payload.email) throw new Error("Invalid Google Token");

        const user = await findOrCreateUser(payload.email, payload.name || 'User', payload.sub);
        const sessionToken = generateSessionToken(user);

        res.json({ token: sessionToken, user: { id: user.id, name: user.name, email: user.email, credits: user.credits } });
    } catch (error: any) {
        console.error("Auth Error:", error);
        res.status(401).json({ error: "Authentication failed" });
    }
});

app.get('/user/me', authMiddleware, async (req: any, res) => {
    try {
        const user = await db.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ id: user.id, name: user.name, email: user.email, credits: user.credits });
    } catch (error) {
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


// --- RENDERER ROUTES ---

// Simple in-memory job store
const jobs = new Map<string, { status: 'processing' | 'completed' | 'error', path?: string, error?: string, createdAt: number }>();

// Clean up old jobs periodically (every 1 hour)
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - job.createdAt > 3600000) { // 1 hour
            if (job.path && fs.existsSync(job.path)) {
                fs.unlinkSync(job.path);
            }
            jobs.delete(id);
        }
    }
}, 3600000);

// 1. Start Render Job
app.post('/render', async (req, res) => {
    try {
        console.log(`Received render request: ${req.body.title}`);
        const jobId = uuidv4();
        
        jobs.set(jobId, { status: 'processing', createdAt: Date.now() });
        
        renderVideo(req.body)
            .then((outputPath) => {
                console.log(`Job ${jobId} completed: ${outputPath}`);
                jobs.set(jobId, { status: 'completed', path: outputPath, createdAt: Date.now() });
            })
            .catch((err) => {
                console.error(`Job ${jobId} failed:`, err);
                jobs.set(jobId, { status: 'error', error: err.message, createdAt: Date.now() });
            });

        res.json({ jobId });

    } catch (error: any) {
        console.error("Failed to start job:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Check Job Status
app.get('/status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = jobs.get(jobId);
    
    console.log(`Status check for ${jobId}: ${job ? job.status : 'NOT FOUND'}`);
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ status: job.status, error: job.error });
});

// 3. Download File
app.get('/download/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = jobs.get(jobId);
    
    if (!job || job.status !== 'completed' || !job.path) {
        return res.status(404).json({ error: 'File not ready or not found' });
    }

    if (!fs.existsSync(job.path)) {
         return res.status(404).json({ error: 'File deleted from server' });
    }
    
    res.setHeader('Content-Type', 'video/mp4');
    
    res.download(job.path, `video_export.mp4`, (err) => {
        if (err) console.error("Download error:", err);
    });
});

app.get('/', (req, res) => {
    res.send('Magistory Backend is Running. Frontend is hosted separately on Vercel.');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Render server running on port ${PORT}`);
});
