
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
}

const SegmentCard: React.FC<SegmentCardProps> = ({ segment, isActive, onClick, onNudgeLeft, onNudgeRight, onUpdateVolume, isFirst, isLast }) => {
    const activeClasses = isActive ? 'ring-2 ring-purple-500 shadow-lg' : 'ring-1 ring-gray-700';
    
    // Use the first media clip for the thumbnail
    const thumbnailMedia = segment.media[0];

    const NudgeButton: React.FC<{onClick: (e: React.MouseEvent) => void, children: React.ReactNode, position: 'left' | 'right', title: string}> = ({onClick, children, position, title}) => (
        <button
            onClick={onClick}
            title={title}
            className={`absolute top-1/2 -translate-y-1/2 ${position === 'left' ? 'left-1' : 'right-1'} z-20 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-purple-600 transition-colors opacity-0 group-hover:opacity-100`}
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
            className={`w-full h-full bg-gray-700 rounded-md overflow-hidden cursor-pointer relative group transition-all duration-200 ${activeClasses}`}
        >
             {thumbnailMedia && (thumbnailMedia.type === 'video' ? (
                <video 
                    src={thumbnailMedia.url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                />
            ) : (
                <img src={thumbnailMedia.url} alt={segment.search_keywords_for_media} className="w-full h-full object-cover"/>
            ))}
            <div className="absolute inset-0 bg-black bg-opacity-50 group-hover:bg-opacity-30 transition-all"></div>
            
            {isActive && (
                <>
                    {!isFirst && (
                       <NudgeButton onClick={onNudgeLeft} position="left" title="Nudge Left">
                           <ChevronLeftIcon className="w-4 h-4" />
                       </NudgeButton>
                    )}
                    {!isLast && (
                        <NudgeButton onClick={onNudgeRight} position="right" title="Nudge Right">
                           <ChevronRightIcon className="w-4 h-4" />
                       </NudgeButton>
                    )}
                </>
            )}
            
             {/* Duration Badge */}
             <div className="absolute top-1.5 right-1.5 bg-black/60 px-1.5 rounded text-[10px] font-mono text-white z-10 border border-gray-600">
                {segment.duration}s
            </div>
            
            {/* Multiple Clips Indicator */}
            {segment.media.length > 1 && (
                <div className="absolute top-1.5 left-1.5 bg-purple-600/80 px-1.5 rounded text-[10px] font-bold text-white z-10">
                    {segment.media.length} clips
                </div>
            )}

            {segment.audioUrl && (
                <div className="absolute top-8 right-1.5 z-10 group/audio w-6 hover:w-24 transition-all duration-300 flex items-center justify-end">
                    <div className="bg-black/60 p-1 rounded-full relative flex items-center gap-2 overflow-hidden">
                         <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.1" 
                            value={segment.audioVolume ?? 1} 
                            onChange={handleVolumeChange}
                            className="w-16 h-1.5 accent-purple-500 hidden group-hover/audio:block"
                         />
                        <MusicIcon className="w-4 h-4 text-purple-300 flex-shrink-0" />
                    </div>
                </div>
            )}

             {thumbnailMedia?.type === 'video' && segment.media.length === 1 && (
                <div className="absolute top-1.5 left-1.5 bg-black/50 p-1 rounded-full">
                    <PlayIcon className="w-4 h-4 text-white"/>
                </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white text-xs truncate">
                    {segment.narration_text}
                </p>
            </div>
        </div>
    );
};

export default SegmentCard;
