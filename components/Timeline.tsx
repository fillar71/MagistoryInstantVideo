
import React from 'react';
import type { Segment, TransitionEffect } from '../types';
import SegmentCard from './SegmentCard';
import TransitionPicker from './TransitionPicker';

interface TimelineProps {
    segments: Segment[];
    onReorder: (newSegments: Segment[]) => void;
    activeSegmentId: string | null;
    setActiveSegmentId: (id: string) => void;
    onUpdateTransition: (segmentId: string, newTransition: TransitionEffect) => void;
    onUpdateVolume: (segmentId: string, newVolume: number) => void;
    timelineZoom: number;
    onNudgeSegment: (segmentId: string, direction: 'left' | 'right') => void;
}

const Timeline: React.FC<TimelineProps> = ({ segments, onReorder, activeSegmentId, setActiveSegmentId, onUpdateTransition, onUpdateVolume, timelineZoom, onNudgeSegment }) => {
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.dataTransfer.setData("draggedSegmentIndex", index.toString());
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        const draggedIndex = parseInt(e.dataTransfer.getData("draggedSegmentIndex"));
        const newSegments = [...segments];
        const [draggedSegment] = newSegments.splice(draggedIndex, 1);
        newSegments.splice(dropIndex, 0, draggedSegment);
        onReorder(newSegments);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const cardWidth = 160 * timelineZoom;

    return (
        <div className="flex items-center gap-2 overflow-x-auto h-full pb-2">
            {segments.map((segment, index) => (
               <React.Fragment key={segment.id}>
                    <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragOver={handleDragOver}
                        className="h-full flex-shrink-0"
                        style={{ width: `${cardWidth}px` }}
                    >
                        <SegmentCard 
                            segment={segment}
                            isActive={segment.id === activeSegmentId}
                            onClick={() => setActiveSegmentId(segment.id)}
                            onNudgeLeft={(e) => { e.stopPropagation(); onNudgeSegment(segment.id, 'left'); }}
                            onNudgeRight={(e) => { e.stopPropagation(); onNudgeSegment(segment.id, 'right'); }}
                            onUpdateVolume={onUpdateVolume}
                            isFirst={index === 0}
                            isLast={index === segments.length - 1}
                        />
                    </div>
                    {index < segments.length - 1 && (
                        <TransitionPicker 
                            currentTransition={segment.transition || 'fade'}
                            onSelect={(newTransition) => onUpdateTransition(segment.id, newTransition)}
                        />
                    )}
               </React.Fragment>
            ))}
            <div className="flex-shrink-0 w-24 h-full flex items-center justify-center bg-gray-700 rounded-md border-2 border-dashed border-gray-600 hover:border-purple-500 cursor-pointer transition-colors">
                <span className="text-3xl text-gray-500">+</span>
            </div>
        </div>
    );
};

export default Timeline;
