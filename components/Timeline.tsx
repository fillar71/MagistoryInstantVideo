
import React, { useMemo, useRef, useState } from 'react';
import type { Segment, TransitionEffect, AudioClip } from '../types';
import SegmentCard from './SegmentCard';
import TransitionPicker from './TransitionPicker';
import Waveform from './Waveform';
import { TrashIcon } from './icons';

interface TimelineProps {
    segments: Segment[];
    audioTracks: AudioClip[];
    onReorder: (newSegments: Segment[]) => void;
    activeSegmentId: string | null;
    setActiveSegmentId: (id: string) => void;
    onUpdateTransition: (segmentId: string, newTransition: TransitionEffect) => void;
    onUpdateVolume: (segmentId: string, newVolume: number) => void;
    timelineZoom: number;
    onNudgeSegment: (segmentId: string, direction: 'left' | 'right') => void;
    onAddSegment: () => void;
    onUpdateAudioTrack: (trackId: string, updates: Partial<AudioClip>) => void;
    onDeleteAudioTrack: (trackId: string) => void;
    onAddAudioTrack: (type: 'music' | 'sfx') => void;
}

const BASE_PIXELS_PER_SECOND = 60;

const Timeline: React.FC<TimelineProps> = ({ 
    segments,
    audioTracks = [],
    onReorder, 
    activeSegmentId, 
    setActiveSegmentId, 
    onUpdateTransition, 
    onUpdateVolume, 
    timelineZoom, 
    onNudgeSegment,
    onAddSegment,
    onUpdateAudioTrack,
    onDeleteAudioTrack,
    onAddAudioTrack
}) => {
    const [draggedSegmentIndex, setDraggedSegmentIndex] = useState<number | null>(null);
    const [draggedAudioId, setDraggedAudioId] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const pixelsPerSecond = BASE_PIXELS_PER_SECOND * timelineZoom;

    const totalVideoDuration = useMemo(() => {
         return segments.reduce((acc, curr) => acc + curr.duration, 0);
    }, [segments]);

    const totalTimelineDuration = useMemo(() => {
        const tracksDuration = audioTracks.reduce((acc, curr) => Math.max(acc, curr.startTime + curr.duration), 0);
        return Math.max(totalVideoDuration, tracksDuration, 30); // Min 30s for canvas
    }, [totalVideoDuration, audioTracks]);

    // --- Segment Dragging ---
    const handleSegmentDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedSegmentIndex(index);
        (e.dataTransfer as any).effectAllowed = "move";
        (e.dataTransfer as any).setData("type", "segment");
        (e.dataTransfer as any).setData("index", index.toString());
        const el = e.currentTarget;
        (el as any).style.opacity = '0.5';
    };

    const handleSegmentDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        (e.currentTarget as any).style.opacity = '1';
        setDraggedSegmentIndex(null);
    }

    const handleSegmentDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        const type = (e.dataTransfer as any).getData("type");
        if (type !== "segment") return;
        
        const draggedIdxStr = (e.dataTransfer as any).getData("index");
        if (!draggedIdxStr) return;
        
        const draggedIdx = parseInt(draggedIdxStr);
        if (draggedIdx === dropIndex) return;

        const newSegments = [...segments];
        const [draggedSegment] = newSegments.splice(draggedIdx, 1);
        newSegments.splice(dropIndex, 0, draggedSegment);
        onReorder(newSegments);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        (e.dataTransfer as any).dropEffect = "move";
    };

    // --- Audio Track Dragging ---
    const handleAudioDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
        e.stopPropagation();
        setDraggedAudioId(id);
        (e.dataTransfer as any).effectAllowed = "move";
        (e.dataTransfer as any).setData("type", "audioTrack");
        (e.dataTransfer as any).setData("id", id);
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        (e.dataTransfer as any).setData("offsetX", offsetX.toString());
    };

    const handleAudioTrackDrop = (e: React.DragEvent<HTMLDivElement>, trackType: 'music' | 'sfx') => {
        e.preventDefault();
        const type = (e.dataTransfer as any).getData("type");
        if (type !== "audioTrack") return;
        
        const id = (e.dataTransfer as any).getData("id");
        const offsetX = parseFloat((e.dataTransfer as any).getData("offsetX") || "0");
        
        const track = audioTracks.find(t => t.id === id);
        if (!track || track.type !== trackType) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - offsetX + (scrollContainerRef.current?.scrollLeft || 0);
        const newStartTime = Math.max(0, x / pixelsPerSecond);
        
        onUpdateAudioTrack(id, { startTime: newStartTime });
        setDraggedAudioId(null);
    };


    // Generate Time Ruler Marks
    const rulerMarks = [];
    const rulerStep = 5; // Every 5 seconds major mark
    for (let i = 0; i <= totalTimelineDuration; i += 1) {
        rulerMarks.push(i);
    }
    
    const renderAudioClip = (clip: AudioClip) => {
        const width = Math.max(clip.duration * pixelsPerSecond, 20);
        return (
            <div
                key={clip.id}
                draggable
                onDragStart={(e) => handleAudioDragStart(e, clip.id)}
                className={`absolute h-full rounded-sm border flex flex-col justify-center cursor-pointer overflow-hidden group transition-colors shadow-sm
                    ${clip.type === 'music' 
                        ? 'bg-[#1e3a8a]/60 border-blue-500/50 hover:bg-[#1e3a8a]/80' 
                        : 'bg-[#7c2d12]/60 border-orange-500/50 hover:bg-[#7c2d12]/80'
                    }
                    ${draggedAudioId === clip.id ? 'opacity-50' : 'opacity-100'}
                `}
                style={{
                    left: `${clip.startTime * pixelsPerSecond}px`,
                    width: `${width}px`,
                    top: '2px',
                    bottom: '2px',
                    zIndex: 10
                }}
                title={`${clip.name} (${clip.duration.toFixed(1)}s)`}
            >
                <div className="absolute inset-0 opacity-40">
                    <Waveform 
                        width={width} 
                        height={40} 
                        color={clip.type === 'music' ? '#93c5fd' : '#fdba74'}
                        seedId={clip.id}
                        type={clip.type}
                    />
                </div>

                <div className="relative px-2 text-[10px] font-bold truncate text-white drop-shadow-md z-10">{clip.name}</div>
                
                <div className="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center gap-2 backdrop-blur-sm px-1 z-20">
                    <button 
                         onClick={(e) => { e.stopPropagation(); onDeleteAudioTrack(clip.id); }}
                         className="p-1 bg-red-600 rounded hover:bg-red-500 text-white"
                         title="Delete"
                    >
                        <TrashIcon className="w-2.5 h-2.5" />
                    </button>
                    <input 
                        type="range"
                        min="0" max="1" step="0.1"
                        value={clip.volume}
                        onChange={(e) => { e.stopPropagation(); onUpdateAudioTrack(clip.id, { volume: parseFloat(e.target.value) }) }}
                        className="w-12 h-1 bg-gray-600 appearance-none rounded-lg cursor-pointer accent-white"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            </div>
        )
    };

    return (
        <div className="flex h-full w-full overflow-hidden bg-[#0c0c0e] text-white select-none font-sans">
            
            {/* LEFT TRACK HEADERS (Fixed) */}
            <div className="w-24 flex-shrink-0 flex flex-col border-r border-white/10 bg-[#0c0c0e] z-20 shadow-md">
                <div className="flex-grow flex flex-col pt-8 gap-1 relative">
                    {/* Visual Track Label */}
                    <div className="h-24 flex items-center justify-end px-3 mb-4">
                         <div className="text-right">
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Video</span>
                             <span className="text-[9px] text-gray-600">Main Track</span>
                         </div>
                    </div>

                    {/* Narration Track Label */}
                    <div className="h-8 flex items-center justify-end px-3 mb-1 border-b border-white/5 bg-[#121214]">
                        <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider">Voice</span>
                    </div>
                    
                    {/* Music Track Label */}
                    <div className="h-10 flex items-center justify-between px-2 mb-1 bg-[#0f172a]/30 border-t border-b border-white/5 group">
                        <button onClick={() => onAddAudioTrack('music')} className="w-4 h-4 flex items-center justify-center rounded bg-white/5 hover:bg-blue-600 text-gray-500 hover:text-white transition-colors">
                            <span className="text-[10px] font-bold">+</span>
                        </button>
                        <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Music</span>
                    </div>

                    {/* SFX Track Label */}
                    <div className="h-10 flex items-center justify-between px-2 mb-1 bg-[#2a1205]/30 border-b border-white/5 group">
                         <button onClick={() => onAddAudioTrack('sfx')} className="w-4 h-4 flex items-center justify-center rounded bg-white/5 hover:bg-orange-600 text-gray-500 hover:text-white transition-colors">
                            <span className="text-[10px] font-bold">+</span>
                        </button>
                        <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wider">SFX</span>
                    </div>
                </div>
            </div>

            {/* RIGHT SCROLLABLE AREA */}
            <div 
                ref={scrollContainerRef}
                className="flex-grow overflow-x-auto overflow-y-hidden relative custom-scrollbar bg-[#09090b]"
            >
                 {/* Time Ruler */}
                <div 
                    className="absolute top-0 left-0 h-6 flex items-end text-[9px] text-gray-600 font-mono border-b border-white/10 w-full z-10 bg-[#0c0c0e]"
                    style={{ width: `${Math.max(totalTimelineDuration * pixelsPerSecond + 200, 1000)}px` }} 
                >
                    {rulerMarks.map(time => (
                        <div 
                            key={time} 
                            className={`absolute bottom-0 border-l pl-1 pointer-events-none ${time % 5 === 0 ? 'h-full border-white/20' : 'h-2 border-white/5'}`}
                            style={{ left: `${time * pixelsPerSecond}px` }}
                        >
                            {time % 5 === 0 ? (
                                <span className="absolute -top-1 -left-1">{new Date(time * 1000).toISOString().substr(15, 4)}</span>
                            ) : ''}
                        </div>
                    ))}
                </div>

                {/* Tracks Container */}
                <div 
                    className="flex flex-col pt-8 pl-2"
                    style={{ width: `${totalTimelineDuration * pixelsPerSecond + 300}px` }}
                >
                    {/* VIDEO TRACK (Segments) */}
                    <div className="flex items-center relative h-24 mb-4">
                        {segments.map((segment, index) => {
                            const segmentWidth = segment.duration * pixelsPerSecond;
                            const isDragging = index === draggedSegmentIndex;
                            
                            return (
                                <div
                                    key={segment.id}
                                    className={`relative flex-shrink-0 h-[80px] group ${isDragging ? 'opacity-50' : ''}`}
                                    style={{ width: `${segmentWidth}px`, minWidth: '30px' }}
                                    draggable
                                    onDragStart={(e) => handleSegmentDragStart(e, index)}
                                    onDragEnd={handleSegmentDragEnd}
                                    onDrop={(e) => handleSegmentDrop(e, index)}
                                    onDragOver={handleDragOver}
                                >
                                    {/* Segment Card */}
                                    <div className="absolute inset-y-0 left-0 right-[1px] rounded overflow-hidden">
                                        <SegmentCard 
                                            segment={segment}
                                            isActive={segment.id === activeSegmentId}
                                            onClick={() => setActiveSegmentId(segment.id)}
                                            onNudgeLeft={(e) => { e.stopPropagation(); onNudgeSegment(segment.id, 'left'); }}
                                            onNudgeRight={(e) => { e.stopPropagation(); onNudgeSegment(segment.id, 'right'); }}
                                            onUpdateVolume={onUpdateVolume}
                                            isFirst={index === 0}
                                            isLast={index === segments.length - 1}
                                            widthPx={segmentWidth}
                                        />
                                    </div>

                                    {/* Transition Handle */}
                                    {index < segments.length - 1 && (
                                        <div 
                                            className="absolute top-1/2 -right-3 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center transform scale-75 hover:scale-100 transition-transform"
                                        >
                                            <TransitionPicker 
                                                currentTransition={segment.transition || 'fade'}
                                                onSelect={(newTransition) => onUpdateTransition(segment.id, newTransition)}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Button at the end of Video Track */}
                        <div 
                            onClick={onAddSegment}
                            className="flex-shrink-0 w-8 h-full ml-4 flex items-center justify-center bg-white/5 border border-dashed border-white/10 rounded cursor-pointer hover:bg-white/10 hover:border-purple-500 transition-all"
                        >
                            <span className="text-xl text-gray-600 font-bold hover:text-purple-400">+</span>
                        </div>
                    </div>

                    {/* NARRATION TRACK (Attached to segments) */}
                    <div className="flex items-center h-8 mb-1 relative border-b border-white/5">
                        {segments.map((segment) => {
                            const width = segment.duration * pixelsPerSecond;
                            
                            return (
                                <div key={`narration-${segment.id}`} style={{ width }} className="flex-shrink-0 pr-[1px] h-full border-r border-white/5">
                                    {segment.audioUrl ? (
                                        <div 
                                            className="h-full bg-purple-900/40 border border-purple-500/30 rounded-sm flex items-center px-2 cursor-pointer hover:bg-purple-800/50 overflow-hidden relative"
                                            onClick={() => setActiveSegmentId(segment.id)}
                                            title="AI Narration"
                                        >
                                            <div className="absolute inset-0 opacity-50">
                                                <Waveform 
                                                    width={width} 
                                                    height={32} 
                                                    color="#c084fc"
                                                    seedId={segment.id}
                                                    type="narration"
                                                />
                                            </div>
                                            <span className="text-[9px] text-purple-200 truncate relative z-10 font-medium">Voice</span>
                                        </div>
                                    ) : (
                                        <div className="h-full bg-white/0"></div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* MUSIC BACKGROUND TRACK (Global) */}
                    <div 
                        className="relative h-10 mb-1 w-full bg-[#0f172a]/20 border-t border-white/5"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleAudioTrackDrop(e, 'music')}
                    >
                         {/* Vertical Grid Lines */}
                        {rulerMarks.map(time => (
                            <div key={time} className="absolute top-0 bottom-0 border-l border-white/5 pointer-events-none" style={{ left: `${time * pixelsPerSecond}px` }}></div>
                        ))}
                        
                        {audioTracks.filter(t => t.type === 'music').map(renderAudioClip)}
                        
                        {audioTracks.filter(t => t.type === 'music').length === 0 && (
                            <div className="absolute inset-0 flex items-center pl-4 opacity-10 pointer-events-none text-blue-400 text-xs italic tracking-widest uppercase">
                                Drag Music Here
                            </div>
                        )}
                    </div>

                    {/* SOUND EFFECTS TRACK (Global) */}
                    <div 
                        className="relative h-10 mb-1 w-full bg-[#2a1205]/20 border-b border-white/5"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleAudioTrackDrop(e, 'sfx')}
                    >
                         {rulerMarks.map(time => (
                            <div key={time} className="absolute top-0 bottom-0 border-l border-white/5 pointer-events-none" style={{ left: `${time * pixelsPerSecond}px` }}></div>
                        ))}
                        
                        {audioTracks.filter(t => t.type === 'sfx').map(renderAudioClip)}

                        {audioTracks.filter(t => t.type === 'sfx').length === 0 && (
                            <div className="absolute inset-0 flex items-center pl-4 opacity-10 pointer-events-none text-orange-400 text-xs italic tracking-widest uppercase">
                                Drag SFX Here
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Timeline;
