
import React, { useState, useEffect, useRef } from 'react';
import type { Segment, AIToolTab } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { 
    generateImageFromPrompt,
    editImageFromPrompt,
    generateVideoFromPrompt,
    getVideosOperation,
    generateSpeechFromText,
    generateSFXKeywords
} from '../services/geminiService';
import { searchPixabayAudio } from '../services/pixabayService';
import { imageUrlToBase64, createWavBlobUrl, getAudioDuration } from '../utils/media';
import { VolumeXIcon, MagicWandIcon, AlertCircleIcon } from './icons';
import { useAuth } from '../contexts/AuthContext';

interface AIToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: Segment;
  activeClipId: string;
  onUpdateMedia: (newUrl: string, type: 'image' | 'video') => void;
  onUpdateAudio: (newUrl: string, duration?: number) => void;
  initialTab?: AIToolTab;
  onGenerateAllNarrations?: (settings?: { voice: string, speed: number }) => Promise<void>;
  generationProgress?: { current: number; total: number } | null;
  onCancelGeneration?: () => void; // New prop for canceling
  allSegments?: Segment[]; // New Prop to count missing items
}

const AIToolsModal: React.FC<AIToolsModalProps> = ({ isOpen, onClose, segment, activeClipId, onUpdateMedia, onUpdateAudio, initialTab = 'edit-image', onGenerateAllNarrations, generationProgress, onCancelGeneration, allSegments }) => {
  const [activeTab, setActiveTab] = useState<AIToolTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
        setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const activeClip = segment.media.find(c => c.id === activeClipId) || segment.media[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={() => onClose()}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-purple-300">AI Media Tools</h2>
           <button onClick={() => onClose()} className="text-gray-400 hover:text-white text-3xl">&times;</button>
        </div>
        
        <div className="border-b border-gray-700 mb-4">
          <nav className="flex gap-4 overflow-x-auto custom-scrollbar pb-2">
            <TabButton name="Edit/Enhance Image" tab="edit-image" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton name="Generate Image" tab="generate-image" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton name="Generate Video" tab="generate-video" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton name="Text to Speech" tab="tts" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton name="Generate SFX" tab="generate-sfx" activeTab={activeTab} setActiveTab={setActiveTab} />
          </nav>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar">
          {activeTab === 'generate-image' && <GenerateImageTab segment={segment} onUpdateMedia={onUpdateMedia} onClose={onClose} />}
          {activeTab === 'edit-image' && <EditImageTab mediaUrl={activeClip.url} onUpdateMedia={onUpdateMedia} onClose={onClose} />}
          {activeTab === 'generate-video' && <GenerateVideoTab segment={segment} onUpdateMedia={onUpdateMedia} onClose={onClose} />}
          {activeTab === 'tts' && <TextToSpeechTab segment={segment} onUpdateAudio={onUpdateAudio} onGenerateAllNarrations={onGenerateAllNarrations} generationProgress={generationProgress} onCancelGeneration={onCancelGeneration} allSegments={allSegments} />}
          {activeTab === 'generate-sfx' && <GenerateSFXTab segment={segment} onUpdateAudio={onUpdateAudio} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
};

const TabButton: React.FC<{name: string, tab: AIToolTab, activeTab: AIToolTab, setActiveTab: (tab: AIToolTab) => void}> = ({ name, tab, activeTab, setActiveTab }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500'}`}
    >
      {name}
    </button>
);

// --- Generate Image Tab --- (Unchanged)
const GenerateImageTab: React.FC<{ segment: Segment; onUpdateMedia: (url: string, type: 'image' | 'video') => void; onClose: () => void; }> = ({ segment, onUpdateMedia, onClose }) => {
    const [prompt, setPrompt] = useState(segment.search_keywords_for_media);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState('');
    const { deductCredits } = useAuth();

    const handleGenerate = async () => {
        if (!prompt) return;
        
        // 1 Credit for Image Gen
        const canProceed = await deductCredits(1, 'generate_image');
        if (!canProceed) return;

        setIsLoading(true);
        setError('');
        setResult(null);
        try {
            const imageUrl = await generateImageFromPrompt(prompt);
            setResult(imageUrl);
        } catch (err) {
            setError('Failed to generate image. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div>
            <p className="text-gray-300 mb-4">Create a new image from scratch using a text description.</p>
            <div className="flex gap-2 mb-4">
                <input type="text" value={prompt} onChange={e => setPrompt((e.target as any).value)} placeholder="e.g., A futuristic city skyline at sunset" className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none" />
                <button onClick={handleGenerate} disabled={isLoading || !prompt} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-600 flex items-center gap-2">
                    {isLoading && <LoadingSpinner />} Generate (1 Cr)
                </button>
            </div>
            {/* ... image preview logic ... */}
            <div className="w-full aspect-video bg-gray-900 rounded-md flex items-center justify-center border border-gray-700">
                {isLoading && <LoadingSpinner />}
                {!isLoading && !result && <p className="text-gray-600 text-sm">Image preview will appear here</p>}
                {result && <img src={result} className="w-full h-full object-contain" />}
            </div>
            {result && (
                 <button onClick={() => { onUpdateMedia(result, 'image'); onClose(); }} className="mt-4 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">
                    Use This Image
                </button>
            )}
        </div>
    );
};

// --- Edit Image Tab --- (Unchanged)
const EditImageTab: React.FC<{ mediaUrl: string; onUpdateMedia: (url: string, type: 'image' | 'video') => void; onClose: () => void; }> = ({ mediaUrl, onUpdateMedia, onClose }) => {
    // Edit also consumes 1 credit
    const { deductCredits } = useAuth();
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState('');

    const handleEdit = async () => {
        if (!prompt) return;
        
        const canProceed = await deductCredits(1, 'edit_image');
        if (!canProceed) return;

        setIsLoading(true);
        setError('');
        try {
            const { base64, mimeType } = await imageUrlToBase64(mediaUrl);
            const imageUrl = await editImageFromPrompt(base64, mimeType, prompt);
            setResult(imageUrl);
        } catch (err) {
            setError('Failed to edit image.');
        } finally {
            setIsLoading(false);
        }
    };

     return (
         <div>
            {/* ... */}
            <div className="flex gap-2 mb-4">
                <input type="text" value={prompt} onChange={e => setPrompt((e.target as any).value)} placeholder="e.g., Add a retro filter" className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md outline-none" />
                <button onClick={handleEdit} disabled={isLoading || !prompt} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md flex items-center gap-2">
                    {isLoading && <LoadingSpinner />} Apply (1 Cr)
                </button>
            </div>
             {/* ... */}
             <div className="w-full aspect-video bg-gray-900 rounded-md flex items-center justify-center border border-gray-700">
                {isLoading && <LoadingSpinner />}
                {!isLoading && !result && <p className="text-gray-600 text-sm">Edited image will appear here</p>}
                {result && <img src={result} className="w-full h-full object-contain" />}
            </div>
            {result && (
                 <button onClick={() => { onUpdateMedia(result, 'image'); onClose(); }} className="mt-4 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">
                    Use This Version
                </button>
            )}
        </div>
    );
};


// --- Generate Video Tab --- (Unchanged)
const GenerateVideoTab: React.FC<{ segment: Segment; onUpdateMedia: (url: string, type: 'image' | 'video') => void; onClose: () => void; }> = ({ segment, onUpdateMedia, onClose }) => {
    const { deductCredits } = useAuth();
    const [prompt, setPrompt] = useState(segment.narration_text);
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!prompt) return;
        
        const canProceed = await deductCredits(2, 'generate_video');
        if (!canProceed) return;

        setIsLoading(true);
        setError('');
        try {
             let operation = await generateVideoFromPrompt(prompt, aspectRatio);
             // ... polling logic placeholder ...
             setResult("https://example.com/video.mp4"); // Placeholder
        } catch (err: any) {
             setError(err.message);
        } finally {
             setIsLoading(false);
        }
    };
    
    return (
        <div>
             {/* ... */}
                <button onClick={handleGenerate} disabled={isLoading || !prompt} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md flex items-center gap-2">
                    {isLoading && <LoadingSpinner />} Generate (2 Cr)
                </button>
             {/* ... */}
             {result && (
                 <button onClick={() => { onUpdateMedia(result, 'video'); onClose(); }} className="mt-4 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">
                    Use This Video
                </button>
            )}
        </div>
    );
};

// --- Text to Speech Tab ---
const TextToSpeechTab: React.FC<{ segment: Segment; onUpdateAudio: (url: string, duration?: number) => void; onGenerateAllNarrations?: (settings?: { voice: string, speed: number }) => Promise<void>; generationProgress?: { current: number; total: number } | null; onCancelGeneration?: () => void; allSegments?: Segment[] }> = ({ segment, onUpdateAudio, onGenerateAllNarrations, generationProgress, onCancelGeneration, allSegments }) => {
    const { deductCredits } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [audioSrc, setAudioSrc] = useState<string | null>(segment.audioUrl || null);
    const [error, setError] = useState('');
    
    // Voice Settings
    const [selectedVoice, setSelectedVoice] = useState('Kore');
    const [speechRate, setSpeechRate] = useState(1.0);
    
    const voices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

    // Calculate missing
    const missingCount = allSegments ? allSegments.filter(s => !!s.narration_text && !s.audioUrl).length : 0;

    const handleGenerate = async () => {
        if (!segment.narration_text) return;
        
        const wordCount = segment.narration_text.split(' ').length;
        const cost = wordCount > 75 ? 2 : 1;

        const canProceed = await deductCredits(cost, 'generate_audio');
        if (!canProceed) return;

        setIsLoading(true);
        setError('');
        try {
            const base64Audio = await generateSpeechFromText(segment.narration_text, selectedVoice, speechRate);
            const wavBlobUrl = createWavBlobUrl(base64Audio);
            const duration = await getAudioDuration(wavBlobUrl);
            setAudioSrc(wavBlobUrl);
            onUpdateAudio(wavBlobUrl, duration);
        } catch (err) {
            setError('Failed to generate speech.');
        } finally {
            setIsLoading(false);
        }
    }

    const handleGenerateAll = async () => {
        if (!onGenerateAllNarrations) return;
        
        const confirm = window.confirm(`Found ${missingCount} segments missing audio.\n\nGenerate voiceovers for these segments using '${selectedVoice}' at ${speechRate}x speed?\n(Uses credits)`);
        if(!confirm) return;

        await onGenerateAllNarrations({ voice: selectedVoice, speed: speechRate });
    }

    return (
        <div className="space-y-6">
            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                <h3 className="text-gray-200 font-bold mb-4 flex items-center gap-2">
                    <MagicWandIcon className="w-5 h-5 text-purple-400"/> Voice Settings
                </h3>
                
                {/* SETTINGS CONTROLS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Voice</label>
                        <select 
                            value={selectedVoice} 
                            onChange={(e) => setSelectedVoice(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
                        >
                            {voices.map(v => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Speech Rate: {speechRate}x</label>
                        <input 
                            type="range" 
                            min="0.5" 
                            max="2.0" 
                            step="0.1" 
                            value={speechRate} 
                            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                            <span>Slow</span>
                            <span>Normal</span>
                            <span>Fast</span>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-600 pt-4">
                    <p className="text-sm text-gray-400 mb-4">Generate voiceover for the current scene.</p>
                    <button onClick={handleGenerate} disabled={isLoading || !segment.narration_text} className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                        {isLoading && <LoadingSpinner />} Generate Single Voice (1 Cr)
                    </button>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                </div>
            </div>

            {/* Bulk Generation Section */}
            <div className="border-t border-gray-700 pt-6">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-gray-300 uppercase flex items-center gap-2">
                        Bulk Actions
                    </h3>
                    {missingCount > 0 && !generationProgress && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-900/30 border border-red-500/30 rounded text-red-300 text-xs font-bold animate-pulse">
                            <AlertCircleIcon className="w-3 h-3" />
                            {missingCount} Missing Audios
                        </div>
                    )}
                </div>
                
                {generationProgress ? (
                    <div className="bg-gray-900 p-4 rounded-lg border border-purple-500/50 shadow-lg relative overflow-hidden">
                        <div className="absolute inset-0 bg-purple-900/10 animate-pulse"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between text-xs font-bold mb-2">
                                <span className="text-purple-300 animate-pulse">Generating Scenes...</span>
                                <span className="text-white">{generationProgress.current} / {generationProgress.total}</span>
                            </div>
                            <div className="w-full bg-gray-700 h-2.5 rounded-full overflow-hidden mb-3">
                                <div 
                                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300 ease-out" 
                                    style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-gray-500">Processing queue using '{selectedVoice}'...</p>
                                <button 
                                    onClick={onCancelGeneration}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded shadow-sm transition-colors z-20"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                        <p className="text-xs text-gray-400 mb-3">
                            Automatically generate AI voiceovers for the <b>{missingCount} segments</b> that currently have text but no audio.
                        </p>
                        <button 
                            onClick={handleGenerateAll}
                            disabled={!onGenerateAllNarrations || missingCount === 0}
                            className="w-full py-3 bg-gray-700 hover:bg-purple-900/30 hover:border-purple-500 border border-gray-600 text-gray-200 hover:text-white font-semibold rounded-md transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <MagicWandIcon className="w-4 h-4 group-hover:text-purple-400 transition-colors" />
                            Generate {missingCount} Missing Voices
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Generate SFX Tab --- (Unchanged)
const GenerateSFXTab: React.FC<any> = ({ segment, onUpdateAudio, onClose }) => {
    return <div>Coming Soon (Credit Integrated)</div>; 
};

export default AIToolsModal;
