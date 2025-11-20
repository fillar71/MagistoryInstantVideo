
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Segment, TextOverlayStyle, WordTiming, TransitionEffect } from '../types';
import { PlayIcon, MusicIcon, MagicWandIcon } from './icons';
import { generateSpeechFromText } from '../services/geminiService';
import { createWavBlobUrl, estimateWordTimings, generateSubtitleChunks } from '../utils/media';
import LoadingSpinner from './LoadingSpinner';

interface PreviewWindowProps {
  segment: Segment; // Active segment for preview
  segments: Segment[]; // All segments for full script view
  activeSegmentId: string;
  onUpdateSegments: (segments: Segment[]) => void; // Bulk update
  onTextChange: (segmentId: string, newText: string) => void; // Specific updates (less used now)
  onUpdateAudio: (segmentId: string, newAudioUrl: string | undefined) => void;
  onUpdateWordTimings: (segmentId: string, timings: WordTiming[]) => void;
  onAutoGenerateSubtitles: (segmentId?: string) => void;
  onUpdateTextOverlayStyle: (segmentId: string, styleUpdate: Partial<TextOverlayStyle>) => void;
  onUpdateDuration: (segmentId: string, newDuration: number) => void;
  onUpdateTransition: (segmentId: string, transition: TransitionEffect) => void;
  isLastSegment: boolean;
  onOpenMediaSearch: (clipId: string | null) => void;
  onRemoveMedia: (segmentId: string, clipId: string) => void;
  onOpenVideoPreview: () => void;
  onEditClipWithAI: (clipId: string) => void;
}

const fonts = [
    { name: 'Arial', value: 'Arial, sans-serif' },
    { name: 'Georgia', value: 'Georgia, serif' },
    { name: 'Impact', value: 'Impact, sans-serif' },
    { name: 'Verdana', value: 'Verdana, sans-serif' },
];

const PreviewWindow: React.FC<PreviewWindowProps> = ({ 
    segment, segments, activeSegmentId, onUpdateSegments,
    onTextChange, onUpdateAudio, onUpdateWordTimings, onAutoGenerateSubtitles, 
    onUpdateTextOverlayStyle, onUpdateDuration, onUpdateTransition, isLastSegment, 
    onOpenMediaSearch, onRemoveMedia, onOpenVideoPreview, onEditClipWithAI 
}) => {
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [generationProgress, setGenerationProgress] = useState('');
    const [audioError, setAudioError] = useState('');
    const audioPlayerRef = useRef<HTMLAudioElement>(null);
    const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    
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

    // Only use explicit word timings. Do not estimate on the fly for display.
    const effectiveTimings = useMemo(() => {
        if (segment.wordTimings && segment.wordTimings.length > 0) {
            return segment.wordTimings;
        }
        return [];
    }, [segment.wordTimings]);

    // Memoize subtitle chunks calculation to avoid re-calc on every frame
    const subtitleChunks = useMemo(() => {
        if (!style || effectiveTimings.length === 0) return [];
        return generateSubtitleChunks(
            effectiveTimings, 
            style.fontSize, 
            style.maxCaptionLines || 2,
            800 // Approx preview container width
        );
    }, [effectiveTimings, style?.fontSize, style?.maxCaptionLines]);

    const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = e.target.value;
        setFullScript(newText);
        
        const parts = newText.split(/\n\n+/); // Split by double newline
        
        const newSegments = [...segments];
        
        // Handle segmentation changes
        // 1. Update existing segments text
        // 2. If text parts > segments, add new segments
        // 3. If text parts < segments, ignore/truncate? 
        // Let's assume we map 1-to-1 as much as possible
        
        const maxLen = Math.max(parts.length, newSegments.length);
        const updatedSegments: Segment[] = [];
        
        for (let i = 0; i < maxLen; i++) {
            if (i < parts.length) {
                if (i < newSegments.length) {
                    // Update existing
                    if (newSegments[i].narration_text !== parts[i]) {
                        updatedSegments.push({
                            ...newSegments[i],
                            narration_text: parts[i],
                            audioUrl: undefined, // Invalidate audio on text change
                            wordTimings: undefined
                        });
                    } else {
                        updatedSegments.push(newSegments[i]);
                    }
                } else {
                    // Create new segment
                    // Copy media from last segment or use default
                    const lastSeg = newSegments[newSegments.length - 1];
                    updatedSegments.push({
                        ...lastSeg,
                        id: `segment-${Date.now()}-${i}`,
                        narration_text: parts[i],
                        audioUrl: undefined,
                        wordTimings: undefined,
                        media: lastSeg ? [...lastSeg.media] : [] // Shallow copy media clips
                    });
                }
            } else {
                // Text parts ran out, but we have segments. Keep them?
                // If we want strictly "text defines segments", we should remove them.
                // But removing deletes media. Let's keep them but empty the text?
                // Or simpler: Just map available text. If the user deleted a paragraph, maybe they want to delete the segment?
                // Safe bet: Keep the segment, empty the text.
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
        
        // Filter out segments that might have been effectively removed if we went strict? 
        // No, let's stick to the updated list.
        
        // However, React state batching means we should call the update function once.
        // Only update if changed
        if (JSON.stringify(updatedSegments) !== JSON.stringify(segments)) {
            onUpdateSegments(updatedSegments);
        }
    };

    const handleStyleChange = (prop: keyof TextOverlayStyle, value: any) => {
        onUpdateTextOverlayStyle(segment.id, { [prop]: value });
    };
    
    const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(1, parseFloat(e.target.value));
        onUpdateDuration(segment.id, val);
    }
    
    const handleTransitionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onUpdateTransition(segment.id, e.target.value as TransitionEffect);
    }

    const handleGenerateAllAudio = async () => {
        setIsGeneratingAudio(true);
        setGenerationProgress('Initializing...');
        setAudioError('');
        
        try {
            const updatedSegments = [...segments];
            let changed = false;
            
            for (let i = 0; i < updatedSegments.length; i++) {
                const s = updatedSegments[i];
                // Only generate if text exists
                if (s.narration_text && s.narration_text.trim().length > 0) {
                    setGenerationProgress(`Generating audio for segment ${i+1}/${updatedSegments.length}...`);
                    
                    // Add a small delay to avoid rate limits
                    if (i > 0) await new Promise(r => setTimeout(r, 500));
                    
                    try {
                        const base64Audio = await generateSpeechFromText(s.narration_text);
                        const wavBlobUrl = createWavBlobUrl(base64Audio);
                        
                        // Create temporary audio to get duration
                        const audio = new Audio(wavBlobUrl);
                        await new Promise((resolve) => {
                            audio.onloadedmetadata = () => resolve(null);
                            audio.onerror = () => resolve(null); // Fail safe
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
                        // Continue to next segment even if one fails
                    }
                }
            }
            
            if (changed) {
                onUpdateSegments(updatedSegments);
                setGenerationProgress('Done!');
            }
            
        } catch (err) {
            setAudioError('Batch generation encountered errors.');
            console.error(err);
        } finally {
            setIsGeneratingAudio(false);
            setTimeout(() => setGenerationProgress(''), 2000);
        }
    };

    const handleRemoveAudio = () => {
        onUpdateAudio(segment.id, undefined);
        onUpdateWordTimings(segment.id, []); 
    };
    
    const handleTimeUpdate = () => {
        if (audioPlayerRef.current) {
            setCurrentPlaybackTime(audioPlayerRef.current.currentTime);
        }
    };

    // Autoplay when new audio URL is set
    useEffect(() => {
        if (segment.audioUrl && audioPlayerRef.current && !isGeneratingAudio) {
            audioPlayerRef.current.load();
            audioPlayerRef.current.play().catch(() => {
                // Auto-play rules might block this
            });
        }
    }, [segment.audioUrl, isGeneratingAudio]);
    
    const getTextPositionClass = () => {
        if (!style) return 'justify-end'; // Default to bottom
        switch (style.position) {
            case 'top': return 'justify-start';
            case 'center': return 'justify-center';
            case 'bottom': return 'justify-end';
            default: return 'justify-end';
        }
    };

    const renderKaraokeText = () => {
        if (!style) return null;
        
        // Strict condition: Audio must exist AND timings must be generated
        if (!segment.audioUrl || effectiveTimings.length === 0) return null;
        
        const activeChunk = subtitleChunks.find(c => currentPlaybackTime >= c.start && currentPlaybackTime <= c.end);
        const displayChunk = activeChunk || (currentPlaybackTime < 0.1 ? subtitleChunks[0] : null);

        if (!displayChunk) {
             return null;
        }

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

    // Safety check
    if (!currentClip) return <div className="bg-gray-800 p-4">No Media Found</div>;

    return (
        <div className="bg-gray-800 rounded-lg p-4 flex-grow flex flex-col md:flex-row gap-4 h-full min-h-[300px] md:min-h-0">
            <div className="w-full md:w-2/3 flex flex-col gap-2">
                {/* Main Preview Player */}
                <div className="w-full aspect-video bg-black rounded-md overflow-hidden relative group shadow-lg border border-gray-700">
                    {currentClip.type === 'video' ? (
                        <video 
                            key={currentClip.url}
                            src={currentClip.url} 
                            className="w-full h-full object-cover"
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
                            className="w-full h-full object-cover"
                        />
                    )}
                    {/* Text Overlay */}
                    {style && (
                        <div className={`absolute inset-0 p-4 flex flex-col pointer-events-none ${getTextPositionClass()}`}>
                            {renderKaraokeText()}
                        </div>
                    )}
                    {/* Hover controls overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 pointer-events-none">
                        <button 
                            onClick={onOpenVideoPreview}
                            className="px-6 py-3 bg-purple-600/80 backdrop-blur-sm text-white font-semibold rounded-md hover:bg-purple-700/80 flex items-center gap-2 pointer-events-auto"
                            title="Preview Full Video"
                        >
                            <PlayIcon className="w-5 h-5" />
                            Preview All
                        </button>
                    </div>
                </div>

                {/* Media Clip List */}
                <div className="flex gap-2 overflow-x-auto py-2 items-center">
                    {segment.media.map((clip, idx) => (
                        <div 
                            key={clip.id} 
                            className={`relative flex-shrink-0 w-20 h-14 rounded-md overflow-hidden cursor-pointer border-2 transition-all ${idx === activeClipIndex ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-gray-600 hover:border-gray-400'}`}
                            onClick={() => setActiveClipIndex(idx)}
                        >
                            {clip.type === 'video' ? (
                                <video src={clip.url} className="w-full h-full object-cover" />
                            ) : (
                                <img src={clip.url} className="w-full h-full object-cover" />
                            )}
                            
                            <div className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-1 ${idx === activeClipIndex ? 'opacity-0 hover:opacity-100' : 'opacity-0'}`}>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onOpenMediaSearch(clip.id); }}
                                    className="p-1 bg-gray-700 rounded hover:bg-blue-600 text-white"
                                    title="Replace"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                                {segment.media.length > 1 && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onRemoveMedia(segment.id, clip.id); }}
                                        className="p-1 bg-gray-700 rounded hover:bg-red-600 text-white"
                                        title="Remove"
                                    >
                                        &times;
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    <button 
                        onClick={() => onOpenMediaSearch(null)}
                        className="flex-shrink-0 w-10 h-14 rounded-md border-2 border-dashed border-gray-600 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center text-gray-400 transition-colors"
                        title="Add another clip to this segment"
                    >
                        +
                    </button>
                </div>
                
                {/* Unified Script Textbox */}
                <div className="mt-2 relative group flex-grow flex flex-col">
                     <div className="flex justify-between items-center mb-1">
                         <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Full Video Script (All Segments)</h3>
                         <span className="text-[10px] text-gray-500">Separate segments with blank lines</span>
                     </div>
                    <div className="relative bg-gray-800 rounded-lg p-1 border border-gray-700 focus-within:border-blue-500 transition-colors flex-grow">
                         <textarea
                            value={fullScript}
                            onChange={handleScriptChange}
                            className="w-full h-full min-h-[120px] p-3 bg-transparent border-none resize-none focus:ring-0 text-white placeholder-gray-500 text-lg leading-relaxed"
                            placeholder="Enter narration text here. Use double newlines to separate segments..."
                        />
                    </div>
                </div>
            </div>

            {/* Right Sidebar (Settings) */}
            <div className="w-full md:w-1/3 flex flex-col justify-between overflow-y-auto pr-2">
                
                {/* Transition Control */}
                <div className="mb-4 bg-gray-700/30 p-3 rounded-lg border border-gray-700">
                     <div className="flex justify-between items-center">
                        <label className="text-xs text-gray-400 uppercase font-bold tracking-wider">Transition to next</label>
                     </div>
                     {isLastSegment ? (
                         <div className="text-xs text-gray-500 italic mt-1">None (End of video)</div>
                     ) : (
                         <select 
                            value={segment.transition || 'fade'}
                            onChange={handleTransitionChange}
                            className="w-full mt-1 p-2 bg-gray-800 border border-gray-600 rounded text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                            <option value="fade">Fade</option>
                            <option value="slide">Slide</option>
                            <option value="zoom">Zoom</option>
                        </select>
                     )}
                </div>
                
                 {/* Text Style Controls */}
                {style && (
                    <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                            <h4 className="text-sm font-semibold text-purple-300 uppercase tracking-wide">Text Overlay</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Font</label>
                                <select value={style.fontFamily} onChange={(e) => handleStyleChange('fontFamily', e.target.value)} className="w-full p-1.5 bg-gray-700 border border-gray-600 rounded text-sm">
                                    {fonts.map(f => <option key={f.name} value={f.value}>{f.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Size</label>
                                <input type="number" value={style.fontSize} onChange={(e) => handleStyleChange('fontSize', parseInt(e.target.value))} className="w-full p-1.5 bg-gray-700 border border-gray-600 rounded text-sm" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-gray-400 block mb-1">Highlight Color</label>
                                <div className="flex items-center gap-2 bg-gray-700 p-1 rounded border border-gray-600">
                                    <input type="color" value={style.color} onChange={(e) => handleStyleChange('color', e.target.value)} className="w-6 h-6 p-0 border-none rounded cursor-pointer bg-transparent" />
                                    <span className="text-xs text-gray-300">{style.color}</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Lines</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="4" 
                                    value={style.maxCaptionLines || 2} 
                                    onChange={(e) => handleStyleChange('maxCaptionLines', parseInt(e.target.value))} 
                                    className="w-full p-1.5 bg-gray-700 border border-gray-600 rounded text-sm" 
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Animation</label>
                                <select 
                                    value={style.animation || 'none'} 
                                    onChange={(e) => handleStyleChange('animation', e.target.value)} 
                                    className="w-full p-1.5 bg-gray-700 border border-gray-600 rounded text-sm"
                                >
                                    <option value="none">None</option>
                                    <option value="scale">Scale</option>
                                    <option value="slide-up">Slide Up</option>
                                    <option value="highlight">Highlight</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}


                <div className="mt-auto bg-gray-800 border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-semibold mb-2 text-purple-300 uppercase tracking-wide">Audio Track</h4>
                    {segment.audioUrl && (
                        <div className="mb-2">
                             <audio 
                                ref={audioPlayerRef} 
                                controls 
                                onTimeUpdate={handleTimeUpdate}
                                src={segment.audioUrl} 
                                className="w-full h-8" 
                            />
                        </div>
                    )}
                    
                    {/* Generation Status */}
                    {isGeneratingAudio && (
                        <div className="mb-2 text-xs text-purple-300 animate-pulse">
                            {generationProgress}
                        </div>
                    )}
                    
                    <div className="flex gap-2 flex-col">
                        <button 
                            onClick={handleGenerateAllAudio} 
                            disabled={isGeneratingAudio}
                            className="w-full px-3 py-3 bg-purple-600 text-white text-sm font-semibold rounded hover:bg-purple-700 disabled:bg-gray-600 flex items-center justify-center gap-2 transition-colors shadow-lg"
                        >
                            {isGeneratingAudio ? <LoadingSpinner /> : <MusicIcon className="w-4 h-4" />}
                            Generate Voice for ALL Segments
                        </button>
                        
                        {segment.audioUrl && (
                            <button 
                                onClick={handleRemoveAudio}
                                className="w-full px-3 py-2 bg-red-900/30 text-red-300 border border-red-900/50 text-xs font-semibold rounded hover:bg-red-900/50"
                                title="Remove Audio from this segment"
                            >
                                Remove Current Audio
                            </button>
                        )}
                    </div>
                    {audioError && <p className="text-xs text-red-400 mt-1">{audioError}</p>}
                </div>
            </div>
        </div>
    );
};

export default PreviewWindow;
