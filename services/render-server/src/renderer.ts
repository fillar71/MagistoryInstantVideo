
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Buffer } from 'buffer';

declare const require: any;

let ffmpegPath = null;
let ffprobePath = null;

try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) ffmpegPath = ffmpegStatic;
} catch (e) { console.warn("FFmpeg static not found"); }

try {
    const ffprobeStatic = require('ffprobe-static');
    if (ffprobeStatic && ffprobeStatic.path) ffprobePath = ffprobeStatic.path;
} catch (e) { console.warn("FFprobe static not found"); }

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

interface RenderJob {
    title: string;
    segments: any[];
    audioTracks: any[];
    resolution: { width: number; height: number };
}

function getMediaDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format.duration || 0);
        });
    });
}

async function saveAsset(url: string, jobId: string, type: string, baseDir: string): Promise<string> {
    const ext = type === 'image' ? 'jpg' : (type === 'audio' ? 'mp3' : 'mp4');
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
            writer.on('error', rej); 
        });
    }
    return filePath;
}

// Generate Advanced Substation Alpha (.ass) for high-quality subtitles
function createASSFile(filePath: string, segment: any, width: number, height: number) {
    const style = segment.textOverlayStyle || {};
    const fontSize = Math.round((style.fontSize || 40) * (height / 720)); // scale font
    const color = (style.color || '#FFFFFF').replace('#', '');
    // Convert hex to ASS format (AABBGGRR)
    const assColor = `&H00${color.substring(4,6)}${color.substring(2,4)}${color.substring(0,2)}`;

    let content = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${assColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const fmt = (s: number) => {
        const d = new Date(s * 1000);
        return d.toISOString().substr(11, 11).slice(0, -1);
    };

    if (!segment.wordTimings || segment.wordTimings.length === 0) {
        content += `Dialogue: 0,${fmt(0)},${fmt(segment.duration)},Default,,0,0,0,,${segment.narration_text}\n`;
    } else {
        // Group words into lines based on typical character length
        let currentLine: any[] = [];
        let charCount = 0;
        const flush = () => {
            if (currentLine.length === 0) return;
            const start = fmt(currentLine[0].start);
            const end = fmt(currentLine[currentLine.length-1].end);
            const text = currentLine.map(w => w.word).join(' ');
            content += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
            currentLine = [];
            charCount = 0;
        };

        segment.wordTimings.forEach((w: any) => {
            if (charCount + w.word.length > 40) flush();
            currentLine.push(w);
            charCount += w.word.length + 1;
        });
        flush();
    }
    fs.writeFileSync(filePath, content);
}

export async function renderVideo(job: RenderJob, tempDir: string): Promise<string> {
    const jobId = uuidv4();
    const jobDir = path.join(tempDir, jobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const finalPath = path.join(jobDir, 'final_output.mp4');
    const { width, height } = job.resolution || { width: 1280, height: 720 };

    try {
        const segmentFiles: string[] = [];

        // 1. Process Segments (Visuals + Narration + Subtitles)
        for (let i = 0; i < job.segments.length; i++) {
            const seg = job.segments[i];
            const segOut = path.join(jobDir, `seg_${i}.mp4`);
            
            const clipPath = await saveAsset(seg.media[0].url, jobId, seg.media[0].type, tempDir);
            let audioPath = seg.audioUrl ? await saveAsset(seg.audioUrl, jobId, 'audio', tempDir) : null;
            
            // Generate Subtitle File
            let assPath = null;
            if (seg.narration_text) {
                assPath = path.join(jobDir, `sub_${i}.ass`);
                createASSFile(assPath, seg, width, height);
            }

            await new Promise<void>((resolve, reject) => {
                const cmd = ffmpeg(clipPath);
                if (seg.media[0].type === 'image') cmd.inputOptions(['-loop 1']);
                
                const filterComplex = [
                    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v_scaled]`
                ];
                let lastVLabel = 'v_scaled';

                if (assPath) {
                    const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
                    filterComplex.push(`[${lastVLabel}]subtitles=filename='${safeAssPath}'[v_sub]`);
                    lastVLabel = 'v_sub';
                }

                cmd.complexFilter(filterComplex);
                const outOpts = [
                    `-map [${lastVLabel}]`,
                    '-c:v libx264', '-preset superfast', '-crf 23',
                    '-c:a aac', '-b:a 128k',
                    `-t ${seg.duration}`
                ];

                if (audioPath) {
                    cmd.input(audioPath);
                    outOpts.push('-map 1:a');
                } else {
                    cmd.input('anullsrc=channel_layout=stereo:sample_rate=44100').inputFormat('lavfi');
                    outOpts.push('-map 1:a');
                }

                cmd.outputOptions(outOpts).save(segOut).on('end', () => resolve()).on('error', reject);
            });
            segmentFiles.push(segOut);
        }

        // 2. Concatenate Segments
        const concatTxt = path.join(jobDir, 'concat.txt');
        fs.writeFileSync(concatTxt, segmentFiles.map(f => `file '${f}'`).join('\n'));
        const mergedVisuals = path.join(jobDir, 'merged.mp4');

        await new Promise<void>((res, rej) => {
            ffmpeg().input(concatTxt).inputOptions(['-f concat', '-safe 0'])
                .outputOptions(['-c copy']).save(mergedVisuals).on('end', res).on('error', rej);
        });

        // 3. FINAL MIX (Merge with Global Audio Tracks - Feature: Audio to Video)
        if (job.audioTracks && job.audioTracks.length > 0) {
            const mixCmd = ffmpeg(mergedVisuals);
            const mixFilters = ['[0:a]volume=1.0[main_a]'];
            const mixLabels = ['[main_a]'];

            for (let j = 0; j < job.audioTracks.length; j++) {
                const track = job.audioTracks[j];
                const trackPath = await saveAsset(track.url, jobId, 'audio', tempDir);
                mixCmd.input(trackPath);
                
                const delay = Math.round(track.startTime * 1000);
                const label = `a${j+1}`;
                mixFilters.push(`[${j+1}:a]adelay=${delay}|${delay},volume=${track.volume || 1.0}[${label}]`);
                mixLabels.push(`[${label}]`);
            }

            mixFilters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first[out_a]`);
            
            await new Promise<void>((res, rej) => {
                mixCmd.complexFilter(mixFilters)
                    .outputOptions(['-map 0:v', '-map [out_a]', '-c:v copy', '-c:a aac', '-shortest'])
                    .save(finalPath).on('end', res).on('error', rej);
            });
            return finalPath;
        }

        return mergedVisuals;
    } catch (e) {
        console.error("Renderer Exception:", e);
        throw e;
    }
}
