
import React, { useState } from 'react';
import { VideoScript } from './types';
import PromptInput from './components/PromptInput';
import VideoEditor from './components/VideoEditor';
import { generateVideoScript } from './services/geminiService';
import LoadingSpinner from './components/LoadingSpinner';

const App: React.FC = () => {
  const [videoScript, setVideoScript] = useState<VideoScript | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateScript = async (topic: string, duration: string, aspectRatio: 'landscape' | 'portrait') => {
    setIsLoading(true);
    setError(null);
    setVideoScript(null);

    try {
      const script = await generateVideoScript(topic, duration, aspectRatio);
      setVideoScript(script);
    } catch (err: any) {
      console.error("Error generating script:", err);
      // Display the specific error message to the user (e.g., "Quota exceeded", "API Key invalid")
      setError(err.message || "Failed to generate video script. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualStart = () => {
    // Create a blank template script
    const initialScript: VideoScript = {
        title: "New Project",
        segments: [{
            id: `segment-${Date.now()}`,
            narration_text: "Welcome to your new video. Click here to edit text, or use the Media button to upload your own clips.",
            search_keywords_for_media: "placeholder",
            media: [{
                id: `clip-${Date.now()}`,
                // Simple placeholder color image
                url: "https://placehold.co/1280x720/1f2937/ffffff?text=Click+Media+to+Add+Clips", 
                type: 'image'
            }],
            duration: 5,
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
        }]
    };
    setVideoScript(initialScript);
    setError(null);
  };
  
  const handleBackToStart = () => {
    setVideoScript(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-2xl font-bold text-white tracking-wider">
          <span className="text-purple-400">Magi</span>story Instant Video
        </h1>
        {videoScript && (
          <button
            onClick={handleBackToStart}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold transition-colors duration-200"
          >
            New Project
          </button>
        )}
      </header>

      <main className="p-4 md:p-8">
        {!videoScript && !isLoading && !error && (
          <PromptInput onGenerate={handleGenerateScript} onManualStart={handleManualStart} />
        )}
        
        {isLoading && (
            <div className="flex flex-col items-center justify-center h-64">
                <LoadingSpinner />
                <p className="mt-4 text-lg text-gray-300">Generating your magical video script...</p>
            </div>
        )}

        {error && !isLoading && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <p className="text-xl text-red-400 mb-4 bg-red-900/20 p-4 rounded-lg border border-red-500/30 max-w-2xl">
                    Error: {error}
                </p>
                <button
                    onClick={() => setError(null)}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold transition-colors duration-200"
                >
                    Try Again
                </button>
            </div>
        )}

        {videoScript && !isLoading && (
          <VideoEditor initialScript={videoScript} />
        )}
      </main>
    </div>
  );
};

export default App;
