
import React, { useState, useRef, useEffect } from 'react';
import type { Segment, TextOverlayStyle, WordTiming, MediaClip } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { DownloadIcon } from './icons';
import { estimateWordTimings, generateSubtitleChunks } from '../utils/media';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  segments: Segment[];
}

type ExportStatus = 'idle' | 'rendering' | 'complete' | 'error';

const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;
const FRAME_RATE = 30;
const TRANSITION_DURATION_S = 0.7;

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, title, segments }) => {
    const [status, setStatus] = useState<ExportStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const rendererRef = useRef<() => void>(null); // To hold the cancel function

    useEffect(() => {
        // Reset state when modal is opened
        if (isOpen) {
            setStatus('idle');
            setProgress(0);
            setVideoUrl(null);
            setError('');
        }
    }, [isOpen]);

    const handleClose = () => {
        if (rendererRef.current) {
            rendererRef.current(); // Cancel any ongoing render
        }
        onClose();
    }
    
    const drawKaraokeText = (
        ctx: CanvasRenderingContext2D, 
        segment: Segment, 
        currentTimeInSegment: number
    ) => {
        const style = segment.textOverlayStyle;
        const text = segment.narration_text;
        if (!text || !style) return;
        
        // Only draw if timings exist (explicitly generated)
        const timings = segment.wordTimings;
        if (!timings || timings.length === 0) {
             return;
        }

        ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
        ctx.textBaseline = 'middle';
        
        const maxWidth = RENDER_WIDTH * 0.9;
        const lineHeight = style.fontSize * 1.2;
        const animation = style.animation || 'none';

        // Calculate Chunks (Pages)
        const chunks = generateSubtitleChunks(
            timings,
            style.fontSize,
            style.maxCaptionLines || 2,
            maxWidth
        );

        // Find active Chunk
        const activeChunk = chunks.find(c => currentTimeInSegment >= c.start && currentTimeInSegment <= c.end);
        
        // If no active chunk but we are at start, show first chunk
        const displayChunk = activeChunk || (currentTimeInSegment < 0.1 ? chunks[0] : null);

        if (!displayChunk) return;

        // Re-calculate lines for this chunk only to draw them
        // Note: generateSubtitleChunks gives us words, but we need to lay them out in lines for canvas
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

        // Calculate Y position for the block
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

        // Draw Background (Optional)
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

        // Draw Lines
        lines.forEach((line, lineIndex) => {
            const lineStr = line.map(t => t.word).join(' ');
            const lineWidth = ctx.measureText(lineStr).width;
            let currentX = (RENDER_WIDTH - lineWidth) / 2; // Center align
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
                 // Future words are white (or inactive color)
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
                 ctx.textAlign = 'left'; // Important since we are positioning manually
                 ctx.fillText(wordWithSpace, currentX, lineY);
                 ctx.restore();
                 
                 currentX += wordWidth;
            });
        });
    }

    const handleStartExport = async () => {
        setStatus('rendering');
        setProgress(0);
        setError('');
        setStatusText('Initializing renderer...');

        let isCancelled = false;
        rendererRef.current = () => { isCancelled = true; };

        try {
            const canvas = document.createElement('canvas');
            canvas.width = RENDER_WIDTH;
            canvas.height = RENDER_HEIGHT;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error("Could not create canvas context.");

            setStatusText('Loading media assets...');
            // Flatten all clips from all segments to load them
            const allClips: { segmentIndex: number, clipIndex: number, clip: MediaClip }[] = [];
            segments.forEach((s, sIdx) => {
                s.media.forEach((c, cIdx) => {
                    allClips.push({ segmentIndex: sIdx, clipIndex: cIdx, clip: c });
                });
            });

            // Map loaded assets by ID to easy retrieval
            const loadedAssets = new Map<string, HTMLImageElement | HTMLVideoElement>();

            await Promise.all(allClips.map(async ({ clip }) => {
                if (loadedAssets.has(clip.id)) return; // Already loaded? (unlikely with unique IDs but good practice)
                try {
                    if (clip.type === 'image') {
                        const img = new Image();
                        img.crossOrigin = "Anonymous";
                        img.src = clip.url;
                        await img.decode();
                        loadedAssets.set(clip.id, img);
                    } else {
                        const vid = document.createElement('video');
                        vid.crossOrigin = "Anonymous";
                        vid.src = clip.url;
                        vid.muted = true;
                        await new Promise((res, rej) => {
                            vid.oncanplaythrough = res;
                            vid.onerror = rej;
                        });
                        loadedAssets.set(clip.id, vid);
                    }
                } catch (e) {
                    console.error("Failed to load asset:", clip.url, e);
                    // Continue even if one fails, maybe show placeholder or black
                }
            }));
            
            if (isCancelled) return;

            const videoStream = canvas.captureStream(FRAME_RATE);
            let combinedStream: MediaStream = videoStream;
            const audioContext = new AudioContext();
            let hasAudio = segments.some(s => s.audioUrl);

            if (hasAudio) {
                setStatusText('Mixing audio tracks...');
                const audioDestination = audioContext.createMediaStreamDestination();
                
                let currentAudioTime = audioContext.currentTime + 0.1; // Start slightly in future
                
                // We need to schedule each segment sequentially
                for (const [index, s] of segments.entries()) {
                    if (s.audioUrl) {
                         const response = await fetch(s.audioUrl);
                         const arrayBuffer = await response.arrayBuffer();
                         const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                         
                         const source = audioContext.createBufferSource();
                         source.buffer = audioBuffer;

                         const gainNode = audioContext.createGain();
                         gainNode.gain.value = s.audioVolume ?? 1.0;

                         source.connect(gainNode);
                         gainNode.connect(audioDestination);
                         
                         source.start(currentAudioTime);
                    }
                    currentAudioTime += s.duration;
                }

                combinedStream = new MediaStream([videoStream.getVideoTracks()[0], audioDestination.stream.getAudioTracks()[0]]);
            }

            const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9,opus' });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = (e: Event) => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoUrl(url);
                setStatus('complete');
                audioContext.close();
            };
            recorder.start();

            let totalTime = 0;
            const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0);
            const frameDuration = 1 / FRAME_RATE;
            
            // Calculate start times for each segment
            const segmentStartTimes = segments.reduce((acc, s, i) => {
                const prevTime = i > 0 ? acc[i-1] : 0;
                const duration = i > 0 ? segments[i-1].duration : 0;
                acc.push(prevTime + duration);
                return acc;
            }, [] as number[]);

            const renderFrame = async () => {
                if (isCancelled || totalTime >= totalDuration) {
                    if (recorder.state === 'recording') recorder.stop();
                    return;
                }

                // Find current segment based on time
                let segmentIndex = segmentStartTimes.findIndex((startTime, idx) => {
                     const endTime = startTime + segments[idx].duration;
                     return totalTime >= startTime && totalTime < endTime;
                });
                
                // Handle edge case at very end or rounding errors
                if (segmentIndex === -1) {
                     if (totalTime >= totalDuration) segmentIndex = segments.length - 1;
                     else segmentIndex = 0;
                }

                const currentSegment = segments[segmentIndex];
                const segmentStartTime = segmentStartTimes[segmentIndex];
                const timeInSegment = totalTime - segmentStartTime;
                
                // Determine which CLIP to show within this segment
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
                    if (!asset) return; // Should not happen if loaded correctly
                    if (asset instanceof HTMLImageElement) {
                        ctx.drawImage(asset, 0, 0, RENDER_WIDTH, RENDER_HEIGHT);
                    } else if (asset instanceof HTMLVideoElement) {
                        asset.currentTime = Math.min(asset.duration, time);
                        ctx.drawImage(asset, 0, 0, RENDER_WIDTH, RENDER_HEIGHT);
                    }
                };
                
                // Time within this specific clip (if we had per-clip duration, we'd use that, here it's just mod)
                const timeInClip = timeInSegment % clipDuration;
                drawAsset(currentAsset, timeInClip);
                
                // Handle Transitions (only at end of segment, transition to next segment's first clip)
                const timeToEndOfSegment = currentSegment.duration - timeInSegment;
                if (currentSegment?.transition === 'fade' && timeToEndOfSegment < TRANSITION_DURATION_S && segmentIndex < segments.length - 1) {
                    const transitionProgress = 1 - (timeToEndOfSegment / TRANSITION_DURATION_S);
                    const nextSegment = segments[segmentIndex + 1];
                    const nextAsset = loadedAssets.get(nextSegment.media[0].id);
                    
                    if (nextAsset) {
                        ctx.globalAlpha = transitionProgress;
                        drawAsset(nextAsset, 0); // Start of next clip
                        ctx.globalAlpha = 1.0;
                    }
                }
                
                // Draw Subtitles
                drawKaraokeText(ctx, currentSegment, timeInSegment);
                
                setProgress((totalTime / totalDuration) * 100);
                setStatusText(`Rendering segment ${segmentIndex + 1} of ${segments.length}...`);

                totalTime += frameDuration;
                requestAnimationFrame(renderFrame);
            };

            renderFrame();

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
                    <h2 className="text-2xl font-bold text-purple-300">Export Video</h2>
                    <button onClick={handleClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
                </div>

                {status === 'idle' && (
                    <div className="text-center">
                        <p className="text-gray-300 mb-4">Your video will be rendered as a 720p WebM file.</p>
                        <p className="text-sm text-gray-400 mb-6">Rendering happens in your browser and may take a few minutes for longer videos.</p>
                        <button onClick={handleStartExport} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold">
                            Start Export
                        </button>
                    </div>
                )}

                {status === 'rendering' && (
                    <div className="text-center">
                        <div className="flex justify-center mb-4"><LoadingSpinner /></div>
                        <p className="text-lg font-semibold text-gray-200 mb-2">{statusText}</p>
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                )}
                
                {status === 'complete' && videoUrl && (
                     <div className="text-center">
                        <p className="text-xl font-semibold text-green-400 mb-4">Render Complete!</p>
                        <video src={videoUrl} controls className="w-full rounded-md mb-4"></video>
                        <a 
                            href={videoUrl} 
                            download={`${title.replace(/ /g, '_')}.webm`}
                            className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold flex items-center justify-center gap-2"
                        >
                            <DownloadIcon /> Download Video
                        </a>
                     </div>
                )}

                {status === 'error' && (
                    <div className="text-center">
                        <p className="text-xl font-semibold text-red-400 mb-4">Export Failed</p>
                        <p className="text-gray-300 bg-gray-700 p-3 rounded-md">{error}</p>
                         <button onClick={handleStartExport} className="mt-4 w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold">
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
