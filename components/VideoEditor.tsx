
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { VideoScript, Segment, TransitionEffect, TextOverlayStyle, WordTiming, MediaClip, AudioClip, AIToolTab } from '../types';
import PreviewWindow from './PreviewWindow';
import Timeline from './Timeline';
import ResourcePanel from './ResourcePanel';
import PropertiesPanel from './PropertiesPanel';
import AIToolsModal from './AIToolsModal';
import ExportModal from './ExportModal';
import { UndoIcon, RedoIcon, ExportIcon, MediaIcon, MusicIcon, TextIcon, MagicWandIcon, ChevronLeftIcon } from './icons';
import { estimateWordTimings, getAudioDuration, createWavBlobUrl } from '../utils/media';
import { generateSpeechFromText } from '../services/geminiService';

interface VideoEditorProps {
  initialScript: VideoScript;
}

const VideoEditor: React.FC<VideoEditorProps> = ({ initialScript }) => {
  const [title, setTitle] = useState(initialScript.title);
  
  // History State
  const [history, setHistory] = useState<{
      past: { segments: Segment[], audioTracks: AudioClip[] }[];
      present: { segments: Segment[], audioTracks: AudioClip[] };
      future: { segments: Segment[], audioTracks: AudioClip[] }[];
  }>({
      past: [],
      present: { 
          segments: initialScript.segments, 
          audioTracks: initialScript.audioTracks || [] 
      },
      future: []
  });

  const segments = history.present.segments;
  const audioTracks = history.present.audioTracks;

  // --- PLAYBACK STATE ---
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIntervalRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // --- UI STATE ---
  const [activeResourceTab, setActiveResourceTab] = useState('media');
  const [resourceAudioType, setResourceAudioType] = useState<'music' | 'sfx'>('music');
  const [isResourcePanelOpen, setIsResourcePanelOpen] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(segments[0]?.id || null);
  const [activeAudioTrackId, setActiveAudioTrackId] = useState<string | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAIToolsOpen, setIsAIToolsOpen] = useState(false);
  const [aiToolsInitialTab, setAiToolsInitialTab] = useState<AIToolTab>('edit-image');

  // Calculate total duration
  const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0);

  const updateHistory = useCallback((newSegments: Segment[], newAudioTracks: AudioClip[]) => {
      setHistory(curr => ({
          past: [...curr.past, curr.present],
          present: { segments: newSegments, audioTracks: newAudioTracks },
          future: []
      }));
  }, []);

  const updateSegments = useCallback((newSegmentsOrUpdater: Segment[] | ((prev: Segment[]) => Segment[])) => {
      const newSegments = typeof newSegmentsOrUpdater === 'function' 
          ? newSegmentsOrUpdater(history.present.segments) 
          : newSegmentsOrUpdater;
      updateHistory(newSegments, history.present.audioTracks);
  }, [history.present, updateHistory]);
  
  const updateAudioTracks = useCallback((newTracksOrUpdater: AudioClip[] | ((prev: AudioClip[]) => AudioClip[])) => {
      const newTracks = typeof newTracksOrUpdater === 'function'
          ? newTracksOrUpdater(history.present.audioTracks)
          : newTracksOrUpdater;
      updateHistory(history.present.segments, newTracks);
  }, [history.present, updateHistory]);

  const handleUndo = useCallback(() => {
      setHistory(curr => {
          if (curr.past.length === 0) return curr;
          const previous = curr.past[curr.past.length - 1];
          const newPast = curr.past.slice(0, curr.past.length - 1);
          return {
              past: newPast,
              present: previous,
              future: [curr.present, ...curr.future]
          };
      });
  }, []);

  const handleRedo = useCallback(() => {
      setHistory(curr => {
          if (curr.future.length === 0) return curr;
          const next = curr.future[0];
          const newFuture = curr.future.slice(1);
          return {
              past: [...curr.past, curr.present],
              present: next,
              future: newFuture
          };
      });
  }, []);

  // Selection Handlers (Mutual Exclusion)
  const handleSelectSegment = useCallback((id: string | null) => {
      setActiveSegmentId(id);
      if (id) setActiveAudioTrackId(null);
  }, []);

  const handleSelectAudioTrack = useCallback((id: string | null) => {
      setActiveAudioTrackId(id);
      if (id) setActiveSegmentId(null);
  }, []);

  useEffect(() => {
      if (isPlaying) {
          let elapsed = 0;
          for (const seg of segments) {
              if (currentTime >= elapsed && currentTime < elapsed + seg.duration) {
                  // Only auto-switch segment if we are NOT strictly editing an audio track
                  if (activeSegmentId !== seg.id && !activeAudioTrackId) {
                      setActiveSegmentId(seg.id);
                  }
                  break;
              }
              elapsed += seg.duration;
          }
      }
  }, [currentTime, isPlaying, segments, activeSegmentId, activeAudioTrackId]); 

  // Segment Safety
  useEffect(() => {
      if (activeSegmentId && !segments.find(s => s.id === activeSegmentId)) {
          setActiveSegmentId(segments[0]?.id || null);
      }
  }, [segments, activeSegmentId]);

  const activeSegmentIndex = segments.findIndex(s => s.id === activeSegmentId);
  const activeSegment = segments[activeSegmentIndex] || null;
  const activeAudioTrack = audioTracks.find(t => t.id === activeAudioTrackId) || null;

  // --- PLAYBACK LOGIC ---
  const togglePlay = useCallback(() => {
      setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((time: number) => {
      const clampedTime = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(clampedTime);
      
      // Auto-select logic on manual seek if we aren't focused on audio
      if (!activeAudioTrackId) {
        let elapsed = 0;
        for (const seg of segments) {
            if (clampedTime >= elapsed && clampedTime < elapsed + seg.duration) {
                setActiveSegmentId(seg.id);
                break;
            }
            elapsed += seg.duration;
        }
      }
  }, [totalDuration, segments, activeAudioTrackId]);

  useEffect(() => {
      if (isPlaying) {
          lastTimeRef.current = performance.now();
          const loop = (timestamp: number) => {
              const delta = (timestamp - lastTimeRef.current) / 1000;
              lastTimeRef.current = timestamp;
              setCurrentTime(prev => {
                  const nextTime = prev + delta;
                  if (nextTime >= totalDuration) {
                      setIsPlaying(false);
                      return 0; 
                  }
                  return nextTime;
              });
              playbackIntervalRef.current = requestAnimationFrame(loop);
          };
          playbackIntervalRef.current = requestAnimationFrame(loop);
      } else {
          if (playbackIntervalRef.current) cancelAnimationFrame(playbackIntervalRef.current);
      }
      return () => { if (playbackIntervalRef.current) cancelAnimationFrame(playbackIntervalRef.current); };
  }, [isPlaying, totalDuration]);


  // --- HANDLERS ---
  const handleUpdateSegmentText = useCallback((segmentId: string, newText: string) => {
    updateSegments(prev => prev.map(s => s.id === segmentId ? { ...s, narration_text: newText, wordTimings: undefined } : s));
  }, [updateSegments]);
  
  const handleResourceSelectMedia = useCallback((newUrl: string, type: 'image' | 'video') => {
      if (!activeSegmentId) return;
      updateSegments(prev => prev.map(s => {
        if (s.id !== activeSegmentId) return s;
        return { 
            ...s, 
            media: [{ id: `clip-${Date.now()}`, url: newUrl, type }] 
        };
      }));
      if (window.innerWidth < 768) setIsResourcePanelOpen(false);
  }, [activeSegmentId, updateSegments]);

  const handleResourceSelectAudio = useCallback(async (url: string, name: string, type: 'music' | 'sfx' = 'music') => {
      let duration = 10;
      try {
          const detectedDuration = await getAudioDuration(url);
          if (detectedDuration > 0) duration = detectedDuration;
      } catch (e) {
          console.warn("Could not detect audio duration", e);
      }

      updateAudioTracks(prev => [...prev, { 
          id: `audio-${Date.now()}`, 
          url, 
          name, 
          type: type, 
          startTime: currentTime, 
          duration: duration, 
          volume: type === 'music' ? 0.5 : 0.8 
      }]);
      if (window.innerWidth < 768) setIsResourcePanelOpen(false);
  }, [updateAudioTracks, currentTime]);

  const handleResourceAddText = useCallback((text: string) => {
      if (activeSegmentId) {
          handleUpdateSegmentText(activeSegmentId, text);
      }
      if (window.innerWidth < 768) setIsResourcePanelOpen(false);
  }, [activeSegmentId, handleUpdateSegmentText]);

  const handleAutoCaptions = useCallback(() => {
    updateSegments(prev => prev.map(s => {
      if (!s.narration_text) return s;
      const timings = estimateWordTimings(s.narration_text, s.duration);
      const existingStyle: Partial<TextOverlayStyle> = s.textOverlayStyle || {};
      const newStyle: TextOverlayStyle = {
          fontFamily: existingStyle.fontFamily || 'Arial, sans-serif',
          fontSize: existingStyle.fontSize && existingStyle.fontSize < 40 ? existingStyle.fontSize : 24,
          color: existingStyle.color || '#FFFFFF',
          position: 'bottom',
          backgroundColor: 'rgba(0,0,0,0.6)',
          animation: 'highlight',
          maxCaptionLines: 2,
      };

      return {
        ...s,
        wordTimings: timings,
        textOverlayStyle: newStyle
      }
    }));
    if (window.innerWidth < 768) setIsResourcePanelOpen(false);
  }, [updateSegments]);

  const handleGenerateAllNarrations = useCallback(async () => {
      const newSegments = [...segments];
      let hasUpdates = false;

      for (let i = 0; i < newSegments.length; i++) {
          const seg = newSegments[i];
          if (seg.narration_text) {
             try {
                 const base64Audio = await generateSpeechFromText(seg.narration_text);
                 const wavUrl = createWavBlobUrl(base64Audio);
                 const duration = await getAudioDuration(wavUrl);
                 
                 newSegments[i] = {
                     ...seg,
                     audioUrl: wavUrl,
                     duration: duration
                 };
                 hasUpdates = true;
             } catch (e) {
                 console.error(`Failed to generate narration for segment ${i}`, e);
             }
          }
      }
      
      if (hasUpdates) {
          updateSegments(newSegments);
      }
  }, [segments, updateSegments]);


  const handleUpdateSegmentAudio = useCallback((segmentId: string, newAudioUrl: string | undefined, audioDuration?: number) => {
    updateSegments(prev => prev.map(s => s.id === segmentId ? { ...s, audioUrl: newAudioUrl, duration: (audioDuration && audioDuration > 0 && audioDuration < s.duration ? audioDuration : s.duration) } : s));
  }, [updateSegments]);

  const handleUpdateWordTimings = useCallback((segmentId: string, timings: WordTiming[]) => {
      updateSegments(prev => prev.map(s => s.id === segmentId ? { ...s, wordTimings: timings } : s));
  }, [updateSegments]);
  
  const handleUpdateSegmentVolume = useCallback((segmentId: string, newVolume: number) => {
      updateSegments(prev => prev.map(s => s.id === segmentId ? { ...s, audioVolume: newVolume } : s));
  }, [updateSegments]);

  const handleUpdateSegmentDuration = useCallback((segmentId: string, newDuration: number) => {
      updateSegments(prev => prev.map(s => s.id === segmentId ? { ...s, duration: newDuration } : s));
  }, [updateSegments]);

  const handleUpdateSegmentTransition = useCallback((segmentId: string, newTransition: TransitionEffect) => {
    updateSegments(prev => prev.map(s => s.id === segmentId ? { ...s, transition: newTransition } : s));
  }, [updateSegments]);

  const handleUpdateSegmentTextOverlayStyle = useCallback((segmentId: string, styleUpdate: Partial<TextOverlayStyle>) => {
    updateSegments(prev => prev.map(s => s.id === segmentId ? { ...s, textOverlayStyle: { ...s.textOverlayStyle!, ...styleUpdate } } : s));
  }, [updateSegments]);

  const handleSplitSegment = useCallback((segmentId: string, splitTime: number) => {
    const original = segments.find(s => s.id === segmentId);
    if (!original || splitTime < 0.5 || splitTime > original.duration - 0.5) return;
    const index = segments.indexOf(original);
    const durA = splitTime;
    const durB = original.duration - splitTime;
    const segA = { ...original, duration: durA, audioUrl: undefined };
    const segB = { ...original, id: `segment-${Date.now()}-split`, duration: durB, media: original.media.map(m => ({ ...m, id: `clip-${Date.now()}-split` })), audioUrl: undefined };
    const newSegments = [...segments];
    newSegments.splice(index, 1, segA, segB);
    updateSegments(newSegments);
    setActiveSegmentId(segA.id);
  }, [segments, updateSegments]);

  const handleSplitActiveSegment = useCallback(() => {
    if (!activeSegmentId) return;
    const index = segments.findIndex(s => s.id === activeSegmentId);
    if (index === -1) return;
    let startTime = 0;
    for (let i = 0; i < index; i++) {
        startTime += segments[i].duration;
    }
    const relativeTime = currentTime - startTime;
    handleSplitSegment(activeSegmentId, relativeTime);
  }, [activeSegmentId, segments, currentTime, handleSplitSegment]);

  const handleDeleteSegment = useCallback(() => {
    if (!activeSegmentId) return;
    updateSegments(prev => {
        if (prev.length <= 1) return prev;
        return prev.filter(s => s.id !== activeSegmentId);
    });
    // Reset selection
    setActiveSegmentId(null);
  }, [activeSegmentId, updateSegments]);

  const handleAddSegment = useCallback(() => {
      const newSegment: Segment = {
        id: `segment-${Date.now()}`,
        narration_text: "New Scene",
        search_keywords_for_media: "",
        media: [{ id: `clip-${Date.now()}`, url: "https://placehold.co/1280x720/1f2937/ffffff?text=Select+Media", type: 'image' }],
        duration: 3,
        audioVolume: 1,
        transition: 'fade',
        textOverlayStyle: {
            fontFamily: 'Arial, sans-serif',
            fontSize: 40,
            color: '#EAB308',
            position: 'bottom',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            animation: 'scale',
            maxCaptionLines: 2,
        }
      };
      updateSegments(prev => [...prev, newSegment]);
      handleSelectSegment(newSegment.id);
      setActiveResourceTab('media');
      setIsResourcePanelOpen(true);
  }, [updateSegments, handleSelectSegment]);

  const handleTimelineAddAudio = useCallback((type: 'music' | 'sfx' = 'music') => {
      setResourceAudioType(type);
      setActiveResourceTab('audio');
      setIsResourcePanelOpen(true);
  }, []);

  const handleUpdateAudioTrack = useCallback((trackId: string, updates: Partial<AudioClip>) => {
      updateAudioTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...updates } : t));
  }, [updateAudioTracks]);

  const handleDeleteAudioTrack = useCallback((trackId: string) => {
      updateAudioTracks(prev => prev.filter(t => t.id !== trackId));
      if (activeAudioTrackId === trackId) setActiveAudioTrackId(null);
  }, [updateAudioTracks, activeAudioTrackId]);

  const handleDockClick = (tab: string) => {
    if (activeResourceTab === tab && isResourcePanelOpen) {
      setIsResourcePanelOpen(false);
    } else {
      setActiveResourceTab(tab);
      setIsResourcePanelOpen(true);
    }
  };
  
  const handleOpenAITools = useCallback((tab: AIToolTab = 'edit-image') => {
      setAiToolsInitialTab(tab);
      setIsAIToolsOpen(true);
  }, []);


  return (
    <div className="flex flex-col h-screen w-full bg-[#121212] text-gray-100 font-sans overflow-hidden">
        
        {/* TOP HEADER */}
        <div className="h-12 md:h-14 bg-[#1e1e1e] border-b border-black/50 flex items-center justify-between px-3 md:px-4 z-50 flex-shrink-0 shadow-md">
             <div className="flex items-center gap-3">
                 <button className="flex items-center gap-2 hover:opacity-80 transition-opacity" onClick={() => window.location.reload()}>
                    <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                        <span className="font-bold text-white text-base md:text-lg">M</span>
                    </div>
                 </button>
                 <div className="flex flex-col">
                    <input 
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        className="bg-transparent text-gray-200 text-sm font-medium focus:text-white outline-none hover:bg-white/5 px-2 rounded transition-colors w-32 md:w-64"
                        placeholder="Untitled Project"
                    />
                 </div>
             </div>
            
            <div className="flex items-center gap-2 md:gap-3">
                 <div className="hidden md:flex items-center bg-[#2a2a2a] rounded-md p-0.5 border border-white/5">
                    <button onClick={handleUndo} disabled={history.past.length === 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30 hover:bg-white/5 rounded"><UndoIcon className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-gray-700"></div>
                    <button onClick={handleRedo} disabled={history.future.length === 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30 hover:bg-white/5 rounded"><RedoIcon className="w-4 h-4" /></button>
                </div>
                <button 
                    onClick={() => setIsExportOpen(true)} 
                    className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-md text-xs md:text-sm font-semibold hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg transition-all"
                >
                    <ExportIcon className="w-4 h-4" /> <span className="hidden md:inline">Export</span>
                </button>
            </div>
        </div>

        {/* MAIN LAYOUT */}
        <div className="flex-grow flex flex-col relative overflow-hidden">
             
             {/* PREVIEW AREA */}
             <div className="flex-grow flex flex-col relative bg-[#0f0f0f] overflow-hidden">
                <div className="absolute inset-0 opacity-10 pointer-events-none" 
                        style={{ 
                            backgroundImage: `
                            linear-gradient(45deg, #333 25%, transparent 25%), 
                            linear-gradient(-45deg, #333 25%, transparent 25%), 
                            linear-gradient(45deg, transparent 75%, #333 75%), 
                            linear-gradient(-45deg, transparent 75%, #333 75%)
                            `,
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' 
                        }}>
                </div>

                <div className="flex-grow flex items-center justify-center p-2 md:p-4 z-10">
                    <div className="relative shadow-2xl bg-black ring-1 ring-white/10 w-full h-full max-h-full flex items-center justify-center">
                         <div className="relative w-full h-full max-w-full max-h-full aspect-video md:aspect-auto flex items-center justify-center">
                            <PreviewWindow 
                                title={title}
                                onTitleChange={setTitle}
                                segments={segments} 
                                activeSegmentId={activeSegmentId!}
                                onUpdateSegments={updateSegments} 
                                segment={activeSegment || segments[0]} 
                                currentTime={currentTime} isPlaying={isPlaying} totalDuration={totalDuration}
                                onPlayPause={togglePlay} onSeek={handleSeek}
                                onTextChange={handleUpdateSegmentText}
                                onUpdateAudio={handleUpdateSegmentAudio}
                                onUpdateWordTimings={handleUpdateWordTimings}
                                onUpdateTextOverlayStyle={handleUpdateSegmentTextOverlayStyle}
                                onUpdateDuration={handleUpdateSegmentDuration}
                                onUpdateTransition={handleUpdateSegmentTransition}
                                onUpdateVolume={handleUpdateSegmentVolume}
                                isLastSegment={false}
                                onOpenMediaSearch={() => {}} 
                                onRemoveMedia={() => {}}
                                onEditClipWithAI={() => {}}
                                onReorderClips={() => {}}
                                onSplitSegment={handleSplitSegment}
                            />
                         </div>
                    </div>
                </div>

                {isResourcePanelOpen && (
                    <div className="fixed inset-0 md:absolute md:inset-auto md:top-4 md:left-4 md:bottom-4 md:w-[400px] bg-[#1e1e1e] md:rounded-xl shadow-2xl border-0 md:border border-gray-700 z-[60] flex flex-col overflow-hidden animate-slide-in-up md:animate-slide-in-left">
                        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-[#252525]">
                             <div className="flex items-center gap-2">
                                <button onClick={() => setIsResourcePanelOpen(false)} className="md:hidden text-gray-400 hover:text-white">
                                    <ChevronLeftIcon className="w-6 h-6" />
                                </button>
                                <span className="font-bold text-white capitalize text-lg">{activeResourceTab} Library</span>
                             </div>
                             <button onClick={() => setIsResourcePanelOpen(false)} className="hidden md:block text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                        </div>
                        <ResourcePanel 
                            activeTab={activeResourceTab}
                            initialAudioType={resourceAudioType}
                            onSelectMedia={handleResourceSelectMedia}
                            onSelectAudio={handleResourceSelectAudio}
                            onAddText={handleResourceAddText}
                            onUpdateSegmentText={handleUpdateSegmentText}
                            onOpenAITools={handleOpenAITools}
                            onAutoCaptions={handleAutoCaptions}
                            segments={segments}
                            activeSegmentId={activeSegmentId}
                            onSelectSegment={handleSelectSegment}
                        />
                    </div>
                )}
             </div>

             {/* PROPERTIES PANEL */}
             <div className="flex-shrink-0 z-30 bg-[#1e1e1e] border-t border-b border-black/50 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                 <PropertiesPanel 
                    segment={activeSegment}
                    audioTrack={activeAudioTrack}
                    onUpdateAudioTrack={handleUpdateAudioTrack}
                    onDeleteAudioTrack={handleDeleteAudioTrack}
                    onUpdateVolume={handleUpdateSegmentVolume}
                    onUpdateText={handleUpdateSegmentText}
                    onUpdateStyle={handleUpdateSegmentTextOverlayStyle}
                    onUpdateTransition={handleUpdateSegmentTransition}
                    onDelete={handleDeleteSegment}
                    onOpenAITools={() => handleOpenAITools()}
                 />
             </div>
             
             {/* TIMELINE */}
             <div className="flex-shrink-0 h-[30vh] md:h-[280px] bg-[#161616] flex flex-col z-20 relative">
                <div className="flex-grow relative overflow-hidden">
                        <Timeline 
                        segments={segments}
                        audioTracks={audioTracks}
                        onReorder={updateSegments}
                        activeSegmentId={activeSegmentId}
                        activeAudioTrackId={activeAudioTrackId}
                        setActiveSegmentId={handleSelectSegment}
                        onSelectAudioTrack={handleSelectAudioTrack}
                        onUpdateTransition={handleUpdateSegmentTransition}
                        onUpdateVolume={handleUpdateSegmentVolume}
                        timelineZoom={timelineZoom}
                        setTimelineZoom={setTimelineZoom}
                        onNudgeSegment={() => {}}
                        onAddSegment={handleAddSegment}
                        onUpdateAudioTrack={handleUpdateAudioTrack}
                        onDeleteAudioTrack={handleDeleteAudioTrack}
                        onUpdateSegmentDuration={handleUpdateSegmentDuration}
                        onAddAudioTrack={handleTimelineAddAudio}
                        currentTime={currentTime}
                        isPlaying={isPlaying}
                        onSeek={handleSeek}
                        onSplit={handleSplitActiveSegment}
                        onDelete={handleDeleteSegment}
                    />
                </div>
             </div>

        </div>

        {/* BOTTOM MENU DOCK */}
        <div className="h-16 md:h-20 bg-[#18181b] border-t border-gray-800 flex items-center justify-evenly md:justify-center md:gap-8 z-50 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] safe-area-bottom">
            <DockButton 
                icon={<MediaIcon className="w-5 h-5 md:w-6 md:h-6" />} 
                label="Media" 
                active={isResourcePanelOpen && activeResourceTab === 'media'} 
                onClick={() => handleDockClick('media')} 
            />
            <DockButton 
                icon={<MusicIcon className="w-5 h-5 md:w-6 md:h-6" />} 
                label="Audio" 
                active={isResourcePanelOpen && activeResourceTab === 'audio'} 
                onClick={() => handleDockClick('audio')} 
            />
            <DockButton 
                icon={<TextIcon className="w-5 h-5 md:w-6 md:h-6" />} 
                label="Text" 
                active={isResourcePanelOpen && activeResourceTab === 'text'} 
                onClick={() => handleDockClick('text')} 
            />
            <DockButton 
                icon={<MagicWandIcon className="w-5 h-5 md:w-6 md:h-6" />} 
                label="AI Tools" 
                active={isResourcePanelOpen && activeResourceTab === 'ai'} 
                onClick={() => handleDockClick('ai')} 
            />
        </div>

        {/* MODALS */}
        {isAIToolsOpen && activeSegment && (
            <AIToolsModal
                isOpen={isAIToolsOpen}
                onClose={() => setIsAIToolsOpen(false)}
                segment={activeSegment}
                activeClipId={activeSegment.media[0].id}
                onUpdateMedia={(newUrl) => handleResourceSelectMedia(newUrl, 'image')}
                onUpdateAudio={(newUrl, duration) => handleUpdateSegmentAudio(activeSegment.id, newUrl, duration)}
                initialTab={aiToolsInitialTab}
                onGenerateAllNarrations={handleGenerateAllNarrations}
            />
        )}

        <ExportModal 
            isOpen={isExportOpen}
            onClose={() => setIsExportOpen(false)}
            title={title}
            segments={segments}
            audioTracks={audioTracks}
        />
    </div>
  );
};

const DockButton: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1 w-16 md:w-20 h-full transition-all duration-200 border-t-2 ${active ? 'border-purple-500 bg-white/5 text-purple-400' : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'}`}
    >
        <div className={`p-1.5 rounded-full ${active ? 'bg-purple-500/10' : ''}`}>{icon}</div>
        <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
)

export default VideoEditor;
