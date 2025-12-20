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

// Middleware: Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    next();
});

const healthHandler = (req: any, res: any) => {
    console.log(`[Health] Check responding OK`);
    res.status(200).send('Render Server Online');
};

app.get('/', healthHandler);
app.head('/', healthHandler);
app.get('/health', healthHandler);

// CORS
app.use(cors());

// 3. MEMORY OPTIMIZATION
app.use(express.json({ limit: '100mb' }) as any);

const PORT = parseInt(process.env.PORT || '3002');
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

// Start Server - Bind to all interfaces
const server = app.listen(PORT, () => {
    console.log(`✅ Render Server Live on port ${PORT}`);
});

const shutdown = () => {
    console.log('SIGTERM/SIGINT received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        (process as any).exit(0);
    });
};

(process as any).on('SIGTERM', shutdown);
(process as any).on('SIGINT', shutdown);