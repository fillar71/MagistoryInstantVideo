

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
  
  // Replace a specific clip or Add a new one
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

  // --- AUDIO TRACK HANDLERS ---
  const handleAddAudioTrack = useCallback((url: string, type: 'music' | 'sfx', duration: number, name: string) => {
      const newTrack: AudioClip = {
          id: `audio-${Date.now()}`,
          url,
          name,
          type,
          startTime: 0, // Start at beginning by default, drag to move
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
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-120px)] animate-fade-in">
        <Toolbar 
          onOpenAITools={() => { 
            setActiveClipIdForTools(activeSegment?.media[0]?.id || null);
            setIsAIToolsOpen(true); 
          }} 
          onOpenAudioModal={() => {
              setAudioModalTargetTrack(null); // Default to segment attachment
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
        <div className="flex-grow flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle((e.target as any).value)}
                className="w-full p-2 text-2xl font-bold bg-transparent border-b-2 border-gray-700 focus:outline-none focus:border-purple-500"
              />
            </div>
            {activeSegment && (
              <PreviewWindow 
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
              />
            )}
            <div className="bg-gray-800 rounded-lg p-4 h-64 flex-shrink-0 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-purple-300">Timeline</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Zoom Out</span>
                        <input
                            type="range"
                            min="0.5"
                            max="2.5"
                            step="0.1"
                            value={timelineZoom}
                            onChange={(e) => setTimelineZoom(parseFloat((e.target as any).value))}
                            className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            title={`Zoom: ${Math.round(timelineZoom * 100)}%`}
                        />
                        <span className="text-xs text-gray-400">Zoom In</span>
                    </div>
                </div>
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
                    // Logic to figure out which clip to update. 
                    // activeClipIdForTools is explicit from UI click.
                    // Fallback to media[0] if null (Toolbar click)
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
        />
    </div>
  );
};

export default VideoEditor;
