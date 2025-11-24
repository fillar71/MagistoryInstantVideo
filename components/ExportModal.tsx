
import React, { useState, useRef, useEffect } from 'react';
import type { Segment, WordTiming } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { DownloadIcon } from './icons';
import { generateSubtitleChunks, audioBufferToWav } from '../utils/media';
import type { FFmpeg } from '@ffmpeg/ffmpeg'; 

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  segments: Segment[];
}

type ExportStatus = 'idle' | 'loading_engine' | 'downloading_assets' | 'rendering_audio' | 'rendering_video' | 'encoding' | 'complete' | 'error';

const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;
const FRAME_RATE = 30;

// Helper to fetch Blob with progress tracking
const fetchWithProgress = async (url: string, mimeType: string, onProgress: (percent: number) => void): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download ${url}: ${response.statusText}`);

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        
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
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
};

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, title, segments }) => {
    const [status, setStatus] = useState<ExportStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isMultiThreaded, setIsMultiThreaded] = useState(true);
    
    const statusRef = useRef<ExportStatus>('idle');
    const ffmpegRef = useRef<FFmpeg | null>(null);
    const isCancelledRef = useRef(false);
    const loadingIntervalRef = useRef<number | null>(null);
    // Keep track of blob URLs to revoke them later
    const createdBlobUrls = useRef<string[]>([]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        // Check for SharedArrayBuffer to decide mode, but DO NOT block.
        const hasSAB = typeof (window as any).SharedArrayBuffer !== 'undefined';
        setIsMultiThreaded(hasSAB);

        if (isOpen) {
            setStatus('idle');
            setProgress(0);
            setVideoUrl(null);
            setError('');
            isCancelledRef.current = false;
            createdBlobUrls.current = [];
        } else {
             isCancelledRef.current = true;
             cleanupBlobUrls();
             if (loadingIntervalRef.current) (window as any).clearInterval(loadingIntervalRef.current);
        }
        
        return () => {
            cleanupBlobUrls();
        }
    }, [isOpen]);

    const cleanupBlobUrls = () => {
        createdBlobUrls.current.forEach(url => URL.revokeObjectURL(url));
        createdBlobUrls.current = [];
    };

    const startLoadingAnimation = () => {
        const messages = [
            "Initializing video engine...",
            "Compiling WebAssembly...",
            "Still working (this can take a minute on mobile)...",
            "Optimizing engine..."
        ];
        let i = 0;
        setStatusText(messages[0]);
        if (loadingIntervalRef.current) (window as any).clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = (window as any).setInterval(() => {
            i = (i + 1) % messages.length;
            setStatusText(messages[i]);
        }, 4000);
    };

    const stopLoadingAnimation = () => {
        if (loadingIntervalRef.current) {
            (window as any).clearInterval(loadingIntervalRef.current);
            loadingIntervalRef.current = null;
        }
    };

    const loadFFmpeg = async () => {
        if (!ffmpegRef.current) {
            try {
                const { FFmpeg } = await import('@ffmpeg/ffmpeg');
                ffmpegRef.current = new FFmpeg();
            } catch (e) {
                throw new Error("Failed to load FFmpeg module.");
            }
        }

        const ffmpeg = ffmpegRef.current;
        if (!ffmpeg) return;

        if (!ffmpeg.loaded) {
            setStatus('loading_engine');
            
            try {
                ffmpeg.on('progress', ({ progress: p }) => {
                    if (statusRef.current === 'encoding') {
                         setProgress(90 + (p * 10));
                    }
                });

                // Use standard @ffmpeg/core which is typically single-threaded or compatible
                // DO NOT use @ffmpeg/core-mt if we suspect SAB issues
                const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
                
                setStatusText('Downloading engine scripts...');
                const coreURL = await fetchWithProgress(`${baseURL}/ffmpeg-core.js`, 'text/javascript', (p) => setProgress(p * 0.05));

                setStatusText('Downloading engine core (~25MB)...');
                const wasmURL = await fetchWithProgress(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm', (p) => setProgress(5 + (p * 0.20)));

                setProgress(25);
                startLoadingAnimation();
                await new Promise(r => setTimeout(r, 200));

                // Add timeout to prevent infinite stuck state
                const loadPromise = ffmpeg.load({
                    coreURL: coreURL,
                    wasmURL: wasmURL,
                    // If not multithreaded, we might strictly need only 1 worker or main thread, 
                    // but 0.12.x abstraction handles this mostly via the core file used.
                });

                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Engine initialization timed out. Your device might be too slow or blocking the operation.")), 60000)
                );

                await Promise.race([loadPromise, timeoutPromise]);
                
                stopLoadingAnimation();
                setStatusText('Engine ready.');
                
            } catch (e: any) {
                stopLoadingAnimation();
                console.error("FFmpeg load error:", e);
                const msg = e.message || "Failed to initialize engine.";
                setError(msg);
                setStatus('error');
                throw e; 
            }
        }
    };

    const handleClose = () => {
        isCancelledRef.current = true;
        stopLoadingAnimation();
        onClose();
    }
    
    const drawKaraokeText = (ctx: any, segment: Segment, currentTimeInSegment: number) => { // ctx: CanvasRenderingContext2D
         const style = segment.textOverlayStyle;
         if (!style || !segment.narration_text) return;
         const timings = segment.wordTimings;
         if (!timings || timings.length === 0) return;

         ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
         ctx.textBaseline = 'middle';
         const maxWidth = RENDER_WIDTH * 0.9;
         const chunks = generateSubtitleChunks(timings, style.fontSize, style.maxCaptionLines || 2, maxWidth);
         const activeChunk = chunks.find(c => currentTimeInSegment >= c.start && currentTimeInSegment <= c.end) || (currentTimeInSegment < 0.1 ? chunks[0] : null);
         
         if (!activeChunk) return;

         const lines: WordTiming[][] = [];
         let currentLine: WordTiming[] = [];
         let currentLineWidth = 0;
         activeChunk.timings.forEach(timing => {
            const w = ctx.measureText(timing.word + ' ').width;
            if (currentLineWidth + w > maxWidth && currentLine.length) { lines.push(currentLine); currentLine = [timing]; currentLineWidth = w; }
            else { currentLine.push(timing); currentLineWidth += w; }
         });
         if (currentLine.length) lines.push(currentLine);

         const totalH = lines.length * (style.fontSize * 1.2);
         let y = style.position === 'top' ? 60 + totalH/2 : style.position === 'center' ? RENDER_HEIGHT/2 : RENDER_HEIGHT - 60 - totalH/2;

         if (style.backgroundColor) {
             let maxW = 0; lines.forEach(l => maxW = Math.max(maxW, ctx.measureText(l.map(t=>t.word).join(' ')).width));
             ctx.fillStyle = style.backgroundColor;
             ctx.fillRect((RENDER_WIDTH - maxW - 40)/2, y - totalH/2 - style.fontSize*0.6, maxW + 40, totalH + 20);
         }

         lines.forEach((line, i) => {
             const lineStr = line.map(t => t.word).join(' ');
             const lw = ctx.measureText(lineStr).width;
             let cx = (RENDER_WIDTH - lw)/2;
             const ly = y - totalH/2 + i*(style.fontSize*1.2);
             line.forEach(t => {
                 const isActive = currentTimeInSegment >= t.start && currentTimeInSegment < t.end;
                 ctx.fillStyle = isActive ? (style.animation === 'highlight' ? '#000' : style.color) : '#FFF';
                 if (isActive && style.animation === 'highlight') {
                      ctx.save(); ctx.fillStyle = style.color; ctx.fillRect(cx-2, ly-style.fontSize/2, ctx.measureText(t.word).width+4, style.fontSize); ctx.restore();
                 }
                 ctx.fillText(t.word, cx, ly);
                 cx += ctx.measureText(t.word + ' ').width;
             });
         });
    }

    const fetchResourceAsBlob = async (url: string): Promise<string> => {
        // If it's already a blob/data URL, just return it
        if (url.startsWith('blob:') || url.startsWith('data:')) return url;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            createdBlobUrls.current.push(blobUrl);
            return blobUrl;
        } catch (error) {
            console.error("Failed to fetch resource as blob, falling back to URL:", url, error);
            return url;
        }
    };

    const handleStartExport = async () => {
        if (status !== 'idle' && status !== 'error') return;
        isCancelledRef.current = false;
        setError('');
        
        try {
            await loadFFmpeg();
            if (isCancelledRef.current) return;

            const ffmpeg = ffmpegRef.current;
            if (!ffmpeg || !ffmpeg.loaded) throw new Error("FFmpeg failed to load");
            
            // --- STEP 1: DOWNLOAD ASSETS TO LOCAL BLOBs ---
            setStatus('downloading_assets');
            setProgress(30);
            
            // Collect all unique media URLs
            const assetsToLoad = new Set<string>();
            segments.forEach(s => s.media.forEach(m => assetsToLoad.add(m.id)));
            const totalAssets = assetsToLoad.size;
            
            const loadedAssets = new Map<string, HTMLImageElement | HTMLVideoElement>();
            let loadedCount = 0;

            for (const s of segments) {
                for (const c of s.media) {
                     if (!loadedAssets.has(c.id)) {
                         setStatusText(`Downloading media ${loadedCount + 1}/${totalAssets}...`);
                         
                         // THIS IS THE FIX: Download to Blob first
                         // This prevents CORS "tainted canvas" issues and Black Screens due to streaming lag
                         const localBlobUrl = await fetchResourceAsBlob(c.url);
                         
                         try {
                             if (c.type === 'image') {
                                 const img = new (window as any).Image(); 
                                 img.src = localBlobUrl; 
                                 await img.decode();
                                 loadedAssets.set(c.id, img);
                             } else {
                                 const v = (window as any).document.createElement('video'); 
                                 v.src = localBlobUrl;
                                 v.muted = true;
                                 v.playsInline = true;
                                 // Wait for metadata to ensure it's playable
                                 await new Promise((resolve, reject) => {
                                     v.onloadedmetadata = resolve;
                                     v.onerror = reject;
                                 });
                                 loadedAssets.set(c.id, v);
                             }
                         } catch(e) {
                             console.error("Failed to load asset:", c.url, e);
                         }
                         
                         loadedCount++;
                         setProgress(30 + (loadedCount / totalAssets) * 10); // 30% -> 40%
                     }
                }
            }

            // --- STEP 2: AUDIO RENDERING ---
            setStatus('rendering_audio');
            setStatusText('Mixing audio tracks...');
            setProgress(40);

            const OfflineContextClass = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
            const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0);
            const offlineCtx = new OfflineContextClass(1, Math.ceil(totalDuration * 44100), 44100);
            
            let currentAudioTime = 0;
            for (const s of segments) {
                if (s.audioUrl) {
                    try {
                        const res = await fetch(s.audioUrl);
                        const ab = await res.arrayBuffer();
                        const b = await offlineCtx.decodeAudioData(ab);
                        const src = offlineCtx.createBufferSource();
                        src.buffer = b;
                        const gain = offlineCtx.createGain();
                        gain.gain.value = s.audioVolume ?? 1.0;
                        src.connect(gain);
                        gain.connect(offlineCtx.destination);
                        src.start(currentAudioTime);
                    } catch(e) {}
                }
                currentAudioTime += s.duration;
            }
            const renderedBuffer = await offlineCtx.startRendering();
            await ffmpeg.writeFile('audio.wav', new Uint8Array(audioBufferToWav(renderedBuffer)));
            setProgress(45);

            // --- STEP 3: VIDEO RENDERING (Frame by Frame) ---
            setStatus('rendering_video');
            setStatusText('Rendering video frames...');
            const canvas = (window as any).document.createElement('canvas');
            canvas.width = RENDER_WIDTH;
            canvas.height = RENDER_HEIGHT;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error("Canvas init failed");

            const totalFrames = Math.ceil(totalDuration * FRAME_RATE);
            let currentTime = 0;
            let currentSegmentIndex = 0;
            let segmentTimeStart = 0;

            for (let i = 0; i < totalFrames; i++) {
                if (isCancelledRef.current) return;
                
                currentTime = i / FRAME_RATE;
                while(currentSegmentIndex < segments.length - 1 && currentTime >= segmentTimeStart + segments[currentSegmentIndex].duration) {
                    segmentTimeStart += segments[currentSegmentIndex].duration;
                    currentSegmentIndex++;
                }
                const seg = segments[currentSegmentIndex];
                const timeInSeg = currentTime - segmentTimeStart;
                
                ctx.fillStyle = '#000'; ctx.fillRect(0,0,RENDER_WIDTH,RENDER_HEIGHT);
                
                const clipDuration = seg.duration / seg.media.length;
                const clipIdx = Math.min(seg.media.length-1, Math.floor(timeInSeg / clipDuration));
                const asset = loadedAssets.get(seg.media[clipIdx].id);
                
                if (asset) {
                    if (asset instanceof (window as any).HTMLVideoElement) {
                         const v = asset as HTMLVideoElement;
                         // Set time and ensure buffer availability
                         v.currentTime = timeInSeg % clipDuration;
                         // Small hack to ensure video frame is ready to paint
                         // In a perfect world we use requestVideoFrameCallback, but inside a tight loop
                         // simple awaiting usually suffices if source is local blob
                    }
                    ctx.drawImage(asset as any, 0,0, RENDER_WIDTH, RENDER_HEIGHT);
                }

                drawKaraokeText(ctx, seg, timeInSeg);

                const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
                if (blob) await ffmpeg.writeFile(`frame_${String(i).padStart(3,'0')}.jpg`, new Uint8Array(await blob.arrayBuffer()));
                
                // Progress from 45% to 90%
                setProgress(45 + (i/totalFrames)*45);
                setStatusText(`Rendering frame ${i}/${totalFrames}`);
                
                // Yield to main thread frequently to keep UI responsive
                if (i%5===0) await new Promise(r => setTimeout(r, 0));
            }

            setStatus('encoding');
            await ffmpeg.exec(['-framerate', String(FRAME_RATE), '-i', 'frame_%03d.jpg', '-i', 'audio.wav', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', 'output.mp4']);
            const data = await ffmpeg.readFile('output.mp4');
            setVideoUrl(URL.createObjectURL(new Blob([data], {type:'video/mp4'})));
            setStatus('complete');
            setProgress(100);

        } catch (err: any) {
            console.error(err);
            setError(err.message);
            setStatus('error');
        } finally {
            stopLoadingAnimation();
            // Note: We don't cleanup blobs immediately here so the video can play
            // They are cleaned up on Modal close
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
                        {!isMultiThreaded ? (
                            <div className="bg-yellow-900/30 border border-yellow-600/50 p-4 rounded-md mb-6">
                                <p className="text-yellow-200 font-semibold mb-2">Compatibility Mode</p>
                                <p className="text-sm text-yellow-100/80 mb-2">
                                    Your device (Termux/Mobile) doesn't support high-speed multi-threaded export. 
                                    Export will proceed in <b>Compatibility Mode</b>.
                                </p>
                                <p className="text-xs text-white">
                                    Note: This process may be significantly slower than on a Desktop PC. Please do not switch tabs.
                                </p>
                            </div>
                        ) : (
                            <p className="text-gray-300 mb-4">Render high-quality MP4 video directly in your browser.</p>
                        )}
                        
                        <button 
                            onClick={handleStartExport} 
                            className="w-full py-3 rounded-md text-white font-semibold transition-colors bg-purple-600 hover:bg-purple-700"
                        >
                            {!isMultiThreaded ? 'Start Export (Slow Mode)' : 'Start Export'}
                        </button>
                    </div>
                )}

                {(status === 'loading_engine' || status === 'downloading_assets' || status === 'rendering_audio' || status === 'rendering_video' || status === 'encoding') && (
                    <div className="text-center py-4">
                        <div className="flex justify-center mb-6"><LoadingSpinner /></div>
                        <h3 className="text-lg font-semibold text-white mb-2">Processing Video</h3>
                        <p className="text-sm text-gray-400 mb-4">{statusText}</p>
                        <div className="w-full bg-gray-700 rounded-full h-3 mb-2 overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p className="text-xs text-gray-500">{Math.round(progress)}%</p>
                    </div>
                )}
                
                {status === 'complete' && videoUrl && (
                     <div className="text-center">
                        <p className="text-xl font-semibold text-green-400 mb-4">Render Complete!</p>
                        <video src={videoUrl} controls className="w-full rounded-md mb-4 max-h-64 bg-black"></video>
                        <a href={videoUrl} download={`${title.replace(/ /g, '_')}.mp4`} className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold flex items-center justify-center gap-2">
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
                         <button onClick={() => setStatus('idle')} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold">Back</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
