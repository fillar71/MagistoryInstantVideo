
import React from 'react';
import type { Segment } from '../types';
import { MusicIcon, PlayIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

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
    const activeClasses = isActive ? 'ring-2 ring-purple-500 z-10' : 'ring-1 ring-gray-700 hover:ring-gray-500';
    const thumbnailMedia = segment.media[0];
    
    // Hide controls if segment is too narrow (less than 80px)
    const isCompact = widthPx < 100;
    const isTiny = widthPx < 60;

    const NudgeButton: React.FC<{onClick: (e: React.MouseEvent) => void, children: React.ReactNode, position: 'left' | 'right', title: string}> = ({onClick, children, position, title}) => (
        <button
            onClick={onClick}
            title={title}
            className={`absolute top-1/2 -translate-y-1/2 ${position === 'left' ? 'left-0' : 'right-0'} z-30 w-5 h-12 bg-black/60 hover:bg-purple-600/90 flex items-center justify-center text-white transition-colors opacity-0 group-hover:opacity-100`}
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
            className={`w-full h-full bg-gray-800 rounded-md overflow-hidden cursor-pointer relative group transition-all duration-100 ${activeClasses}`}
        >
             {thumbnailMedia && (thumbnailMedia.type === 'video' ? (
                <video 
                    src={thumbnailMedia.url}
                    className="w-full h-full object-cover opacity-80"
                    muted
                    playsInline
                />
            ) : (
                <img src={thumbnailMedia.url} alt={segment.search_keywords_for_media} className="w-full h-full object-cover opacity-80"/>
            ))}
            
            {/* Selection Overlay */}
            <div className={`absolute inset-0 transition-colors ${isActive ? 'bg-purple-500/10' : 'bg-black/20 group-hover:bg-transparent'}`}></div>
            
            {/* Nudge Controls (Only if width permits) */}
            {isActive && !isCompact && (
                <>
                    {!isFirst && (
                       <NudgeButton onClick={onNudgeLeft} position="left" title="Swap Left">
                           <ChevronLeftIcon className="w-3 h-3" />
                       </NudgeButton>
                    )}
                    {!isLast && (
                        <NudgeButton onClick={onNudgeRight} position="right" title="Swap Right">
                           <ChevronRightIcon className="w-3 h-3" />
                       </NudgeButton>
                    )}
                </>
            )}
            
             {/* Duration Badge */}
             <div className="absolute top-1 right-1 bg-black/70 px-1 rounded text-[9px] font-mono text-white z-10 border border-gray-600 pointer-events-none">
                {segment.duration}s
            </div>
            
            {/* Clip Count */}
            {segment.media.length > 1 && !isTiny && (
                <div className="absolute top-1 left-1 bg-purple-600/90 px-1.5 rounded text-[9px] font-bold text-white z-10 shadow-sm">
                    {segment.media.length} clips
                </div>
            )}

            {/* Audio Control */}
            {segment.audioUrl && !isCompact && (
                <div className="absolute top-6 right-1 z-10 group/audio flex flex-col items-end">
                    <div className="bg-black/70 p-1 rounded-full hover:w-24 hover:rounded-md transition-all duration-200 flex items-center gap-2 w-6 h-6 overflow-hidden group-hover/audio:bg-gray-900">
                        <MusicIcon className="w-3 h-3 text-purple-300 flex-shrink-0 mx-auto" />
                         <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.1" 
                            value={segment.audioVolume ?? 1} 
                            onClick={(e) => e.stopPropagation()}
                            onChange={handleVolumeChange}
                            className="w-16 h-1.5 accent-purple-500"
                         />
                    </div>
                </div>
            )}
             
             {/* Audio Indicator for tiny segments */}
             {segment.audioUrl && isCompact && (
                 <div className="absolute top-5 right-1 w-2 h-2 rounded-full bg-purple-500"></div>
             )}

             {/* Narration Text Preview (Waveform placeholder style) */}
             {!isTiny && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1 flex items-end">
                    <p className="text-white text-[10px] truncate w-full leading-tight opacity-90">
                        {segment.narration_text || <span className="italic text-gray-400">No text</span>}
                    </p>
                </div>
             )}
        </div>
    );
};

export default SegmentCard;
