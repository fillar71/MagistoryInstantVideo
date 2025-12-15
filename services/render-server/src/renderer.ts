
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Buffer } from 'buffer';

const TEMP_DIR = path.join((process as any).cwd(), 'temp');
// Standard font path in Debian/Ubuntu (Docker Node Slim) after fonts-dejavu is installed
const FONT_PATH_DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

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

// Generate Advanced Substation Alpha (.ass) subtitle file for perfect sync
function createASSFile(filePath: string, text: string, timings: any[], duration: number, width: number, height: number) {
    let content = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,${Math.round(height * 0.06)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,${Math.round(height * 0.08)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const fmtTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const iso = date.toISOString().substr(11, 11); 
        return iso.slice(0, -1);
    };

    if (!timings || timings.length === 0) {
        const end = fmtTime(duration);
        content += `Dialogue: 0,0:00:00.00,${end},Default,,0,0,0,,${text}\n`;
        fs.writeFileSync(filePath, content);
        return;
    }

    const MAX_CHARS = 50;
    let currentLine: any[] = [];
    let currentLen = 0;

    timings.forEach((t: any) => {
        if (currentLen + t.word.length > MAX_CHARS && currentLine.length > 0) {
             const start = fmtTime(currentLine[0].start);
             const end = fmtTime(currentLine[currentLine.length - 1].end);
             const lineText = currentLine.map(x => x.word).join(' ');
             content += `Dialogue: 0,${start},${end},Default,,0,0,0,,${lineText}\n`;
             currentLine = [];
             currentLen = 0;
        }
        currentLine.push(t);
        currentLen += t.word.length + 1;
    });

    if (currentLine.length > 0) {
        const start = fmtTime(currentLine[0].start);
        const end = fmtTime(currentLine[currentLine.length - 1].end);
        // Ensure last subtitle lasts until the very end of segment duration if needed
        const lineText = currentLine.map(x => x.word).join(' ');
        content += `Dialogue: 0,${start},${fmtTime(duration)},Default,,0,0,0,,${lineText}\n`;
    }

    fs.writeFileSync(filePath, content);
}


export async function renderVideo(job: RenderJob): Promise<string> {
    const jobId = uuidv4();
    const jobDir = path.join(TEMP_DIR, jobId);
    
    if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
    }

    const outputPath = path.join(jobDir, 'output.mp4');
    const width = job.resolution?.width || 1280;
    const height = job.resolution?.height || 720;

    try {
        const segmentFiles: string[] = [];

        // 1. Process Segments
        for (let i = 0; i < job.segments.length; i++) {
            const seg = job.segments[i];
            const segOutputPath = path.join(jobDir, `seg_${i}.mp4`);
            
            // --- SYNC STRATEGY: AUDIO IS KING ---
            // 1. Download audio first
            // 2. Measure EXACT audio duration
            // 3. Adjust visual duration to match audio exactly
            
            let audioPath = null;
            let exactDuration = seg.duration || 3; // Fallback

            if (seg.audioUrl) {
                audioPath = await saveAsset(seg.audioUrl, jobId, 'audio');
                try {
                    exactDuration = await getMediaDuration(audioPath);
                    console.log(`Segment ${i}: Exact Audio Duration = ${exactDuration}s`);
                } catch (e) {
                    console.warn(`Failed to probe audio duration for seg ${i}, using fallback:`, e);
                }
            } else {
                // If no audio, strictly use the frontend planned duration
                exactDuration = seg.duration;
            }

            // --- VISUAL DURATION CALCULATION ---
            const transitionDur = 0.5; // Fixed transition duration
            const numClips = seg.media.length;
            
            // Logic: Total Visual Time (after overlaps) MUST EQUAL Exact Audio Duration
            // Formula for N clips with (N-1) overlaps of transitionDur:
            // TotalDuration = (ClipDur * N) - (TransitionDur * (N-1))
            // Therefore: ClipDur = (TotalDuration + (TransitionDur * (N-1))) / N
            
            const totalOverlapTime = Math.max(0, numClips - 1) * transitionDur;
            const requiredTotalRawDuration = exactDuration + totalOverlapTime;
            const perClipDuration = requiredTotalRawDuration / Math.max(1, numClips);

            const clipInputs: { path: string, type: string, duration: number }[] = [];

            for (const clip of seg.media) {
                const clipPath = await saveAsset(clip.url, jobId, clip.type);
                clipInputs.push({ 
                    path: clipPath, 
                    type: clip.type, 
                    duration: perClipDuration // Use calculated precise duration
                });
            }

            // Create Subtitles using EXACT duration
            let assPath = '';
            if (seg.narration_text) {
                assPath = path.join(jobDir, `subs_${i}.ass`);
                createASSFile(assPath, seg.narration_text, seg.wordTimings, exactDuration, width, height);
            }

            await new Promise<void>((resolve, reject) => {
                const cmd = ffmpeg();
                const filters: string[] = [];
                
                // --- VISUAL INPUTS ---
                clipInputs.forEach(c => {
                    cmd.input(c.path);
                    if (c.type === 'image') cmd.inputOptions(['-loop 1']);
                });

                // --- AUDIO INPUT ---
                const audioInputIndex = clipInputs.length;
                let audioLabel = '';

                if (audioPath) {
                    cmd.input(audioPath);
                    // Filter: Resample to 44.1k Stereo, and slightly boost volume (1.5) for narration clarity
                    filters.push(`[${audioInputIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.5[a_norm]`);
                    audioLabel = 'a_norm';
                } else {
                    // Generate silence that exactly matches duration
                    cmd.input(`anullsrc=channel_layout=stereo:sample_rate=44100:duration=${exactDuration}`).inputFormat('lavfi');
                    filters.push(`[${audioInputIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo[a_norm]`);
                    audioLabel = 'a_norm';
                }

                // --- VISUAL FILTERS ---
                let videoStreamLabel = '';

                // Scale & Trim
                clipInputs.forEach((c, idx) => {
                    const label = `v${idx}`;
                    // Important: setpts=PTS-STARTPTS resets timestamp so trim works correctly in chain
                    filters.push(`[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${c.duration},setpts=PTS-STARTPTS[${label}]`);
                });

                // XFADE Transitions
                if (clipInputs.length > 1) {
                    let prevLabel = 'v0';
                    let currentOffset = clipInputs[0].duration; // Start offset after first clip ends
                    
                    for (let j = 1; j < clipInputs.length; j++) {
                        const nextLabel = `v${j}`;
                        const outLabel = `mix${j}`;
                        
                        // Overlap starts 'transitionDur' before the current clip ends
                        const xfadeOffset = currentOffset - transitionDur;
                        
                        filters.push(`[${prevLabel}][${nextLabel}]xfade=transition=fade:duration=${transitionDur}:offset=${xfadeOffset}[${outLabel}]`);
                        
                        prevLabel = outLabel;
                        // Add duration of next clip minus the overlap we just consumed
                        currentOffset += (clipInputs[j].duration - transitionDur);
                    }
                    videoStreamLabel = prevLabel;
                } else {
                    videoStreamLabel = 'v0';
                }

                // Apply Subtitles
                if (assPath) {
                    const assFilterPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
                    filters.push(`[${videoStreamLabel}]subtitles=filename='${assFilterPath}'[vfinal]`);
                    videoStreamLabel = 'vfinal';
                }

                cmd.complexFilter(filters);

                cmd.outputOptions([
                    '-map', `[${videoStreamLabel}]`,
                    '-map', `[${audioLabel}]`,
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-c:a', 'aac',
                    // Force output duration to match audio exactly to prevent 1-frame mismatches
                    `-t`, `${exactDuration}`
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
            const volume = track.volume || 0.5;
            
            complexFilters.push(`[${inputCount}:a]adelay=${delayMs}|${delayMs},volume=${volume}[a${inputCount}]`);
            audioMixInputs.push(`[a${inputCount}]`);
            inputCount++;
        }

        if (audioMixInputs.length > 1) {
            complexFilters.push(`${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0,dynaudnorm[aout]`);
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
