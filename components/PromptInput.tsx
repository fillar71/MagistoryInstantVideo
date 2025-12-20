
import React, { useState, useRef } from 'react';
import { MagicWandIcon, LargePlayIcon, FolderIcon, MusicIcon, ExportIcon } from './icons';
import { generateVisualsFromAudio } from '../services/geminiService';
import { searchPexelsVideos, searchPexelsPhotos } from '../services/pexelsService';
import { VideoScript, Segment } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { getAudioDuration } from '../utils/media';
import { useAuth } from '../contexts/AuthContext';

interface PromptInputProps {
  onGenerate: (prompt: string, duration: string, aspectRatio: 'landscape' | 'portrait', visualStyle: 'video' | 'image') => void;
  onManualStart: () => void;
  onOpenProjects: () => void;
  onScriptReady?: (script: VideoScript) => void;
}

const PromptInput: React.FC<PromptInputProps> = ({ onGenerate, onManualStart, onOpenProjects, onScriptReady }) => {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('1 minute');
  const [aspectRatio, setAspectRatio] = useState<'landscape' | 'portrait'>('landscape');
  const [visualStyle, setVisualStyle] = useState<'video' | 'image'>('video');
  const [mode, setMode] = useState<'ai' | 'manual' | 'audio'>('ai');
  
  // Audio Mode States
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { deductCredits } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt, duration, aspectRatio, visualStyle);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setAudioFile(e.target.files[0]);
      }
  }

  const handleGenerateFromAudio = async () => {
      if (!audioFile || !onScriptReady) return;
      
      const canProceed = await deductCredits(5, 'audio_to_video'); // Higher cost for analysis + generation
      if (!canProceed) return;

      setIsProcessingAudio(true);
      setAudioStatus('Analyzing audio waveform...');

      try {
          // 1. Convert to Base64
          const reader = new FileReader();
          reader.readAsDataURL(audioFile);
          
          reader.onloadend = async () => {
              const base64String = (reader.result as string).split(',')[1];
              const mimeType = audioFile.type || 'audio/mp3';
              const audioObjectUrl = URL.createObjectURL(audioFile);
              
              try {
                  // 2. Analyze with Gemini
                  // We pass the selected duration context to Gemini
                  setAudioStatus('Gemini is listening & planning visual structure...');
                  const analysis = await generateVisualsFromAudio(base64String, mimeType, duration);
                  
                  // 3. Fetch Visuals for segments
                  setAudioStatus(`Searching stock media for ${analysis.segments.length} scenes...`);
                  
                  const segmentsWithMediaPromises = analysis.segments.map(async (seg: any, index: number) => {
                      const keyword = seg.search_keywords_for_media || 'abstract background';
                      let mediaUrl = `https://picsum.photos/seed/${index}/1280/720`;
                      let mediaType: 'image' | 'video' = 'image';

                      try {
                          if (visualStyle === 'video') {
                              // User wants VIDEO: Try Video first, fallback to Image
                              const videoResults = await searchPexelsVideos(keyword, aspectRatio);
                              if (videoResults && videoResults.length > 0) {
                                  // Prefer SD/Tiny for faster loading/preview
                                  const bestVideo = videoResults[0].video_files.find((f: any) => f.quality === 'sd') || videoResults[0].video_files[0];
                                  mediaUrl = bestVideo.link;
                                  mediaType = 'video';
                              } else {
                                  // Fallback to photo if no video found
                                  const photoResults = await searchPexelsPhotos(keyword, aspectRatio);
                                  if (photoResults.length > 0) {
                                      mediaUrl = photoResults[0].src.large2x;
                                      mediaType = 'image';
                                  }
                              }
                          } else {
                              // User wants IMAGE ONLY
                              const photoResults = await searchPexelsPhotos(keyword, aspectRatio);
                              if (photoResults.length > 0) {
                                  mediaUrl = photoResults[0].src.large2x;
                                  mediaType = 'image';
                              }
                          }
                      } catch (e) { console.warn("Media fetch failed for segment", index); }

                      return {
                          id: `seg-${Date.now()}-${index}`,
                          narration_text: seg.narration_text || "",
                          search_keywords_for_media: keyword,
                          media: [{
                              id: `clip-${index}`,
                              url: mediaUrl,
                              type: mediaType
                          }],
                          duration: seg.duration,
                          transition: 'fade',
                          textOverlayStyle: {
                              fontFamily: 'Arial', fontSize: 40, color: '#FFFFFF', position: 'bottom', backgroundColor: 'rgba(0,0,0,0.6)'
                          }
                      } as Segment;
                  });

                  const segments = await Promise.all(segmentsWithMediaPromises);
                  
                  // 4. Construct Script
                  // Note: We add the full audio file as a global track starting at 0
                  const fileDuration = await getAudioDuration(audioObjectUrl);
                  
                  const script: VideoScript = {
                      title: analysis.title || "Audio Visualization",
                      segments: segments,
                      audioTracks: [{
                          id: 'main-audio-track',
                          url: audioObjectUrl,
                          name: audioFile.name,
                          type: 'music', // Treat as music track so it plays in background
                          startTime: 0,
                          duration: fileDuration,
                          volume: 1.0
                      }]
                  };

                  onScriptReady(script);

              } catch (err: any) {
                  console.error("Gemini Error:", err);
                  alert("Failed to analyze audio: " + err.message);
                  setIsProcessingAudio(false);
              }
          };
      } catch (e) {
          console.error(e);
          setIsProcessingAudio(false);
      }
  }

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

        {/* Audio to Video Card (NEW) */}
        <div 
            onClick={() => setMode('audio')}
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 flex flex-col items-center text-center gap-4 ${mode === 'audio' ? 'bg-gray-800/80 border-orange-500 shadow-lg shadow-orange-500/20' : 'bg-gray-800/40 border-gray-700 hover:border-gray-500'}`}
        >
            <div className={`p-4 rounded-full ${mode === 'audio' ? 'bg-gradient-to-br from-orange-500 to-pink-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                <MusicIcon className="w-8 h-8" />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">Audio to Video</h3>
                <p className="text-sm text-gray-400">Upload narration or music. AI analyzes the audio and syncs relevant visuals automatically.</p>
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
            className="hidden md:flex p-6 rounded-xl border-2 border-gray-700 bg-gray-800/40 hover:border-green-500 hover:bg-gray-800/60 cursor-pointer transition-all duration-300 flex-col items-center text-center gap-4 group"
        >
            <div className="p-4 rounded-full bg-gray-700 text-gray-400 group-hover:bg-green-600 group-hover:text-white transition-colors">
                <FolderIcon className="w-8 h-8" />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">My Projects</h3>
                <p className="text-sm text-gray-400">Load a previously saved project.</p>
            </div>
        </div>
      </div>

      {mode === 'ai' && (
        <div className="bg-gray-800/60 p-6 rounded-xl border border-gray-700 animate-fade-in">
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

      {mode === 'audio' && (
          <div className="bg-gray-800/60 p-8 rounded-xl border border-orange-500/50 animate-fade-in flex flex-col items-center">
              {isProcessingAudio ? (
                  <div className="flex flex-col items-center justify-center py-10">
                      <LoadingSpinner />
                      <h3 className="mt-4 text-xl font-bold text-white">AI Listening & Creating...</h3>
                      <p className="text-orange-400 animate-pulse mt-2">{audioStatus}</p>
                  </div>
              ) : (
                  <>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-2xl border-2 border-dashed border-gray-600 hover:border-orange-500 bg-gray-900/50 hover:bg-gray-800/80 rounded-2xl p-10 cursor-pointer transition-all group flex flex-col items-center gap-4"
                    >
                        <div className="p-4 bg-gray-800 rounded-full group-hover:bg-orange-600 transition-colors">
                            <ExportIcon className="w-8 h-8 text-gray-400 group-hover:text-white" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-white">Upload Audio File</h3>
                            <p className="text-sm text-gray-400 mt-1">MP3, WAV, or AAC (Max 10MB)</p>
                        </div>
                        <input 
                            type="file" 
                            accept="audio/*" 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleAudioUpload}
                        />
                    </div>

                    {audioFile && (
                        <div className="mt-6 w-full max-w-2xl">
                            <div className="flex items-center gap-3 bg-gray-800 p-3 rounded-lg border border-gray-700 mb-6">
                                <MusicIcon className="w-5 h-5 text-orange-400" />
                                <span className="text-sm text-gray-200 truncate flex-grow">{audioFile.name}</span>
                                <button onClick={() => setAudioFile(null)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                            </div>
                            
                            {/* NEW: Options Row for Audio Mode */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                                 {/* Visual Style */}
                                 <select 
                                    value={visualStyle}
                                    onChange={(e) => setVisualStyle((e.target as any).value)}
                                    className="p-3 bg-gray-900 border border-gray-700 rounded-md focus:border-orange-500 outline-none text-sm text-white"
                                    title="Visual Style"
                                >
                                    <option value="video">Dynamic Video Clips</option>
                                    <option value="image">Static Images Only</option>
                                </select>

                                {/* Duration */}
                                <select 
                                    value={duration}
                                    onChange={(e) => setDuration((e.target as any).value)}
                                    className="p-3 bg-gray-900 border border-gray-700 rounded-md focus:border-orange-500 outline-none text-sm text-white"
                                    title="Target Duration"
                                >
                                    <option value="full">Full Audio Length</option>
                                    <option value="30 seconds">30 Seconds Preview</option>
                                    <option value="1 minute">1 Minute Preview</option>
                                    <option value="2 minutes">2 Minutes Preview</option>
                                </select>

                                 {/* Aspect Ratio */}
                                 <select 
                                    value={aspectRatio}
                                    onChange={(e) => setAspectRatio((e.target as any).value)}
                                    className="p-3 bg-gray-900 border border-gray-700 rounded-md focus:border-orange-500 outline-none text-sm text-white"
                                    title="Aspect Ratio"
                                >
                                    <option value="landscape">Landscape (16:9)</option>
                                    <option value="portrait">Portrait (9:16)</option>
                                </select>
                            </div>

                            <button 
                                onClick={handleGenerateFromAudio}
                                className="w-full py-4 bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transform transition-all hover:scale-[1.02]"
                            >
                                <MagicWandIcon className="w-5 h-5" />
                                Generate Visual Video (5 Cr)
                            </button>
                        </div>
                    )}
                  </>
              )}
          </div>
      )}
    </div>
  );
};

export default PromptInput;
