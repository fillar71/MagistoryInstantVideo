
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Buffer } from 'buffer';

// Import static binaries
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// Set paths correctly - ffmpeg-static returns a string path, ffprobe-static returns an object
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

if (ffprobeStatic && ffprobeStatic.path) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
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
        const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches[2]) {
            fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
        } else {
            // Fallback for direct base64
            const base64Data = url.split(',')[1] || url;
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        }
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
                
                // Input options for visual
                if (seg.media[0].type === 'image') {
                    cmd.inputOptions(['-loop 1', `-t ${seg.duration}`]);
                } else {
                    cmd.inputOptions([`-t ${seg.duration}`]);
                }
                
                // Building complex filter
                // We generate visual [v] and audio [a]
                const filters: any[] = [
                    {
                        filter: 'scale',
                        options: `${width}:${height}:force_original_aspect_ratio=decrease`,
                        inputs: '0:v',
                        outputs: 'v1'
                    },
                    {
                        filter: 'pad',
                        options: `${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
                        inputs: 'v1',
                        outputs: 'v2'
                    },
                    {
                        filter: 'setsar',
                        options: '1',
                        inputs: 'v2',
                        outputs: 'v'
                    }
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
                    // If audio exists, add as second input
                    cmd.input(audioPath);
                    outputOptions.push('-map 1:a');
                } else {
                    // CRITICAL FIX: Generate silence INSIDE complex filter to avoid -f lavfi
                    filters.push({
                        filter: 'anullsrc',
                        options: {
                            channel_layout: 'stereo',
                            sample_rate: 44100,
                            duration: seg.duration
                        },
                        outputs: 'a'
                    });
                    outputOptions.push('-map [a]');
                }

                cmd.complexFilter(filters)
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

        // Final Concatenation
        const listPath = path.join(jobDir, 'list.txt');
        fs.writeFileSync(listPath, segmentFiles.map(f => `file '${f}'`).join('\n'));

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(listPath)
                .inputOptions(['-f concat', '-safe 0'])
                .outputOptions(['-c copy'])
                .save(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => {
                    console.error("Concatenation Error:", err);
                    reject(err);
                });
        });

        return outputPath;
    } catch (e) {
        throw e;
    }
}
