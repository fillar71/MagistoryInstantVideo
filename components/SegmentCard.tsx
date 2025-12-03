
import React from 'react';
import type { Segment } from '../types';
import { MusicIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

interface SegmentCardProps {
    segment: Segment;
    isActive: boolean;
    onClick: () => void;
    onNudgeLeft: (e: React.MouseEvent) => void;
    onNudgeRight: (e: React.MouseEvent) => void;
    onUpdateVolume: (id: string, vol: number) => void;
    isFirst: boolean;
    isLast: boolean;
    widthPx?: number; // Optional width prop for responsive decisions
}

const SegmentCard: React.FC<SegmentCardProps> = ({ 
    segment, isActive, onClick, onNudgeLeft, onNudgeRight, 
    onUpdateVolume, isFirst, isLast, widthPx = 160 
}) => {
    // Cleaner active state: purple border vs faint gray border
    const activeClasses = isActive 
        ? 'ring-2 ring-purple-500 z-10 border-transparent shadow-lg shadow-purple-900/50' 
        : 'border border-white/10 hover:border-white/30';
        
    const thumbnailMedia = segment.media[0];
    
    // Hide controls if segment is too narrow (less than 80px)
    const isCompact = widthPx < 100;
    const isTiny = widthPx < 60;

    const NudgeButton: React.FC<{onClick: (e: React.MouseEvent) => void, children: React.ReactNode, position: 'left' | 'right', title: string}> = ({onClick, children, position, title}) => (
        <button
            onClick={onClick}
            title={title}
            className={`absolute top-0 bottom-0 ${position === 'left' ? 'left-0' : 'right-0'} z-30 w-4 bg-black/60 hover:bg-purple-600/90 flex items-center justify-center text-white transition-colors opacity-0 group-hover:opacity-100 backdrop-blur-sm`}
        >
            {children}
        </button>
    );

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        onUpdateVolume(segment.id, parseFloat(e.target.value));
    }

    return (
        <div 
            onClick={onClick}
            className={`w-full h-full bg-[#18181b] overflow-hidden cursor-pointer relative group transition-all duration-100 ${activeClasses}`}
        >
             {thumbnailMedia && (thumbnailMedia.type === 'video' ? (
                <video 
                    src={thumbnailMedia.url}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    muted
                    playsInline
                />
            ) : (
                <img src={thumbnailMedia.url} alt={segment.search_keywords_for_media} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"/>
            ))}
            
            {/* Selection Overlay */}
            <div className={`absolute inset-0 transition-colors pointer-events-none ${isActive ? 'bg-purple-500/10' : 'bg-transparent'}`}></div>
            
            {/* Nudge Controls */}
            {isActive && !isCompact && (
                <>
                    {!isFirst && (
                       <NudgeButton onClick={onNudgeLeft} position="left" title="Swap Left">
                           <ChevronLeftIcon className="w-2.5 h-2.5" />
                       </NudgeButton>
                    )}
                    {!isLast && (
                        <NudgeButton onClick={onNudgeRight} position="right" title="Swap Right">
                           <ChevronRightIcon className="w-2.5 h-2.5" />
                       </NudgeButton>
                    )}
                </>
            )}
            
             {/* Duration Badge */}
             <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-md px-1 rounded text-[9px] font-mono text-white z-10 border border-white/10 pointer-events-none">
                {segment.duration}s
            </div>
            
            {/* Clip Count */}
            {segment.media.length > 1 && !isTiny && (
                <div className="absolute top-1 left-1 bg-purple-600 px-1.5 rounded text-[8px] font-bold text-white z-10 shadow-sm uppercase tracking-wider">
                    {segment.media.length} CLIPS
                </div>
            )}

            {/* Audio Volume Slider - Visible on Hover or Active */}
            {segment.audioUrl && !isCompact && (
                <div 
                    className={`absolute top-7 right-1 z-20 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm rounded-full pl-2 pr-2 py-1 border border-white/10 transition-all duration-200 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'}`}
                    onClick={(e) => e.stopPropagation()} 
                >
                    <MusicIcon className="w-3 h-3 text-purple-400" />
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.1" 
                        value={segment.audioVolume ?? 1} 
                        onChange={handleVolumeChange}
                        className="w-12 h-1 accent-purple-500 cursor-pointer appearance-none bg-gray-600 rounded-lg"
                        title={`Volume: ${Math.round((segment.audioVolume ?? 1) * 100)}%`}
                    />
                </div>
            )}
             
             {/* Audio Indicator for tiny segments */}
             {segment.audioUrl && isCompact && (
                 <div className="absolute top-5 right-1 w-1.5 h-1.5 rounded-full bg-purple-500 ring-1 ring-black"></div>
             )}

             {/* Narration Text Preview */}
             {!isTiny && (
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black via-black/80 to-transparent px-2 flex items-center">
                    <p className="text-gray-300 text-[9px] truncate w-full leading-tight font-medium">
                        {segment.narration_text || <span className="italic text-gray-500">No narration</span>}
                    </p>
                </div>
             )}
        </div>
    );
};

export default SegmentCard;
