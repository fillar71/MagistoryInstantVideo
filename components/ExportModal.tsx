
import React, { useState, useRef, useEffect } from 'react';
import type { Segment, TextOverlayStyle, WordTiming, MediaClip } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { DownloadIcon } from './icons';
import { generateSubtitleChunks, audioBufferToWav } from '../utils/media';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  segments: Segment[];
}

type ExportStatus = 'idle' | 'loading_engine' | 'rendering_audio' | 'rendering_video' | 'encoding' | 'complete' | 'error';

const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;
const FRAME_RATE = 30;
const TRANSITION_DURATION_S = 0.7;

// Helper to fetch Blob with progress tracking
const fetchWithProgress = async (url: string, mimeType: string, onProgress: (percent: number) => void): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${url}: ${response.statusText}`);

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    // If no content-length, we can't track percent, but we can still fetch
    if (!total) {
        const blob = await response.blob();
        onProgress(100);
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
    }

    const reader = response.body?.getReader();
    if (!reader) {
        const blob = await response.blob();
        onProgress(100);
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
    }

    let receivedLength = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        onProgress((receivedLength / total) * 100);
    }

    const blob = new Blob(chunks, { type: mimeType });
    return URL.createObjectURL(blob);
};

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, title, segments }) => {
    const [status, setStatus] = useState<ExportStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    
    const ffmpegRef = useRef<FFmpeg>(new FFmpeg());
    const isCancelledRef = useRef(false);

    useEffect(() => {
        if (isOpen) {
            setStatus('idle');
            setProgress(0);
            setVideoUrl(null);
            setError('');
            isCancelledRef.current = false;
        } else {
             isCancelledRef.current = true;
        }
    }, [isOpen]);

    const loadFFmpeg = async () => {
        const ffmpeg = ffmpegRef.current;
        if (!ffmpeg.loaded) {
            setStatus('loading_engine');
            setStatusText('Downloading video engine (~25MB)...');
            try {
                // Attach progress listener for the encoding phase later
                ffmpeg.on('progress', ({ progress: p }) => {
                    // FFmpeg reports 0-1. We map encoding phase to 80-100% of total progress
                    if (status === 'encoding') {
                         setProgress(80 + (p * 20));
                    }
                });

                ffmpeg.on('log', ({ message }) => {
                    console.log('FFmpeg Log:', message);
                });

                const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
                
                // Load JS (small) directly
                const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
                
                // Load WASM (large) with progress tracking
                const wasmURL = await fetchWithProgress(
                    `${baseURL}/ffmpeg-core.wasm`, 
                    'application/wasm', 
                    (percent) => {
                        // Engine download maps to 0-20% of global progress
                        setProgress((percent / 100) * 20);
                    }
                );

                await ffmpeg.load({
                    coreURL: coreURL,
                    wasmURL: wasmURL,
                });
            } catch (e: any) {
                console.error("FFmpeg load error:", e);
                const msg = e.message || "Unknown error";
                let friendlyMsg = `Failed to download or load the video engine. Error: ${msg}`;
                
                if (msg.includes("SharedArrayBuffer")) {
                    friendlyMsg = "Your browser does not support SharedArrayBuffer, which is required for the video engine. Please try using a recent version of Chrome/Firefox on Desktop, or ensure you are serving this site with proper security headers (Cross-Origin-Opener-Policy: same-origin).";
                } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
                    friendlyMsg = "Network error: Failed to download the video engine components. Please check your internet connection. If using Termux or a restricted network, ensure access to unpkg.com is allowed.";
                }
                
                setError(friendlyMsg);
                setStatus('error');
                throw e; 
            }
        }
    };

    const handleClose = () => {
        isCancelledRef.current = true;
        onClose();
    }
    
    // ... drawKaraokeText function remains the same ...
    const drawKaraokeText = (
        ctx: CanvasRenderingContext2D, 
        segment: Segment, 
        currentTimeInSegment: number
    ) => {
        const style = segment.textOverlayStyle;
        const text = segment.narration_text;
        if (!text || !style) return;
        
        const timings = segment.wordTimings;
        if (!timings || timings.length === 0) {
             return;
        }

        ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
        ctx.textBaseline = 'middle';
        
        const maxWidth = RENDER_WIDTH * 0.9;
        const lineHeight = style.fontSize * 1.2;
        const animation = style.animation || 'none';

        const chunks = generateSubtitleChunks(
            timings,
            style.fontSize,
            style.maxCaptionLines || 2,
            maxWidth
        );

        const activeChunk = chunks.find(c => currentTimeInSegment >= c.start && currentTimeInSegment <= c.end);
        
        const displayChunk = activeChunk || (currentTimeInSegment < 0.1 ? chunks[0] : null);

        if (!displayChunk) return;

        const words = displayChunk.timings;
        const lines: WordTiming[][] = [];
        let currentLine: WordTiming[] = [];
        let currentLineWidth = 0;
        
        words.forEach(timing => {
            const word = timing.word + ' ';
            const wordWidth = ctx.measureText(word).width;
            if (currentLineWidth + wordWidth > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = [timing];
                currentLineWidth = wordWidth;
            } else {
                currentLine.push(timing);
                currentLineWidth += wordWidth;
            }
        });
        if (currentLine.length > 0) lines.push(currentLine);


        const totalTextHeight = lines.length * lineHeight;

        let y;
        switch(style.position) {
            case 'top':
                y = 60 + totalTextHeight / 2;
                break;
            case 'center':
                y = RENDER_HEIGHT / 2;
                break;
            case 'bottom':
            default:
                y = RENDER_HEIGHT - 60 - totalTextHeight / 2;
                break;
        }

        if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
             let maxLineWidth = 0;
             lines.forEach(line => {
                 const lineStr = line.map(t => t.word).join(' ');
                 maxLineWidth = Math.max(maxLineWidth, ctx.measureText(lineStr).width);
             });

            const padding = 20;
            const rectWidth = maxLineWidth + padding * 2;
            const rectHeight = totalTextHeight + padding;
            const bgX = (RENDER_WIDTH - rectWidth) / 2;
            
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(bgX, y - rectHeight / 2 - (lineHeight / 2), rectWidth, rectHeight);
        }

        lines.forEach((line, lineIndex) => {
            const lineStr = line.map(t => t.word).join(' ');
            const lineWidth = ctx.measureText(lineStr).width;
            let currentX = (RENDER_WIDTH - lineWidth) / 2; 
            const lineY = y - (totalTextHeight / 2) + (lineIndex * lineHeight);

            line.forEach(timing => {
                 const wordWithSpace = timing.word + ' ';
                 const wordWidth = ctx.measureText(wordWithSpace).width;
                 
                 let isActive = false;
                 let isPast = false;
                 if (timing.start !== -1) { 
                     isActive = currentTimeInSegment >= timing.start && currentTimeInSegment < timing.end;
                     isPast = currentTimeInSegment >= timing.end;
                 }

                 let fillStyle = style.color;
                 if (!isActive && !isPast && timing.start !== -1) {
                     fillStyle = '#FFFFFF'; 
                 } else if (isActive && animation === 'highlight') {
                     fillStyle = '#000000'; 
                 }
                 
                 ctx.save();
                 
                 if (isActive) {
                     if (animation === 'scale') {
                        const centerX = currentX + wordWidth / 2;
                        const centerY = lineY;
                        ctx.translate(centerX, centerY);
                        ctx.scale(1.2, 1.2);
                        ctx.translate(-centerX, -centerY);
                     } else if (animation === 'slide-up') {
                         ctx.translate(0, -10);
                     } else if (animation === 'highlight') {
                         ctx.fillStyle = style.color;
                         ctx.fillRect(currentX - 4, lineY - lineHeight/2, wordWidth + 4, lineHeight);
                         ctx.fillStyle = '#000000'; 
                         fillStyle = '#000000';
                     }
                 }

                 ctx.fillStyle = fillStyle;
                 ctx.textAlign = 'left'; 
                 ctx.fillText(wordWithSpace, currentX, lineY);
                 ctx.restore();
                 
                 currentX += wordWidth;
            });
        });
    }

    const handleStartExport = async () => {
        if (status !== 'idle' && status !== 'error') return;
        isCancelledRef.current = false;
        
        try {
            await loadFFmpeg();
            if (isCancelledRef.current) return;

            const ffmpeg = ffmpegRef.current;
            if (!ffmpeg.loaded) {
                throw new Error("FFmpeg failed to load");
            }

            const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0);

            setStatus('rendering_audio');
            setStatusText('Mixing audio tracks...');
            // Progress: 20% -> 30%
            setProgress(20);

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
            const sampleRate = 44100;
            const length = Math.ceil(totalDuration * sampleRate);
            const offlineCtx = new OfflineContextClass(1, length, sampleRate);
            
            let currentAudioTime = 0;
            
            for (const s of segments) {
                if (s.audioUrl) {
                    try {
                        const response = await fetch(s.audioUrl);
                        const arrayBuffer = await response.arrayBuffer();
                        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
                        
                        const source = offlineCtx.createBufferSource();
                        source.buffer = audioBuffer;

                        const gainNode = offlineCtx.createGain();
                        gainNode.gain.value = s.audioVolume ?? 1.0;

                        source.connect(gainNode);
                        gainNode.connect(offlineCtx.destination);
                        
                        source.start(currentAudioTime);
                    } catch (e) {
                        console.warn("Failed to mix audio for segment", e);
                    }
                }
                currentAudioTime += s.duration;
            }

            const renderedBuffer = await offlineCtx.startRendering();
            const wavBytes = audioBufferToWav(renderedBuffer);
            await ffmpeg.writeFile('audio.wav', new Uint8Array(wavBytes));
            setProgress(30);


            setStatus('rendering_video');
            setStatusText('Loading visual assets...');
            
            const canvas = document.createElement('canvas');
            canvas.width = RENDER_WIDTH;
            canvas.height = RENDER_HEIGHT;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error("Could not create canvas context.");

            const allClips: { segmentIndex: number, clipIndex: number, clip: MediaClip }[] = [];
            segments.forEach((s, sIdx) => {
                s.media.forEach((c, cIdx) => {
                    allClips.push({ segmentIndex: sIdx, clipIndex: cIdx, clip: c });
                });
            });
            const loadedAssets = new Map<string, HTMLImageElement | HTMLVideoElement>();

            await Promise.all(allClips.map(async ({ clip }) => {
                if (loadedAssets.has(clip.id)) return; 
                
                const isDataUrl = clip.url.startsWith('data:');
                const cacheBuster = `?t=${Date.now()}-${Math.random()}`;
                const safeUrl = isDataUrl 
                    ? clip.url 
                    : (clip.url.includes('?') ? `${clip.url}&cb=${Date.now()}` : `${clip.url}${cacheBuster}`);

                try {
                    if (clip.type === 'image') {
                        const img = new Image();
                        if (!isDataUrl) img.crossOrigin = "Anonymous";
                        img.src = safeUrl; 
                        await img.decode();
                        loadedAssets.set(clip.id, img);
                    } else {
                        const vid = document.createElement('video');
                        vid.crossOrigin = "Anonymous";
                        vid.src = safeUrl;
                        vid.muted = true;
                        vid.playsInline = true;
                        await new Promise((res, rej) => {
                            vid.onloadedmetadata = res;
                            vid.onerror = rej;
                        });
                        loadedAssets.set(clip.id, vid);
                    }
                } catch (e) {
                    console.warn("Failed to load asset:", clip.url);
                }
            }));

            if (isCancelledRef.current) return;

            const segmentStartTimes = segments.reduce((acc, s, i) => {
                const prevTime = i > 0 ? acc[i-1] : 0;
                const duration = i > 0 ? segments[i-1].duration : 0;
                acc.push(prevTime + duration);
                return acc;
            }, [] as number[]);

            const totalFrames = Math.ceil(totalDuration * FRAME_RATE);
            setStatusText('Rendering video frames...');

            for (let i = 0; i < totalFrames; i++) {
                if (isCancelledRef.current) return;
                
                const currentTime = i / FRAME_RATE;
                
                let segmentIndex = segmentStartTimes.findIndex((startTime, idx) => {
                     const endTime = startTime + segments[idx].duration;
                     return currentTime >= startTime && currentTime < endTime;
                });
                if (segmentIndex === -1) segmentIndex = segments.length - 1;

                const currentSegment = segments[segmentIndex];
                const segmentStartTime = segmentStartTimes[segmentIndex];
                const timeInSegment = currentTime - segmentStartTime;
                
                const clipDuration = currentSegment.duration / currentSegment.media.length;
                const clipIndex = Math.min(
                    currentSegment.media.length - 1, 
                    Math.floor(timeInSegment / clipDuration)
                );
                const currentClip = currentSegment.media[clipIndex];
                const currentAsset = loadedAssets.get(currentClip.id);

                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);

                const drawAsset = (asset: HTMLImageElement | HTMLVideoElement | undefined, time: number) => {
                    if (!asset) return;
                    try {
                        if (asset instanceof HTMLImageElement) {
                            ctx.drawImage(asset, 0, 0, RENDER_WIDTH, RENDER_HEIGHT);
                        } else if (asset instanceof HTMLVideoElement) {
                            asset.currentTime = Math.min(asset.duration || 0, time);
                            ctx.drawImage(asset, 0, 0, RENDER_WIDTH, RENDER_HEIGHT);
                        }
                    } catch (err) { /* ignore draw error */ }
                };
                
                const timeInClip = timeInSegment % clipDuration;
                drawAsset(currentAsset, timeInClip);
                
                const timeToEndOfSegment = currentSegment.duration - timeInSegment;
                if (currentSegment?.transition === 'fade' && timeToEndOfSegment < TRANSITION_DURATION_S && segmentIndex < segments.length - 1) {
                    const transitionProgress = 1 - (timeToEndOfSegment / TRANSITION_DURATION_S);
                    const nextSegment = segments[segmentIndex + 1];
                    const nextAsset = loadedAssets.get(nextSegment.media[0].id);
                    
                    if (nextAsset) {
                        ctx.save();
                        ctx.globalAlpha = transitionProgress;
                        drawAsset(nextAsset, 0);
                        ctx.restore();
                    }
                }
                
                drawKaraokeText(ctx, currentSegment, timeInSegment);

                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
                if (blob) {
                    const buffer = await blob.arrayBuffer();
                    const frameName = `frame_${String(i).padStart(3, '0')}.jpg`;
                    await ffmpeg.writeFile(frameName, new Uint8Array(buffer));
                }

                // Video rendering Progress: 30% -> 80%
                const percent = 30 + ((i / totalFrames) * 50); 
                setProgress(percent);
                setStatusText(`Rendering frame ${i}/${totalFrames}...`);

                // Crucial: Yield to main thread to allow UI updates
                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            setStatus('encoding');
            setStatusText('Encoding final video (this might take a moment)...');
            
            await ffmpeg.exec([
                '-framerate', String(FRAME_RATE),
                '-i', 'frame_%03d.jpg',
                '-i', 'audio.wav',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'ultrafast',
                'output.mp4'
            ]);

            const data = await ffmpeg.readFile('output.mp4');
            const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
            
            setVideoUrl(url);
            setStatus('complete');
            setProgress(100);

        } catch (err: any) {
            console.error("Export failed:", err);
            setError(err.message || "An unexpected error occurred during rendering.");
            setStatus('error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={handleClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-purple-300">Export Video (HD)</h2>
                    <button onClick={handleClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
                </div>

                {status === 'idle' && (
                    <div className="text-center">
                        <p className="text-gray-300 mb-4">Your video will be rendered as a high-quality MP4 file using FFmpeg technology.</p>
                        <div className="bg-gray-700/50 p-4 rounded-md mb-6 text-left text-sm text-gray-400">
                            <ul className="list-disc list-inside space-y-1">
                                <li>Perfect audio/video synchronization</li>
                                <li>Consistent 30 FPS frame rate</li>
                                <li>Standard .mp4 format compatible with all devices</li>
                                <li>Rendering happens locally in your browser</li>
                            </ul>
                        </div>
                        <button onClick={handleStartExport} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold">
                            Start High-Quality Export
                        </button>
                    </div>
                )}

                {(status === 'loading_engine' || status === 'rendering_audio' || status === 'rendering_video' || status === 'encoding') && (
                    <div className="text-center py-4">
                        <div className="flex justify-center mb-6"><LoadingSpinner /></div>
                        <h3 className="text-lg font-semibold text-white mb-2">Processing Video</h3>
                        <p className="text-sm text-gray-400 mb-4">{statusText}</p>
                        
                        <div className="w-full bg-gray-700 rounded-full h-3 mb-2 overflow-hidden">
                            <div 
                                className="bg-purple-500 h-full rounded-full transition-all duration-300 ease-out" 
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <p className="text-xs text-gray-500">{Math.round(progress)}% Complete</p>
                        {status === 'loading_engine' && (
                            <p className="text-[10px] text-gray-600 mt-2">
                                Downloading export engine (~25MB). This happens once and is cached for next time.
                            </p>
                        )}
                    </div>
                )}
                
                {status === 'complete' && videoUrl && (
                     <div className="text-center">
                        <p className="text-xl font-semibold text-green-400 mb-4">Render Complete!</p>
                        <video src={videoUrl} controls className="w-full rounded-md mb-4 max-h-64 bg-black"></video>
                        <a 
                            href={videoUrl} 
                            download={`${title.replace(/ /g, '_')}.mp4`}
                            className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold flex items-center justify-center gap-2 shadow-lg transform hover:scale-105 transition-all"
                        >
                            <DownloadIcon /> Download MP4
                        </a>
                     </div>
                )}

                {status === 'error' && (
                    <div className="text-center">
                        <p className="text-xl font-semibold text-red-400 mb-4">Export Failed</p>
                        <div className="bg-gray-900/50 p-4 rounded-md mb-4 text-left border border-red-900/50">
                            <p className="text-red-300 text-sm">{error}</p>
                        </div>
                         <button onClick={handleStartExport} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold">
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
