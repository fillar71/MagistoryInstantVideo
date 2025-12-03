
import React, { useState, useCallback, useEffect } from 'react';
import type { VideoScript, Segment, TransitionEffect, TextOverlayStyle, WordTiming, MediaClip, AudioClip } from '../types';
import PreviewWindow from './PreviewWindow';
import Timeline from './Timeline';
import Toolbar from './Toolbar';
import MediaSearchModal from './MediaSearchModal';
import VideoPreviewModal from './VideoPreviewModal';
import AIToolsModal from './AIToolsModal';
import AudioModal from './AudioModal';
import ExportModal from './ExportModal';
import { estimateWordTimings } from '../utils/media';

interface VideoEditorProps {
  initialScript: VideoScript;
}

const VideoEditor: React.FC<VideoEditorProps> = ({ initialScript }) => {
  const [title, setTitle] = useState(initialScript.title);
  
  // History State Management
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


  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(segments[0]?.id || null);
  // Media Search State
  const [isMediaSearchOpen, setIsMediaSearchOpen] = useState(false);
  const [mediaSearchTarget, setMediaSearchTarget] = useState<{clipId: string | null}>({ clipId: null });
  const [mediaSearchMode, setMediaSearchMode] = useState<'default' | 'wizard'>('default');

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAIToolsOpen, setIsAIToolsOpen] = useState(false);
  const [activeClipIdForTools, setActiveClipIdForTools] = useState<string | null>(null);

  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [audioModalTargetTrack, setAudioModalTargetTrack] = useState<'music' | 'sfx' | null>(null);
  
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);

  // Ensure activeSegmentId is valid after undo/redo
  useEffect(() => {
      if (activeSegmentId && !segments.find(s => s.id === activeSegmentId)) {
          setActiveSegmentId(segments[0]?.id || null);
      }
  }, [segments, activeSegmentId]);

  const activeSegmentIndex = segments.findIndex(s => s.id === activeSegmentId);
  const activeSegment = segments[activeSegmentIndex] || null;
  const isLastSegment = activeSegmentIndex === segments.length - 1;

  const handleUpdateSegmentText = useCallback((segmentId: string, newText: string) => {
    updateSegments(prevSegments =>
      prevSegments.map(s =>
        s.id === segmentId ? { ...s, narration_text: newText, wordTimings: undefined } : s // Reset timings if text changes
      )
    );
  }, [updateSegments]);
  
  const handleUpdateSegmentMedia = useCallback((segmentId: string, clipId: string | null, newMediaUrl: string, newMediaType: 'image' | 'video') => {
    updateSegments(prevSegments =>
      prevSegments.map(s => {
        if (s.id !== segmentId) return s;
        
        // If clipId exists, replace it
        if (clipId) {
            return {
                ...s,
                media: s.media.map(clip => clip.id === clipId ? { ...clip, url: newMediaUrl, type: newMediaType } : clip)
            };
        } 
        
        // Else, add new clip
        return {
            ...s,
            media: [...s.media, { id: `clip-${Date.now()}`, url: newMediaUrl, type: newMediaType }]
        };
      })
    );
  }, [updateSegments]);

  const handleReorderClips = useCallback((segmentId: string, newMedia: MediaClip[]) => {
      updateSegments(prevSegments => 
        prevSegments.map(s => 
            s.id === segmentId ? { ...s, media: newMedia } : s
        )
      );
  }, [updateSegments]);

  const handleAddSegment = useCallback(() => {
      setMediaSearchMode('wizard');
      setMediaSearchTarget({ clipId: null });
      setIsMediaSearchOpen(true);
  }, []);

  const handleDeleteSegment = useCallback(() => {
    if (!activeSegmentId) return;

    if (!window.confirm("Are you sure you want to delete this segment?")) {
        return;
    }
    
    updateSegments(prev => {
        if (prev.length <= 1) {
            alert("Cannot delete the only segment.");
            return prev;
        }
        const index = prev.findIndex(s => s.id === activeSegmentId);
        const newSegments = prev.filter(s => s.id !== activeSegmentId);
        
        // Determine new active segment
        let nextId = null;
        if (index > 0) nextId = newSegments[index - 1].id;
        else if (newSegments.length > 0) nextId = newSegments[0].id;
        
        // Defer state update to avoid render loop issues
        setTimeout(() => setActiveSegmentId(nextId), 0);
        
        return newSegments;
    });
  }, [activeSegmentId, updateSegments]);

  const handleCreateNewSegment = useCallback((newMediaUrl: string, newMediaType: 'image' | 'video') => {
      const newSegmentId = `segment-${Date.now()}`;
      const newSegment: Segment = {
          id: newSegmentId,
          narration_text: "",
          search_keywords_for_media: "",
          media: [{
              id: `clip-${Date.now()}`,
              url: newMediaUrl,
              type: newMediaType
          }],
          duration: 3,
          audioVolume: 1.0,
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
      setActiveSegmentId(newSegmentId);
  }, [updateSegments]);

  const handleRemoveMedia = useCallback((segmentId: string, clipId: string) => {
      updateSegments(prevSegments => 
        prevSegments.map(s => {
            if (s.id !== segmentId) return s;
            if (s.media.length <= 1) return s; // Don't remove the last clip
            return {
                ...s,
                media: s.media.filter(c => c.id !== clipId)
            }
        })
      );
  }, [updateSegments]);

  const handleUpdateSegmentAudio = useCallback((segmentId: string, newAudioUrl: string | undefined, audioDuration?: number) => {
    updateSegments(prevSegments =>
      prevSegments.map(s => {
        if (s.id !== segmentId) return s;
        
        let newDuration = s.duration;
        // If audio exists and valid duration is provided
        if (newAudioUrl && audioDuration && audioDuration > 0) {
             // If audio is shorter than current segment duration, automatically shrink segment to match
             if (audioDuration < s.duration) {
                 newDuration = audioDuration;
             }
        }

        return { ...s, audioUrl: newAudioUrl, duration: newDuration };
      })
    );
  }, [updateSegments]);

  const handleUpdateWordTimings = useCallback((segmentId: string, timings: WordTiming[]) => {
      updateSegments(prevSegments => 
        prevSegments.map(s => 
            s.id === segmentId ? { ...s, wordTimings: timings } : s
        )
      );
  }, [updateSegments]);
  
  const handleAutoGenerateSubtitles = useCallback((segmentId?: string) => {
      updateSegments(prevSegments =>
        prevSegments.map(s => {
            if (segmentId && s.id !== segmentId) return s;
            return {
                ...s,
                wordTimings: estimateWordTimings(s.narration_text, s.duration)
            };
        })
      );
  }, [updateSegments]);

  const handleUpdateSegmentVolume = useCallback((segmentId: string, newVolume: number) => {
      updateSegments(prevSegments =>
        prevSegments.map(s =>
            s.id === segmentId ? { ...s, audioVolume: newVolume } : s
        )
      );
  }, [updateSegments]);

  const handleUpdateSegmentDuration = useCallback((segmentId: string, newDuration: number) => {
      updateSegments(prevSegments =>
        prevSegments.map(s =>
            s.id === segmentId ? { ...s, duration: newDuration } : s
        )
      );
  }, [updateSegments]);

  const handleUpdateSegmentTransition = useCallback((segmentId: string, newTransition: TransitionEffect) => {
    updateSegments(prevSegments =>
      prevSegments.map(s =>
        s.id === segmentId ? { ...s, transition: newTransition } : s
      )
    );
  }, [updateSegments]);

  const handleUpdateSegmentTextOverlayStyle = useCallback((segmentId: string, styleUpdate: Partial<TextOverlayStyle>) => {
    updateSegments(prevSegments =>
        prevSegments.map(s =>
            s.id === segmentId ? { ...s, textOverlayStyle: { ...s.textOverlayStyle!, ...styleUpdate } } : s
        )
    );
  }, [updateSegments]);


  const handleNudgeSegment = useCallback((segmentId: string, direction: 'left' | 'right') => {
    updateSegments(prevSegments => {
      const segmentIndex = prevSegments.findIndex(s => s.id === segmentId);
      if (segmentIndex === -1) return prevSegments;

      const newSegments = [...prevSegments];
      if (direction === 'left' && segmentIndex > 0) {
        [newSegments[segmentIndex - 1], newSegments[segmentIndex]] = [newSegments[segmentIndex], newSegments[segmentIndex - 1]];
      } else if (direction === 'right' && segmentIndex < newSegments.length - 1) {
        [newSegments[segmentIndex + 1], newSegments[segmentIndex]] = [newSegments[segmentIndex], newSegments[segmentIndex + 1]];
      }
      
      return newSegments;
    });
  }, [updateSegments]);

  const handleSplitSegment = useCallback((segmentId: string, splitTime: number) => {
    const original = segments.find(s => s.id === segmentId);
    if (!original) return;

    // Minimum duration safeguard
    if (splitTime < 0.5 || splitTime > original.duration - 0.5) {
        alert("Split point too close to edge.");
        return;
    }

    const index = segments.indexOf(original);
    const durA = splitTime;
    const durB = original.duration - splitTime;

    // Handle Narration Splitting
    let textA = original.narration_text;
    let textB = "";
    let timingsA: WordTiming[] | undefined = undefined;
    let timingsB: WordTiming[] | undefined = undefined;

    if (original.wordTimings && original.wordTimings.length > 0) {
        timingsA = original.wordTimings.filter(w => w.end <= splitTime);
        timingsB = original.wordTimings.filter(w => w.end > splitTime).map(w => ({
            ...w,
            start: w.start - splitTime,
            end: w.end - splitTime
        }));
        textA = timingsA.map(w => w.word).join(' ');
        textB = timingsB.map(w => w.word).join(' ');
    } else {
         textB = "";
    }

    const mediaA = [...original.media];
    const mediaB = original.media.map(m => ({ ...m, id: `clip-${Date.now()}-split` })); 

    const segA: Segment = { 
        ...original, 
        duration: durA, 
        narration_text: textA, 
        wordTimings: timingsA,
        audioUrl: undefined 
    };

    const segB: Segment = {
        ...original,
        id: `segment-${Date.now()}-split`,
        duration: durB,
        narration_text: textB,
        wordTimings: timingsB,
        media: mediaB,
        audioUrl: undefined
    };

    const newSegments = [...segments];
    newSegments.splice(index, 1, segA, segB);
    updateSegments(newSegments);
    setActiveSegmentId(segA.id);

  }, [segments, updateSegments]);

  // --- AUDIO TRACK HANDLERS ---
  const handleAddAudioTrack = useCallback((url: string, type: 'music' | 'sfx', duration: number, name: string) => {
      const newTrack: AudioClip = {
          id: `audio-${Date.now()}`,
          url,
          name,
          type,
          startTime: 0, 
          duration: duration || 10,
          volume: 0.8
      };
      updateAudioTracks(prev => [...prev, newTrack]);
  }, [updateAudioTracks]);

  const handleUpdateAudioTrack = useCallback((trackId: string, updates: Partial<AudioClip>) => {
      updateAudioTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...updates } : t));
  }, [updateAudioTracks]);

  const handleDeleteAudioTrack = useCallback((trackId: string) => {
      updateAudioTracks(prev => prev.filter(t => t.id !== trackId));
  }, [updateAudioTracks]);


  return (
    <div className="flex h-full w-full bg-[#09090b] text-white overflow-hidden font-sans">
        {/* SIDEBAR TOOLBAR (Fixed Left) */}
        <div className="flex-shrink-0 w-16 border-r border-white/10 bg-[#0c0c0e] z-30 flex flex-col items-center py-4">
             <Toolbar 
                onOpenAITools={() => { 
                    setActiveClipIdForTools(activeSegment?.media[0]?.id || null);
                    setIsAIToolsOpen(true); 
                }} 
                onOpenAudioModal={() => {
                    setAudioModalTargetTrack(null);
                    setIsAudioModalOpen(true);
                }}
                onOpenExportModal={() => setIsExportOpen(true)}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onDelete={handleDeleteSegment}
                hasActiveSegment={!!activeSegment}
            />
        </div>

        {/* MAIN WORKSPACE */}
        <div className="flex-grow flex flex-col min-w-0">
            
            {/* TOP SECTION: 3-PANE EDITOR (Script | Stage | Inspector) */}
            <div className="flex-grow min-h-0 flex overflow-hidden">
                 {activeSegment ? (
                    <PreviewWindow 
                        title={title}
                        onTitleChange={setTitle}
                        segments={segments} 
                        activeSegmentId={activeSegmentId!}
                        onUpdateSegments={updateSegments} 
                        segment={activeSegment} 
                        
                        onTextChange={handleUpdateSegmentText}
                        onUpdateAudio={handleUpdateSegmentAudio}
                        onUpdateWordTimings={handleUpdateWordTimings}
                        onAutoGenerateSubtitles={handleAutoGenerateSubtitles}
                        onUpdateTextOverlayStyle={handleUpdateSegmentTextOverlayStyle}
                        onUpdateDuration={handleUpdateSegmentDuration}
                        onUpdateTransition={handleUpdateSegmentTransition}
                        isLastSegment={isLastSegment}
                        onOpenMediaSearch={(clipId) => {
                            setMediaSearchMode('default');
                            setMediaSearchTarget({ clipId });
                            setIsMediaSearchOpen(true);
                        }}
                        onRemoveMedia={handleRemoveMedia}
                        onOpenVideoPreview={() => setIsPreviewOpen(true)}
                        onEditClipWithAI={(clipId) => {
                            setActiveClipIdForTools(clipId);
                            setIsAIToolsOpen(true);
                        }}
                        onReorderClips={(newMedia) => handleReorderClips(activeSegment.id, newMedia)}
                        onUpdateVolume={handleUpdateSegmentVolume}
                        onSplitSegment={handleSplitSegment}
                    />
                 ) : (
                     <div className="w-full h-full flex items-center justify-center text-gray-500 bg-[#09090b]">
                         <div className="text-center">
                             <p className="mb-2">No active segment</p>
                             <button onClick={handleAddSegment} className="text-purple-400 hover:text-purple-300 underline">Add a segment</button>
                         </div>
                     </div>
                 )}
            </div>

            {/* BOTTOM SECTION: TIMELINE (Fixed Height) */}
            <div className="h-72 flex-shrink-0 border-t border-white/10 bg-[#0c0c0e] flex flex-col shadow-2xl z-20">
                {/* Timeline Controls Bar */}
                 <div className="h-10 border-b border-white/5 bg-[#121214] flex items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span> Timeline
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-medium">Zoom</span>
                        <input
                            type="range"
                            min="0.5"
                            max="2.5"
                            step="0.1"
                            value={timelineZoom}
                            onChange={(e) => setTimelineZoom(parseFloat((e.target as any).value))}
                            className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
                        />
                    </div>
                </div>

                {/* Actual Timeline Component */}
                <div className="flex-grow min-h-0 relative">
                    <Timeline 
                        segments={segments}
                        audioTracks={audioTracks}
                        onReorder={updateSegments}
                        activeSegmentId={activeSegmentId}
                        setActiveSegmentId={setActiveSegmentId}
                        onUpdateTransition={handleUpdateSegmentTransition}
                        onUpdateVolume={handleUpdateSegmentVolume}
                        timelineZoom={timelineZoom}
                        onNudgeSegment={handleNudgeSegment}
                        onAddSegment={handleAddSegment}
                        onUpdateAudioTrack={handleUpdateAudioTrack}
                        onDeleteAudioTrack={handleDeleteAudioTrack}
                        onAddAudioTrack={(type) => {
                            setAudioModalTargetTrack(type);
                            setIsAudioModalOpen(true);
                        }}
                    />
                </div>
            </div>
        </div>

        {/* MODALS */}
        {isMediaSearchOpen && (
            <MediaSearchModal
                isOpen={isMediaSearchOpen}
                onClose={() => setIsMediaSearchOpen(false)}
                onSelectMedia={(newUrl, newType) => {
                    if (mediaSearchMode === 'wizard') {
                        handleCreateNewSegment(newUrl, newType);
                    } else if (activeSegment) {
                        handleUpdateSegmentMedia(activeSegment.id, mediaSearchTarget.clipId, newUrl, newType);
                    }
                }}
                initialKeywords={mediaSearchMode === 'wizard' ? '' : (activeSegment?.search_keywords_for_media || '')}
                narrationText={activeSegment?.narration_text || ''}
                mode={mediaSearchMode}
                videoTitle={title}
            />
        )}
        {isAIToolsOpen && activeSegment && (
            <AIToolsModal
                isOpen={isAIToolsOpen}
                onClose={() => {
                    setIsAIToolsOpen(false);
                    setActiveClipIdForTools(null);
                }}
                segment={activeSegment}
                activeClipId={activeClipIdForTools || activeSegment.media[0].id}
                onUpdateMedia={(newUrl) => {
                    const targetId = activeClipIdForTools || activeSegment.media[0].id;
                    handleUpdateSegmentMedia(activeSegment.id, targetId, newUrl, 'image'); 
                }}
                onUpdateAudio={(newUrl, duration) => handleUpdateSegmentAudio(activeSegment.id, newUrl, duration)}
            />
        )}
         {isAudioModalOpen && activeSegment && (
            <AudioModal
                isOpen={isAudioModalOpen}
                onClose={() => setIsAudioModalOpen(false)}
                segment={activeSegment}
                targetTrackType={audioModalTargetTrack}
                onUpdateAudio={(newUrl, duration) => handleUpdateSegmentAudio(activeSegment.id, newUrl, duration)}
                onAddAudioTrack={handleAddAudioTrack}
                initialSearchTerm={initialScript.backgroundMusicKeywords}
            />
        )}
        <VideoPreviewModal 
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            title={title}
            segments={segments}
        />
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

export default VideoEditor;
