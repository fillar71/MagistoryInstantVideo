import express from 'express';
import cors from 'cors';
import { renderVideo } from './renderer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Handle unhandled exceptions to prevent hard crashes
(process as any).on('uncaughtException', (err: any) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
// Priority: Environment Variable > 3002. Railway MUST use process.env.PORT
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;

console.log(`Starting Render Server... Environment Port: ${process.env.PORT}, Selected Port: ${PORT}`);

// Increase limit for uploads (large video payloads)
app.use(express.json({ limit: '500mb' }) as any);

// CORS Configuration
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, true);
    },
    credentials: true
}) as any);

// Ensure Temp Directory Exists - Wrap in try-catch for read-only filesystem protection
const TEMP_DIR = path.join((process as any).cwd(), 'temp');
try {
    if (!fs.existsSync(TEMP_DIR)) {
        console.log(`Creating temp directory at: ${TEMP_DIR}`);
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
} catch (err) {
    console.error("WARNING: Failed to create temp directory. If this is a read-only environment, rendering may fail.", err);
}

// --- HEALTH CHECK ---
app.get('/', (req, res) => {
    res.status(200).send('Magistory Render Server is Running.');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// --- RENDERER ROUTES ---

// Simple in-memory job store
const jobs = new Map<string, { status: 'processing' | 'completed' | 'error', path?: string, error?: string, createdAt: number }>();

// Clean up old jobs periodically (every 1 hour)
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - job.createdAt > 3600000) { // 1 hour
            try {
                if (job.path && fs.existsSync(job.path)) {
                    fs.unlinkSync(job.path);
                }
            } catch (e) { /* ignore cleanup errors */ }
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
        
        // Non-blocking render call
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

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log("==================================================");
    console.log(`✅ Render Server running on port ${PORT}`);
    console.log("==================================================");
});

// Graceful Shutdown
(process as any).on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Process terminated.');
    });
});
