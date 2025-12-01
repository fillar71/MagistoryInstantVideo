import express from 'express';
import cors from 'cors';
import { renderVideo } from './renderer'; // Removed .js extension for CommonJS compatibility
import path from 'path';
import fs from 'fs';

// Handle unhandled exceptions to prevent silent crashes
(process as any).on('uncaughtException', (err: any) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('UNHANDLED REJECTION:', reason);
});

const app = express();
// Railway provides PORT env var. Default to 3001 if local.
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Increase payload limit for Base64 assets
app.use(express.json({ limit: '500mb' }));
app.use(cors({
    origin: '*', 
    methods: ['POST', 'GET']
}));

// Using process.cwd() is safer in Docker environments
const TEMP_DIR = path.join((process as any).cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    } catch (e) {
        console.error("Failed to create temp directory:", e);
    }
}

app.post('/render', async (req, res) => {
    try {
        console.log(`Received render request for title: ${req.body.title}`);
        const { title, segments, audioTracks, resolution } = req.body;

        if (!segments || segments.length === 0) {
            return res.status(400).json({ error: "No segments provided" });
        }

        const outputPath = await renderVideo({ title, segments, audioTracks, resolution });

        console.log(`Render complete: ${outputPath}`);

        res.download(outputPath, `${title.replace(/[^a-z0-9]/gi, '_')}.mp4`, (err) => {
            if (err) {
                console.error("Error sending file:", err);
            }
            // Clean up file after sending
            fs.unlink(outputPath, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting temp file:", unlinkErr);
            });
        });

    } catch (error: any) {
        console.error("Render failed:", error);
        // Send explicit error message to frontend
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

app.get('/', (req, res) => {
    res.send('Magistory Render Server is running (Healthy).');
});

// Bind to 0.0.0.0 is CRITICAL for Docker/Railway networking
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Render server running on port ${PORT}`);
    console.log(`Temp directory: ${TEMP_DIR}`);
});