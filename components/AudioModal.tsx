
import React, { useRef, useState, useEffect } from 'react';
import type { Segment } from '../types';
import { MusicIcon, MagicWandIcon, ExportIcon } from './icons';
import { getAudioDuration, createWavBlobUrl } from '../utils/media';
import { generateSpeechFromText } from '../services/geminiService';
import { searchPixabayAudio } from '../services/pixabayService';
import LoadingSpinner from './LoadingSpinner';

interface AudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: Segment;
  onUpdateAudio: (newUrl: string | undefined, duration?: number) => void;
  initialSearchTerm?: string;
  targetTrackType?: 'music' | 'sfx' | null;
  onAddAudioTrack?: (url: string, type: 'music' | 'sfx', duration: number, name: string) => void;
}

const AudioModal: React.FC<AudioModalProps> = ({ isOpen, onClose, segment, onUpdateAudio, initialSearchTerm, targetTrackType, onAddAudioTrack }) => {
  const [activeTab, setActiveTab] = useState<'library' | 'ai'>('library');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  
  // Library Search State
  const [searchQuery, setSearchQuery] = useState(initialSearchTerm || 'ambient');
  const [musicResults, setMusicResults] = useState<any[]>([]);
  const [isLoadingMusic, setIsLoadingMusic] = useState(false);
  const [musicError, setMusicError] = useState('');
  
  // Target Selection State (if triggered generically)
  const [selectedTarget, setSelectedTarget] = useState<'segment' | 'music' | 'sfx'>(targetTrackType || 'segment');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const quickCategories = [
    "Cinematic", "Upbeat", "Corporate", "Ambient", 
    "Epic", "Lo-fi", "Acoustic", "Nature", "Electronic"
  ];

  // Perform initial search if we have a term and no results yet
  useEffect(() => {
    if (isOpen && activeTab === 'library' && musicResults.length === 0) {
        handleSearchMusic(searchQuery);
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
      if (isOpen && targetTrackType) {
          setSelectedTarget(targetTrackType);
      }
  }, [isOpen, targetTrackType]);

  const handleSearchMusic = async (q: string) => {
      if (!q.trim()) return;
      setIsLoadingMusic(true);
      setMusicError('');
      try {
          const results = await searchPixabayAudio(q);
          setMusicResults(results);
      } catch (e: any) {
          console.error("Music search failed", e);
          setMusicError("Failed to fetch music from Pixabay.");
      } finally {
          setIsLoadingMusic(false);
      }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      handleSearchMusic(searchQuery);
  }

  const handleMagicAutoSelect = async () => {
      setIsLoadingMusic(true);
      setMusicError('');
      // Use initial AI keywords or fallback to 'Cinematic'
      const query = initialSearchTerm || 'Cinematic';
      setSearchQuery(query);
      
      try {
          const results = await searchPixabayAudio(query);
          if (results.length > 0) {
             const bestMatch = results[0];
             await processAudioSelection(bestMatch.url, bestMatch.name);
             return; // Close happens in processAudioSelection
          } else {
             setMusicError("No auto-match found. Please search manually.");
             setMusicResults([]);
          }
      } catch (e) {
          setMusicError("Auto-select failed.");
      } finally {
          setIsLoadingMusic(false);
      }
  }

  const processAudioSelection = async (url: string, name: string) => {
      const duration = await getAudioDuration(url);
      
      if (selectedTarget === 'segment') {
          onUpdateAudio(url, duration);
      } else if (onAddAudioTrack) {
          onAddAudioTrack(url, selectedTarget, duration, name);
      }
      
      onClose();
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = (event.target as any).files?.[0];
    if (file) {
      const audioUrl = URL.createObjectURL(file);
      await processAudioSelection(audioUrl, file.name);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveAudio = () => {
    onUpdateAudio(undefined);
    onClose();
  }

  const handleGenerateAI = async () => {
    if (!segment.narration_text) return;
    setIsGenerating(true);
    setAiError('');
    
    try {
        const base64Audio = await generateSpeechFromText(segment.narration_text);
        const wavBlobUrl = createWavBlobUrl(base64Audio);
        // AI Voice is strictly for segment narration usually
        const duration = await getAudioDuration(wavBlobUrl);
        onUpdateAudio(wavBlobUrl, duration);
        onClose();
    } catch (err) {
        setAiError('Failed to generate speech. Please try again.');
        console.error(err);
    } finally {
        setIsGenerating(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-purple-300">Audio Manager</h2>
           <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-700 mb-6">
            <button 
                onClick={() => setActiveTab('library')}
                className={`pb-2 px-1 font-semibold transition-colors border-b-2 ${activeTab === 'library' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
                Search & Upload
            </button>
            <button 
                onClick={() => setActiveTab('ai')}
                className={`pb-2 px-1 font-semibold transition-colors border-b-2 ${activeTab === 'ai' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
                AI Voiceover
            </button>
        </div>
        
        {/* Target Selection - Only show if not forced or if generic add */}
        {activeTab === 'library' && (
             <div className="mb-4 bg-gray-900/50 p-3 rounded-md border border-gray-700 flex items-center gap-4">
                <span className="text-sm font-bold text-gray-400">ADD TO:</span>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setSelectedTarget('segment')} 
                        className={`px-3 py-1 text-xs rounded-full border ${selectedTarget === 'segment' ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                    >
                        Current Segment
                    </button>
                    <button 
                        onClick={() => setSelectedTarget('music')} 
                        className={`px-3 py-1 text-xs rounded-full border ${selectedTarget === 'music' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                    >
                        Music Track
                    </button>
                    <button 
                         onClick={() => setSelectedTarget('sfx')} 
                         className={`px-3 py-1 text-xs rounded-full border ${selectedTarget === 'sfx' ? 'bg-orange-600 border-orange-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                    >
                        SFX Track
                    </button>
                </div>
            </div>
        )}

        <div className="flex-grow overflow-y-auto custom-scrollbar">
            {activeTab === 'library' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Search Section */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-3">Stock Audio (Pixabay)</h3>
                        
                        <div className="flex gap-2 mb-4">
                            <form onSubmit={handleSearchSubmit} className="flex-grow flex gap-2">
                                <input 
                                    type="text" 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery((e.target as any).value)}
                                    placeholder="Search music (e.g., 'Cinematic', 'Upbeat')"
                                    className="flex-grow p-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 text-white"
                                />
                                <button 
                                    type="submit" 
                                    disabled={isLoadingMusic}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-semibold"
                                >
                                    {isLoadingMusic ? '...' : 'Search'}
                                </button>
                            </form>
                            
                            <button
                                onClick={handleMagicAutoSelect}
                                disabled={isLoadingMusic}
                                className="px-3 py-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-md hover:opacity-90 font-semibold flex items-center gap-1 shadow-lg border border-white/20"
                                title="Auto-Select Best Match"
                            >
                                <MagicWandIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">Magic Match</span>
                            </button>
                        </div>
                        
                        {/* Quick Categories */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {quickCategories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => { setSearchQuery(cat); handleSearchMusic(cat); }}
                                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-full text-xs text-gray-300 border border-gray-700 hover:border-purple-500 transition-colors"
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {musicError && <p className="text-red-400 text-sm mb-2">{musicError}</p>}
                        
                        {isLoadingMusic ? (
                            <div className="flex justify-center py-8">
                                <LoadingSpinner />
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                {musicResults.map(track => (
                                    <div key={track.id} className="bg-gray-700 p-3 rounded-md flex items-center justify-between hover:bg-gray-600 transition-colors group">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-gray-400 group-hover:bg-purple-600 group-hover:text-white transition-colors flex-shrink-0">
                                                <MusicIcon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-gray-200 font-medium truncate">{track.name}</div>
                                                <div className="text-xs text-gray-400">{track.tags}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                             <audio src={track.url} controls className="h-6 w-24 opacity-50 hover:opacity-100" />
                                             <button onClick={() => processAudioSelection(track.url, track.name)} className="px-4 py-1.5 text-xs font-bold bg-gray-500 hover:bg-purple-600 rounded-full text-white transition-colors">
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {musicResults.length === 0 && !isLoadingMusic && (
                                    <div className="text-center text-gray-500 py-4">
                                        No music found for "{searchQuery}". Try a different term.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Upload Section */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-3">Upload Custom Audio</h3>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="audio/*"
                            className="hidden"
                        />
                        <button 
                            onClick={handleUploadClick} 
                            className="w-full py-4 border-2 border-dashed border-gray-600 hover:border-purple-500 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg text-gray-300 hover:text-purple-300 transition-all flex flex-col items-center gap-2"
                        >
                            <ExportIcon className="w-6 h-6" />
                            <span className="font-semibold">Click to Upload from Device</span>
                            <span className="text-xs text-gray-500">Supports MP3, WAV, AAC</span>
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'ai' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg">
                        <div className="flex items-start gap-3">
                            <MagicWandIcon className="w-6 h-6 text-purple-400 flex-shrink-0 mt-1" />
                            <div>
                                <h3 className="font-semibold text-purple-200 mb-1">Text-to-Speech Generator</h3>
                                <p className="text-sm text-gray-400">Instantly generate a professional voiceover for this segment based on your narration text.</p>
                            </div>
                        </div>
                    </div>
                    
                    {selectedTarget !== 'segment' && (
                         <div className="bg-yellow-900/20 border border-yellow-600/30 p-2 rounded text-xs text-yellow-200 mb-2">
                             Note: AI Voiceover is best used with the "Current Segment" target to match visuals.
                         </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-400 uppercase">Narration Text</label>
                        <div className="bg-gray-900/50 p-4 rounded-md border border-gray-700 min-h-[100px] text-gray-300 italic">
                            {segment.narration_text || "No narration text available for this segment."}
                        </div>
                        {!segment.narration_text && (
                            <p className="text-xs text-red-400">Please add text to the segment before generating voiceover.</p>
                        )}
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={handleGenerateAI} 
                            disabled={isGenerating || !segment.narration_text} 
                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-md shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isGenerating ? <LoadingSpinner /> : <MagicWandIcon className="w-5 h-5" />}
                            {isGenerating ? 'Generating Voice...' : 'Generate Voiceover'}
                        </button>
                        {aiError && <p className="text-red-400 text-center mt-3 text-sm">{aiError}</p>}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AudioModal;
