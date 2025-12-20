
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Buffer } from 'buffer';

// Add type declaration for require to fix TS error
declare const require: any;

let ffmpegPath = null;
let ffprobePath = null;

try {
    // @ts-ignore
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) ffmpegPath = ffmpegStatic;
} catch (e) {
    console.warn("Failed to require ffmpeg-static:", e);
}

try {
    // @ts-ignore
    const ffprobeStatic = require('ffprobe-static');
    if (ffprobeStatic && ffprobeStatic.path) ffprobePath = ffprobeStatic.path;
} catch (e) {
    console.warn("Failed to require ffprobe-static:", e);
}

// Fallback to system paths if static binaries fail
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`FFmpeg binary set to: ${ffmpegPath}`);
} else {
    console.log("Using system FFmpeg");
}

if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
    console.log(`FFprobe binary set to: ${ffprobePath}`);
}

interface RenderJob {
    title: string;
    segments: any[];
    audioTracks: any[];
    resolution: { width: number; height: number };
}

async function saveAsset(url: string, jobId: string, type: string, baseDir: string): Promise<string> {
    const ext = type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'mp3';
    const filename = `${uuidv4()}.${ext}`;
    const jobDir = path.join(baseDir, jobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
    
    const filePath = path.join(jobDir, filename);

    if (url.startsWith('data:')) {
        const base64Data = url.split(',')[1];
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    } else {
        const response = await axios({ url, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        
        await new Promise<void>((res, rej) => { 
            writer.on('finish', () => res()); 
            writer.on('error', (err) => rej(err)); 
        });
    }
    return filePath;
}

export async function renderVideo(job: RenderJob, tempDir: string): Promise<string> {
    const jobId = uuidv4();
    const jobDir = path.join(tempDir, jobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const outputPath = path.join(jobDir, 'final.mp4');
    const { width, height } = job.resolution || { width: 1280, height: 720 };

    try {
        const segmentFiles: string[] = [];

        for (let i = 0; i < job.segments.length; i++) {
            const seg = job.segments[i];
            const segPath = path.join(jobDir, `seg_${i}.mp4`);
            
            const clipPath = await saveAsset(seg.media[0].url, jobId, seg.media[0].type, tempDir);
            let audioPath = seg.audioUrl ? await saveAsset(seg.audioUrl, jobId, 'audio', tempDir) : null;

            await new Promise<void>((resolve, reject) => {
                const cmd = ffmpeg(clipPath);
                
                // Jika input berupa gambar, buat loop
                if (seg.media[0].type === 'image') {
                    cmd.inputOptions(['-loop 1', `-t ${seg.duration}`]);
                } else {
                    cmd.inputOptions([`-t ${seg.duration}`]);
                }
                
                const filterComplex = [
                    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v]`
                ];

                const outputOptions = [
                    '-map [v]',
                    '-c:v libx264',
                    '-preset superfast',
                    '-crf 28',
                    '-c:a aac',
                    '-shortest',
                    `-t ${seg.duration}`
                ];

                if (audioPath) {
                    // Jika ada file audio, tambahkan sebagai input kedua
                    cmd.input(audioPath);
                    outputOptions.push('-map 1:a');
                } else {
                    // Jika TIDAK ADA audio, buat audio hening di dalam filter (menghindari -f lavfi)
                    filterComplex.push(`anullsrc=channel_layout=stereo:sample_rate=44100:duration=${seg.duration}[a]`);
                    outputOptions.push('-map [a]');
                }

                cmd.complexFilter(filterComplex)
                    .outputOptions(outputOptions)
                    .save(segPath)
                    .on('end', () => resolve())
                    .on('error', (err) => {
                        console.error(`Error rendering segment ${i}:`, err);
                        reject(err);
                    });
            });
            segmentFiles.push(segPath);
        }

        // Gabungkan semua segment
        const listPath = path.join(jobDir, 'list.txt');
        fs.writeFileSync(listPath, segmentFiles.map(f => `file '${f}'`).join('\n'));

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(listPath)
                .inputOptions(['-f concat', '-safe 0'])
                .outputOptions(['-c copy'])
                .save(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });

        return outputPath;
    } catch (e) {
        throw e;
    }
}
