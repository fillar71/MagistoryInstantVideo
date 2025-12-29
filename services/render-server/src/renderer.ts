
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Buffer } from 'buffer';

interface RenderJob {
    title: string;
    segments: any[];
    audioTracks: any[];
    resolution: { width: number; height: number };
}

// Helper: Get exact duration of a media file using ffprobe
function getMediaDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const duration = metadata.format.duration;
            resolve(duration || 0);
        });
    });
}

// Updated: Accepts targetDirectory directly instead of depending on global constant
async function saveAsset(url: string, targetDirectory: string, type: 'image' | 'video' | 'audio'): Promise<string> {
    const ext = type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'mp3';
    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(targetDirectory, filename);

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

// Generate Advanced Substation Alpha (.ass) subtitle file for perfect sync and styling
// Updated to support custom coordinates (x,y) from frontend
function createASSFile(filePath: string, text: string, timings: any[], duration: number, width: number, height: number, overlayStyle: any) {
    // Escaping function for ASS text
    const escapeAss = (str: string) => str.replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');

    const fontSize = overlayStyle?.fontSize ? Math.round(overlayStyle.fontSize * (height / 720)) : Math.round(height * 0.05);
    
    // Determine Alignment & Position
    // Default: Bottom Center (Alignment 2)
    let alignment = 2; 
    let posTag = "";

    // If custom coordinates exist, use Alignment 5 (7=top-left, 5=top-left but legacy logic... typically 7 is top-left, 5 is top-left in some implementations or 7 is standard top-left)
    // Actually, simple \pos(x,y) works best with Alignment 2 (center reference) or 5 (top-left reference).
    // Let's use \pos(x,y) with alignment 2 (center) if x/y provided, converting percentage to pixels.
    if (overlayStyle?.x !== undefined && overlayStyle?.y !== undefined) {
        const posX = Math.round((overlayStyle.x / 100) * width);
        const posY = Math.round((overlayStyle.y / 100) * height);
        posTag = `\\pos(${posX},${posY})`;
        alignment = 5; // 5 is usually Top-Left relative to position, or 2 if we want center. 
        // To match frontend "translate(-50%, -50%)", we should probably use alignment 5 (7 numpad) and offset, 
        // OR better: Frontend uses center origin for text. 
        // Let's assume standard behavior: \pos sets the anchor point.
        // If we set Alignment=5 (Top Left of text at pos), it might shift.
        // Alignment=2 (Bottom Center). 
        // Let's stick to Alignment=2 (Bottom Center) as default, but if pos is set, override to 5 (Top Left) or 2 (Center).
        // Since frontend centers the div on the coordinate, Alignment 5 (7 on numpad logic, but in ASS, 5 is often legacy top-left or center depending on version. Standard is numpad: 5=Center).
        alignment = 5; // Center-Center alignment
    } else {
        // Legacy position logic
        if (overlayStyle?.position === 'top') alignment = 8; // Top Center
        else if (overlayStyle?.position === 'center') alignment = 5; // Middle Center
        else alignment = 2; // Bottom Center
    }

    let content = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const fmtTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const iso = date.toISOString().substr(11, 11); // HH:mm:ss.ss
        return iso.slice(0, -1);
    };

    const overrideTags = `{\\an${alignment}${posTag}}`;

    // If no timings provided, show full text for duration
    if (!timings || timings.length === 0) {
        if (text) {
            const end = fmtTime(duration);
            content += `Dialogue: 0,0:00:00.00,${end},Default,,0,0,0,,${overrideTags}${escapeAss(text)}\n`;
        }
    } else {
        // Group words into lines
        const MAX_CHARS = 40;
        let currentLine: any[] = [];
        let currentLen = 0;

        const flushLine = () => {
            if (currentLine.length === 0) return;
            const start = fmtTime(currentLine[0].start);
            const end = fmtTime(currentLine[currentLine.length - 1].end);
            const lineText = currentLine.map(x => x.word).join(' ');
            content += `Dialogue: 0,${start},${end},Default,,0,0,0,,${overrideTags}${escapeAss(lineText)}\n`;
            currentLine = [];
            currentLen = 0;
        };

        timings.forEach((t: any) => {
            // Check if adding this word exceeds max chars
            if (currentLen + t.word.length > MAX_CHARS && currentLine.length > 0) {
                flushLine();
            }
            currentLine.push(t);
            currentLen += t.word.length + 1;
        });
        flushLine(); // Flush remaining
    }

    fs.writeFileSync(filePath, content);
}

export async function renderVideo(job: RenderJob, tempDir: string): Promise<string> {
    const jobId = uuidv4();
    const jobDir = path.join(tempDir, jobId);
    
    if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
    }

    const outputPath = path.join(jobDir, 'output.mp4');
    const width = job.resolution?.width || 1280;
    const height = job.resolution?.height || 720;

    try {
        const segmentFiles: string[] = [];

        // 1. Process Segments (Burn subtitles per segment)
        for (let i = 0; i < job.segments.length; i++) {
            const seg = job.segments[i];
            const segOutputPath = path.join(jobDir, `seg_${i}.mp4`);
            
            // --- RESOURCE PREPARATION ---
            let audioPath = null;
            let exactDuration = seg.duration || 3;

            // Handle Audio
            if (seg.audioUrl) {
                // FIX: Pass jobDir directly
                audioPath = await saveAsset(seg.audioUrl, jobDir, 'audio');
                try {
                    // Use audio duration as the master clock if available
                    const audioDur = await getMediaDuration(audioPath);
                    if (audioDur > 0) exactDuration = audioDur;
                } catch (e) {
                    console.warn(`Failed to probe audio for seg ${i}:`, e);
                }
            }

            // Handle Video/Images
            const clipInputs: { path: string, type: string, duration: number, transform?: any }[] = [];
            const numClips = seg.media.length;
            const perClipDuration = exactDuration / Math.max(1, numClips);

            for (const clip of seg.media) {
                // FIX: Pass jobDir directly
                const clipPath = await saveAsset(clip.url, jobDir, clip.type);
                clipInputs.push({ 
                    path: clipPath, 
                    type: clip.type, 
                    duration: perClipDuration,
                    transform: clip.transform
                });
            }

            // Generate Subtitle File (.ass)
            let assPath = '';
            let assFilterString = '';
            if (seg.narration_text) {
                assPath = path.join(jobDir, `subs_${i}.ass`);
                
                // --- SUBTITLE SYNC FIX ---
                let syncedTimings = seg.wordTimings;
                if (seg.wordTimings && seg.wordTimings.length > 0) {
                    const estimatedDuration = seg.duration || exactDuration;
                    if (estimatedDuration > 0 && Math.abs(estimatedDuration - exactDuration) > 0.05) {
                        const ratio = exactDuration / estimatedDuration;
                        syncedTimings = seg.wordTimings.map((t: any) => ({
                            ...t,
                            start: t.start * ratio,
                            end: t.end * ratio
                        }));
                    }
                }

                // Pass overlay style to createASSFile
                createASSFile(assPath, seg.narration_text, syncedTimings, exactDuration, width, height, seg.textOverlayStyle);
                
                // Escape path specifically for FFmpeg filter
                const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
                assFilterString = `subtitles=filename='${safeAssPath}'`;
            }

            // --- FFMPEG SEGMENT RENDER ---
            await new Promise<void>((resolve, reject) => {
                const cmd = ffmpeg();
                const filters: string[] = [];
                
                // Input Visuals
                clipInputs.forEach(c => {
                    cmd.input(c.path);
                    if (c.type === 'image') cmd.inputOptions(['-loop 1']);
                });

                // Input Audio (or Silence)
                const audioInputIndex = clipInputs.length;
                let audioLabel = 'a_out';

                if (audioPath) {
                    cmd.input(audioPath);
                    filters.push(`[${audioInputIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.5[${audioLabel}]`);
                } else {
                    // Use filter to generate silence to avoid "lavfi not found" input issues
                    filters.push(`anullsrc=channel_layout=stereo:sample_rate=44100:duration=${exactDuration}[${audioLabel}]`);
                }

                // Visual Filters Chain
                let videoStreamLabel = '';

                // 1. Normalize Scale & Duration & Apply TRANSFORM (Pan & Zoom)
                clipInputs.forEach((c, idx) => {
                    const label = `v${idx}`;
                    
                    const t = c.transform || { scale: 1, x: 0, y: 0 };
                    const userZoom = t.scale || 1;
                    const userX = t.x || 0;
                    const userY = t.y || 0;

                    const scaleFilter = `scale='if(gt(a,${width}/${height}),-1,${width})*${userZoom}':'if(gt(a,${width}/${height}),${height},-1)*${userZoom}'`;
                    
                    const cropFilter = `crop=${width}:${height}:(iw-ow)/2 - ${userX}:(ih-oh)/2 - ${userY}`;

                    filters.push(`[${idx}:v]${scaleFilter},${cropFilter},setsar=1,trim=duration=${c.duration},setpts=PTS-STARTPTS[${label}]`);
                });

                // 2. Concatenate Clips Visuals
                const vLabels = clipInputs.map((_, idx) => `[v${idx}]`).join('');
                filters.push(`${vLabels}concat=n=${clipInputs.length}:v=1:a=0[v_concat]`);
                videoStreamLabel = 'v_concat';

                // 3. Burn Subtitles (Last Step)
                if (assFilterString) {
                    filters.push(`[${videoStreamLabel}]${assFilterString}[v_final]`);
                    videoStreamLabel = 'v_final';
                }

                cmd.complexFilter(filters);

                cmd.outputOptions([
                    '-map', `[${videoStreamLabel}]`,
                    '-map', `[${audioLabel}]`,
                    '-c:v', 'libx264',
                    '-preset', 'superfast', // Faster rendering
                    '-c:a', 'aac',
                    `-t`, `${exactDuration}` // Force exact duration matches audio
                ]);

                cmd.save(segOutputPath)
                    .on('end', () => resolve())
                    .on('error', (err) => {
                        console.error(`Segment ${i} Render Error:`, err);
                        reject(err);
                    });
            });

            segmentFiles.push(segOutputPath);
        }

        // 2. Concatenate All Segments
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

        // 3. Final Mix with Global Audio Tracks
        if (job.audioTracks && job.audioTracks.length > 0) {
            const finalCmd = ffmpeg().input(mergedVisualsPath);
            let inputCount = 1;
            const audioMixLabels = ['[0:a]'];
            
            const complexFilters: string[] = [];

            for (const track of job.audioTracks) {
                // FIX: Pass jobDir directly
                const trackPath = await saveAsset(track.url, jobDir, 'audio');
                finalCmd.input(trackPath);
                
                const delayMs = Math.round(track.startTime * 1000);
                const volume = track.volume || 0.5;
                const label = `a${inputCount}`;
                
                complexFilters.push(`[${inputCount}:a]adelay=${delayMs}|${delayMs},volume=${volume}[${label}]`);
                audioMixLabels.push(`[${label}]`);
                inputCount++;
            }

            // Mix all audios
            complexFilters.push(`${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=first:dropout_transition=0,dynaudnorm[aout]`);
            
            finalCmd.complexFilter(complexFilters);
            finalCmd.outputOptions([
                '-map', '0:v', 
                '-map', '[aout]',
                '-c:v', 'copy', // Don't re-encode video, just copy
                '-c:a', 'aac',
                '-shortest'
            ]);

            await new Promise<void>((resolve, reject) => {
                finalCmd
                    .save(outputPath)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(new Error(`Error final mix: ${err.message}`)));
            });
        } else {
            // No global audio, just move the merged file
            fs.renameSync(mergedVisualsPath, outputPath);
        }
        
        return outputPath;

    } catch (e) {
        throw e;
    }
}
