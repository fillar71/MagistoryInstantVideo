

import React, { useState, useEffect, useRef } from 'react';
import type { Segment } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { 
    generateImageFromPrompt,
    editImageFromPrompt,
    generateVideoFromPrompt,
    getVideosOperation,
    generateSpeechFromText
} from '../services/geminiService';
import { imageUrlToBase64, createWavBlobUrl, getAudioDuration } from '../utils/media';

interface AIToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: Segment;
  activeClipId: string; // The ID of the clip we are modifying
  onUpdateMedia: (newUrl: string) => void; // This callback in parent will handle updating specific clip
  onUpdateAudio: (newUrl: string, duration?: number) => void;
}

type Tab = 'generate-image' | 'edit-image' | 'generate-video' | 'tts';

const AIToolsModal: React.FC<AIToolsModalProps> = ({ isOpen, onClose, segment, activeClipId, onUpdateMedia, onUpdateAudio }) => {
  const [activeTab, setActiveTab] = useState<Tab>('edit-image');

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
          <nav className="flex gap-4">
            <TabButton name="Edit/Enhance Image" tab="edit-image" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton name="Generate Image" tab="generate-image" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton name="Generate Video" tab="generate-video" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton name="Text to Speech" tab="tts" activeTab={activeTab} setActiveTab={setActiveTab} />
          </nav>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar">
          {activeTab === 'generate-image' && <GenerateImageTab segment={segment} onUpdateMedia={onUpdateMedia} onClose={onClose} />}
          {activeTab === 'edit-image' && <EditImageTab mediaUrl={activeClip.url} onUpdateMedia={onUpdateMedia} onClose={onClose} />}
          {activeTab === 'generate-video' && <GenerateVideoTab segment={segment} onUpdateMedia={onUpdateMedia} onClose={onClose} />}
          {activeTab === 'tts' && <TextToSpeechTab segment={segment} onUpdateAudio={onUpdateAudio} />}
        </div>
      </div>
    </div>
  );
};


const TabButton: React.FC<{name: string, tab: Tab, activeTab: Tab, setActiveTab: (tab: Tab) => void}> = ({ name, tab, activeTab, setActiveTab }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 font-semibold border-b-2 transition-colors ${activeTab === tab ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500'}`}
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
const TextToSpeechTab: React.FC<{ segment: Segment; onUpdateAudio: (url: string, duration?: number) => void; }> = ({ segment, onUpdateAudio }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [audioSrc, setAudioSrc] = useState<string | null>(segment.audioUrl || null);
    const [error, setError] = useState('');

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
        </div>
    );
};


export default AIToolsModal;
