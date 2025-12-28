
import React, { useMemo, useRef, useEffect, useState } from 'react';
import type { Segment, AudioClip } from '../types';
import { MusicIcon, ScissorsIcon, TrashIcon, PlusIcon, VolumeXIcon, AlertCircleIcon } from './icons';
import Waveform from './Waveform';

interface TimelineProps {
    segments: Segment[];
    audioTracks?: AudioClip[];
    activeSegmentId: string | null;
    activeAudioTrackId?: string | null;
    setActiveSegmentId: (id: string) => void;
    onSelectAudioTrack?: (id: string) => void;
    timelineZoom: number;
    setTimelineZoom: React.Dispatch<React.SetStateAction<number>>;
    currentTime: number;
    isPlaying: boolean;
    onSeek: (time: number) => void;
    onReorder: (segments: Segment[]) => void;
    onSplit?: () => void;
    onDelete?: () => void;
    onDeleteAudioTrack?: (id: string) => void;
    onAddSegment?: () => void;
    onAddAudioTrack?: (type: 'music' | 'sfx') => void;
    onUpdateAudioTrack?: (id: string, updates: Partial<AudioClip>) => void;
    onUpdateSegmentDuration?: (id: string, newDuration: number) => void; // New Prop
    [key: string]: any;
}

const BASE_PIXELS_PER_SECOND = 80; 

type DragMode = 'none' | 'move-segment' | 'resize-segment' | 'move-audio' | 'resize-audio';

interface DragState {
    mode: DragMode;
    itemId: string;
    startX: number;
    initialValue: number; // For move: startTime/Index. For resize: duration.
    initialSecondValue?: number; // For segment move: original index map
}

const Timeline: React.FC<TimelineProps> = ({ 
    segments, audioTracks = [], activeSegmentId, activeAudioTrackId, setActiveSegmentId, onSelectAudioTrack, timelineZoom, setTimelineZoom, currentTime, isPlaying, onSeek, onSplit, onDelete, onDeleteAudioTrack, onAddSegment, onAddAudioTrack, onUpdateAudioTrack, onUpdateSegmentDuration, onReorder
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    
    // Drag State
    const [dragState, setDragState] = useState<DragState>({ mode: 'none', itemId: '', startX: 0, initialValue: 0 });
    const [tempSegments, setTempSegments] = useState<Segment[] | null>(null); // For realtime visual feedback
    const [tempAudioTracks, setTempAudioTracks] = useState<AudioClip[] | null>(null); // For realtime visual feedback

    const pixelsPerSecond = BASE_PIXELS_PER_SECOND * timelineZoom;

    // Computed Lists (Use temps while dragging for smoothness)
    const displaySegments = tempSegments || segments;
    const displayAudioTracks = tempAudioTracks || audioTracks;

    const totalDuration = useMemo(() => displaySegments.reduce((acc, curr) => acc + curr.duration, 0), [displaySegments]);

    // Auto-scroll logic
    useEffect(() => {
        if (scrollContainerRef.current && isPlaying && dragState.mode === 'none') {
            const containerWidth = scrollContainerRef.current.clientWidth;
            const playheadX = currentTime * pixelsPerSecond;
            const scrollLeft = scrollContainerRef.current.scrollLeft;
            
            if (playheadX > scrollLeft + (containerWidth * 0.7)) {
                scrollContainerRef.current.scrollTo({ left: playheadX - (containerWidth * 0.3), behavior: 'auto' });
            }
        }
    }, [currentTime, isPlaying, pixelsPerSecond, dragState.mode]);


    // --- MOUSE EVENT HANDLERS FOR DRAGGING ---

    const handleMouseDown = (e: React.MouseEvent, mode: DragMode, itemId: string, initialVal: number, initialSecondVal?: number) => {
        e.stopPropagation();
        setDragState({
            mode,
            itemId,
            startX: e.clientX,
            initialValue: initialVal,
            initialSecondValue: initialSecondVal
        });
        
        // Initialize temps
        setTempSegments(segments);
        setTempAudioTracks(audioTracks);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (dragState.mode === 'none') return;

            const deltaPixels = e.clientX - dragState.startX;
            const deltaSeconds = deltaPixels / pixelsPerSecond;

            if (dragState.mode === 'move-audio') {
                // Free move audio
                const newStartTime = Math.max(0, dragState.initialValue + deltaSeconds);
                setTempAudioTracks(prev => prev ? prev.map(t => t.id === dragState.itemId ? { ...t, startTime: newStartTime } : t) : []);
            } 
            else if (dragState.mode === 'resize-audio') {
                // Resize audio duration
                const newDuration = Math.max(0.5, dragState.initialValue + deltaSeconds);
                setTempAudioTracks(prev => prev ? prev.map(t => t.id === dragState.itemId ? { ...t, duration: newDuration } : t) : []);
            }
            else if (dragState.mode === 'resize-segment') {
                // Resize video segment duration
                const newDuration = Math.max(0.5, dragState.initialValue + deltaSeconds);
                setTempSegments(prev => prev ? prev.map(s => s.id === dragState.itemId ? { ...s, duration: newDuration } : s) : []);
            }
            else if (dragState.mode === 'move-segment') {
                // Reorder Segments logic
                // We calculate which index we are hovering over based on mouse X
                if (!timelineRef.current || !scrollContainerRef.current) return;
                
                const scrollLeft = scrollContainerRef.current.scrollLeft;
                const containerRect = timelineRef.current.getBoundingClientRect();
                const relativeX = (e.clientX - containerRect.left + scrollLeft);
                
                // CRITICAL FIX: Use tempSegments (the active list) for calculating positions, 
                // otherwise resizing logic breaks when swapping elements of different widths
                const currentList = tempSegments || segments;
                
                // Find index based on width accumulation of the CURRENT order
                let accumWidth = 0;
                let hoverIndex = currentList.length - 1;
                
                for(let i=0; i<currentList.length; i++) {
                    const segWidth = currentList[i].duration * pixelsPerSecond;
                    if (relativeX < accumWidth + (segWidth / 2)) {
                        hoverIndex = i;
                        break;
                    }
                    accumWidth += segWidth;
                }
                
                // Swap logic
                const currentIndex = currentList.findIndex(s => s.id === dragState.itemId);
                if (currentIndex !== -1 && currentIndex !== hoverIndex) {
                    const newOrder = [...currentList];
                    const [moved] = newOrder.splice(currentIndex, 1);
                    newOrder.splice(hoverIndex, 0, moved);
                    setTempSegments(newOrder);
                }
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (dragState.mode === 'none') return;

            // Commit Changes
            if (dragState.mode.includes('audio') && tempAudioTracks) {
                const track = tempAudioTracks.find(t => t.id === dragState.itemId);
                if (track && onUpdateAudioTrack) {
                    onUpdateAudioTrack(track.id, { startTime: track.startTime, duration: track.duration });
                }
            }
            else if (dragState.mode === 'resize-segment' && tempSegments) {
                const seg = tempSegments.find(s => s.id === dragState.itemId);
                if (seg && onUpdateSegmentDuration) {
                    onUpdateSegmentDuration(seg.id, seg.duration);
                }
            }
            else if (dragState.mode === 'move-segment' && tempSegments) {
                onReorder(tempSegments);
            }

            // Cleanup
            setDragState({ mode: 'none', itemId: '', startX: 0, initialValue: 0 });
            setTempSegments(null);
            setTempAudioTracks(null);
        };

        if (dragState.mode !== 'none') {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, pixelsPerSecond, onUpdateAudioTrack, onUpdateSegmentDuration, onReorder, segments, audioTracks, tempSegments, tempAudioTracks]);


    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Only seek if we weren't dragging
        if (dragState.mode !== 'none') return;
        
        if (!scrollContainerRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const clickX = e.clientX - rect.left + scrollLeft - 20; // -20 padding
        const newTime = Math.max(0, clickX / pixelsPerSecond);
        onSeek(newTime);
    }

    const handleDelete = () => {
        if (activeSegmentId && onDelete) {
            onDelete();
        } else if (activeAudioTrackId && onDeleteAudioTrack) {
            onDeleteAudioTrack(activeAudioTrackId);
        }
    }

    return (
        <div className="h-full w-full bg-[#161616] relative flex flex-col select-none group touch-pan-x">
            
            {/* TIMELINE TOOLBAR */}
            <div className="h-10 md:h-8 border-b border-white/5 flex items-center justify-between px-2 md:px-4 bg-[#1a1a1a] text-xs text-gray-400 select-none flex-shrink-0 z-30">
                <div className="flex items-center gap-2 md:gap-3">
                    <button 
                        onClick={onSplit}
                        className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 rounded text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Split Segment (S)"
                        disabled={!activeSegmentId}
                    >
                        <ScissorsIcon className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        <span className="hidden md:inline">Split</span>
                    </button>
                    <button 
                        onClick={handleDelete}
                        className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 rounded text-gray-300 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Delete Selection (Del)"
                        disabled={!activeSegmentId && !activeAudioTrackId}
                    >
                        <TrashIcon className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        <span className="hidden md:inline">Delete</span>
                    </button>
                    <div className="w-px h-4 bg-gray-700 mx-1"></div>
                    <span className="font-mono text-white text-[10px] md:text-[10px]">{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                    <button onClick={() => setTimelineZoom(z => Math.max(0.5, z-0.2))} className="hover:text-white hover:bg-white/10 w-8 h-8 rounded flex items-center justify-center text-lg">-</button>
                    <div className="w-10 md:w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 transition-all duration-200" style={{ width: `${(timelineZoom/3)*100}%` }}></div>
                    </div>
                    <button onClick={() => setTimelineZoom(z => Math.min(3, z+0.2))} className="hover:text-white hover:bg-white/10 w-8 h-8 rounded flex items-center justify-center text-lg">+</button>
                </div>
            </div>

            <div 
                ref={scrollContainerRef}
                className="overflow-x-auto overflow-y-auto custom-scrollbar flex-grow relative touch-pan-x"
                onMouseDown={handleTimelineClick}
            >
                <div 
                    ref={timelineRef}
                    className="relative min-h-full pb-10"
                    style={{ width: `${Math.max(2000, totalDuration * pixelsPerSecond + 800)}px`, paddingLeft: '20px' }}
                >
                    {/* Time Ruler */}
                    <div className="h-6 bg-[#1a1a1a] border-b border-white/5 sticky top-0 z-30 flex items-end pointer-events-none">
                        {Array.from({ length: Math.ceil(totalDuration) + 10 }).map((_, i) => (
                            <div key={i} className="relative h-3 border-l border-gray-600" style={{ width: `${pixelsPerSecond}px` }}>
                                <span className="absolute -top-3.5 -left-1 text-[9px] text-gray-500 font-mono">{i}s</span>
                                {/* Subticks */}
                                <div className="absolute bottom-0 left-1/4 h-1 border-l border-gray-700"></div>
                                <div className="absolute bottom-0 left-2/4 h-2 border-l border-gray-700"></div>
                                <div className="absolute bottom-0 left-3/4 h-1 border-l border-gray-700"></div>
                            </div>
                        ))}
                    </div>

                    {/* Playhead Line */}
                    <div 
                        className="absolute top-0 bottom-0 z-50 pointer-events-none border-l border-purple-500 w-0"
                        style={{ left: `${(currentTime * pixelsPerSecond) + 20}px` }}
                    >
                        {/* Playhead Handle */}
                        <div className="w-3 h-3 md:w-4 md:h-4 bg-purple-500 -ml-[6.5px] md:-ml-[8px] rotate-45 transform -mt-1.5 shadow-sm border border-white/20"></div>
                        <div className="absolute top-0 bottom-0 -ml-px w-[1px] bg-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                    </div>

                    {/* TRACKS CONTAINER */}
                    <div className="pt-4 px-1 space-y-4">
                        
                        {/* VIDEO TRACK */}
                        <div className="relative">
                            <div className="text-[9px] font-bold text-gray-500 mb-1 ml-1 tracking-wider uppercase flex items-center gap-2">
                                <div className="w-3 h-3 bg-gray-700 rounded-sm flex items-center justify-center text-[7px]">V</div> Video Track
                            </div>
                            <div className="flex h-16 md:h-20 bg-[#121212] rounded-lg border border-white/5 relative overflow-hidden items-center">
                                {displaySegments.map((segment, index) => {
                                    const width = segment.duration * pixelsPerSecond;
                                    const isActive = segment.id === activeSegmentId;
                                    const isDragging = dragState.itemId === segment.id && dragState.mode === 'move-segment';
                                    
                                    // Missing audio detection
                                    const missingAudio = segment.narration_text && !segment.audioUrl;

                                    return (
                                        <div
                                            key={segment.id}
                                            style={{ width }}
                                            className={`relative flex-shrink-0 h-full overflow-visible border-r border-black/50 group/clip select-none transition-all duration-75 ease-out
                                                ${isActive 
                                                    ? 'ring-2 ring-purple-400 z-20 shadow-[0_0_15px_rgba(168,85,247,0.6)] brightness-110 scale-[1.01] rounded-sm' 
                                                    : 'brightness-75 hover:brightness-100 opacity-90 hover:opacity-100 hover:z-10'
                                                }
                                                ${isDragging ? 'opacity-50 scale-95 cursor-grabbing z-30 shadow-xl' : 'cursor-grab active:cursor-grabbing'}
                                            `}
                                            onMouseDown={(e) => handleMouseDown(e, 'move-segment', segment.id, index)}
                                            onClick={(e) => { e.stopPropagation(); setActiveSegmentId(segment.id); }}
                                        >
                                            {/* Clip Background/Thumbnail */}
                                            <div className="absolute inset-0 flex bg-gray-800 overflow-hidden rounded-sm pointer-events-none">
                                                {Array.from({ length: Math.min(10, Math.ceil(width / 80)) }).map((_, i) => (
                                                    <img 
                                                        key={i} 
                                                        src={segment.media[0].url} 
                                                        className="h-full w-full object-cover opacity-60 flex-grow min-w-0" 
                                                        loading="lazy"
                                                    />
                                                ))}
                                            </div>
                                            
                                            {/* WARNING OVERLAY FOR MISSING AUDIO */}
                                            {missingAudio && (
                                                <div className="absolute top-1 right-1 z-30 animate-pulse bg-red-600/90 text-white rounded-full p-1 shadow-sm border border-white/20" title="Missing Audio Narration">
                                                    <AlertCircleIcon className="w-3 h-3 md:w-4 md:h-4" />
                                                </div>
                                            )}
                                            
                                            {/* Text Overlay Indicator */}
                                            <div className="absolute bottom-0 left-0 right-0 h-4 md:h-5 bg-black/70 flex items-center px-2 border-t border-white/5 pointer-events-none">
                                                <div className={`w-1.5 h-1.5 rounded-full mr-2 ${missingAudio ? 'bg-red-500' : 'bg-purple-500'}`}></div>
                                                <span className={`text-[8px] md:text-[9px] truncate font-medium ${missingAudio ? 'text-red-300' : 'text-gray-300'}`}>{segment.narration_text || 'Video Clip'}</span>
                                            </div>

                                            {/* Hover Selection Effect */}
                                            <div className={`absolute inset-0 bg-white/5 opacity-0 group-hover/clip:opacity-100 transition-opacity pointer-events-none`}></div>

                                            {/* RESIZE HANDLE (Right) */}
                                            <div 
                                                className="absolute top-0 bottom-0 right-0 w-6 cursor-ew-resize z-20 hover:bg-purple-500/50 flex items-center justify-center opacity-0 group-hover/clip:opacity-100 transition-opacity touch-none"
                                                onMouseDown={(e) => handleMouseDown(e, 'resize-segment', segment.id, segment.duration)}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="w-1 h-8 bg-white/80 rounded-full shadow-sm pointer-events-none"></div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {/* Add Button at end of Video Track */}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onAddSegment && onAddSegment(); }}
                                    className="flex-shrink-0 w-12 h-12 md:w-16 md:h-full bg-[#1e1e1e] hover:bg-[#252525] flex items-center justify-center text-gray-500 hover:text-white border-l border-white/5 transition-colors group ml-1"
                                    title="Add New Clip"
                                >
                                    <PlusIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        </div>

                        {/* AUDIO TRACKS */}
                        <div>
                             <div className="text-[9px] font-bold text-gray-500 mb-1 ml-1 tracking-wider uppercase flex items-center justify-between pr-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-gray-700 rounded-sm flex items-center justify-center text-[7px] text-teal-400"><MusicIcon className="w-2 h-2" /></div> Audio Tracks
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onAddAudioTrack && onAddAudioTrack('music')} className="flex items-center gap-1 hover:text-white hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors text-teal-500" title="Add Music">
                                        <MusicIcon className="w-3 h-3" /> <span className="hidden xl:inline">Music</span>
                                    </button>
                                    <button onClick={() => onAddAudioTrack && onAddAudioTrack('sfx')} className="flex items-center gap-1 hover:text-white hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors text-orange-500" title="Add SFX">
                                        <VolumeXIcon className="w-3 h-3" /> <span className="hidden xl:inline">SFX</span>
                                    </button>
                                </div>
                             </div>
                             <div className="space-y-1 min-h-[50px] md:min-h-[60px] bg-[#121212] rounded-lg border border-white/5 p-1 relative">
                                {displayAudioTracks.map((track) => {
                                    const isActive = track.id === activeAudioTrackId;
                                    return (
                                        <div 
                                            key={track.id} 
                                            className="h-8 md:h-8 bg-[#1e1e1e] relative rounded border border-white/5 overflow-visible hover:border-teal-500/50 transition-colors"
                                        >
                                            <div 
                                                className={`absolute top-0 bottom-0 flex items-center px-2 overflow-visible border rounded-sm cursor-grab active:cursor-grabbing transition-all duration-200 group/audio
                                                    ${track.type === 'music' 
                                                        ? (isActive 
                                                            ? 'bg-teal-800/90 border-teal-400 ring-2 ring-teal-400 z-20 shadow-[0_4px_12px_rgba(20,184,166,0.5)]' 
                                                            : 'bg-teal-900/40 border-teal-800/50 opacity-80 hover:opacity-100 hover:bg-teal-900/60') 
                                                        : (isActive 
                                                            ? 'bg-orange-800/90 border-orange-400 ring-2 ring-orange-400 z-20 shadow-[0_4px_12px_rgba(249,115,22,0.5)]' 
                                                            : 'bg-orange-900/40 border-orange-800/50 opacity-80 hover:opacity-100 hover:bg-orange-900/60')
                                                    }
                                                `}
                                                style={{ 
                                                    left: `${track.startTime * pixelsPerSecond}px`,
                                                    width: `${track.duration * pixelsPerSecond}px`
                                                }}
                                                onMouseDown={(e) => handleMouseDown(e, 'move-audio', track.id, track.startTime)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onSelectAudioTrack) onSelectAudioTrack(track.id);
                                                }}
                                            >
                                                {/* Render Waveform */}
                                                <div className="absolute inset-0 opacity-60 pointer-events-none overflow-hidden">
                                                    <Waveform 
                                                        width={track.duration * pixelsPerSecond} 
                                                        height={32} 
                                                        color={track.type === 'music' ? '#2dd4bf' : '#fb923c'} // Teal or Orange
                                                        seedId={track.id}
                                                        type={track.type}
                                                    />
                                                </div>

                                                <div className="relative z-10 flex items-center truncate max-w-full pointer-events-none">
                                                    <MusicIcon className={`w-3 h-3 mr-2 flex-shrink-0 ${track.type === 'music' ? 'text-teal-400' : 'text-orange-400'}`} />
                                                    <span className="text-[9px] md:text-[10px] text-gray-200 truncate font-medium drop-shadow-md">{track.name}</span>
                                                </div>

                                                {/* RESIZE HANDLE (Right) */}
                                                <div 
                                                    className="absolute top-0 bottom-0 right-[-6px] w-6 cursor-ew-resize z-20 hover:bg-white/20 rounded flex items-center justify-center opacity-0 group-hover/audio:opacity-100 touch-none"
                                                    onMouseDown={(e) => handleMouseDown(e, 'resize-audio', track.id, track.duration)}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="w-1 h-4 bg-white shadow-sm rounded-full pointer-events-none"></div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {displayAudioTracks.length === 0 && (
                                    <div 
                                        onClick={() => onAddAudioTrack && onAddAudioTrack('music')}
                                        className="h-10 flex items-center justify-center text-[10px] text-gray-600 border border-dashed border-gray-700 rounded cursor-pointer hover:border-gray-500 hover:text-gray-400 transition-colors"
                                    >
                                        <PlusIcon className="w-3 h-3 mr-1" /> Add Audio Track
                                    </div>
                                )}
                             </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default Timeline;
