
import express from 'express';
import cors from 'cors';
import { renderVideo } from './renderer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Catch startup errors
(process as any).on('uncaughtException', (err: any) => {
    console.error('CRITICAL RENDER SERVER ERROR:', err);
});

const app = express();
app.enable('trust proxy');

// 1. HEALTH CHECK PERTAMA
app.get('/health', (req, res) => {
    console.log(`[Health] Check received from ${req.ip}`);
    res.status(200).send('OK')
});
app.get('/', (req, res) => {
    console.log(`[Root] Check received from ${req.ip}`);
    res.status(200).send('Render Server Online')
});

// 2. CORS
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}) as any);

// 3. MEMORY OPTIMIZATION
app.use(express.json({ limit: '100mb' }) as any);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;
const TEMP_DIR = path.join(os.tmpdir(), 'magistory-render');

try {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
} catch (err) {
    console.error("Temp Dir Error:", err);
}

const jobs = new Map<string, { status: 'processing' | 'completed' | 'error', path?: string, error?: string, createdAt: number }>();

// Cleanup setiap 30 menit
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - job.createdAt > 1800000) {
            try { if (job.path && fs.existsSync(job.path)) fs.unlinkSync(job.path); } catch (e) {}
            jobs.delete(id);
        }
    }
}, 1800000);

app.post('/render', async (req, res) => {
    try {
        const jobId = uuidv4();
        console.log(`Job Started: ${jobId}`);
        jobs.set(jobId, { status: 'processing', createdAt: Date.now() });
        
        renderVideo(req.body, TEMP_DIR)
            .then((outputPath) => {
                jobs.set(jobId, { status: 'completed', path: outputPath, createdAt: Date.now() });
            })
            .catch((err) => {
                console.error(`Job Failed ${jobId}:`, err);
                jobs.set(jobId, { status: 'error', error: err.message, createdAt: Date.now() });
            });

        res.json({ jobId });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Not Found' });
    res.json({ status: job.status, error: job.error });
});

app.get('/download/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job || job.status !== 'completed' || !job.path) return res.status(404).send('File not ready');
    res.download(job.path, 'video.mp4');
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Render Server Live on port ${PORT}`);
});

(process as any).on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});
