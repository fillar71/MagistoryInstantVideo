
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
    onUpdateSegmentDuration?: (id: string, newDuration: number) => void;
    [key: string]: any;
}

const BASE_PIXELS_PER_SECOND = 80; 

type DragMode = 'none' | 'move-segment' | 'resize-segment' | 'move-audio' | 'resize-audio';

interface DragState {
    mode: DragMode;
    itemId: string;
    startX: number;
    initialValue: number; 
    initialSecondValue?: number;
}

const Timeline: React.FC<TimelineProps> = ({ 
    segments, audioTracks = [], activeSegmentId, activeAudioTrackId, setActiveSegmentId, onSelectAudioTrack, timelineZoom, setTimelineZoom, currentTime, isPlaying, onSeek, onSplit, onDelete, onDeleteAudioTrack, onAddSegment, onAddAudioTrack, onUpdateAudioTrack, onUpdateSegmentDuration, onReorder
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    
    // Drag State
    const [dragState, setDragState] = useState<DragState>({ mode: 'none', itemId: '', startX: 0, initialValue: 0 });
    const [tempSegments, setTempSegments] = useState<Segment[] | null>(null); 
    const [tempAudioTracks, setTempAudioTracks] = useState<AudioClip[] | null>(null);

    const pixelsPerSecond = BASE_PIXELS_PER_SECOND * timelineZoom;

    const displaySegments = tempSegments || segments;
    const displayAudioTracks = tempAudioTracks || audioTracks;

    const totalDuration = useMemo(() => displaySegments.reduce((acc, curr) => acc + curr.duration, 0), [displaySegments]);

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


    // --- INPUT HANDLERS (MOUSE & TOUCH) ---

    const startDrag = (clientX: number, mode: DragMode, itemId: string, initialVal: number, initialSecondVal?: number) => {
        setDragState({
            mode,
            itemId,
            startX: clientX,
            initialValue: initialVal,
            initialSecondValue: initialSecondVal
        });
        setTempSegments(segments);
        setTempAudioTracks(audioTracks);
    }

    const handleMouseDown = (e: React.MouseEvent, mode: DragMode, itemId: string, initialVal: number, initialSecondVal?: number) => {
        e.stopPropagation();
        startDrag(e.clientX, mode, itemId, initialVal, initialSecondVal);
    };

    const handleTouchStart = (e: React.TouchEvent, mode: DragMode, itemId: string, initialVal: number, initialSecondVal?: number) => {
        e.stopPropagation();
        startDrag(e.touches[0].clientX, mode, itemId, initialVal, initialSecondVal);
    };

    useEffect(() => {
        const moveHandler = (clientX: number) => {
            if (dragState.mode === 'none') return;

            const deltaPixels = clientX - dragState.startX;
            const deltaSeconds = deltaPixels / pixelsPerSecond;

            if (dragState.mode === 'move-audio') {
                const newStartTime = Math.max(0, dragState.initialValue + deltaSeconds);
                setTempAudioTracks(prev => prev ? prev.map(t => t.id === dragState.itemId ? { ...t, startTime: newStartTime } : t) : []);
            } 
            else if (dragState.mode === 'resize-audio') {
                const newDuration = Math.max(0.5, dragState.initialValue + deltaSeconds);
                setTempAudioTracks(prev => prev ? prev.map(t => t.id === dragState.itemId ? { ...t, duration: newDuration } : t) : []);
            }
            else if (dragState.mode === 'resize-segment') {
                const newDuration = Math.max(0.5, dragState.initialValue + deltaSeconds);
                setTempSegments(prev => prev ? prev.map(s => s.id === dragState.itemId ? { ...s, duration: newDuration } : s) : []);
            }
            else if (dragState.mode === 'move-segment') {
                if (!timelineRef.current || !scrollContainerRef.current) return;
                
                const scrollLeft = scrollContainerRef.current.scrollLeft;
                const containerRect = timelineRef.current.getBoundingClientRect();
                const relativeX = (clientX - containerRect.left + scrollLeft);
                
                const currentList = tempSegments || segments;
                
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
                
                const currentIndex = currentList.findIndex(s => s.id === dragState.itemId);
                if (currentIndex !== -1 && currentIndex !== hoverIndex) {
                    const newOrder = [...currentList];
                    const [moved] = newOrder.splice(currentIndex, 1);
                    newOrder.splice(hoverIndex, 0, moved);
                    setTempSegments(newOrder);
                }
            }
        };

        const upHandler = () => {
            if (dragState.mode === 'none') return;

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

            setDragState({ mode: 'none', itemId: '', startX: 0, initialValue: 0 });
            setTempSegments(null);
            setTempAudioTracks(null);
        };

        const mouseMove = (e: MouseEvent) => moveHandler(e.clientX);
        const touchMove = (e: TouchEvent) => moveHandler(e.touches[0].clientX);

        if (dragState.mode !== 'none') {
            window.addEventListener('mousemove', mouseMove);
            window.addEventListener('mouseup', upHandler);
            window.addEventListener('touchmove', touchMove, { passive: false });
            window.addEventListener('touchend', upHandler);
        }

        return () => {
            window.removeEventListener('mousemove', mouseMove);
            window.removeEventListener('mouseup', upHandler);
            window.removeEventListener('touchmove', touchMove);
            window.removeEventListener('touchend', upHandler);
        };
    }, [dragState, pixelsPerSecond, onUpdateAudioTrack, onUpdateSegmentDuration, onReorder, segments, audioTracks, tempSegments, tempAudioTracks]);


    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (dragState.mode !== 'none') return;
        
        if (!scrollContainerRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const clickX = e.clientX - rect.left + scrollLeft - 20; 
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
            <div className="h-10 border-b border-white/5 flex items-center justify-between px-2 bg-[#1a1a1a] text-xs text-gray-400 select-none flex-shrink-0 z-30">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onSplit}
                        className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 rounded text-gray-300 hover:text-white transition-colors disabled:opacity-30"
                        disabled={!activeSegmentId}
                    >
                        <ScissorsIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Split</span>
                    </button>
                    <button 
                        onClick={handleDelete}
                        className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 rounded text-gray-300 hover:text-red-400 transition-colors disabled:opacity-30"
                        disabled={!activeSegmentId && !activeAudioTrackId}
                    >
                        <TrashIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Delete</span>
                    </button>
                    <span className="font-mono text-white text-[10px] ml-2">{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                    <button onClick={() => setTimelineZoom(z => Math.max(0.5, z-0.2))} className="hover:bg-white/10 w-8 h-8 rounded flex items-center justify-center text-lg">-</button>
                    <button onClick={() => setTimelineZoom(z => Math.min(3, z+0.2))} className="hover:bg-white/10 w-8 h-8 rounded flex items-center justify-center text-lg">+</button>
                </div>
            </div>

            <div 
                ref={scrollContainerRef}
                className="overflow-x-auto overflow-y-auto custom-scrollbar flex-grow relative touch-pan-x"
                onMouseDown={handleTimelineClick}
            >
                <div 
                    ref={timelineRef}
                    className="relative min-h-full pb-20"
                    style={{ width: `${Math.max(window.innerWidth, totalDuration * pixelsPerSecond + 800)}px`, paddingLeft: '20px' }}
                >
                    {/* Time Ruler */}
                    <div className="h-6 bg-[#1a1a1a] border-b border-white/5 sticky top-0 z-30 flex items-end pointer-events-none">
                        {Array.from({ length: Math.ceil(totalDuration) + 10 }).map((_, i) => (
                            <div key={i} className="relative h-3 border-l border-gray-600" style={{ width: `${pixelsPerSecond}px` }}>
                                <span className="absolute -top-3.5 -left-1 text-[9px] text-gray-500 font-mono">{i}s</span>
                            </div>
                        ))}
                    </div>

                    {/* Playhead */}
                    <div 
                        className="absolute top-0 bottom-0 z-50 pointer-events-none border-l border-purple-500 w-0"
                        style={{ left: `${(currentTime * pixelsPerSecond) + 20}px` }}
                    >
                        <div className="w-4 h-4 bg-purple-500 -ml-[8px] rotate-45 transform -mt-1.5 shadow-sm border border-white/20"></div>
                        <div className="absolute top-0 bottom-0 -ml-px w-[1px] bg-purple-500/50"></div>
                    </div>

                    {/* TRACKS */}
                    <div className="pt-4 px-1 space-y-6">
                        
                        {/* VIDEO TRACK */}
                        <div className="relative">
                            <div className="text-[9px] font-bold text-gray-500 mb-1 ml-1 tracking-wider uppercase flex items-center gap-2">
                                <div className="w-3 h-3 bg-gray-700 rounded-sm flex items-center justify-center text-[7px]">V</div> Video Track
                            </div>
                            <div className="flex h-16 bg-[#121212] rounded-lg border border-white/5 relative overflow-hidden items-center">
                                {displaySegments.map((segment, index) => {
                                    const width = segment.duration * pixelsPerSecond;
                                    const isActive = segment.id === activeSegmentId;
                                    const isDragging = dragState.itemId === segment.id && dragState.mode === 'move-segment';
                                    const missingAudio = segment.narration_text && !segment.audioUrl;

                                    return (
                                        <div
                                            key={segment.id}
                                            style={{ width }}
                                            className={`relative flex-shrink-0 h-full overflow-visible border-r border-black/50 group/clip select-none
                                                ${isActive ? 'ring-2 ring-purple-400 z-20 brightness-110' : 'brightness-75 opacity-90'}
                                                ${isDragging ? 'opacity-50 cursor-grabbing z-30' : 'cursor-grab'}
                                            `}
                                            onMouseDown={(e) => handleMouseDown(e, 'move-segment', segment.id, index)}
                                            onTouchStart={(e) => handleTouchStart(e, 'move-segment', segment.id, index)}
                                            onClick={(e) => { e.stopPropagation(); setActiveSegmentId(segment.id); }}
                                        >
                                            <div className="absolute inset-0 flex bg-gray-800 overflow-hidden rounded-sm pointer-events-none">
                                                <img src={segment.media[0].url} className="h-full w-full object-cover opacity-60" loading="lazy" />
                                            </div>
                                            
                                            {missingAudio && (
                                                <div className="absolute top-1 right-1 z-30 bg-red-600 rounded-full p-1 w-4 h-4 flex items-center justify-center">!</div>
                                            )}
                                            
                                            <div className="absolute bottom-0 left-0 right-0 h-4 bg-black/70 flex items-center px-1 border-t border-white/5 pointer-events-none">
                                                <span className="text-[9px] truncate text-gray-300">{segment.narration_text || 'Video Clip'}</span>
                                            </div>

                                            {/* RESIZE HANDLE */}
                                            <div 
                                                className="absolute top-0 bottom-0 right-[-8px] w-6 z-20 hover:bg-purple-500/20 flex items-center justify-center touch-none cursor-ew-resize"
                                                onMouseDown={(e) => handleMouseDown(e, 'resize-segment', segment.id, segment.duration)}
                                                onTouchStart={(e) => handleTouchStart(e, 'resize-segment', segment.id, segment.duration)}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="w-1 h-8 bg-white/50 rounded-full"></div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onAddSegment && onAddSegment(); }}
                                    className="flex-shrink-0 w-12 h-full bg-[#1e1e1e] hover:bg-[#252525] flex items-center justify-center text-gray-500 border-l border-white/5 ml-1"
                                >
                                    <PlusIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* AUDIO TRACKS */}
                        <div>
                             <div className="text-[9px] font-bold text-gray-500 mb-1 ml-1 tracking-wider uppercase flex items-center justify-between pr-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-gray-700 rounded-sm flex items-center justify-center text-[7px] text-teal-400"><MusicIcon className="w-2 h-2" /></div> Audio Tracks
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => onAddAudioTrack && onAddAudioTrack('music')} className="text-teal-500 hover:text-white px-1 border border-teal-500/30 rounded text-[9px]">+ Music</button>
                                    <button onClick={() => onAddAudioTrack && onAddAudioTrack('sfx')} className="text-orange-500 hover:text-white px-1 border border-orange-500/30 rounded text-[9px]">+ SFX</button>
                                </div>
                             </div>
                             <div className="space-y-1 min-h-[50px] bg-[#121212] rounded-lg border border-white/5 p-1 relative">
                                {displayAudioTracks.map((track) => {
                                    const isActive = track.id === activeAudioTrackId;
                                    return (
                                        <div 
                                            key={track.id} 
                                            className="h-8 bg-[#1e1e1e] relative rounded border border-white/5 overflow-visible"
                                        >
                                            <div 
                                                className={`absolute top-0 bottom-0 flex items-center px-2 overflow-visible border rounded-sm cursor-grab active:cursor-grabbing group/audio touch-none
                                                    ${track.type === 'music' ? 'bg-teal-900/60 border-teal-600' : 'bg-orange-900/60 border-orange-600'}
                                                    ${isActive ? 'ring-1 ring-white' : ''}
                                                `}
                                                style={{ 
                                                    left: `${track.startTime * pixelsPerSecond}px`,
                                                    width: `${track.duration * pixelsPerSecond}px`
                                                }}
                                                onMouseDown={(e) => handleMouseDown(e, 'move-audio', track.id, track.startTime)}
                                                onTouchStart={(e) => handleTouchStart(e, 'move-audio', track.id, track.startTime)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onSelectAudioTrack) onSelectAudioTrack(track.id);
                                                }}
                                            >
                                                <Waveform width={track.duration * pixelsPerSecond} height={32} color={track.type === 'music' ? '#2dd4bf' : '#fb923c'} seedId={track.id} type={track.type} />
                                                <div className="absolute inset-0 flex items-center px-1 pointer-events-none">
                                                    <span className="text-[8px] text-white truncate drop-shadow-md">{track.name}</span>
                                                </div>

                                                <div 
                                                    className="absolute top-0 bottom-0 right-[-6px] w-6 cursor-ew-resize z-20 flex items-center justify-center"
                                                    onMouseDown={(e) => handleMouseDown(e, 'resize-audio', track.id, track.duration)}
                                                    onTouchStart={(e) => handleTouchStart(e, 'resize-audio', track.id, track.duration)}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="w-1 h-4 bg-white/50 rounded-full"></div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                             </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default Timeline;
