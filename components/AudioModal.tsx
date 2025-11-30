
import React, { useRef, useState } from 'react';
import type { Segment } from '../types';
import { MusicIcon, MagicWandIcon, ExportIcon } from './icons';
import { getAudioDuration, createWavBlobUrl } from '../utils/media';
import { generateSpeechFromText } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';

interface AudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: Segment;
  onUpdateAudio: (newUrl: string | undefined, duration?: number) => void;
}

const stockMusic = [
    { name: 'Uplifting Corporate', url: 'https://storage.googleapis.com/magistory-public/music/uplifting-corporate.mp3' },
    { name: 'Cinematic Chill', url: 'https://storage.googleapis.com/magistory-public/music/cinematic-chill.mp3' },
    { name: 'Acoustic Folk', url: 'https://storage.googleapis.com/magistory-public/music/acoustic-folk.mp3' },
    { name: 'Ambient Background', url: 'https://storage.googleapis.com/magistory-public/music/ambient-background.mp3' },
];

const AudioModal: React.FC<AudioModalProps> = ({ isOpen, onClose, segment, onUpdateAudio }) => {
  const [activeTab, setActiveTab] = useState<'library' | 'ai'>('library');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = (event.target as any).files?.[0];
    if (file) {
      const audioUrl = URL.createObjectURL(file);
      const duration = await getAudioDuration(audioUrl);
      onUpdateAudio(audioUrl, duration);
      onClose();
    }
  };

  const handleUploadClick = () => {
    (fileInputRef.current as any)?.click();
  };

  const handleSelectStock = async (url: string) => {
    const duration = await getAudioDuration(url);
    onUpdateAudio(url, duration);
    onClose();
  }

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
        const duration = await getAudioDuration(wavBlobUrl);
        onUpdateAudio(wavBlobUrl, duration);
        // Don't close immediately so user can see success or play it? 
        // Or close for "Instant Video" feel. Let's close for consistency with other actions.
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
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
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
                Upload & Stock
            </button>
            <button 
                onClick={() => setActiveTab('ai')}
                className={`pb-2 px-1 font-semibold transition-colors border-b-2 ${activeTab === 'ai' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
                AI Voiceover
            </button>
        </div>
        
        <div className="flex-grow overflow-y-auto custom-scrollbar">
            {/* Common: Current Audio Status */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Current Audio</h3>
                <div className="bg-gray-700/50 p-3 rounded-md flex items-center justify-between border border-gray-600">
                    {segment.audioUrl ? (
                        <>
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-2 bg-purple-900/50 rounded-full text-purple-300">
                                    <MusicIcon className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-gray-200 text-sm font-medium truncate">
                                        {segment.audioUrl.startsWith('blob:') ? 'Generated / Uploaded Audio' : segment.audioUrl.split('/').pop()?.replace('.mp3', '')}
                                    </span>
                                    <span className="text-xs text-gray-500">{segment.duration}s</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <audio src={segment.audioUrl} controls className="h-8 w-24 md:w-40 opacity-70 hover:opacity-100 transition-opacity" />
                                <button onClick={handleRemoveAudio} className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded hover:bg-red-900/50 border border-red-900/50">Remove</button>
                            </div>
                        </>
                    ) : (
                        <span className="text-gray-500 italic text-sm">No audio attached to this segment.</span>
                    )}
                </div>
            </div>

            {activeTab === 'library' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Upload Section */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-3">Upload Audio</h3>
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
                    
                    {/* Stock Section */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-3">Stock Music Library</h3>
                        <div className="space-y-2">
                            {stockMusic.map(track => (
                                <div key={track.name} className="bg-gray-700 p-3 rounded-md flex items-center justify-between hover:bg-gray-600 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-gray-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                            <MusicIcon className="w-4 h-4" />
                                        </div>
                                        <span className="text-gray-200 font-medium">{track.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                         <audio src={track.url} controls className="h-6 w-24 opacity-50 hover:opacity-100" />
                                         <button onClick={() => handleSelectStock(track.url)} className="px-4 py-1.5 text-xs font-bold bg-gray-500 hover:bg-purple-600 rounded-full text-white transition-colors">
                                            Use
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
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
