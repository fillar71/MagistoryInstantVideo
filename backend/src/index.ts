import express from 'express';
import cors from 'cors';
import { renderVideo } from './renderer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Handle unhandled exceptions
(process as any).on('uncaughtException', (err: any) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.use(express.json({ limit: '500mb' }));
app.use(cors({ origin: '*' }));

const TEMP_DIR = path.join((process as any).cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

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
        
        // Initialize job
        jobs.set(jobId, { status: 'processing', createdAt: Date.now() });
        
        // Start processing in background (DO NOT AWAIT)
        renderVideo(req.body)
            .then((outputPath) => {
                console.log(`Job ${jobId} completed: ${outputPath}`);
                jobs.set(jobId, { status: 'completed', path: outputPath, createdAt: Date.now() });
            })
            .catch((err) => {
                console.error(`Job ${jobId} failed:`, err);
                jobs.set(jobId, { status: 'error', error: err.message, createdAt: Date.now() });
            });

        // Return Job ID immediately
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
    
    res.download(job.path, `video_export.mp4`, (err) => {
        if (err) console.error("Download error:", err);
    });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Render server running on port ${PORT}`);
});