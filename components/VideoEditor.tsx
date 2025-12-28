
import React, { useState, useEffect, useRef } from 'react';
import { VideoScript, Segment, TransitionEffect, AIToolTab, AudioClip } from '../types';
import Sidebar from './Sidebar';
import Timeline from './Timeline';
import PreviewWindow from './PreviewWindow';
import Toolbar from './Toolbar';
import PropertiesPanel from './PropertiesPanel';
import ResourcePanel from './ResourcePanel';
import AIToolsModal from './AIToolsModal';
import ExportModal from './ExportModal';
import VideoPreviewModal from './VideoPreviewModal';
import { ChevronLeftIcon, ExportIcon, PlayIcon, SaveIcon, ChevronDownIcon } from './icons';
import { estimateWordTimings, createWavBlobUrl, getAudioDuration } from '../utils/media';
import { generateSpeechFromText } from '../services/geminiService';
import { saveProject } from '../services/projectService';
import LoadingSpinner from './LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

interface VideoEditorProps {
  initialScript: VideoScript;
}

const VideoEditor: React.FC<VideoEditorProps> = ({ initialScript }) => {
  // --- STATE ---
  const [projectId, setProjectId] = useState(initialScript.id);
  const [segments, setSegments] = useState<Segment[]>(initialScript.segments);
  const [audioTracks, setAudioTracks] = useState<AudioClip[]>(initialScript.audioTracks || []);
  const [title, setTitle] = useState(initialScript.title);

  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(segments.length > 0 ? segments[0].id : null);
  const [activeAudioTrackId, setActiveAudioTrackId] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);

  // Panels & Modals
  const [activeMenu, setActiveMenu] = useState<string | null>(null); // For Toolbar
  const [isResourcePanelOpen, setIsResourcePanelOpen] = useState(false);
  const [activeResourceTab, setActiveResourceTab] = useState<string>('media');
  const [resourceAudioType, setResourceAudioType] = useState<'music' | 'sfx' | undefined>(undefined);

  const [showAITools, setShowAITools] = useState(false);
  const [activeAIToolTab, setActiveAIToolTab] = useState<AIToolTab>('edit-image');
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Menu Dropdown States
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  // Saving State
  const [isSaving, setIsSaving] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  
  const stopGenerationRef = useRef(false);
  const { deductCredits } = useAuth();
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // --- DERIVED STATE ---
  const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0);
  const activeSegment = segments.find(s => s.id === activeSegmentId) || null;
  const activeAudioTrack = audioTracks.find(t => t.id === activeAudioTrackId) || null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (saveMenuRef.current && !saveMenuRef.current.contains(event.target as Node)) {
            setIsSaveMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      setCurrentTime(prev => {
        const next = prev + deltaTime;
        if (next >= totalDuration) {
           setIsPlaying(false);
           return totalDuration; 
        }
        return next;
      });
    }
    lastTimeRef.current = time;
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [isPlaying, totalDuration]);

  const handleSeek = (time: number) => {
      setCurrentTime(Math.min(Math.max(0, time), totalDuration));
  };

  const handlePlayPause = () => {
      setIsPlaying(!isPlaying);
  };

  const handleSaveProject = () => {
      setIsSaving(true);
      try {
          const projectData: VideoScript = {
              id: projectId,
              title,
              segments,
              audioTracks,
              backgroundMusicKeywords: initialScript.backgroundMusicKeywords
          };
          const saved = saveProject(projectData);
          setProjectId(saved.id); 
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg z-[100] animate-fade-in-up text-sm font-bold flex items-center gap-2';
          toast.innerHTML = '<span>Project Saved</span>';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
      } catch (e) {
          alert("Failed to save project. Browser storage might be full.");
      } finally {
          setIsSaving(false);
      }
  }

  const handleUpdateSegment = (id: string, updates: Partial<Segment>) => {
      setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleUpdateSegmentText = (id: string, text: string) => {
      const seg = segments.find(s => s.id === id);
      if(seg) {
          const timings = estimateWordTimings(text, seg.duration);
          handleUpdateSegment(id, { narration_text: text, wordTimings: timings });
      }
  };

  const handleUpdateSegmentDuration = (id: string, newDuration: number) => {
      handleUpdateSegment(id, { duration: newDuration });
  }

  const handleReorderSegments = (newOrder: Segment[]) => {
      setSegments(newOrder);
  };
  
  const handleSplitSegment = () => {
      if (!activeSegment) return;
      let elapsed = 0;
      for (const s of segments) {
          if (s.id === activeSegment.id) break;
          elapsed += s.duration;
      }
      const splitPoint = currentTime - elapsed;
      if (splitPoint <= 0.5 || splitPoint >= activeSegment.duration - 0.5) {
          alert("Cannot split too close to the edge.");
          return;
      }
      const dur1 = splitPoint;
      const dur2 = activeSegment.duration - splitPoint;
      const seg1: Segment = {
          ...activeSegment,
          duration: dur1,
          wordTimings: estimateWordTimings(activeSegment.narration_text, dur1)
      };
      const seg2: Segment = {
          ...activeSegment,
          id: `segment-${Date.now()}`,
          duration: dur2,
          narration_text: "", 
          wordTimings: [],
          media: JSON.parse(JSON.stringify(activeSegment.media)) 
      };
      const idx = segments.findIndex(s => s.id === activeSegment.id);
      const newSegs = [...segments];
      newSegs.splice(idx, 1, seg1, seg2);
      setSegments(newSegs);
      setActiveSegmentId(seg2.id);
  }

  const handleDelete = () => {
      if (activeSegmentId) {
          if (segments.length <= 1) return;
          const idx = segments.findIndex(s => s.id === activeSegmentId);
          const newSegs = segments.filter(s => s.id !== activeSegmentId);
          setSegments(newSegs);
          setActiveSegmentId(newSegs[Math.min(idx, newSegs.length - 1)].id);
      } else if (activeAudioTrackId) {
          setAudioTracks(prev => prev.filter(t => t.id !== activeAudioTrackId));
          setActiveAudioTrackId(null);
      }
  }

  const handleAddSegment = () => {
      const newSeg: Segment = {
          id: `segment-${Date.now()}`,
          narration_text: "New Scene",
          search_keywords_for_media: "background",
          media: [{
              id: `clip-${Date.now()}`,
              url: "https://placehold.co/1280x720/1f2937/ffffff?text=New+Clip",
              type: 'image'
          }],
          duration: 3,
          transition: 'fade',
          textOverlayStyle: {
             fontFamily: 'Arial', fontSize: 40, color: '#ffffff', position: 'bottom', backgroundColor: 'rgba(0,0,0,0.5)'
          }
      };
      setSegments([...segments, newSeg]);
      setActiveSegmentId(newSeg.id);
  }

  const handleUpdateAudioTrack = (id: string, updates: Partial<AudioClip>) => {
      setAudioTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }
  
  const handleAddAudioTrack = (type: 'music' | 'sfx') => {
      setResourceAudioType(type);
      setActiveResourceTab('audio');
      setIsResourcePanelOpen(true);
  }

  const handleResourceSelectMedia = (url: string, type: 'image' | 'video') => {
      if (activeSegmentId) {
          handleUpdateSegment(activeSegmentId, {
              media: [{
                  id: `clip-${Date.now()}`,
                  url,
                  type
              }]
          });
      }
  }

  const handleResourceSelectAudio = async (url: string, name: string, type: 'music' | 'sfx' = 'music') => {
      const duration = await getAudioDuration(url) || 10;
      const newTrack: AudioClip = {
          id: `audio-${Date.now()}`,
          url,
          name,
          type,
          startTime: currentTime, 
          duration,
          volume: type === 'music' ? 0.3 : 0.8
      };
      setAudioTracks([...audioTracks, newTrack]);
  }

  const handleResourceAddText = (text: string) => {
      if (activeSegmentId) {
          handleUpdateSegmentText(activeSegmentId, text);
      }
  }

  const handleAutoCaptions = () => {
      const updatedSegments = segments.map(seg => {
          if (seg.narration_text) {
              return {
                  ...seg,
                  wordTimings: estimateWordTimings(seg.narration_text, seg.duration)
              };
          }
          return seg;
      });
      setSegments(updatedSegments);
  }

  const handleOpenAITools = (tab?: AIToolTab) => {
      if (tab) setActiveAIToolTab(tab);
      setShowAITools(true);
  }

  const handleSidebarTabClick = (tab: string) => {
      if (tab === activeResourceTab && isResourcePanelOpen) {
          setIsResourcePanelOpen(false);
      } else {
          setActiveResourceTab(tab);
          setIsResourcePanelOpen(true);
          if (tab === 'audio') {
              setResourceAudioType('music'); 
          }
      }
  }

  const handleAIToolsUpdateMedia = (url: string, type: 'image' | 'video') => {
      handleResourceSelectMedia(url, type);
  }

  const handleAIToolsUpdateAudio = (url: string, duration?: number) => {
      if (activeSegmentId) {
          const updates: Partial<Segment> = { audioUrl: url };
          handleUpdateSegment(activeSegmentId, updates);
      }
  }

  const handleGenerateAllNarrations = async () => {
      const indicesToProcess = segments
          .map((s, i) => (s.narration_text && !s.audioUrl ? i : -1))
          .filter(i => i !== -1);
      
      if (indicesToProcess.length === 0) {
          alert("All segments with text already have audio!");
          return;
      }

      const cost = indicesToProcess.length * 1; 
      const proceed = await deductCredits(cost, 'bulk_tts');
      if (!proceed) return;

      setGenerationProgress({ current: 0, total: indicesToProcess.length });
      stopGenerationRef.current = false;
      
      let completedCount = 0;
      let currentSegmentsState = [...segments];

      for (const idx of indicesToProcess) {
          if (stopGenerationRef.current) break;
          const seg = currentSegmentsState[idx];
          try {
              const base64Audio = await generateSpeechFromText(seg.narration_text);
              const wavUrl = createWavBlobUrl(base64Audio);
              const duration = await getAudioDuration(wavUrl);
              
              currentSegmentsState[idx] = {
                  ...seg,
                  audioUrl: wavUrl,
                  duration: duration > 0 ? duration : seg.duration,
                  audioVolume: 1.0,
                  wordTimings: estimateWordTimings(seg.narration_text, duration > 0 ? duration : seg.duration)
              };
              setSegments([...currentSegmentsState]);
              completedCount++;
              setGenerationProgress({ current: completedCount, total: indicesToProcess.length });
              await new Promise(r => setTimeout(r, 500));
          } catch (e) {
              console.error(`Failed segment ${idx}:`, e);
          }
      }
      setGenerationProgress(null);
  };

  const handleApplyTransitionToAll = (effect: TransitionEffect | 'random') => {
      const effects: TransitionEffect[] = ['fade', 'slide', 'zoom'];
      const newSegments = segments.map(s => ({
          ...s,
          transition: effect === 'random' ? effects[Math.floor(Math.random() * effects.length)] : effect
      }));
      setSegments(newSegments);
  }

  return (
    <div className="flex flex-col md:flex-row h-full w-full overflow-hidden bg-black text-white relative">
        
        {/* RESOURCE PANEL (Overlay) */}
        {isResourcePanelOpen && (
            <div className={`
                fixed z-[60] bg-[#1e1e1e] flex flex-col shadow-2xl overflow-hidden animate-slide-in-up md:animate-slide-in-left
                inset-0 md:absolute md:inset-auto md:top-4 md:left-[80px] md:bottom-4 md:w-[400px] md:rounded-xl md:border md:border-gray-700
            `}>
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-[#252525]">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-white capitalize text-lg">{activeResourceTab} Library</span>
                        </div>
                        <button onClick={() => setIsResourcePanelOpen(false)} className="text-gray-400 hover:text-white p-2">
                           <ChevronDownIcon className="w-6 h-6 md:-rotate-90" />
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
                    onSelectSegment={setActiveSegmentId}
                    videoTitle={title}
                />
            </div>
        )}

        {/* DESKTOP SIDEBAR */}
        <div className="hidden md:block h-full z-30 shrink-0">
            <Sidebar activeTab={isResourcePanelOpen ? activeResourceTab : ''} setActiveTab={handleSidebarTabClick} />
        </div>

        {/* MAIN EDIT AREA */}
        <div className="flex-1 flex flex-col min-w-0 relative h-full">
             
             {/* TOP HALF: PREVIEW + TOOLBAR */}
             <div className="flex-none flex flex-col bg-[#0a0a0a] relative z-10 border-b border-white/10" style={{ height: '45%' }}>
                 
                 {/* Preview Window */}
                 <div className="flex-grow relative overflow-hidden flex items-center justify-center p-2 bg-black">
                    {activeSegment && (
                         <PreviewWindow 
                            title={title}
                            onTitleChange={setTitle}
                            segment={activeSegment}
                            segments={segments}
                            audioTracks={audioTracks} 
                            activeSegmentId={activeSegmentId || ''}
                            onUpdateSegments={setSegments}
                            currentTime={currentTime}
                            isPlaying={isPlaying}
                            totalDuration={totalDuration}
                            onPlayPause={handlePlayPause}
                            onSeek={handleSeek}
                         />
                    )}
                    
                    {/* Header Actions */}
                    <div className="absolute top-2 right-2 flex gap-2 z-50">
                         <button onClick={() => setShowPreviewModal(true)} className="bg-gray-800/80 hover:bg-gray-700 text-white p-2 rounded-full backdrop-blur-sm shadow-md" title="Fullscreen">
                             <PlayIcon className="w-4 h-4" />
                         </button>

                         <div className="relative" ref={saveMenuRef}>
                            <button 
                                onClick={() => setIsSaveMenuOpen(!isSaveMenuOpen)} 
                                className="bg-purple-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 border border-purple-500/50"
                            >
                                <span>Export</span>
                                <ChevronDownIcon className={`w-3 h-3 ${isSaveMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSaveMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-40 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-50 overflow-hidden">
                                    <button 
                                        onClick={() => { handleSaveProject(); setIsSaveMenuOpen(false); }}
                                        disabled={isSaving}
                                        className="w-full text-left px-4 py-3 text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2 border-b border-gray-700/50"
                                    >
                                        <SaveIcon className="w-3 h-3 text-green-400" /> Save Project
                                    </button>
                                    <button 
                                        onClick={() => { setShowExportModal(true); setIsSaveMenuOpen(false); }}
                                        className="w-full text-left px-4 py-3 text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <ExportIcon className="w-3 h-3 text-blue-400" /> Render Video
                                    </button>
                                </div>
                            )}
                         </div>
                    </div>
                 </div>
                 
                 {/* Toolbar */}
                 <div className="h-10 md:h-12 bg-[#1e1e1e] border-t border-black/50 z-20 flex-shrink-0">
                     <Toolbar 
                        activeMenu={activeMenu}
                        setActiveMenu={setActiveMenu}
                        onOpenMediaSearch={() => { setActiveResourceTab('media'); setIsResourcePanelOpen(true); }}
                        onOpenAudioModal={(type) => handleAddAudioTrack(type)}
                        onOpenAITools={() => handleOpenAITools()}
                        onSplit={handleSplitSegment}
                        onDelete={handleDelete}
                        activeSegment={activeSegment}
                        onUpdateVolume={(id, vol) => handleUpdateSegment(id, { audioVolume: vol })}
                        onUpdateText={handleUpdateSegmentText}
                        onAutoCaptions={handleAutoCaptions}
                        onUpdateStyle={(id, style) => handleUpdateSegment(id, { textOverlayStyle: { ...activeSegment?.textOverlayStyle!, ...style } })}
                        onApplyTransitionToAll={handleApplyTransitionToAll}
                     />
                 </div>
             </div>

             {/* BOTTOM HALF: TIMELINE & PROPERTIES */}
             <div className="flex-1 flex flex-col min-h-0 bg-[#161616] pb-16 md:pb-0">
                 {/* Timeline */}
                 <div className="flex-1 relative flex flex-col min-h-0">
                     <Timeline 
                        segments={segments}
                        audioTracks={audioTracks}
                        activeSegmentId={activeSegmentId}
                        activeAudioTrackId={activeAudioTrackId}
                        setActiveSegmentId={(id) => { setActiveSegmentId(id); setActiveAudioTrackId(null); }}
                        onSelectAudioTrack={(id) => { setActiveAudioTrackId(id); setActiveSegmentId(null as any); }}
                        timelineZoom={timelineZoom}
                        setTimelineZoom={setTimelineZoom}
                        currentTime={currentTime}
                        isPlaying={isPlaying}
                        onSeek={handleSeek}
                        onReorder={handleReorderSegments}
                        onSplit={handleSplitSegment}
                        onDelete={handleDelete}
                        onDeleteAudioTrack={(id) => setAudioTracks(prev => prev.filter(t => t.id !== id))}
                        onAddSegment={handleAddSegment}
                        onAddAudioTrack={handleAddAudioTrack}
                        onUpdateAudioTrack={handleUpdateAudioTrack}
                        onUpdateSegmentDuration={handleUpdateSegmentDuration}
                     />
                 </div>
                 
                 {/* Properties Panel */}
                 <div className="flex-shrink-0 border-t border-white/5 z-20 bg-[#1e1e1e]">
                     <PropertiesPanel 
                        segment={activeSegment}
                        audioTrack={activeAudioTrack}
                        onUpdateVolume={(id, vol) => handleUpdateSegment(id, { audioVolume: vol })}
                        onUpdateText={handleUpdateSegmentText}
                        onUpdateStyle={(id, style) => handleUpdateSegment(id, { textOverlayStyle: { ...activeSegment?.textOverlayStyle!, ...style } })}
                        onUpdateTransition={(id, trans) => handleUpdateSegment(id, { transition: trans })}
                        onDelete={handleDelete}
                        onOpenAITools={handleOpenAITools}
                        onUpdateAudioTrack={handleUpdateAudioTrack}
                        onDeleteAudioTrack={(id) => setAudioTracks(prev => prev.filter(t => t.id !== id))}
                     />
                 </div>
             </div>
        </div>

        {/* MOBILE BOTTOM NAVIGATION */}
        <div className="md:hidden z-50 fixed bottom-0 left-0 right-0 bg-[#161616] border-t border-white/10 shadow-2xl h-16">
            <Sidebar activeTab={isResourcePanelOpen ? activeResourceTab : ''} setActiveTab={handleSidebarTabClick} />
        </div>

        {/* MODALS */}
        <AIToolsModal 
            isOpen={showAITools}
            onClose={() => setShowAITools(false)}
            segment={activeSegment || segments[0]}
            activeClipId={activeSegment?.media[0]?.id || ''}
            onUpdateMedia={handleAIToolsUpdateMedia}
            onUpdateAudio={handleAIToolsUpdateAudio}
            onAddAudioTrack={handleResourceSelectAudio}
            initialTab={activeAIToolTab}
            allSegments={segments}
            onGenerateAllNarrations={handleGenerateAllNarrations} 
            generationProgress={generationProgress}
            onCancelGeneration={() => stopGenerationRef.current = true}
        />

        <ExportModal 
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            title={title}
            segments={segments}
            audioTracks={audioTracks}
        />

        <VideoPreviewModal 
            isOpen={showPreviewModal}
            onClose={() => setShowPreviewModal(false)}
            title={title}
            segments={segments}
        />

    </div>
  );
};

export default VideoEditor;
