
import React, { useState } from 'react';
import { VideoScript } from './types';
import PromptInput from './components/PromptInput';
import VideoEditor from './components/VideoEditor';
import LandingPage from './components/LandingPage';
import { generateVideoScript } from './services/geminiService';
import LoadingSpinner from './components/LoadingSpinner';

type AppView = 'landing' | 'prompt' | 'editor';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
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
      setView('editor');
    } catch (err: any) {
      console.error("Error generating script:", err);
      setError(err.message || "Failed to generate video script. Please try again.");
      // Stay on prompt view to show error
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualStart = () => {
    const initialScript: VideoScript = {
        title: "New Project",
        segments: [{
            id: `segment-${Date.now()}`,
            narration_text: "Welcome to your new video. Click here to edit text, or use the Media button to upload your own clips.",
            search_keywords_for_media: "placeholder",
            media: [{
                id: `clip-${Date.now()}`,
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
    setView('editor');
    setError(null);
  };
  
  const handleBackToStart = () => {
    setVideoScript(null);
    setError(null);
    setView('prompt');
  };

  const handleGoHome = () => {
      setVideoScript(null);
      setError(null);
      setView('landing');
  }

  // Determine if header should be compact (in editor) or transparent/standard
  const isEditor = view === 'editor';

  return (
    <div className="h-screen bg-gray-900 text-gray-100 font-sans flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className={`flex-shrink-0 z-50 transition-all duration-300 border-b border-gray-800 ${isEditor ? 'h-12 bg-gray-900' : 'h-16 bg-gray-900/80 backdrop-blur-md'}`}>
         <div className={`h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center ${isEditor ? 'max-w-none px-4' : ''}`}>
            <div 
                className="flex items-center gap-2 cursor-pointer group" 
                onClick={handleGoHome}
                title="Back to Home"
            >
                <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-500 rounded-lg flex items-center justify-center font-bold text-white text-lg shadow-lg">M</div>
                <h1 className={`${isEditor ? 'text-lg' : 'text-xl'} font-bold text-white tracking-wider`}>
                Magistory <span className="hidden sm:inline font-light text-gray-500 text-sm">| Instant Video</span>
                </h1>
            </div>

            <div className="flex items-center gap-4">
                {isEditor && (
                <button
                    onClick={handleBackToStart}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 font-medium border border-gray-700 transition-colors"
                >
                    New Project
                </button>
                )}
                {view === 'landing' && (
                    <button 
                        onClick={() => setView('prompt')}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-full transition-colors"
                    >
                        Get Started
                    </button>
                )}
            </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow overflow-auto relative bg-gray-900 custom-scrollbar">
        
        {view === 'landing' && (
            <LandingPage onGetStarted={() => setView('prompt')} />
        )}

        {view === 'prompt' && (
            <div className="min-h-full flex flex-col items-center justify-center p-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center animate-fade-in">
                        <LoadingSpinner />
                        <h2 className="mt-8 text-2xl font-bold text-white">Generating Magic...</h2>
                        <p className="mt-2 text-gray-400">Writing script, finding media, and casting voices.</p>
                    </div>
                ) : (
                    <div className="w-full max-w-4xl animate-fade-in-up">
                        <div className="mb-8">
                             <button onClick={handleGoHome} className="text-gray-500 hover:text-white mb-4 flex items-center gap-1 text-sm">&larr; Back to Home</button>
                        </div>
                        <PromptInput onGenerate={handleGenerateScript} onManualStart={handleManualStart} />
                        
                        {error && (
                            <div className="mt-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-center animate-fade-in">
                                <p className="text-red-400 font-semibold mb-2">Generation Failed</p>
                                <p className="text-red-300 text-sm mb-4">{error}</p>
                                <button
                                    onClick={() => setError(null)}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

        {view === 'editor' && videoScript && (
          <VideoEditor initialScript={videoScript} />
        )}

      </main>
    </div>
  );
};

export default App;
