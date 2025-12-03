
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Segment, TextOverlayStyle, WordTiming, TransitionEffect, MediaClip } from '../types';
import { PlayIcon, MusicIcon, MagicWandIcon, EditIcon, ScissorsIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon, PanelLeftIcon, PanelRightIcon } from './icons';
import { generateSpeechFromText } from '../services/geminiService';
import { createWavBlobUrl, estimateWordTimings, generateSubtitleChunks } from '../utils/media';
import LoadingSpinner from './LoadingSpinner';

interface PreviewWindowProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  segment: Segment; // Active segment for properties view
  segments: Segment[]; // All segments for timeline view
  activeSegmentId: string;
  onUpdateSegments: (segments: Segment[]) => void;
  
  // Layout Props
  showScriptPanel: boolean;
  setShowScriptPanel: (show: boolean) => void;
  showPropertiesPanel: boolean;
  setShowPropertiesPanel: (show: boolean) => void;

  // Playback Control Props
  currentTime: number;
  isPlaying: boolean;
  totalDuration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;

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
    showScriptPanel, setShowScriptPanel, showPropertiesPanel, setShowPropertiesPanel,
    currentTime, isPlaying, totalDuration, onPlayPause, onSeek,
    onTextChange, onUpdateAudio, onUpdateWordTimings, onAutoGenerateSubtitles, 
    onUpdateTextOverlayStyle, onUpdateDuration, onUpdateTransition, onUpdateVolume, isLastSegment, 
    onOpenMediaSearch, onRemoveMedia, onEditClipWithAI, onReorderClips, onSplitSegment
}) => {
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [generationProgress, setGenerationProgress] = useState('');
    const [audioError, setAudioError] = useState('');
    
    const [draggedClipIndex, setDraggedClipIndex] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [fullScript, setFullScript] = useState('');
    
    const style = segment.textOverlayStyle;

    useEffect(() => {
        if (segments && segments.length > 0) {
            const script = segments.map(s => s.narration_text).join('\n\n');
            setFullScript(script);
        }
    }, [segments]);

    const currentRenderState = useMemo(() => {
        let elapsed = 0;
        for (const seg of segments) {
            if (currentTime >= elapsed && currentTime < elapsed + seg.duration) {
                const localTime = currentTime - elapsed;
                const clipDuration = seg.duration / seg.media.length;
                const clipIndex = Math.min(seg.media.length - 1, Math.floor(localTime / clipDuration));
                const activeClip = seg.media[clipIndex];
                
                return { segment: seg, clip: activeClip, localTime, clipIndex };
            }
            elapsed += seg.duration;
        }
        return null;
    }, [currentTime, segments]);

    useEffect(() => {
        if (!audioRef.current) return;
        const activeSeg = currentRenderState?.segment;

        if (activeSeg?.audioUrl) {
            if (!audioRef.current.src.includes(activeSeg.audioUrl)) {
                 audioRef.current.src = activeSeg.audioUrl;
            }
            const expectedTime = currentRenderState?.localTime || 0;
            if (Math.abs(audioRef.current.currentTime - expectedTime) > 0.3) {
                audioRef.current.currentTime = expectedTime;
            }
            if (isPlaying) {
                audioRef.current.play().catch(() => {});
            } else {
                audioRef.current.pause();
            }
            audioRef.current.volume = activeSeg.audioVolume ?? 1.0;
        } else {
            audioRef.current.pause();
            audioRef.current.src = "";
        }
    }, [currentRenderState?.segment.id, currentRenderState?.localTime, isPlaying]);

    const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = (e.target as any).value;
        setFullScript(newText);
        
        const parts = newText.split(/\n\n+/);
        const newSegments = [...segments];
        const maxLen = Math.max(parts.length, newSegments.length);
        const updatedSegments: Segment[] = [];
        
        for (let i = 0; i < maxLen; i++) {
            if (i < parts.length) {
                if (i < newSegments.length) {
                    updatedSegments.push({
                        ...newSegments[i],
                        narration_text: parts[i],
                        audioUrl: undefined, 
                        wordTimings: undefined
                    });
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
    
    const handleGenerateCurrentAudio = async () => {
        if (!segment.narration_text || segment.narration_text.trim().length === 0) return;
        setIsGeneratingAudio(true);
        setGenerationProgress('Generating voice...');
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
            if (duration > segment.duration) onUpdateDuration(segment.id, duration);
        } catch (err) {
            console.error('Failed to generate audio:', err);
            setAudioError('Failed to generate audio.');
        } finally {
            setIsGeneratingAudio(false);
            setGenerationProgress('');
        }
    };

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
    };

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
        const renderSeg = currentRenderState?.segment;
        if (!renderSeg || !renderSeg.textOverlayStyle || !renderSeg.narration_text) return null;
        
        const timings = renderSeg.wordTimings;
        if (!timings || timings.length === 0) return null;

        const currentStyle = renderSeg.textOverlayStyle;
        const localTime = currentRenderState?.localTime || 0;

        const subtitleChunks = generateSubtitleChunks(
            timings, 
            currentStyle.fontSize, 
            currentStyle.maxCaptionLines || 2,
            800 
        );

        const activeChunk = subtitleChunks.find(c => localTime >= c.start && localTime <= c.end);
        const displayChunk = activeChunk || (localTime < 0.1 ? subtitleChunks[0] : null);

        if (!displayChunk) return null;

        const animation = currentStyle.animation || 'none';

        return (
            <p 
                style={{
                    fontFamily: currentStyle.fontFamily,
                    fontSize: `${currentStyle.fontSize}px`,
                    backgroundColor: currentStyle.backgroundColor,
                    textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
                    textAlign: 'center',
                    lineHeight: 1.4
                }}
                className="p-2 rounded-md transition-all duration-100"
            >
                {displayChunk.timings.map((t, i) => {
                    const isActive = localTime >= t.start && localTime < t.end;
                    const isPast = localTime >= t.end;
                    let inlineStyle: React.CSSProperties = {
                        display: 'inline-block',
                        transition: 'all 0.1s ease-out',
                        color: isActive || isPast ? currentStyle.color : '#FFFFFF',
                        opacity: isActive || isPast ? 1 : 0.7,
                        marginRight: '0.25em'
                    };
                    if (isActive) {
                        if (animation === 'scale') {
                            inlineStyle.transform = 'scale(1.2)';
                        } else if (animation === 'slide-up') {
                            inlineStyle.transform = 'translateY(-10%)';
                        } else if (animation === 'highlight') {
                             inlineStyle.backgroundColor = currentStyle.color;
                             inlineStyle.color = '#000000';
                             inlineStyle.borderRadius = '4px';
                             inlineStyle.opacity = 1;
                        }
                    }
                    return <span key={i} style={inlineStyle}>{t.word}</span>;
                })}
            </p>
        )
    }

    return (
        <div className="flex h-full w-full bg-zinc-950 overflow-hidden text-sm relative">
            
            {/* LEFT PANEL: NARRATIVE (Script & Audio) */}
            <div 
                className={`
                    ${showScriptPanel ? 'w-full md:w-80 opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-full md:-translate-x-full'} 
                    fixed inset-0 md:static z-50 md:z-20
                    flex-shrink-0 border-r border-white/5 bg-zinc-900 flex flex-col transition-all duration-300 ease-in-out overflow-hidden shadow-2xl md:shadow-none
                `}
            >
                {/* Header */}
                <div className="h-14 px-4 border-b border-white/5 flex items-center justify-between bg-zinc-900">
                     <div className="flex flex-col w-full">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Project Title</label>
                        <input 
                            type="text"
                            value={title}
                            onChange={(e) => onTitleChange((e.target as any).value)}
                            className="w-full bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0 placeholder-zinc-600 truncate"
                            placeholder="Untitled Project"
                        />
                    </div>
                    <button onClick={() => setShowScriptPanel(false)} className="md:hidden p-2 text-zinc-400 hover:text-white">✕</button>
                </div>
                
                {/* Content */}
                <div className="flex-grow flex flex-col p-4 overflow-y-auto w-full md:w-80">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            Script
                        </h3>
                    </div>
                    <textarea
                        value={fullScript}
                        onChange={handleScriptChange}
                        className="flex-grow w-full bg-zinc-950/50 rounded-lg p-4 border border-white/5 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 resize-none text-zinc-300 text-sm leading-relaxed custom-scrollbar shadow-inner outline-none transition-colors"
                        placeholder="Start typing your story script here... Segments will auto-split on double newlines."
                        spellCheck={false}
                    />
                    
                    {/* Audio Generator Box */}
                    <div className="mt-4 bg-zinc-800/50 p-3 rounded-lg border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-[10px] font-bold text-zinc-400 uppercase">Current Segment Voice</label>
                             {isGeneratingAudio && <span className="text-[10px] text-purple-400 animate-pulse">{generationProgress}</span>}
                        </div>
                        {audioError && <p className="text-xs text-red-400 mb-2">{audioError}</p>}
                        
                        <button 
                            onClick={handleGenerateCurrentAudio}
                            disabled={isGeneratingAudio || !segment.narration_text}
                            className="w-full py-2 bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 hover:text-purple-200 text-xs font-medium rounded border border-purple-500/30 hover:border-purple-500/50 transition-all flex items-center justify-center gap-2 h-9"
                        >
                            {isGeneratingAudio ? <LoadingSpinner /> : <MusicIcon className="w-3.5 h-3.5" />}
                            Generate Voice
                        </button>
                    </div>
                </div>
            </div>

            {/* CENTER PANEL: PROGRAM MONITOR (Stage) */}
            <div className="flex-grow bg-black flex flex-col relative min-w-0 transition-all duration-300">
                {/* Monitor Header */}
                <div className="h-14 bg-zinc-900 border-b border-white/5 flex items-center justify-between px-4 z-10">
                    <button 
                        onClick={() => setShowScriptPanel(!showScriptPanel)} 
                        className={`transition-colors p-1.5 rounded-md hover:bg-white/10 ${!showScriptPanel ? 'text-purple-400 bg-purple-900/10' : 'text-zinc-400'}`}
                        title="Toggle Script Panel"
                    >
                        <PanelLeftIcon className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-3 opacity-50 hover:opacity-100 transition-opacity">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest hidden sm:inline">Program</span>
                    </div>

                    <button 
                        onClick={() => setShowPropertiesPanel(!showPropertiesPanel)} 
                        className={`transition-colors p-1.5 rounded-md hover:bg-white/10 ${!showPropertiesPanel ? 'text-purple-400 bg-purple-900/10' : 'text-zinc-400'}`}
                        title="Toggle Properties Panel"
                    >
                        <PanelRightIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Video Player */}
                <div className="flex-grow flex items-center justify-center bg-black relative overflow-hidden group">
                    <div className="aspect-video w-full max-h-full bg-black shadow-2xl relative border-y border-white/5 overflow-hidden">
                        {currentRenderState ? (
                            <>
                                {currentRenderState.clip.type === 'video' ? (
                                    <video 
                                        key={currentRenderState.clip.url}
                                        src={currentRenderState.clip.url} 
                                        className="w-full h-full object-contain"
                                        autoPlay loop muted playsInline
                                    />
                                ) : (
                                    <img 
                                        key={currentRenderState.clip.url}
                                        src={currentRenderState.clip.url} 
                                        alt="scene" 
                                        className="w-full h-full object-contain"
                                    />
                                )}
                                
                                {/* Overlay Text */}
                                <div className={`absolute inset-0 p-8 flex flex-col pointer-events-none ${getTextPositionClass()}`}>
                                    {renderKaraokeText()}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full w-full text-zinc-700">
                                <span className="text-4xl font-bold opacity-20">END</span>
                            </div>
                        )}
                        
                        {/* Floating Controls Overlay (Visible on Hover/Interaction) */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                             <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="text-white/70 hover:text-white transition-colors"><ChevronLeftIcon className="w-6 h-6" /></button>
                             <button 
                                onClick={onPlayPause}
                                className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                            >
                                {isPlaying ? <PauseIcon className="w-6 h-6 fill-current" /> : <PlayIcon className="w-6 h-6 fill-current ml-0.5" />}
                            </button>
                             <button onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))} className="text-white/70 hover:text-white transition-colors"><ChevronRightIcon className="w-6 h-6" /></button>
                             <div className="w-px h-6 bg-white/20 mx-2"></div>
                             {currentRenderState && (
                                <button
                                    onClick={() => onSplitSegment(currentRenderState.segment.id, currentRenderState.localTime)}
                                    className="text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
                                    title="Split Clip (S)"
                                >
                                    <ScissorsIcon className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Hidden Audio Element */}
                <audio ref={audioRef} className="hidden" />
            </div>

            {/* RIGHT PANEL: INSPECTOR (Properties) */}
            <div 
                className={`
                    ${showPropertiesPanel ? 'w-full md:w-80 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-full'} 
                    fixed inset-0 md:static z-50 md:z-20
                    flex-shrink-0 bg-zinc-900 border-l border-white/5 flex flex-col overflow-hidden transition-all duration-300 ease-in-out shadow-2xl md:shadow-none
                `}
            >
                 <div className="h-14 px-4 border-b border-white/5 flex justify-between items-center bg-zinc-900">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                        Inspector
                    </h3>
                    <button onClick={() => setShowPropertiesPanel(false)} className="md:hidden p-2 text-zinc-400 hover:text-white">✕</button>
                </div>
                
                <div className="p-4 space-y-6 w-full md:w-80 overflow-y-auto custom-scrollbar flex-grow">
                    
                    {/* CARD: VISUALS */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Visuals</label>
                        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 pt-1">
                            {segment.media.map((clip, index) => {
                                const isCurrent = currentRenderState?.clip.id === clip.id;
                                return (
                                    <div 
                                        key={clip.id}
                                        draggable
                                        onDragStart={(e) => handleClipDragStart(e, index)}
                                        onDragOver={handleClipDragOver}
                                        onDrop={(e) => handleClipDrop(e, index)}
                                        className={`relative flex-shrink-0 w-20 aspect-video rounded-md overflow-hidden cursor-pointer border transition-all ${isCurrent ? 'border-purple-500 ring-1 ring-purple-500' : 'border-white/10 opacity-70 hover:opacity-100 hover:border-white/30'}`}
                                        title="Drag to reorder"
                                    >
                                        <img src={clip.url} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 flex items-center justify-center gap-1 transition-opacity backdrop-blur-[1px]">
                                            <button onClick={() => onEditClipWithAI(clip.id)} className="text-purple-300 hover:text-white hover:bg-purple-600/50 p-1 rounded"><MagicWandIcon className="w-3 h-3" /></button>
                                            <button onClick={() => onOpenMediaSearch(clip.id)} className="text-blue-300 hover:text-white hover:bg-blue-600/50 p-1 rounded"><EditIcon className="w-3 h-3" /></button>
                                        </div>
                                    </div>
                                )
                            })}
                            <button onClick={() => onOpenMediaSearch(null)} className="w-20 aspect-video bg-zinc-800 border border-dashed border-zinc-600 rounded-md flex items-center justify-center hover:border-zinc-400 text-zinc-500 hover:text-zinc-300 transition-colors">
                                <span className="text-xl font-light">+</span>
                            </button>
                        </div>
                    </div>

                    <hr className="border-white/5" />

                    {/* CARD: TIMING & AUDIO */}
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Duration (Sec)</label>
                             <div className="flex items-center bg-zinc-800 border border-white/5 rounded-md px-2 py-1.5 focus-within:ring-1 focus-within:ring-purple-500/50">
                                <input 
                                    type="number" 
                                    min="1" 
                                    step="0.1" 
                                    value={segment.duration} 
                                    onChange={handleDurationChange}
                                    className="flex-grow bg-transparent text-sm text-white font-mono focus:outline-none"
                                />
                             </div>
                        </div>

                        {segment.audioUrl && (
                            <div className="space-y-1">
                                 <div className="flex justify-between items-end">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Narration Volume</label>
                                    <span className="text-[10px] text-purple-400 font-mono">{Math.round((segment.audioVolume ?? 1) * 100)}%</span>
                                 </div>
                                 <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1" 
                                    value={segment.audioVolume ?? 1} 
                                    onChange={(e) => onUpdateVolume(segment.id, parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
                                />
                            </div>
                        )}
                    </div>

                    <hr className="border-white/5" />

                    {/* CARD: CAPTIONS */}
                    {style && (
                        <div className="space-y-4">
                             <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Captions</label>
                             <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] text-zinc-500">Font</label>
                                    <select value={style.fontFamily} onChange={(e) => handleStyleChange('fontFamily', (e.target as any).value)} className="w-full p-2 bg-zinc-800 border border-white/5 rounded-md text-xs text-zinc-300 focus:border-purple-500 outline-none">
                                        {fonts.map(f => <option key={f.name} value={f.value}>{f.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500">Size</label>
                                    <input type="number" value={style.fontSize} onChange={(e) => handleStyleChange('fontSize', parseInt((e.target as any).value))} className="w-full p-2 bg-zinc-800 border border-white/5 rounded-md text-xs text-zinc-300 focus:border-purple-500 outline-none" />
                                </div>
                                <div className="space-y-1">
                                     <label className="text-[10px] text-zinc-500">Color</label>
                                     <div className="flex items-center gap-2 bg-zinc-800 border border-white/5 rounded-md p-1 h-[34px]">
                                        <input type="color" value={style.color} onChange={(e) => handleStyleChange('color', (e.target as any).value)} className="w-full h-full rounded cursor-pointer bg-transparent" />
                                     </div>
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
