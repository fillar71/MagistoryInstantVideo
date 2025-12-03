
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Segment, TextOverlayStyle, WordTiming, TransitionEffect, MediaClip } from '../types';
import { PlayIcon, MusicIcon, MagicWandIcon, EditIcon, TrashIcon, ScissorsIcon, PauseIcon, LargePlayIcon } from './icons';
import { generateSpeechFromText } from '../services/geminiService';
import { createWavBlobUrl, estimateWordTimings, generateSubtitleChunks } from '../utils/media';
import LoadingSpinner from './LoadingSpinner';

interface PreviewWindowProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  segment: Segment; // Active segment for preview
  segments: Segment[]; // All segments for full script view
  activeSegmentId: string;
  onUpdateSegments: (segments: Segment[]) => void; // Bulk update
  onTextChange: (segmentId: string, newText: string) => void; 
  onUpdateAudio: (segmentId: string, newAudioUrl: string | undefined, duration?: number) => void;
  onUpdateWordTimings: (segmentId: string, timings: WordTiming[]) => void;
  onAutoGenerateSubtitles: (segmentId?: string) => void;
  onUpdateTextOverlayStyle: (segmentId: string, styleUpdate: Partial<TextOverlayStyle>) => void;
  onUpdateDuration: (segmentId: string, newDuration: number) => void;
  onUpdateTransition: (segmentId: string, transition: TransitionEffect) => void;
  onUpdateVolume: (segmentId: string, volume: number) => void;
  isLastSegment: boolean;
  onOpenMediaSearch: (clipId: string | null) => void;
  onRemoveMedia: (segmentId: string, clipId: string) => void;
  onOpenVideoPreview: () => void;
  onEditClipWithAI: (clipId: string) => void;
  onReorderClips: (newMedia: MediaClip[]) => void;
  onSplitSegment: (segmentId: string, splitTime: number) => void;
}

const fonts = [
    { name: 'Arial', value: 'Arial, sans-serif' },
    { name: 'Georgia', value: 'Georgia, serif' },
    { name: 'Impact', value: 'Impact, sans-serif' },
    { name: 'Verdana', value: 'Verdana, sans-serif' },
];

const PreviewWindow: React.FC<PreviewWindowProps> = ({ 
    title, onTitleChange,
    segment, segments, activeSegmentId, onUpdateSegments,
    onTextChange, onUpdateAudio, onUpdateWordTimings, onAutoGenerateSubtitles, 
    onUpdateTextOverlayStyle, onUpdateDuration, onUpdateTransition, onUpdateVolume, isLastSegment, 
    onOpenMediaSearch, onRemoveMedia, onOpenVideoPreview, onEditClipWithAI, onReorderClips, onSplitSegment
}) => {
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [generationProgress, setGenerationProgress] = useState('');
    const [audioError, setAudioError] = useState('');
    const audioPlayerRef = useRef<HTMLAudioElement>(null);
    const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const [draggedClipIndex, setDraggedClipIndex] = useState<number | null>(null);
    
    // Unified Script State
    const [fullScript, setFullScript] = useState('');
    
    const style = segment.textOverlayStyle;

    // Initialize full script from segments
    useEffect(() => {
        if (segments && segments.length > 0) {
            const script = segments.map(s => s.narration_text).join('\n\n');
            setFullScript(script);
        }
    }, [segments]);

    // Reset playback when segment changes
    useEffect(() => {
        setCurrentPlaybackTime(0);
        setIsPlaying(false);
        setActiveClipIndex(0);
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current.currentTime = 0;
        }
    }, [segment.id]);

    // Sync active clip with playback time
    useEffect(() => {
        if (segment.media.length <= 1) {
            setActiveClipIndex(0);
            return;
        }
        
        const clipDuration = segment.duration / segment.media.length;
        const calculatedIndex = Math.min(
            segment.media.length - 1, 
            Math.floor(currentPlaybackTime / clipDuration)
        );
        
        if (calculatedIndex !== activeClipIndex) {
            setActiveClipIndex(calculatedIndex);
        }
    }, [currentPlaybackTime, segment.duration, segment.media.length]);

    // Only use explicit word timings.
    const effectiveTimings = useMemo(() => {
        if (segment.wordTimings && segment.wordTimings.length > 0) {
            return segment.wordTimings;
        }
        return [];
    }, [segment.wordTimings]);

    // Memoize subtitle chunks
    const subtitleChunks = useMemo(() => {
        if (!style || effectiveTimings.length === 0) return [];
        return generateSubtitleChunks(
            effectiveTimings, 
            style.fontSize, 
            style.maxCaptionLines || 2,
            800 
        );
    }, [effectiveTimings, style?.fontSize, style?.maxCaptionLines]);

    const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = (e.target as any).value;
        setFullScript(newText);
        
        const parts = newText.split(/\n\n+/); // Split by double newline
        
        const newSegments = [...segments];
        const maxLen = Math.max(parts.length, newSegments.length);
        const updatedSegments: Segment[] = [];
        
        for (let i = 0; i < maxLen; i++) {
            if (i < parts.length) {
                if (i < newSegments.length) {
                    if (newSegments[i].narration_text !== parts[i]) {
                        updatedSegments.push({
                            ...newSegments[i],
                            narration_text: parts[i],
                            audioUrl: undefined, 
                            wordTimings: undefined
                        });
                    } else {
                        updatedSegments.push(newSegments[i]);
                    }
                } else {
                    const lastSeg = newSegments[newSegments.length - 1];
                    updatedSegments.push({
                        ...lastSeg,
                        id: `segment-${Date.now()}-${i}`,
                        narration_text: parts[i],
                        audioUrl: undefined,
                        wordTimings: undefined,
                        media: lastSeg ? [...lastSeg.media] : [] 
                    });
                }
            } else {
                if (i < newSegments.length) {
                     updatedSegments.push({
                        ...newSegments[i],
                        narration_text: '',
                        audioUrl: undefined,
                        wordTimings: undefined
                     });
                }
            }
        }
        
        if (JSON.stringify(updatedSegments) !== JSON.stringify(segments)) {
            onUpdateSegments(updatedSegments);
        }
    };

    const handleStyleChange = (prop: keyof TextOverlayStyle, value: any) => {
        onUpdateTextOverlayStyle(segment.id, { [prop]: value });
    };
    
    const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(1, parseFloat((e.target as any).value));
        onUpdateDuration(segment.id, val);
    }
    
    const handleTransitionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onUpdateTransition(segment.id, (e.target as any).value as TransitionEffect);
    }

    const handleGenerateCurrentAudio = async () => {
        if (!segment.narration_text || segment.narration_text.trim().length === 0) return;
        
        setIsGeneratingAudio(true);
        setGenerationProgress('Generating voice...');
        setAudioError('');
        
        try {
            const base64Audio = await generateSpeechFromText(segment.narration_text);
            const wavBlobUrl = createWavBlobUrl(base64Audio);
            
            const audio = new (window as any).Audio(wavBlobUrl);
            await new Promise((resolve) => {
                audio.onloadedmetadata = () => resolve(null);
                audio.onerror = () => resolve(null); 
            });
            
            const duration = audio.duration && isFinite(audio.duration) ? Math.ceil(audio.duration) : segment.duration;
            const timings = estimateWordTimings(segment.narration_text, duration);
            
            onUpdateAudio(segment.id, wavBlobUrl, duration);
            onUpdateWordTimings(segment.id, timings);
            
            if (duration > segment.duration) {
                onUpdateDuration(segment.id, duration);
            }
            
        } catch (err) {
            console.error('Failed to generate audio for current segment:', err);
            setAudioError('Failed to generate audio.');
        } finally {
            setIsGeneratingAudio(false);
            setGenerationProgress('');
        }
    };

    const handleGenerateAllAudio = async () => {
        setIsGeneratingAudio(true);
        setGenerationProgress('Initializing...');
        setAudioError('');
        
        try {
            const updatedSegments = [...segments];
            let changed = false;
            
            for (let i = 0; i < updatedSegments.length; i++) {
                const s = updatedSegments[i];
                if (s.narration_text && s.narration_text.trim().length > 0) {
                    setGenerationProgress(`Generating audio for segment ${i+1}/${updatedSegments.length}...`);
                    if (i > 0) await new Promise(r => setTimeout(r, 500));
                    
                    try {
                        const base64Audio = await generateSpeechFromText(s.narration_text);
                        const wavBlobUrl = createWavBlobUrl(base64Audio);
                        
                        const audio = new (window as any).Audio(wavBlobUrl);
                        await new Promise((resolve) => {
                            audio.onloadedmetadata = () => resolve(null);
                            audio.onerror = () => resolve(null);
                        });
                        
                        const duration = audio.duration && isFinite(audio.duration) ? Math.ceil(audio.duration) : s.duration;
                        const timings = estimateWordTimings(s.narration_text, duration);
                        
                        updatedSegments[i] = {
                            ...s,
                            audioUrl: wavBlobUrl,
                            duration: duration,
                            wordTimings: timings
                        };
                        changed = true;
                    } catch (err) {
                        console.error(`Failed to generate audio for segment ${i}:`, err);
                    }
                }
            }
            
            if (changed) {
                onUpdateSegments(updatedSegments);
                setGenerationProgress('Done!');
            }
            
        } catch (err) {
            setAudioError('Batch generation encountered errors.');
        } finally {
            setIsGeneratingAudio(false);
            setTimeout(() => setGenerationProgress(''), 2000);
        }
    };
    
    const handleTimeUpdate = () => {
        if (audioPlayerRef.current) {
            setCurrentPlaybackTime((audioPlayerRef.current as any).currentTime);
        }
    };

    const handlePlayPause = () => {
        if (audioPlayerRef.current) {
            if (isPlaying) {
                audioPlayerRef.current.pause();
                setIsPlaying(false);
            } else {
                audioPlayerRef.current.play().catch(() => {});
                setIsPlaying(true);
            }
        } else {
            // Fake playback if no audio
            setIsPlaying(!isPlaying);
        }
    };

    // Simulated playback loop for segments without audio
    useEffect(() => {
        let interval: any;
        if (isPlaying && !segment.audioUrl) {
            interval = setInterval(() => {
                setCurrentPlaybackTime(prev => {
                    if (prev >= segment.duration) {
                        setIsPlaying(false);
                        return 0;
                    }
                    return prev + 0.05;
                });
            }, 50);
        }
        return () => clearInterval(interval);
    }, [isPlaying, segment.audioUrl, segment.duration]);

    const handleClipDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedClipIndex(index);
        (e.dataTransfer as any).effectAllowed = "move";
    };

    const handleClipDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        (e.dataTransfer as any).dropEffect = "move";
    };

    const handleClipDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        if (draggedClipIndex === null || draggedClipIndex === dropIndex) return;
        
        const newMedia = [...segment.media];
        const [movedClip] = newMedia.splice(draggedClipIndex, 1);
        newMedia.splice(dropIndex, 0, movedClip);
        
        onReorderClips(newMedia);
        setDraggedClipIndex(null);
        setActiveClipIndex(0);
    };

    // Auto-play when generating finishes (optional, maybe distracting)
    useEffect(() => {
        if (segment.audioUrl && audioPlayerRef.current && !isGeneratingAudio) {
            (audioPlayerRef.current as any).load();
        }
    }, [segment.audioUrl, isGeneratingAudio]);
    
    const getTextPositionClass = () => {
        if (!style) return 'justify-end'; 
        switch (style.position) {
            case 'top': return 'justify-start';
            case 'center': return 'justify-center';
            case 'bottom': return 'justify-end';
            default: return 'justify-end';
        }
    };

    const renderKaraokeText = () => {
        if (!style || !segment.audioUrl || effectiveTimings.length === 0) return null;
        
        const activeChunk = subtitleChunks.find(c => currentPlaybackTime >= c.start && currentPlaybackTime <= c.end);
        const displayChunk = activeChunk || (currentPlaybackTime < 0.1 ? subtitleChunks[0] : null);

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
                    const isActive = currentPlaybackTime >= t.start && currentPlaybackTime < t.end;
                    const isPast = currentPlaybackTime >= t.end;
                    
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

    const currentClip = segment.media[activeClipIndex] || segment.media[0];
    
    // Fallback if no media
    if (!currentClip) {
        return <div className="flex items-center justify-center h-full text-gray-500">No media selected</div>;
    }

    return (
        <div className="flex h-full w-full bg-[#0c0c0e] overflow-hidden text-sm">
            
            {/* COLUMN 1: NARRATIVE (Script & Audio) - Left Panel */}
            <div className="w-80 flex-shrink-0 border-r border-white/10 bg-[#0c0c0e] flex flex-col z-20">
                <div className="p-4 border-b border-white/5 bg-[#121214]">
                     <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Project Title</label>
                        <span className="text-[10px] text-gray-500">{segments.length} segments</span>
                    </div>
                    <input 
                        type="text"
                        value={title}
                        onChange={(e) => onTitleChange((e.target as any).value)}
                        className="w-full bg-transparent border-none p-0 text-base font-bold text-white focus:ring-0 placeholder-gray-600"
                        placeholder="Untitled Project"
                    />
                </div>
                
                <div className="flex-grow flex flex-col p-4 overflow-y-auto">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Script & Story
                        </h3>
                    </div>
                    <textarea
                        value={fullScript}
                        onChange={handleScriptChange}
                        className="flex-grow w-full bg-[#18181b] rounded-lg p-4 border border-white/5 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 resize-none text-gray-300 text-sm leading-relaxed custom-scrollbar shadow-inner"
                        placeholder="Start typing your story script here..."
                        spellCheck={false}
                    />
                    
                    <div className="mt-4 space-y-3 bg-[#18181b] p-3 rounded-lg border border-white/5">
                        <div className="flex justify-between items-center mb-1">
                             <label className="text-[10px] font-bold text-gray-400 uppercase">AI Narration</label>
                             {isGeneratingAudio && <span className="text-[10px] text-purple-400 animate-pulse">{generationProgress}</span>}
                        </div>
                        {audioError && <p className="text-xs text-red-400">{audioError}</p>}
                        
                        <button 
                            onClick={handleGenerateCurrentAudio}
                            disabled={isGeneratingAudio || !segment.narration_text}
                            className="w-full py-2.5 bg-[#27272a] hover:bg-[#3f3f46] text-gray-200 hover:text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-2 border border-white/5"
                        >
                            {isGeneratingAudio ? <LoadingSpinner /> : <MusicIcon className="w-3 h-3 text-purple-400" />}
                            Generate Voice for Current Segment
                        </button>

                        <button 
                            onClick={handleGenerateAllAudio} 
                            disabled={isGeneratingAudio}
                            className="w-full py-2.5 bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 text-xs font-medium rounded transition-colors flex items-center justify-center gap-2"
                        >
                            <MagicWandIcon className="w-3 h-3" />
                            Batch Generate All Voices
                        </button>
                    </div>
                </div>
            </div>

            {/* COLUMN 2: VIEWPORT (Stage) - Center Panel */}
            <div className="flex-grow bg-black flex flex-col relative min-w-0 border-r border-white/10">
                {/* Main Player Area */}
                <div className="flex-grow flex items-center justify-center p-6 overflow-hidden relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#18181b] to-black">
                    <div className="aspect-video w-full max-h-full bg-black shadow-2xl relative group overflow-hidden border border-white/10 ring-1 ring-black">
                        {currentClip.type === 'video' ? (
                            <video 
                                key={currentClip.url}
                                src={currentClip.url} 
                                className="w-full h-full object-contain"
                                controls={false}
                                autoPlay
                                loop
                                muted 
                                playsInline
                            />
                        ) : (
                            <img 
                                key={currentClip.url}
                                src={currentClip.url} 
                                alt={segment.search_keywords_for_media} 
                                className="w-full h-full object-contain"
                            />
                        )}
                        
                        {/* Text Overlay */}
                        {style && (
                            <div className={`absolute inset-0 p-8 flex flex-col pointer-events-none ${getTextPositionClass()}`}>
                                {renderKaraokeText()}
                            </div>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none backdrop-blur-[1px]">
                             <button 
                                onClick={onOpenVideoPreview}
                                className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-bold rounded-full border border-white/20 pointer-events-auto flex items-center gap-3 transition-all transform hover:scale-105"
                            >
                                <LargePlayIcon className="w-6 h-6" />
                                <span>Preview Full Video</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Floating Player Controls */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-3/4 max-w-lg z-20">
                     <div className="bg-[#18181b]/90 backdrop-blur-md border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-2xl">
                         <div className="flex items-center gap-4">
                            <button 
                                onClick={handlePlayPause}
                                className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                            >
                                {isPlaying ? <PauseIcon className="w-5 h-5 fill-current" /> : <PlayIcon className="w-5 h-5 fill-current ml-0.5" />}
                            </button>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Segment Time</span>
                                <span className="text-sm font-mono text-white font-bold">{currentPlaybackTime.toFixed(1)}s <span className="text-gray-500">/</span> {segment.duration.toFixed(1)}s</span>
                            </div>
                         </div>
                         
                         <div className="h-8 w-px bg-white/10 mx-2"></div>
                         
                         <button
                            onClick={() => onSplitSegment(segment.id, currentPlaybackTime)}
                            disabled={currentPlaybackTime < 0.5 || currentPlaybackTime > segment.duration - 0.5}
                            className="flex items-center gap-2 px-4 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ScissorsIcon className="w-4 h-4" />
                            Split Clip
                        </button>
                     </div>
                </div>

                {/* Clip Strip (Bottom Bar) */}
                <div className="h-24 bg-[#09090b] border-t border-white/10 p-3 flex flex-col flex-shrink-0 z-30">
                    <div className="flex justify-between items-center mb-2 px-1">
                        <h3 className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Active Media Layers</h3>
                        <span className="text-[10px] text-gray-600">{segment.media.length} clips</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto custom-scrollbar h-full items-center pb-1">
                        {segment.media.map((clip, index) => {
                            const isDragging = draggedClipIndex === index;
                            const isCurrent = index === activeClipIndex;
                            return (
                                <div 
                                    key={clip.id}
                                    draggable
                                    onDragStart={(e) => handleClipDragStart(e, index)}
                                    onDragOver={handleClipDragOver}
                                    onDrop={(e) => handleClipDrop(e, index)}
                                    className={`relative flex-shrink-0 h-12 aspect-video rounded overflow-hidden cursor-pointer border transition-all ${isCurrent ? 'border-purple-500 ring-1 ring-purple-500 shadow-lg shadow-purple-900/20' : 'border-white/10 hover:border-white/30'} ${isDragging ? 'opacity-30' : 'opacity-100'}`}
                                    onClick={() => setActiveClipIndex(index)}
                                >
                                    {clip.type === 'video' ? (
                                        <video src={clip.url} className="w-full h-full object-cover pointer-events-none" />
                                    ) : (
                                        <img src={clip.url} className="w-full h-full object-cover pointer-events-none" />
                                    )}
                                    
                                    <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-1 backdrop-blur-[1px]">
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); onEditClipWithAI(clip.id); }}
                                            className="p-1 bg-purple-600 rounded hover:bg-purple-500"
                                            title="AI Edit"
                                         >
                                            <MagicWandIcon className="w-2.5 h-2.5 text-white" />
                                         </button>
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); onOpenMediaSearch(clip.id); }}
                                            className="p-1 bg-blue-600 rounded hover:bg-blue-500"
                                            title="Replace"
                                         >
                                            <EditIcon className="w-2.5 h-2.5 text-white" />
                                         </button>
                                          {segment.media.length > 1 && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onRemoveMedia(segment.id, clip.id); }}
                                                className="p-1 bg-red-600 rounded hover:bg-red-500"
                                                title="Delete"
                                            >
                                                <TrashIcon className="w-2.5 h-2.5 text-white" />
                                            </button>
                                          )}
                                    </div>
                                    <div className="absolute bottom-0 right-0 bg-black/80 px-1 text-[8px] text-white font-mono rounded-tl">
                                        {index + 1}
                                    </div>
                                </div>
                            )
                        })}
                        <button 
                            onClick={() => onOpenMediaSearch(null)}
                            className="flex-shrink-0 h-12 aspect-video bg-[#18181b] border border-dashed border-gray-700 rounded flex items-center justify-center hover:bg-[#27272a] hover:border-gray-500 transition-colors gap-1 group"
                        >
                            <span className="text-lg text-gray-500 group-hover:text-gray-300">+</span>
                        </button>
                    </div>
                </div>

                {/* Hidden Audio Player for Sync */}
                <audio 
                    ref={audioPlayerRef} 
                    onTimeUpdate={handleTimeUpdate}
                    src={segment.audioUrl} 
                    className="hidden" 
                    onEnded={() => setIsPlaying(false)}
                />
            </div>

            {/* COLUMN 3: INSPECTOR (Right Panel) */}
            <div className="w-80 flex-shrink-0 bg-[#0c0c0e] flex flex-col z-20 overflow-y-auto">
                 <div className="p-4 border-b border-white/5 bg-[#121214]">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Properties
                    </h3>
                </div>
                
                <div className="p-5 space-y-8">
                    {/* Duration Section */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Duration</label>
                         <div className="flex items-center bg-[#18181b] border border-white/5 rounded p-1">
                            <input 
                                type="number" 
                                min="1" 
                                step="0.1" 
                                value={segment.duration} 
                                onChange={handleDurationChange}
                                className="flex-grow p-1.5 bg-transparent text-sm text-white font-mono focus:outline-none"
                            />
                            <span className="text-xs text-gray-500 pr-3 font-medium">SEC</span>
                         </div>
                    </div>

                    {/* Volume Section */}
                     {segment.audioUrl && (
                        <div className="space-y-3">
                             <div className="flex justify-between items-end">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Narration Volume</label>
                                <span className="text-[10px] text-purple-400 font-mono">{Math.round((segment.audioVolume ?? 1) * 100)}%</span>
                             </div>
                             <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.1" 
                                value={segment.audioVolume ?? 1} 
                                onChange={(e) => onUpdateVolume(segment.id, parseFloat(e.target.value))}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
                            />
                        </div>
                     )}

                    {/* Transition Section */}
                    <div className="space-y-3">
                         <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Transition Out</label>
                         {isLastSegment ? (
                             <div className="text-xs text-gray-600 italic p-3 bg-[#18181b] rounded border border-white/5 text-center">None (End of video)</div>
                         ) : (
                             <div className="relative">
                                 <select 
                                    value={segment.transition || 'fade'}
                                    onChange={handleTransitionChange}
                                    className="w-full p-2.5 bg-[#18181b] border border-white/5 rounded text-xs text-gray-300 focus:border-purple-500 outline-none appearance-none"
                                >
                                    <option value="fade">Cross Fade</option>
                                    <option value="slide">Slide Left</option>
                                    <option value="zoom">Zoom Out</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                             </div>
                         )}
                    </div>

                    {/* Text Styling Section */}
                    {style && (
                        <div className="space-y-4 pt-6 border-t border-white/5">
                             <label className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Caption Style</label>
                             
                             <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] text-gray-500">Font Family</label>
                                    <select value={style.fontFamily} onChange={(e) => handleStyleChange('fontFamily', (e.target as any).value)} className="w-full p-2 bg-[#18181b] border border-white/5 rounded text-xs text-gray-300 focus:border-purple-500 outline-none">
                                        {fonts.map(f => <option key={f.name} value={f.value}>{f.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500">Size (px)</label>
                                    <input type="number" value={style.fontSize} onChange={(e) => handleStyleChange('fontSize', parseInt((e.target as any).value))} className="w-full p-2 bg-[#18181b] border border-white/5 rounded text-xs text-gray-300 focus:border-purple-500 outline-none" />
                                </div>
                                <div className="space-y-1">
                                     <label className="text-[10px] text-gray-500">Highlight Color</label>
                                     <div className="flex items-center gap-2 bg-[#18181b] border border-white/5 rounded p-1.5 h-[34px]">
                                        <input type="color" value={style.color} onChange={(e) => handleStyleChange('color', (e.target as any).value)} className="w-6 h-full rounded border-none cursor-pointer bg-transparent p-0" />
                                        <span className="text-[10px] text-gray-400 font-mono">{style.color}</span>
                                     </div>
                                </div>
                                <div className="col-span-2 space-y-1">
                                     <label className="text-[10px] text-gray-500">Animation</label>
                                     <select 
                                        value={style.animation || 'none'} 
                                        onChange={(e) => handleStyleChange('animation', (e.target as any).value)} 
                                        className="w-full p-2 bg-[#18181b] border border-white/5 rounded text-xs text-gray-300 focus:border-purple-500 outline-none"
                                    >
                                        <option value="none">None</option>
                                        <option value="scale">Pulse Scale</option>
                                        <option value="slide-up">Slide Up</option>
                                        <option value="highlight">Box Highlight</option>
                                    </select>
                                </div>
                             </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default PreviewWindow;
