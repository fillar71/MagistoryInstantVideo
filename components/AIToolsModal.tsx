





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
import { VolumeXIcon, MagicWandIcon } from './icons';

interface AIToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: Segment;
  activeClipId: string; // The ID of the clip we are modifying
  onUpdateMedia: (newUrl: string) => void; // This callback in parent will handle updating specific clip
  onUpdateAudio: (newUrl: string, duration?: number) => void;
  initialTab?: AIToolTab;
  onGenerateAllNarrations?: () => Promise<void>;
}

const AIToolsModal: React.FC<AIToolsModalProps> = ({ isOpen, onClose, segment, activeClipId, onUpdateMedia, onUpdateAudio, initialTab = 'edit-image', onGenerateAllNarrations }) => {
  const [activeTab, setActiveTab] = useState<AIToolTab>(initialTab);

  // Reset tab when modal opens/closes or initialTab changes
  useEffect(() => {
    if (isOpen) {
        setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Find the active clip object
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
          {activeTab === 'tts' && <TextToSpeechTab segment={segment} onUpdateAudio={onUpdateAudio} onGenerateAllNarrations={onGenerateAllNarrations} />}
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

// --- Generate Image Tab ---
const GenerateImageTab: React.FC<{ segment: Segment; onUpdateMedia: (url: string) => void; onClose: () => void; }> = ({ segment, onUpdateMedia, onClose }) => {
    const [prompt, setPrompt] = useState(segment.search_keywords_for_media);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        setError('');
        setResult(null);
        try {
            const imageUrl = await generateImageFromPrompt(prompt);
            setResult(imageUrl);
        } catch (err) {
            setError('Failed to generate image. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleUseImage = () => {
        if (!result) return;
        onUpdateMedia(result);
        onClose();
    }

    const randomPrompts = [
        "A cyberpunk street scene with neon lights and rain",
        "A peaceful zen garden with cherry blossoms",
        "An abstract geometric pattern with gold and black",
        "A cute robot holding a flower in a field"
    ];
    
    const handleSurpriseMe = () => {
        setPrompt(randomPrompts[Math.floor(Math.random() * randomPrompts.length)]);
    }

    return (
        <div>
            <p className="text-gray-300 mb-4">Create a new image from scratch using a text description.</p>
            <div className="flex gap-2 mb-4">
                <input type="text" value={prompt} onChange={e => setPrompt((e.target as any).value)} placeholder="e.g., A futuristic city skyline at sunset" className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none" />
                <button onClick={handleGenerate} disabled={isLoading || !prompt} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-600 flex items-center gap-2">
                    {isLoading && <LoadingSpinner />} Generate
                </button>
            </div>
            <div className="flex justify-end mb-4">
                <button onClick={handleSurpriseMe} className="text-xs text-purple-400 hover:text-purple-300 underline">Surprise Me</button>
            </div>

             {error && <p className="text-red-400 text-center mb-2">{error}</p>}
            <div className="w-full aspect-video bg-gray-900 rounded-md flex items-center justify-center border border-gray-700">
                {isLoading && <LoadingSpinner />}
                {!isLoading && !result && <p className="text-gray-600 text-sm">Image preview will appear here</p>}
                {result && <img src={result} className="w-full h-full object-contain" />}
            </div>
            {result && (
                 <button onClick={handleUseImage} className="mt-4 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">
                    Use This Image
                </button>
            )}
        </div>
    );
};

// --- Edit Image Tab ---
const EditImageTab: React.FC<{ mediaUrl: string; onUpdateMedia: (url: string) => void; onClose: () => void; }> = ({ mediaUrl, onUpdateMedia, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [originalImage, setOriginalImage] = useState(mediaUrl);
    
    const quickActions = [
        { label: "Auto Enhance", prompt: "Enhance image resolution, sharpness, lighting, and color balance to look professional and crisp." },
        { label: "Cinematic Look", prompt: "Apply a cinematic color grading, dramatic lighting, and shallow depth of field." },
        { label: "Cyberpunk", prompt: "Add neon lighting, futuristic elements, and a cyberpunk aesthetic." },
        { label: "Watercolor", prompt: "Convert this image into a beautiful watercolor painting style." },
        { label: "Black & White", prompt: "Convert to high contrast artistic black and white photography." },
    ];

    const handleEdit = async () => {
        if (!prompt) return;
        setIsLoading(true);
        setError('');
        setResult(null);
        try {
            const { base64, mimeType } = await imageUrlToBase64(originalImage);
            const imageUrl = await editImageFromPrompt(base64, mimeType, prompt);
            setResult(imageUrl);
        } catch (err) {
            setError('Failed to edit image. This might be a CORS issue with the source image. Please try again or use a different image.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUseImage = () => {
        if (!result) return;
        onUpdateMedia(result);
        onClose();
    }

    return (
         <div>
            <p className="text-gray-300 mb-4">Automatically enhance or modify the selected image using AI.</p>
            
            <div className="mb-4">
                <label className="text-xs text-gray-400 font-bold uppercase mb-2 block">Quick Actions</label>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {quickActions.map(qa => (
                        <button 
                            key={qa.label}
                            onClick={() => setPrompt(qa.prompt)}
                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-xs text-gray-300 border border-gray-600 hover:border-purple-400 whitespace-nowrap transition-colors"
                        >
                            {qa.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex gap-2 mb-4">
                <input type="text" value={prompt} onChange={e => setPrompt((e.target as any).value)} placeholder="e.g., Add a retro filter, make it black and white" className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none" />
                <button onClick={handleEdit} disabled={isLoading || !prompt} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-600 flex items-center gap-2">
                    {isLoading && <LoadingSpinner />} Apply
                </button>
            </div>
            {error && <p className="text-red-400 text-center mb-2">{error}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="w-full aspect-video bg-gray-900 rounded-md flex flex-col items-center justify-center border border-gray-700">
                    <p className="text-sm font-semibold text-gray-400 mb-1">Original</p>
                    <img src={originalImage} className="w-full h-full object-contain" />
                 </div>
                 <div className="w-full aspect-video bg-gray-900 rounded-md flex flex-col items-center justify-center border border-gray-700">
                    <p className="text-sm font-semibold text-gray-400 mb-1">Result</p>
                    <div className="w-full h-full flex items-center justify-center">
                       {isLoading && <LoadingSpinner />}
                       {!isLoading && !result && <p className="text-gray-600 text-sm">Enhanced version will appear here</p>}
                       {result && <img src={result} className="w-full h-full object-contain" />}
                    </div>
                 </div>
            </div>
             {result && (
                 <button onClick={handleUseImage} className="mt-4 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">
                    Use This Edited Image
                </button>
            )}
        </div>
    );
};

// --- Generate Video Tab ---
const videoGenMessages = [
    "Warming up the AI video engine...",
    "Scripting the first scene...",
    "Casting the digital actors...",
    "Setting up the virtual cameras...",
    "Action! Filming the sequence...",
    "Adding special effects...",
    "Rendering the final cut...",
    "This is taking longer than usual, but we're still working on it...",
];

const GenerateVideoTab: React.FC<{ segment: Segment; onUpdateMedia: (url: string) => void; onClose: () => void; }> = ({ segment, onUpdateMedia, onClose }) => {
    const [prompt, setPrompt] = useState(segment.narration_text);
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [apiKeySelected, setApiKeySelected] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState(videoGenMessages[0]);
    const pollingRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        // Check for API key on mount
        const win = window as any;
        if (win.aistudio) {
            win.aistudio.hasSelectedApiKey().then(setApiKeySelected);
        }
    }, []);

    useEffect(() => {
        // Cleanup polling on unmount
        return () => {
            if (pollingRef.current) (window as any).clearInterval(pollingRef.current);
        }
    }, []);

    const handleSelectKey = async () => {
        const win = window as any;
        await win.aistudio.openSelectKey();
        setApiKeySelected(true); // Assume success to avoid race condition
    }

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        setError('');
        setResult(null);
        let messageIndex = 0;
        setLoadingMessage(videoGenMessages[messageIndex]);
        const messageInterval = (window as any).setInterval(() => {
            messageIndex = (messageIndex + 1) % videoGenMessages.length;
            setLoadingMessage(videoGenMessages[messageIndex]);
        }, 8000);

        try {
            let operation = await generateVideoFromPrompt(prompt, aspectRatio);

            const poll = async () => {
                if (!isLoading) {
                    if (pollingRef.current) (window as any).clearInterval(pollingRef.current);
                    return;
                }
                
                operation = await getVideosOperation({ operation: operation });
                if (operation.done) {
                    setIsLoading(false);
                    if (pollingRef.current) (window as any).clearInterval(pollingRef.current);
                    (window as any).clearInterval(messageInterval);
                    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
                    if (downloadLink) {
                        // Append API key for access
                        const videoUrl = `${downloadLink}&key=${process.env.API_KEY}`;
                        setResult(videoUrl);
                    } else {
                        setError("Video generation finished, but no video URL was found.");
                    }
                }
            };
            
            pollingRef.current = (window as any).setInterval(poll, 10000);

        } catch (err: any) {
            setIsLoading(false);
            (window as any).clearInterval(messageInterval);
            if (err.message && err.message.includes("Requested entity was not found")) {
                setError('API Key is invalid. Please select a valid key.');
                setApiKeySelected(false);
            } else {
                 setError(err.message || 'Failed to start video generation. Please try again.');
            }
            console.error(err);
        }
    };
    
    if (!apiKeySelected) {
        return (
             <div className="flex flex-col items-center justify-center h-full text-center">
                <h3 className="text-xl font-semibold mb-2">API Key Required for Video Generation</h3>
                <p className="text-gray-300 mb-4 max-w-md">The Veo video generation model requires you to select an API key associated with a project that has billing enabled.</p>
                <button onClick={handleSelectKey} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700">Select API Key</button>
                <p className="mt-4 text-sm text-gray-400">
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-gray-300">
                        Learn more about billing
                    </a>
                </p>
             </div>
        )
    }

    return (
        <div>
            <p className="text-gray-300 mb-4">Generate a short video clip from a text prompt. This process can take several minutes.</p>
             <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input type="text" value={prompt} onChange={e => setPrompt((e.target as any).value)} placeholder="e.g., A majestic eagle soaring over mountains" className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none" />
                 <select value={aspectRatio} onChange={e => setAspectRatio((e.target as any).value as '16:9' | '9:16')} className="p-3 bg-gray-700 border border-gray-600 rounded-md outline-none">
                    <option value="16:9">Landscape (16:9)</option>
                    <option value="9:16">Portrait (9:16)</option>
                </select>
                <button onClick={handleGenerate} disabled={isLoading || !prompt} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-600 flex items-center gap-2">
                    {isLoading && <LoadingSpinner />} Generate
                </button>
            </div>
            {error && <p className="text-red-400 text-center mb-2">{error}</p>}
            <div className="w-full aspect-video bg-gray-900 rounded-md flex items-center justify-center border border-gray-700">
                {isLoading && (
                    <div className="text-center">
                        <LoadingSpinner />
                        <p className="mt-4 text-lg text-gray-300">{loadingMessage}</p>
                    </div>
                )}
                {!isLoading && !result && <p className="text-gray-600 text-sm">Video preview will appear here</p>}
                {result && <video src={result} controls autoPlay className="w-full h-full object-contain" />}
            </div>
            {result && (
                 <button onClick={() => { onUpdateMedia(result); onClose(); }} className="mt-4 w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">
                    Use This Video
                </button>
            )}
        </div>
    );
};


// --- Text to Speech Tab ---
const TextToSpeechTab: React.FC<{ segment: Segment; onUpdateAudio: (url: string, duration?: number) => void; onGenerateAllNarrations?: () => Promise<void> }> = ({ segment, onUpdateAudio, onGenerateAllNarrations }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [audioSrc, setAudioSrc] = useState<string | null>(segment.audioUrl || null);
    const [error, setError] = useState('');
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);

    const handleGenerate = async () => {
        if (!segment.narration_text) return;
        setIsLoading(true);
        setError('');
        setAudioSrc(null);
        try {
            const base64Audio = await generateSpeechFromText(segment.narration_text);
            const wavBlobUrl = createWavBlobUrl(base64Audio);
            const duration = await getAudioDuration(wavBlobUrl);
            setAudioSrc(wavBlobUrl);
            onUpdateAudio(wavBlobUrl, duration);

        } catch (err) {
            setError('Failed to generate speech. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }

    const handleGenerateAll = async () => {
        if (!onGenerateAllNarrations) return;
        setIsGeneratingAll(true);
        try {
            await onGenerateAllNarrations();
        } catch (err) {
            console.error("Error generating all narrations", err);
        } finally {
            setIsGeneratingAll(false);
        }
    }

    return (
         <div>
            <p className="text-gray-300 mb-2">Generate a voiceover for the narration text.</p>
            <div className="bg-gray-700 p-4 rounded-md mb-4 border border-gray-600">
                <p className="italic text-gray-300">"{segment.narration_text}"</p>
            </div>
            <button onClick={handleGenerate} disabled={isLoading || !segment.narration_text} className="w-full px-6 py-3 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-600 flex items-center justify-center gap-2">
                {isLoading && <LoadingSpinner />} Generate Audio
            </button>
            {error && <p className="text-red-400 text-center mt-2">{error}</p>}
            {audioSrc && !isLoading && (
                <div className="mt-4">
                    <p className="text-green-400 text-center mb-2">Audio generated successfully!</p>
                    <audio src={audioSrc} controls className="w-full"></audio>
                </div>
            )}
            
            {onGenerateAllNarrations && (
               <div className="mt-8 pt-6 border-t border-gray-700">
                   <p className="text-gray-400 mb-2 text-sm font-bold uppercase tracking-wider">Project Actions</p>
                   <button 
                       onClick={handleGenerateAll}
                       disabled={isGeneratingAll}
                       className="w-full py-3 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-purple-500 text-white font-semibold rounded-md flex items-center justify-center gap-2 transition-colors"
                   >
                       {isGeneratingAll ? <LoadingSpinner /> : <MagicWandIcon className="w-4 h-4" />}
                       Generate All Audio Narrations
                   </button>
                   <p className="text-[10px] text-gray-500 mt-2 text-center">Generates voiceovers for all scenes in the project sequentially.</p>
               </div>
            )}
        </div>
    );
};

// --- Generate SFX Tab ---
const GenerateSFXTab: React.FC<{ segment: Segment; onUpdateAudio: (url: string, duration?: number) => void; onClose: () => void; }> = ({ segment, onUpdateAudio, onClose }) => {
    const [prompt, setPrompt] = useState(segment.narration_text || '');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [generatedKeywords, setGeneratedKeywords] = useState('');

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        setError('');
        setResults([]);
        setGeneratedKeywords('');

        try {
            // 1. Use Gemini to find the best keywords
            const keywords = await generateSFXKeywords(prompt);
            setGeneratedKeywords(keywords);

            // 2. Use those keywords to find sound effects
            const sfxResults = await searchPixabayAudio(keywords, 'sfx');
            
            if (sfxResults.length === 0) {
                // Fallback search with original prompt if complex query failed
                const fallback = await searchPixabayAudio(prompt, 'sfx');
                setResults(fallback);
                if (fallback.length === 0) setError("No sound effects found matching your description.");
            } else {
                setResults(sfxResults);
            }

        } catch (err) {
            setError('Failed to generate sound effects. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (url: string) => {
        // Calculate duration and update
        const duration = await getAudioDuration(url);
        onUpdateAudio(url, duration);
        onClose();
    }

    return (
        <div>
            <p className="text-gray-300 mb-4">Describe a sound effect (e.g., "footsteps in a hallway", "laser blast") and AI will find the perfect match.</p>
            
            <div className="flex gap-2 mb-4">
                <input 
                    type="text" 
                    value={prompt} 
                    onChange={e => setPrompt((e.target as any).value)} 
                    placeholder="e.g., Explosion with debris" 
                    className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none text-white" 
                />
                <button 
                    onClick={handleGenerate} 
                    disabled={isLoading || !prompt} 
                    className="px-6 py-2 bg-orange-600 text-white font-semibold rounded-md hover:bg-orange-700 disabled:bg-gray-600 flex items-center gap-2"
                >
                    {isLoading && <LoadingSpinner />} Generate
                </button>
            </div>

            {generatedKeywords && !isLoading && (
                <div className="mb-4 text-xs text-gray-400">
                    <span className="font-bold text-orange-400">AI Generated Search Terms:</span> {generatedKeywords}
                </div>
            )}

            {error && <p className="text-red-400 text-center mb-2">{error}</p>}

            <div className="grid gap-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                {results.map((item, i) => (
                  <div 
                    key={i} 
                    className="bg-[#252525] p-3 rounded flex items-center justify-between group hover:bg-[#2a2a2a] border border-transparent hover:border-gray-600 transition-all"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 bg-orange-700">
                             <VolumeXIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-200 truncate font-medium max-w-[200px]">{item.name}</p>
                            <p className="text-[9px] text-gray-500">{Math.floor(item.duration/60)}:{(item.duration%60).toString().padStart(2,'0')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <audio src={item.url} controls className="h-6 w-24 opacity-50 hover:opacity-100" />
                        <button 
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded shadow-sm font-bold"
                            onClick={() => handleSelect(item.url)}
                        >
                            Use
                        </button>
                    </div>
                  </div>
                ))}
                {results.length === 0 && !isLoading && !error && (
                    <div className="text-center text-gray-600 py-10 border border-dashed border-gray-700 rounded-lg">
                        Enter a prompt to start generating SFX.
                    </div>
                )}
            </div>
        </div>
    );
};


export default AIToolsModal;
