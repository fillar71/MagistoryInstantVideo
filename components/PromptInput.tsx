
import React, { useState } from 'react';
import { MagicWandIcon, LargePlayIcon, FolderIcon } from './icons';

interface PromptInputProps {
  onGenerate: (prompt: string, duration: string, aspectRatio: 'landscape' | 'portrait', visualStyle: 'video' | 'image') => void;
  onManualStart: () => void;
  onOpenProjects: () => void;
}

const PromptInput: React.FC<PromptInputProps> = ({ onGenerate, onManualStart, onOpenProjects }) => {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('1 minute');
  const [aspectRatio, setAspectRatio] = useState<'landscape' | 'portrait'>('landscape');
  const [visualStyle, setVisualStyle] = useState<'video' | 'image'>('video');
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt, duration, aspectRatio, visualStyle);
    }
  };

  const samplePrompts = [
    "The history of the Industrial Revolution",
    "5-minute chocolate cake recipe",
    "Top 5 travel destinations in Southeast Asia",
    "A brief explanation of black holes",
  ];

  const durationOptions = [
    "30 seconds",
    "1 minute",
    "2 minutes",
    "5 minutes",
    "10 minutes",
    "15 minutes"
  ];

  return (
    <div className="max-w-4xl mx-auto animate-fade-in-up">
      <div className="text-center mb-10">
        <h2 className="text-4xl md:text-5xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          Create Videos with <span className="text-white">Magistory</span>
        </h2>
        <p className="text-lg text-gray-300">
          Choose how you want to start your creative journey.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* AI Mode Card */}
        <div 
            onClick={() => setMode('ai')}
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 flex flex-col items-center text-center gap-4 ${mode === 'ai' ? 'bg-gray-800/80 border-purple-500 shadow-lg shadow-purple-500/20' : 'bg-gray-800/40 border-gray-700 hover:border-gray-500'}`}
        >
            <div className={`p-4 rounded-full ${mode === 'ai' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                <MagicWandIcon className="w-8 h-8" />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">AI Generator</h3>
                <p className="text-sm text-gray-400">Enter a topic and let AI write the script, find media, and generate voiceovers instantly.</p>
            </div>
        </div>

        {/* Manual Mode Card */}
        <div 
            onClick={() => {
                setMode('manual');
                onManualStart();
            }}
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 flex flex-col items-center text-center gap-4 ${mode === 'manual' ? 'bg-gray-800/80 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-gray-800/40 border-gray-700 hover:border-gray-500'}`}
        >
            <div className={`p-4 rounded-full ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                <LargePlayIcon className="w-8 h-8" />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">Manual Editor</h3>
                <p className="text-sm text-gray-400">Start from scratch. Upload your own videos, images, and audio to build your story timeline.</p>
            </div>
        </div>
        
        {/* Load Project Card */}
        <div 
            onClick={onOpenProjects}
            className="p-6 rounded-xl border-2 border-gray-700 bg-gray-800/40 hover:border-green-500 hover:bg-gray-800/60 cursor-pointer transition-all duration-300 flex flex-col items-center text-center gap-4 group"
        >
            <div className="p-4 rounded-full bg-gray-700 text-gray-400 group-hover:bg-green-600 group-hover:text-white transition-colors">
                <FolderIcon className="w-8 h-8" />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">My Projects</h3>
                <p className="text-sm text-gray-400">Load a previously saved project and continue where you left off.</p>
            </div>
        </div>
      </div>

      {mode === 'ai' && (
        <div className="bg-gray-800/60 p-6 rounded-xl border border-gray-700">
             <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-2">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt((e.target as any).value)}
                        placeholder="e.g., 'How to make a perfect omelette'"
                        className="flex-grow p-4 bg-gray-900 border-2 border-gray-700 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition-all"
                    />
                </div>
                
                {/* Options Row */}
                <div className="flex flex-col sm:flex-row gap-2">
                    {/* Visual Style Selector */}
                    <select 
                        value={visualStyle}
                        onChange={(e) => setVisualStyle((e.target as any).value)}
                        className="p-4 bg-gray-900 border-2 border-gray-700 rounded-md focus:ring-2 focus:ring-purple-500 focus:outline-none flex-1 cursor-pointer"
                        title="Select Visual Style"
                    >
                        <option value="video">Dynamic Video Clips</option>
                        <option value="image">Static Images Only</option>
                    </select>

                    {/* Aspect Ratio Selector */}
                    <select 
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio((e.target as any).value)}
                        className="p-4 bg-gray-900 border-2 border-gray-700 rounded-md focus:ring-2 focus:ring-purple-500 focus:outline-none flex-1 cursor-pointer"
                        title="Select Video Orientation"
                    >
                        <option value="landscape">Landscape (16:9)</option>
                        <option value="portrait">Portrait (9:16)</option>
                    </select>

                    {/* Duration Selector */}
                    <select 
                        value={duration}
                        onChange={(e) => setDuration((e.target as any).value)}
                        className="p-4 bg-gray-900 border-2 border-gray-700 rounded-md focus:ring-2 focus:ring-purple-500 focus:outline-none flex-1 cursor-pointer"
                        title="Select Duration"
                    >
                        {durationOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>

                <button
                type="submit"
                disabled={!prompt.trim()}
                className="w-full sm:w-auto mx-auto px-12 py-4 bg-purple-600 text-white font-bold rounded-md hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300 shadow-lg mt-2"
                >
                Generate Magic Video
                </button>
            </form>
            <div className="mt-8 text-center">
                <p className="text-gray-400 mb-2">Or try one of these ideas:</p>
                <div className="flex flex-wrap justify-center gap-2">
                    {samplePrompts.map(p => (
                        <button 
                            key={p} 
                            onClick={() => setPrompt(p)}
                            className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full text-sm hover:bg-gray-600 transition-colors"
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default PromptInput;
