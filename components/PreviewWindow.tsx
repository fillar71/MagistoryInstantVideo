
import React, { useRef, useMemo, useEffect, useState } from 'react';
import type { Segment, AudioClip, MediaTransform, TextOverlayStyle } from '../types';
import { PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { generateSubtitleChunks } from '../utils/media';

interface PreviewWindowProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  segment: Segment; 
  segments: Segment[];
  audioTracks?: AudioClip[]; 
  activeSegmentId: string;
  onUpdateSegments: (segments: Segment[]) => void;
  currentTime: number;
  isPlaying: boolean;
  totalDuration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  aspectRatio?: 'landscape' | 'portrait';
  onUpdateMediaTransform?: (segmentId: string, clipId: string, transform: MediaTransform) => void;
  // New handler for updating text style
  onUpdateTextStyle?: (segmentId: string, style: Partial<TextOverlayStyle>) => void;
  [key: string]: any; 
}

const PreviewWindow: React.FC<PreviewWindowProps> = ({ 
    title, onTitleChange, segments, audioTracks = [], currentTime, isPlaying, totalDuration, onPlayPause, onSeek, aspectRatio = 'landscape', onUpdateMediaTransform, onUpdateTextStyle
}) => {
    // Refs
    const segmentAudioRef = useRef<HTMLAudioElement>(null);
    const globalAudioRef = useRef<HTMLAudioElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Pan & Zoom State (Media)
    const [isDraggingMedia, setIsDraggingMedia] = useState(false);
    const [dragStartMedia, setDragStartMedia] = useState({ x: 0, y: 0 });

    // Text Drag/Resize State
    const [textInteraction, setTextInteraction] = useState<{
        mode: 'drag' | 'resize' | 'none';
        startX: number;
        startY: number;
        initialX: number; // percentage
        initialY: number; // percentage
        initialFontSize: number;
    }>({ mode: 'none', startX: 0, startY: 0, initialX: 0, initialY: 0, initialFontSize: 0 });
    
    // Get Active Clip Information
    const currentRenderState = useMemo(() => {
        let elapsed = 0;
        for (const seg of segments) {
            if (currentTime >= elapsed && currentTime < elapsed + seg.duration) {
                const localTime = currentTime - elapsed;
                const clipDuration = seg.duration / seg.media.length;
                const clipIndex = Math.min(seg.media.length - 1, Math.floor(localTime / clipDuration));
                const activeClip = seg.media[clipIndex];
                return { segment: seg, clip: activeClip, localTime, clipIndex };
            }
            elapsed += seg.duration;
        }
        return null;
    }, [currentTime, segments]);

    // Segment Audio Sync
    useEffect(() => {
        if (!segmentAudioRef.current) return;
        const activeSeg = currentRenderState?.segment;
        if (activeSeg?.audioUrl) {
            if (!segmentAudioRef.current.src.includes(activeSeg.audioUrl)) {
                 segmentAudioRef.current.src = activeSeg.audioUrl;
            }
            const expectedTime = currentRenderState?.localTime || 0;
            if (Math.abs(segmentAudioRef.current.currentTime - expectedTime) > 0.3) {
                segmentAudioRef.current.currentTime = expectedTime;
            }
            if (isPlaying) segmentAudioRef.current.play().catch(() => {});
            else segmentAudioRef.current.pause();
            segmentAudioRef.current.volume = activeSeg.audioVolume ?? 1.0;
        } else {
            segmentAudioRef.current.pause();
            segmentAudioRef.current.src = "";
        }
    }, [currentRenderState?.segment.id, currentRenderState?.localTime, isPlaying]);

    // Global Audio Sync
    useEffect(() => {
        if (!globalAudioRef.current) return;
        const activeTrack = audioTracks.find(t => currentTime >= t.startTime && currentTime < t.startTime + t.duration);

        if (activeTrack) {
            if (!globalAudioRef.current.src.includes(activeTrack.url)) {
                globalAudioRef.current.src = activeTrack.url;
            }
            const trackLocalTime = currentTime - activeTrack.startTime;
            if (Math.abs(globalAudioRef.current.currentTime - trackLocalTime) > 0.3) {
                globalAudioRef.current.currentTime = trackLocalTime;
            }
            globalAudioRef.current.volume = activeTrack.volume;
            if (isPlaying) globalAudioRef.current.play().catch(e => {});
            else globalAudioRef.current.pause();
        } else {
            globalAudioRef.current.pause();
        }
    }, [currentTime, isPlaying, audioTracks]);

    // --- INTERACTION HANDLERS (Media Pan & Zoom) ---

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentRenderState || !onUpdateMediaTransform) return;

        const { segment, clip } = currentRenderState;
        const currentTransform = clip.transform || { scale: 1, x: 0, y: 0 };
        
        // Zoom logic: Scroll Up (negative deltaY) zooms in
        const zoomFactor = -e.deltaY * 0.001;
        const newScale = Math.max(0.1, Math.min(5, currentTransform.scale + zoomFactor));
        
        onUpdateMediaTransform(segment.id, clip.id, {
            ...currentTransform,
            scale: newScale
        });
    };

    const handleMediaMouseDown = (e: React.MouseEvent) => {
        if (!currentRenderState || textInteraction.mode !== 'none') return;
        setIsDraggingMedia(true);
        setDragStartMedia({ x: e.clientX, y: e.clientY });
    };

    // --- INTERACTION HANDLERS (Text Drag & Resize) ---

    const handleTextMouseDown = (e: React.MouseEvent, type: 'drag' | 'resize') => {
        e.stopPropagation(); // Prevent media drag
        e.preventDefault();
        
        if (!currentRenderState || !currentRenderState.segment.textOverlayStyle) return;
        const style = currentRenderState.segment.textOverlayStyle;

        // Default positions if undefined
        const currentX = style.x ?? 50; 
        const currentY = style.y ?? (style.position === 'bottom' ? 85 : style.position === 'top' ? 15 : 50);

        setTextInteraction({
            mode: type,
            startX: e.clientX,
            startY: e.clientY,
            initialX: currentX,
            initialY: currentY,
            initialFontSize: style.fontSize
        });
    };

    // Unified Mouse Move
    const handleMouseMove = (e: React.MouseEvent) => {
        // 1. Handle Text Interaction
        if (textInteraction.mode !== 'none' && currentRenderState && containerRef.current && onUpdateTextStyle) {
            const { segment } = currentRenderState;
            const containerRect = containerRef.current.getBoundingClientRect();
            
            const deltaXPixels = e.clientX - textInteraction.startX;
            const deltaYPixels = e.clientY - textInteraction.startY;

            if (textInteraction.mode === 'drag') {
                // Convert pixel delta to percentage delta
                const deltaXPercent = (deltaXPixels / containerRect.width) * 100;
                const deltaYPercent = (deltaYPixels / containerRect.height) * 100;

                const newX = Math.max(0, Math.min(100, textInteraction.initialX + deltaXPercent));
                const newY = Math.max(0, Math.min(100, textInteraction.initialY + deltaYPercent));

                onUpdateTextStyle(segment.id, { x: newX, y: newY, position: 'custom' });
            } else if (textInteraction.mode === 'resize') {
                // Resize based on drag distance (simplified)
                const scaleFactor = 1 + (deltaXPixels / 200); 
                const newSize = Math.max(10, Math.min(200, textInteraction.initialFontSize * scaleFactor));
                onUpdateTextStyle(segment.id, { fontSize: newSize });
            }
            return;
        }

        // 2. Handle Media Pan
        if (isDraggingMedia && currentRenderState && onUpdateMediaTransform) {
            const { segment, clip } = currentRenderState;
            const currentTransform = clip.transform || { scale: 1, x: 0, y: 0 };
            
            const deltaX = e.clientX - dragStartMedia.x;
            const deltaY = e.clientY - dragStartMedia.y;
            
            onUpdateMediaTransform(segment.id, clip.id, {
                ...currentTransform,
                x: currentTransform.x + deltaX,
                y: currentTransform.y + deltaY
            });
            
            setDragStartMedia({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = () => {
        setIsDraggingMedia(false);
        setTextInteraction({ ...textInteraction, mode: 'none' });
    };

    // Subtitle Rendering
    const renderKaraokeText = () => {
        const renderSeg = currentRenderState?.segment;
        if (!renderSeg || !renderSeg.textOverlayStyle || !renderSeg.narration_text) return null;
        
        const timings = renderSeg.wordTimings;
        if (!timings || timings.length === 0) return null;

        const currentStyle = renderSeg.textOverlayStyle;
        const localTime = currentRenderState?.localTime || 0;

        const subtitleChunks = generateSubtitleChunks(timings, currentStyle.fontSize, currentStyle.maxCaptionLines || 2, 800);
        const displayChunk = subtitleChunks.find(c => localTime >= c.start && localTime <= c.end);

        if (!displayChunk) return null;

        // Determine Position
        let top = '50%';
        let left = '50%';
        let transform = 'translate(-50%, -50%)';

        if (currentStyle.position === 'custom' && currentStyle.x !== undefined && currentStyle.y !== undefined) {
            left = `${currentStyle.x}%`;
            top = `${currentStyle.y}%`;
        } else {
            // Fallback to presets
            if (currentStyle.position === 'top') top = '15%';
            else if (currentStyle.position === 'bottom') top = '85%';
        }

        return (
            <div 
                className="absolute group/text cursor-move select-none"
                style={{ top, left, transform }}
                onMouseDown={(e) => handleTextMouseDown(e, 'drag')}
            >
                <div 
                    className="relative p-2 rounded-md transition-all duration-100 text-center border-2 border-transparent hover:border-purple-500/50 hover:bg-black/20"
                    style={{
                        fontFamily: currentStyle.fontFamily,
                        fontSize: `${currentStyle.fontSize}px`,
                        backgroundColor: currentStyle.backgroundColor,
                        textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
                        lineHeight: 1.4,
                        whiteSpace: 'nowrap'
                    }}
                >
                    {displayChunk.timings.map((t, i) => {
                        const isActive = localTime >= t.start && localTime < t.end;
                        return (
                            <span key={i} style={{ color: isActive ? currentStyle.color : '#FFFFFF', opacity: isActive ? 1 : 0.7, marginRight: '0.25em' }}>
                                {t.word}
                            </span>
                        );
                    })}

                    {/* Resize Handle */}
                    <div 
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-purple-500 rounded-full cursor-se-resize opacity-0 group-hover/text:opacity-100 shadow-sm border border-white"
                        onMouseDown={(e) => handleTextMouseDown(e, 'resize')}
                    />
                </div>
            </div>
        )
    }

    // Aspect Ratio Class
    const containerAspectClass = aspectRatio === 'portrait' ? 'aspect-[9/16] h-full max-h-full' : 'aspect-video w-full max-w-full';

    // Current Transform Style
    const activeTransform = currentRenderState?.clip.transform || { scale: 1, x: 0, y: 0 };
    const mediaStyle: React.CSSProperties = {
        transform: `translate(${activeTransform.x}px, ${activeTransform.y}px) scale(${activeTransform.scale})`,
        cursor: isDraggingMedia ? 'grabbing' : 'grab',
        transition: isDraggingMedia ? 'none' : 'transform 0.1s ease-out'
    };

    return (
        <div className="flex flex-col h-full w-full bg-[#0a0a0a] relative group/preview">
            
            {/* Title Overlay */}
            <div className="absolute top-0 left-0 w-full p-2 z-20 flex justify-center opacity-0 hover:opacity-100 transition-opacity">
                <input 
                    value={title} 
                    onChange={e => onTitleChange(e.target.value)} 
                    className="bg-transparent text-center text-gray-500 text-sm focus:text-white outline-none"
                />
            </div>

            {/* Video Stage */}
            <div className="flex-grow flex items-center justify-center relative overflow-hidden bg-[#111] p-4">
                <div 
                    ref={containerRef}
                    className={`relative bg-black shadow-2xl overflow-hidden ${containerAspectClass}`}
                    onWheel={handleWheel}
                    onMouseDown={handleMediaMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {currentRenderState ? (
                        <>
                            {currentRenderState.clip.type === 'video' ? (
                                <video 
                                    key={currentRenderState.clip.url} 
                                    src={currentRenderState.clip.url} 
                                    className="w-full h-full object-cover pointer-events-none select-none" 
                                    style={mediaStyle}
                                    autoPlay muted loop playsInline 
                                />
                            ) : (
                                <img 
                                    src={currentRenderState.clip.url} 
                                    className="w-full h-full object-cover pointer-events-none select-none" 
                                    style={mediaStyle}
                                />
                            )}
                            
                            {/* Text Overlay Layer */}
                            {renderKaraokeText()}
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-700 font-mono">NO SIGNAL</div>
                    )}
                </div>

                {/* Floating Controls */}
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-6 opacity-0 group-hover/preview:opacity-100 transition-all duration-300 bg-black/60 px-6 py-2 rounded-full backdrop-blur-sm z-30">
                    <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="text-white hover:scale-110"><ChevronLeftIcon /></button>
                    <button onClick={onPlayPause} className="text-white hover:scale-110">
                        {isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8" />}
                    </button>
                    <button onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))} className="text-white hover:scale-110"><ChevronRightIcon /></button>
                </div>
            </div>

            {/* Bottom Slider & Timecode */}
            <div className="h-10 bg-[#111] border-t border-white/10 px-4 flex items-center gap-4 z-20">
                <span className="text-[10px] font-mono text-purple-400 w-12 text-right">
                    {new Date(currentTime * 1000).toISOString().substr(14, 5)}
                </span>
                <input 
                    type="range"
                    min="0"
                    max={totalDuration}
                    step="0.1"
                    value={currentTime}
                    onChange={(e) => onSeek(parseFloat(e.target.value))}
                    className="flex-grow h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
                />
                <span className="text-[10px] font-mono text-gray-500 w-12">
                    {new Date(totalDuration * 1000).toISOString().substr(14, 5)}
                </span>
            </div>

            {/* Hidden Audio Players */}
            <audio ref={segmentAudioRef} className="hidden" />
            <audio ref={globalAudioRef} className="hidden" />
        </div>
    );
};

export default PreviewWindow;
