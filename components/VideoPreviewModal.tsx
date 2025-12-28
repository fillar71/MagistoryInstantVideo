
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Segment, TextOverlayStyle } from '../types';
import { generateSubtitleChunks, estimateWordTimings } from '../utils/media';

interface DisplaySegment extends Segment {
  animationState: 'enter' | 'exit' | 'stable';
}

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  segments: Segment[];
}

const TRANSITION_DURATION_MS = 700;

const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({ isOpen, onClose, title, segments }) => {
  const [displaySegments, setDisplaySegments] = useState<DisplaySegment[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentTimeInSegment, setCurrentTimeInSegment] = useState(0);
  
  const timerRef = useRef<number | null>(null);
  const progressRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const getAnimationClass = (segment: DisplaySegment): string => {
    if (segment.animationState === 'stable') return 'opacity-100';
    const effect = (segments[currentIndexRef.current - 1]?.transition || 'fade');
    return `${effect}-${segment.animationState}`;
  };
  
  const playAudioForSegment = (segment: Segment | null) => {
    if (audioRef.current) {
        if (segment?.audioUrl) {
            (audioRef.current as any).src = segment.audioUrl;
            (audioRef.current as any).volume = segment.audioVolume ?? 1.0;
            (audioRef.current as any).play().catch(e => console.error("Audio play failed:", e));
        } else {
            (audioRef.current as any).pause();
            (audioRef.current as any).src = '';
        }
    }
  };

  const scheduleNextSegment = () => {
    const currentSegment = segments[currentIndexRef.current];
    if (!currentSegment) return;

    const durationMs = currentSegment.duration * 1000;
    let startTime = Date.now();

    const intervalId = (window as any).setInterval(() => {
        const delta = (Date.now() - startTime) / 1000;
        setCurrentTimeInSegment(delta);
    }, 50);

    timerRef.current = (window as any).setTimeout(() => {
        (window as any).clearInterval(intervalId);
        setCurrentTimeInSegment(0);

        if (currentIndexRef.current >= segments.length - 1) {
            if (audioRef.current) (audioRef.current as any).pause();
            return;
        }
        
        playAudioForSegment(null);

        const outgoingSegment = segments[currentIndexRef.current];
        const incomingSegment = segments[currentIndexRef.current + 1];
        
        setDisplaySegments([
            { ...outgoingSegment, animationState: 'exit' },
            { ...incomingSegment, animationState: 'enter' },
        ]);

        currentIndexRef.current += 1;
        playAudioForSegment(incomingSegment);

        setTimeout(() => {
            setDisplaySegments(prev => 
                prev.filter(s => s.id === incomingSegment.id)
                    .map(s => ({ ...s, animationState: 'stable' }))
            );
        }, TRANSITION_DURATION_MS);

        scheduleNextSegment();

    }, durationMs);
  }

  useEffect(() => {
    if (isOpen && segments.length > 0) {
      currentIndexRef.current = 0;
      const firstSegment = segments[0];
      setDisplaySegments([{ ...firstSegment, animationState: 'stable' }]);
      setProgress(0);
      setCurrentTimeInSegment(0);
      playAudioForSegment(firstSegment);
      
      scheduleNextSegment();

      const totalDurationMs = segments.reduce((acc, seg) => acc + (seg.duration * 1000), 0);
      const startTime = Date.now();
      
      progressRef.current = (window as any).setInterval(() => {
          const elapsedTime = Date.now() - startTime;
          const newProgress = Math.min(100, (elapsedTime / totalDurationMs) * 100);
          setProgress(newProgress);
          if (newProgress >= 100) {
              if (progressRef.current) (window as any).clearInterval(progressRef.current);
          }
      }, 50);

    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) (window as any).clearInterval(progressRef.current);
      if (audioRef.current) {
        (audioRef.current as any).pause();
        (audioRef.current as any).src = '';
      }
    };
  }, [isOpen, segments]);

  const handleMediaError = (e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement, Event>) => {
      // If media fails, show placeholder
      const target = e.target as HTMLImageElement; // Cast safe for both src manipulation
      console.warn("Preview media failed to load:", target.src);
      // Fallback for visual
      if (!target.src.includes('placehold.co')) {
          target.src = 'https://placehold.co/1280x720/000/FFF?text=Media+Error';
      }
  };

  if (!isOpen) return null;

  const activeSegment = displaySegments.find(s => s.animationState !== 'exit') || displaySegments[0] || null;

  const getTextPositionClass = (style: TextOverlayStyle | undefined) => {
    if (!style) return 'justify-end'; 
    switch (style.position) {
        case 'top': return 'justify-start';
        case 'center': return 'justify-center';
        case 'bottom': return 'justify-end';
        default: return 'justify-end';
    }
  };

  const renderKaraokeText = (segment: Segment) => {
        const style = segment.textOverlayStyle;
        if (!style || !segment.narration_text) return null;
        
        const timings = segment.wordTimings;
        if (!timings || timings.length === 0) {
            return null;
        }

        const subtitleChunks = generateSubtitleChunks(
            timings, 
            style.fontSize, 
            style.maxCaptionLines || 2,
            1280 
        );

        const activeChunk = subtitleChunks.find(c => currentTimeInSegment >= c.start && currentTimeInSegment <= c.end);
        const displayChunk = activeChunk || (currentTimeInSegment < 0.1 ? subtitleChunks[0] : null);

        if (!displayChunk) return null;
        
        const animation = style.animation || 'none';

        return (
            <p 
                style={{
                    fontFamily: style.fontFamily,
                    fontSize: `${style.fontSize}px`,
                    backgroundColor: style.backgroundColor,
                    textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
                    textAlign: 'center',
                    lineHeight: 1.4
                }}
                className="p-2 rounded-md"
            >
                {displayChunk.timings.map((t, i) => {
                    const isActive = currentTimeInSegment >= t.start && currentTimeInSegment < t.end;
                    const isPast = currentTimeInSegment >= t.end;
                    
                    let inlineStyle: React.CSSProperties = {
                        display: 'inline-block',
                        transition: 'all 0.1s ease-out',
                        color: isActive || isPast ? style.color : '#FFFFFF',
                        opacity: isActive || isPast ? 1 : 0.7,
                        marginRight: '0.25em'
                    };
                    
                     if (isActive) {
                        if (animation === 'scale') {
                            inlineStyle.transform = 'scale(1.2)';
                        } else if (animation === 'slide-up') {
                            inlineStyle.transform = 'translateY(-10%)';
                        } else if (animation === 'highlight') {
                             inlineStyle.backgroundColor = style.color;
                             inlineStyle.color = '#000000';
                             inlineStyle.borderRadius = '4px';
                             inlineStyle.opacity = 1;
                        }
                    }

                    return (
                        <span key={i} style={inlineStyle}>{t.word}</span>
                    );
                })}
            </p>
        )
    }


  const renderMedia = (segment: DisplaySegment) => {
    const classNames = `transition-image ${getAnimationClass(segment)}`;
    
    let currentClip = segment.media[0];
    if (segment.media.length > 1) {
        const clipDuration = segment.duration / segment.media.length;
        if (segment.animationState === 'stable') {
            const index = Math.min(segment.media.length - 1, Math.floor(currentTimeInSegment / clipDuration));
            currentClip = segment.media[index];
        } else if (segment.animationState === 'enter') {
            currentClip = segment.media[0];
        } else if (segment.animationState === 'exit') {
             currentClip = segment.media[segment.media.length - 1];
        }
    }

     if (currentClip.type === 'video') {
        return (
            <video
                key={`${segment.id}-${currentClip.id}`}
                src={currentClip.url}
                className={classNames}
                autoPlay
                muted
                loop
                playsInline
                onError={handleMediaError}
            />
        )
     }
     return (
        <img 
            key={`${segment.id}-${currentClip.id}`}
            src={currentClip.url} 
            alt={segment.search_keywords_for_media} 
            className={classNames}
            onError={handleMediaError}
        />
     )
  }

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in" 
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-5xl aspect-video flex flex-col p-4 relative" 
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-4 left-4 z-20">
          <h2 className="text-xl font-bold text-white bg-black/50 p-2 rounded-md">{title}</h2>
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 text-white bg-black/50 rounded-full w-8 h-8 flex items-center justify-center text-2xl font-bold hover:bg-white/30"
        >
          &times;
        </button>

        <div className="w-full h-full bg-black rounded-md overflow-hidden relative flex items-center justify-center">
            {displaySegments.map(segment => renderMedia(segment))}
            
            {activeSegment?.textOverlayStyle && activeSegment?.narration_text && (
                <div className={`absolute inset-0 p-4 flex flex-col pointer-events-none z-10 ${getTextPositionClass(activeSegment.textOverlayStyle)}`}>
                    {renderKaraokeText(activeSegment)}
                </div>
            )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
            <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                <div 
                    className="bg-purple-500 h-full rounded-full" 
                    style={{ width: `${progress}%`, transition: 'width 0.1s linear' }}
                ></div>
            </div>
        </div>
        <audio ref={audioRef} loop={false} />
      </div>
    </div>
  );
};

export default VideoPreviewModal;
