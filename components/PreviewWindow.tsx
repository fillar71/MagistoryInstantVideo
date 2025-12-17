
import React, { useRef, useMemo, useEffect } from 'react';
import type { Segment, AudioClip } from '../types';
import { PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { generateSubtitleChunks } from '../utils/media';

interface PreviewWindowProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  segment: Segment; 
  segments: Segment[];
  audioTracks?: AudioClip[]; // New prop for global audio
  activeSegmentId: string;
  onUpdateSegments: (segments: Segment[]) => void;
  currentTime: number;
  isPlaying: boolean;
  totalDuration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  aspectRatio?: 'landscape' | 'portrait';
  // ... pass-through props retained for compatibility but unused directly in this simplified view
  [key: string]: any; 
}

const PreviewWindow: React.FC<PreviewWindowProps> = ({ 
    title, onTitleChange, segments, audioTracks = [], currentTime, isPlaying, totalDuration, onPlayPause, onSeek, aspectRatio = 'landscape'
}) => {
    // Segment audio player
    const segmentAudioRef = useRef<HTMLAudioElement>(null);
    // Global audio player (for background music or "Audio to Video" uploads)
    const globalAudioRef = useRef<HTMLAudioElement>(null);

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

    // Segment Audio Sync (Narration)
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

    // Global Audio Sync (Background Music / Uploaded Audio)
    useEffect(() => {
        if (!globalAudioRef.current) return;
        
        // Find the most prominent audio track active at current time
        // Priority to music/upload types. 
        // Note: Previewing multiple overlapping audio tracks is complex with HTML Audio.
        // We pick the first one active for preview purposes.
        const activeTrack = audioTracks.find(t => currentTime >= t.startTime && currentTime < t.startTime + t.duration);

        if (activeTrack) {
            if (!globalAudioRef.current.src.includes(activeTrack.url)) {
                globalAudioRef.current.src = activeTrack.url;
            }
            
            const trackLocalTime = currentTime - activeTrack.startTime;
            
            // Sync time if drift is large
            if (Math.abs(globalAudioRef.current.currentTime - trackLocalTime) > 0.3) {
                globalAudioRef.current.currentTime = trackLocalTime;
            }

            globalAudioRef.current.volume = activeTrack.volume;

            if (isPlaying) {
                globalAudioRef.current.play().catch(e => {
                    // Ignore play error if loading
                });
            } else {
                globalAudioRef.current.pause();
            }
        } else {
            globalAudioRef.current.pause();
            if (globalAudioRef.current.src) {
                // Don't clear src immediately to prevent stutter if skipping short gaps, just pause
                // But if we seek far away, maybe we should? For now just pause.
            }
        }
    }, [currentTime, isPlaying, audioTracks]);


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

        return (
            <p 
                style={{
                    fontFamily: currentStyle.fontFamily,
                    fontSize: `${currentStyle.fontSize}px`,
                    backgroundColor: currentStyle.backgroundColor,
                    textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
                    textAlign: 'center',
                    lineHeight: 1.4
                }}
                className="p-2 rounded-md transition-all duration-100"
            >
                {displayChunk.timings.map((t, i) => {
                    const isActive = localTime >= t.start && localTime < t.end;
                    return (
                        <span key={i} style={{ color: isActive ? currentStyle.color : '#FFFFFF', opacity: isActive ? 1 : 0.7, marginRight: '0.25em' }}>
                            {t.word}
                        </span>
                    );
                })}
            </p>
        )
    }

    // Determine Container Aspect Ratio Class
    const aspectClass = aspectRatio === 'portrait' 
        ? 'aspect-[9/16] h-full shadow-[0_0_50px_rgba(0,0,0,0.5)]' 
        : 'aspect-video w-full shadow-lg';

    return (
        <div className="flex flex-col h-full w-full bg-[#0a0a0a] relative">
            {/* Title Overlay */}
            <div className="absolute top-0 left-0 w-full p-2 z-20 flex justify-center opacity-0 hover:opacity-100 transition-opacity">
                <input 
                    value={title} 
                    onChange={e => onTitleChange(e.target.value)} 
                    className="bg-transparent text-center text-gray-500 text-sm focus:text-white outline-none"
                />
            </div>

            {/* Video Stage */}
            <div className="flex-grow flex items-center justify-center relative overflow-hidden group py-4">
                {currentRenderState ? (
                    <div className={`relative ${aspectClass} max-h-full bg-black mx-auto transition-all duration-300`}>
                        {currentRenderState.clip.type === 'video' ? (
                            <video key={currentRenderState.clip.url} src={currentRenderState.clip.url} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                        ) : (
                            <img src={currentRenderState.clip.url} className="w-full h-full object-cover" />
                        )}
                        <div className={`absolute inset-0 p-8 flex flex-col justify-end items-center pointer-events-none`}>
                            {renderKaraokeText()}
                        </div>
                    </div>
                ) : (
                    <div className="text-gray-700 font-mono">NO SIGNAL</div>
                )}

                {/* Floating Controls */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/50 px-6 py-2 rounded-full backdrop-blur-sm z-30">
                    <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="text-white hover:scale-110"><ChevronLeftIcon /></button>
                    <button onClick={onPlayPause} className="text-white hover:scale-110">
                        {isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8" />}
                    </button>
                    <button onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))} className="text-white hover:scale-110"><ChevronRightIcon /></button>
                </div>
            </div>

            {/* Hidden Audio Players */}
            <audio ref={segmentAudioRef} className="hidden" />
            <audio ref={globalAudioRef} className="hidden" />
        </div>
    );
};

export default PreviewWindow;
