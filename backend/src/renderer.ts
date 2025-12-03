import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Buffer } from 'buffer';

const TEMP_DIR = path.join(process.cwd(), 'temp');
// Path font standar di Debian/Ubuntu (Docker Node Slim)
const FONT_PATH_DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

interface RenderJob {
    title: string;
    segments: any[];
    audioTracks: any[];
    resolution: { width: number; height: number };
}

async function saveAsset(url: string, jobId: string, type: 'image' | 'video' | 'audio'): Promise<string> {
    const ext = type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'mp3';
    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(TEMP_DIR, jobId, filename);

    if (url.startsWith('data:')) {
        const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) throw new Error('Invalid input string');
        const buffer = Buffer.from(matches[2], 'base64');
        fs.writeFileSync(filePath, buffer);
    } else {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
    }
    return filePath;
}

export async function renderVideo(job: RenderJob): Promise<string> {
    const jobId = uuidv4();
    const jobDir = path.join(TEMP_DIR, jobId);
    
    if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
    }

    const outputPath = path.join(jobDir, 'output.mp4');
    const width = 1280;
    const height = 720;

    // Pastikan font ada, atau cari alternatif (untuk robustness)
    let fontPath = '';
    if (fs.existsSync(FONT_PATH_DEJAVU)) {
        fontPath = FONT_PATH_DEJAVU;
    } else {
        // Fallback: biarkan kosong, ffmpeg akan mencoba font default sistem atau error jika strict
        console.warn("Warning: DejaVu font not found at expected path. Subtitles might fail or use default.");
    }

    try {
        const segmentFiles: string[] = [];

        // 1. Process Segments
        for (let i = 0; i < job.segments.length; i++) {
            const seg = job.segments[i];
            const media = seg.media[0];
            
            const mediaPath = await saveAsset(media.url, jobId, media.type);
            
            let audioPath = null;
            if (seg.audioUrl) {
                audioPath = await saveAsset(seg.audioUrl, jobId, 'audio');
            }

            const segOutputPath = path.join(jobDir, `seg_${i}.mp4`);
            
            await new Promise<void>((resolve, reject) => {
                const segCmd = ffmpeg();
                
                segCmd.input(mediaPath);
                if (media.type === 'image') {
                    segCmd.inputOptions(['-loop 1']);
                }

                if (audioPath) {
                    segCmd.input(audioPath);
                } else {
                    segCmd.input('anullsrc=channel_layout=stereo:sample_rate=44100').inputFormat('lavfi');
                }

                const filters = [];
                // Scale video/image to fit 720p
                filters.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vscaled]`);
                
                let videoOut = 'vscaled';

                if (seg.narration_text) {
                    // --- SOLUSI SILVER BULLET UNTUK SUBTITLE ---
                    // Tulis teks ke file alih-alih memasukkannya ke command line
                    // Ini menghindari masalah escaping karakter spesial (quotes, colon, backslash)
                    const textFilePath = path.join(jobDir, `text_${i}.txt`);
                    // Ganti newline dengan spasi agar jadi satu baris (opsional, tergantung preferensi tampilan)
                    const sanitizedContent = seg.narration_text.replace(/\n/g, ' ');
                    fs.writeFileSync(textFilePath, sanitizedContent, 'utf8');

                    // Escape path untuk FFmpeg (windows backslash vs linux forward slash)
                    // Di Docker Linux aman menggunakan forward slash
                    const fontOption = fontPath ? `:fontfile='${fontPath}'` : '';
                    const textFileOption = `:textfile='${textFilePath}'`;
                    
                    // Gunakan textfile=... alih-alih text='...'
                    filters.push(`[${videoOut}]drawtext=${fontOption}${textFileOption}:fontcolor=white:fontsize=36:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-80[vtext]`);
                    videoOut = 'vtext';
                }

                segCmd.complexFilter(filters, [videoOut]);
                
                segCmd.outputOptions([
                    '-map', `[${videoOut}]`,
                    '-map', audioPath ? '1:a' : '1:a',
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-c:a', 'aac',
                    '-shortest',
                    `-t`, `${seg.duration}`
                ]);

                segCmd.save(segOutputPath)
                    .on('end', () => resolve())
                    .on('error', (err) => {
                        console.error(`FFmpeg Segment ${i} Error Log:`, err);
                        reject(new Error(`Error processing segment ${i}: ${err.message}`));
                    });
            });

            segmentFiles.push(segOutputPath);
        }

        // 2. Concat Segments
        const concatListPath = path.join(jobDir, 'concat_list.txt');
        const concatFileContent = segmentFiles.map(f => `file '${f}'`).join('\n');
        fs.writeFileSync(concatListPath, concatFileContent);

        const mergedVisualsPath = path.join(jobDir, 'merged_visuals.mp4');

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c', 'copy'])
                .save(mergedVisualsPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`Error concat segments: ${err.message}`)));
        });

        // 3. Mix Background Audio
        const finalCmd = ffmpeg().input(mergedVisualsPath);
        let inputCount = 1;
        const audioMixInputs = ['[0:a]'];
        
        const complexFilters: string[] = [];

        for (const track of job.audioTracks) {
            const trackPath = await saveAsset(track.url, jobId, 'audio');
            finalCmd.input(trackPath);
            
            const delayMs = Math.round(track.startTime * 1000);
            const volume = track.volume || 0.8;
            
            complexFilters.push(`[${inputCount}:a]adelay=${delayMs}|${delayMs},volume=${volume}[a${inputCount}]`);
            audioMixInputs.push(`[a${inputCount}]`);
            inputCount++;
        }

        if (audioMixInputs.length > 1) {
            complexFilters.push(`${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0[aout]`);
            finalCmd.outputOptions(['-map', '0:v', '-map', '[aout]']);
        } else {
             finalCmd.outputOptions(['-map', '0:v', '-map', '0:a']);
        }
        
        if (complexFilters.length > 0) {
            finalCmd.complexFilter(complexFilters);
        }

        finalCmd.outputOptions([
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest'
        ]);

        await new Promise<void>((resolve, reject) => {
            finalCmd
                .save(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`Error final render: ${err.message}`)));
        });
        
        return outputPath;

    } catch (e) {
        throw e;
    }
}
