
import React, { useMemo, useRef, useState } from 'react';
import type { Segment, TransitionEffect } from '../types';
import SegmentCard from './SegmentCard';
import TransitionPicker from './TransitionPicker';
import { MusicIcon, VolumeXIcon, EditIcon } from './icons';

interface TimelineProps {
    segments: Segment[];
    onReorder: (newSegments: Segment[]) => void;
    activeSegmentId: string | null;
    setActiveSegmentId: (id: string) => void;
    onUpdateTransition: (segmentId: string, newTransition: TransitionEffect) => void;
    onUpdateVolume: (segmentId: string, newVolume: number) => void;
    timelineZoom: number;
    onNudgeSegment: (segmentId: string, direction: 'left' | 'right') => void;
    onAddSegment: () => void;
}

const BASE_PIXELS_PER_SECOND = 60;

const Timeline: React.FC<TimelineProps> = ({ 
    segments, 
    onReorder, 
    activeSegmentId, 
    setActiveSegmentId, 
    onUpdateTransition, 
    onUpdateVolume, 
    timelineZoom, 
    onNudgeSegment,
    onAddSegment
}) => {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const pixelsPerSecond = BASE_PIXELS_PER_SECOND * timelineZoom;

    const totalDuration = useMemo(() => {
        return segments.reduce((acc, curr) => acc + curr.duration, 0);
    }, [segments]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("draggedSegmentIndex", index.toString());
        const el = e.currentTarget;
        el.style.opacity = '0.5';
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.style.opacity = '1';
        setDraggedIndex(null);
    }

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        const draggedIdxStr = e.dataTransfer.getData("draggedSegmentIndex");
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
        e.dataTransfer.dropEffect = "move";
    };

    // Generate Time Ruler Marks
    const rulerMarks = [];
    const rulerStep = 2; // More granular marks
    for (let i = 0; i <= totalDuration; i += rulerStep) {
        rulerMarks.push(i);
    }

    // Track height constants
    const VIDEO_TRACK_HEIGHT = 96; // h-24
    const AUDIO_TRACK_HEIGHT = 32; // h-8
    
    // Cover Image logic
    const coverImage = segments.length > 0 && segments[0].media.length > 0 ? segments[0].media[0].url : null;

    return (
        <div className="flex h-full w-full overflow-hidden bg-black text-white rounded-lg select-none font-sans">
            
            {/* LEFT SIDEBAR (Fixed) */}
            <div className="w-28 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900/50 z-20">
                {/* Mute Control */}
                <div className="h-16 flex flex-col items-center justify-center border-b border-gray-800 cursor-pointer hover:bg-gray-800 text-gray-400 hover:text-white">
                     <VolumeXIcon className="w-5 h-5 mb-1" />
                     <span className="text-[10px]">Bisukan audio</span>
                </div>

                {/* Cover Image Area (Aligns roughly with video track start or just distinct) */}
                <div className="h-32 p-2 flex flex-col items-center justify-center border-b border-gray-800">
                    <div className="w-16 h-16 rounded-lg bg-gray-800 relative overflow-hidden group cursor-pointer border border-gray-700">
                        {coverImage ? (
                            <img src={coverImage} alt="Cover" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                        ) : (
                            <div className="w-full h-full bg-gray-800" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <EditIcon className="w-4 h-4 text-white" />
                        </div>
                    </div>
                    <span className="text-[10px] mt-1 text-gray-300">Sampul</span>
                </div>

                {/* Track Labels */}
                <div className="flex-grow flex flex-col justify-start pt-2 gap-1">
                    {/* Spacers to align with visual tracks on the right */}
                    <div className="h-2"></div> 
                    
                    <div className="h-8 flex items-center justify-end px-3">
                        <span className="text-xs font-medium text-purple-400 tracking-wide">Narration</span>
                    </div>
                    <div className="h-8 flex items-center justify-end px-3">
                        <span className="text-xs font-medium text-purple-400 tracking-wide">Music</span>
                    </div>
                </div>
            </div>

            {/* RIGHT SCROLLABLE AREA */}
            <div 
                ref={scrollContainerRef}
                className="flex-grow overflow-x-auto overflow-y-hidden relative custom-scrollbar bg-[#121212]"
            >
                 {/* Time Ruler */}
                <div 
                    className="absolute top-0 left-0 h-5 flex items-end text-[9px] text-gray-500 font-mono border-b border-gray-800 w-full z-10 bg-[#121212]"
                    style={{ width: `${Math.max(totalDuration * pixelsPerSecond + 200, 1000)}px` }} 
                >
                    {rulerMarks.map(time => (
                        <div 
                            key={time} 
                            className="absolute bottom-0 border-l border-gray-700 pl-1"
                            style={{ left: `${time * pixelsPerSecond}px`, height: '40%' }}
                        >
                            {time % 10 === 0 ? new Date(time * 1000).toISOString().substr(15, 4) : ''}
                        </div>
                    ))}
                </div>

                {/* Tracks Container */}
                <div 
                    className="flex flex-col pt-6 pl-2"
                    style={{ width: `${totalDuration * pixelsPerSecond + 300}px` }}
                >
                    {/* VIDEO TRACK */}
                    <div className="flex items-center relative h-24 mb-4">
                        {segments.map((segment, index) => {
                            const segmentWidth = segment.duration * pixelsPerSecond;
                            const isDragging = index === draggedIndex;
                            
                            return (
                                <div
                                    key={segment.id}
                                    className={`relative flex-shrink-0 h-[80px] group ${isDragging ? 'opacity-50' : ''}`}
                                    style={{ width: `${segmentWidth}px`, minWidth: '30px' }}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDrop={(e) => handleDrop(e, index)}
                                    onDragOver={handleDragOver}
                                >
                                    {/* Segment Card (Video Thumbnail) */}
                                    <div className="absolute inset-y-0 left-0 right-[2px] rounded-md overflow-hidden ring-1 ring-gray-700 bg-gray-800">
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
                                            className="absolute top-1/2 -right-3 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center"
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
                            className="flex-shrink-0 w-12 h-12 ml-4 flex items-center justify-center bg-white rounded-lg cursor-pointer hover:bg-gray-200 shadow-lg transition-transform hover:scale-105"
                        >
                            <span className="text-2xl text-black font-bold">+</span>
                        </div>
                    </div>

                    {/* NARRATION TRACK (Generated Audio) */}
                    <div className="flex items-center h-8 mb-1 relative">
                        {segments.map((segment) => {
                            const width = segment.duration * pixelsPerSecond;
                            const isGenerated = segment.audioUrl?.startsWith('blob:');
                            
                            return (
                                <div key={`narration-${segment.id}`} style={{ width }} className="flex-shrink-0 pr-[2px] h-full">
                                    {segment.audioUrl && isGenerated ? (
                                        <div 
                                            className="h-full bg-purple-900/80 border border-purple-500 rounded-md flex items-center px-2 cursor-pointer hover:bg-purple-800 overflow-hidden relative"
                                            onClick={() => setActiveSegmentId(segment.id)}
                                            title="AI Narration"
                                        >
                                            <span className="text-[9px] text-purple-100 truncate relative z-10">AI Voice</span>
                                            {/* Fake Waveform */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-30 gap-0.5">
                                                {[...Array(8)].map((_,i) => <div key={i} className="w-0.5 bg-white h-3 rounded-full"></div>)}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full"></div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* MUSIC TRACK (Uploaded/External Audio) */}
                    <div className="flex items-center h-8 mb-1 relative">
                        {segments.map((segment) => {
                            const width = segment.duration * pixelsPerSecond;
                            const isGenerated = segment.audioUrl?.startsWith('blob:');
                            const hasAudio = !!segment.audioUrl;
                            // If it has audio but NOT generated, we assume it's music/uploaded
                            const isMusic = hasAudio && !isGenerated;

                            return (
                                <div key={`music-${segment.id}`} style={{ width }} className="flex-shrink-0 pr-[2px] h-full">
                                    {isMusic ? (
                                        <div 
                                            className="h-full bg-teal-900/80 border border-teal-500 rounded-md flex items-center px-2 cursor-pointer hover:bg-teal-800 overflow-hidden relative"
                                            onClick={() => setActiveSegmentId(segment.id)}
                                            title={segment.audioUrl?.split('/').pop()}
                                        >
                                            <MusicIcon className="w-3 h-3 text-teal-200 mr-1 z-10" />
                                            <span className="text-[9px] text-teal-100 truncate relative z-10 max-w-full">Music</span>
                                             {/* Fake Waveform */}
                                             <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-teal-500/20 to-transparent"></div>
                                        </div>
                                    ) : (
                                        <div className="h-full"></div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
                
                {/* Vertical Playhead Line (Centerish visually, or just static guide) */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20 pointer-events-none z-30 hidden"></div>

            </div>
        </div>
    );
};

export default Timeline;
