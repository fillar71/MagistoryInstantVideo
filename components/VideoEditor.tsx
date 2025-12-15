
import React, { useState, useEffect, useRef } from 'react';
import { VideoScript, Segment, TransitionEffect, AIToolTab, TextOverlayStyle, AudioClip } from '../types';
import Sidebar from './Sidebar';
import Timeline from './Timeline';
import PreviewWindow from './PreviewWindow';
import Toolbar from './Toolbar';
import PropertiesPanel from './PropertiesPanel';
import ResourcePanel from './ResourcePanel';
import AIToolsModal from './AIToolsModal';
import ExportModal from './ExportModal';
import VideoPreviewModal from './VideoPreviewModal';
import { ChevronLeftIcon, ExportIcon, PlayIcon, SaveIcon } from './icons';
import { estimateWordTimings, getAudioDuration, createWavBlobUrl } from '../utils/media';
import { generateSpeechFromText } from '../services/geminiService';
import { saveProject } from '../services/projectService';
import LoadingSpinner from './LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

interface VideoEditorProps {
  initialScript: VideoScript;
}

const VideoEditor: React.FC<VideoEditorProps> = ({ initialScript }) => {
  // --- STATE ---
  // Ensure we capture ID if it exists (for overwriting saved projects)
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

  // Saving State
  const [isSaving, setIsSaving] = useState(false);

  // Generation Progress State
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Ref to control stopping the generation loop
  const stopGenerationRef = useRef(false);

  // Auth for Credit Deduction
  const { deductCredits } = useAuth();

  // Refs for loop
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  // --- DERIVED STATE ---
  const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0);
  const activeSegment = segments.find(s => s.id === activeSegmentId) || null;
  const activeAudioTrack = audioTracks.find(t => t.id === activeAudioTrackId) || null;

  // --- PLAYBACK LOGIC ---
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

  // --- SAVE PROJECT ---
  const handleSaveProject = () => {
      setIsSaving(true);
      try {
          const projectData: VideoScript = {
              id: projectId, // Maintain ID to overwrite
              title,
              segments,
              audioTracks,
              backgroundMusicKeywords: initialScript.backgroundMusicKeywords
          };
          const saved = saveProject(projectData);
          setProjectId(saved.id); // Update ID if it was new
          
          // Show toast or alert
          const toast = document.createElement('div');
          toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-[100] animate-fade-in-up';
          toast.textContent = 'Project Saved Successfully';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);

      } catch (e) {
          alert("Failed to save project. Browser storage might be full.");
      } finally {
          setIsSaving(false);
      }
  }

  // --- SEGMENT MANIPULATION ---
  const handleUpdateSegment = (id: string, updates: Partial<Segment>) => {
      setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleUpdateSegmentText = (id: string, text: string) => {
      // Also update word timings estimate if text changes
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
      // Calculate relative split time
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

  // --- AUDIO TRACK MANIPULATION ---
  const handleUpdateAudioTrack = (id: string, updates: Partial<AudioClip>) => {
      setAudioTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }
  
  const handleAddAudioTrack = (type: 'music' | 'sfx') => {
      // Open Resource Panel for Audio
      setResourceAudioType(type);
      setActiveResourceTab('audio');
      setIsResourcePanelOpen(true);
  }

  // --- RESOURCE PANEL HANDLERS ---
  const handleResourceSelectMedia = (url: string, type: 'image' | 'video') => {
      if (activeSegmentId) {
          // Replace media of active segment
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
          startTime: currentTime, // Place at playhead
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

  // --- AI TOOLS HANDLERS ---
  const handleAIToolsUpdateMedia = (url: string, type: 'image' | 'video') => {
      handleResourceSelectMedia(url, type);
  }

  const handleAIToolsUpdateAudio = (url: string, duration?: number) => {
      if (activeSegmentId) {
          const updates: Partial<Segment> = { audioUrl: url };
          handleUpdateSegment(activeSegmentId, updates);
      }
  }

  // --- ROBUST SEQUENTIAL GENERATION HANDLER ---
  const handleGenerateAllNarrations = async () => {
      // 1. Identify work
      const indicesToProcess = segments
          .map((s, i) => (s.narration_text && !s.audioUrl ? i : -1))
          .filter(i => i !== -1);
      
      const totalCount = indicesToProcess.length;

      if (totalCount === 0) {
          alert("All segments with text already have audio! No new audio to generate.");
          return;
      }

      // 2. Billing: Deduct credits (1 credit per clip for bulk)
      const cost = totalCount * 1; 
      const proceed = await deductCredits(cost, 'bulk_tts');
      if (!proceed) return;

      // 3. Initialize Progress
      setGenerationProgress({ current: 0, total: totalCount });
      stopGenerationRef.current = false;
      
      let completedCount = 0;
      let currentSegmentsState = [...segments];

      // 4. Process Loop
      for (const idx of indicesToProcess) {
          if (stopGenerationRef.current) {
              console.log("Generation cancelled by user.");
              break;
          }

          const seg = currentSegmentsState[idx];
          
          try {
              // Generate - geminiService already handles reasonable retries
              const base64Audio = await generateSpeechFromText(seg.narration_text);
              const wavUrl = createWavBlobUrl(base64Audio);
              const duration = await getAudioDuration(wavUrl);
              
              // Update state immediately
              currentSegmentsState[idx] = {
                  ...seg,
                  audioUrl: wavUrl,
                  duration: duration > 0 ? duration : seg.duration,
                  audioVolume: 1.0,
                  wordTimings: estimateWordTimings(seg.narration_text, duration > 0 ? duration : seg.duration)
              };

              // Commit to UI
              setSegments([...currentSegmentsState]);
              
              // Increment Progress
              completedCount++;
              setGenerationProgress({ current: completedCount, total: totalCount });

              // Small delay to prevent UI freeze and allow cancellation check
              await new Promise(r => setTimeout(r, 500));

          } catch (e: any) {
              console.error(`Failed to generate audio for segment ${idx}:`, e);
              // In bulk mode, we skip failed items and continue to the next
              // Maybe add a toast notification here later
          }
      }
      
      setGenerationProgress(null);
  };

  const handleCancelGeneration = () => {
      stopGenerationRef.current = true;
  }

  const handleApplyTransitionToAll = (effect: TransitionEffect | 'random') => {
      const effects: TransitionEffect[] = ['fade', 'slide', 'zoom'];
      const newSegments = segments.map(s => ({
          ...s,
          transition: effect === 'random' ? effects[Math.floor(Math.random() * effects.length)] : effect
      }));
      setSegments(newSegments);
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-black text-white">
        {/* SIDEBAR */}
        <Sidebar activeTab={isResourcePanelOpen ? activeResourceTab : ''} setActiveTab={handleSidebarTabClick} />

        {/* RESOURCE PANEL (Slide-out) */}
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
                           <ChevronLeftIcon className="w-5 h-5 rotate-180 md:rotate-0" />
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

        {/* MAIN AREA */}
        <div className="flex-1 flex flex-col min-w-0">
             {/* TOP SECTION: PREVIEW & PROPERTIES */}
             <div className="flex-1 flex min-h-0">
                 {/* PREVIEW */}
                 <div className="flex-1 flex flex-col bg-[#0a0a0a] relative">
                     <div className="flex-grow relative overflow-hidden flex items-center justify-center p-4">
                        {activeSegment && (
                             <PreviewWindow 
                                title={title}
                                onTitleChange={setTitle}
                                segment={activeSegment}
                                segments={segments}
                                activeSegmentId={activeSegmentId || ''}
                                onUpdateSegments={setSegments}
                                currentTime={currentTime}
                                isPlaying={isPlaying}
                                totalDuration={totalDuration}
                                onPlayPause={handlePlayPause}
                                onSeek={handleSeek}
                             />
                        )}
                        {/* Header Actions Overlay */}
                        <div className="absolute top-4 right-4 flex gap-2">
                             <button onClick={handleSaveProject} disabled={isSaving} className="bg-gray-800/80 hover:bg-green-700 text-white p-2 rounded-full backdrop-blur-sm transition-colors flex items-center justify-center" title="Save Project">
                                 {isSaving ? <LoadingSpinner /> : <SaveIcon className="w-5 h-5" />}
                             </button>
                             <button onClick={() => setShowPreviewModal(true)} className="bg-gray-800/80 hover:bg-gray-700 text-white p-2 rounded-full backdrop-blur-sm" title="Fullscreen Preview">
                                 <PlayIcon className="w-5 h-5" />
                             </button>
                             <button onClick={() => setShowExportModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2" title="Export Video">
                                 <ExportIcon className="w-5 h-5" /> Export
                             </button>
                        </div>
                     </div>
                     
                     {/* TOOLBAR */}
                     <div className="h-14 bg-[#1e1e1e] border-t border-black/50 z-20">
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
             </div>

             {/* BOTTOM SECTION: TIMELINE & PROPERTIES */}
             <div className="h-[40%] min-h-[250px] flex flex-col border-t border-black/50">
                 {/* TIMELINE */}
                 <div className="flex-1 min-h-0 bg-[#161616] relative flex flex-col">
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
                 
                 {/* PROPERTIES PANEL (Bottom Bar) */}
                 <div className="flex-shrink-0 border-t border-white/5 z-20">
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

        {/* MODALS */}
        <AIToolsModal 
            isOpen={showAITools}
            onClose={() => setShowAITools(false)}
            segment={activeSegment || segments[0]}
            activeClipId={activeSegment?.media[0]?.id || ''}
            onUpdateMedia={handleAIToolsUpdateMedia}
            onUpdateAudio={handleAIToolsUpdateAudio}
            initialTab={activeAIToolTab}
            allSegments={segments}
            onGenerateAllNarrations={handleGenerateAllNarrations} // Updated for robust sequential processing
            generationProgress={generationProgress}
            onCancelGeneration={handleCancelGeneration}
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
