
import React, { useState, useEffect } from 'react';
import { VideoScript, SavedProject } from './types';
import PromptInput from './components/PromptInput';
import VideoEditor from './components/VideoEditor';
import LandingPage from './components/LandingPage';
import PricingSection from './components/PricingSection';
import LoginModal from './components/LoginModal';
import ProjectManagerModal from './components/ProjectManagerModal';
import { generateVideoScript } from './services/geminiService';
import LoadingSpinner from './components/LoadingSpinner';
import { useAuth } from './contexts/AuthContext';
import { MagicWandIcon } from './components/icons';

type AppView = 'landing' | 'prompt' | 'editor';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
  const [videoScript, setVideoScript] = useState<VideoScript | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const { user, deductCredits, isLoading: isAuthLoading } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);

  // Auto-close modal and redirect when user is detected
  useEffect(() => {
      if (user) {
          setShowLoginModal(false);
          // If we were stuck on the modal, ensure we are on a valid page.
          // The user requested to be redirected to Landing Page after login.
          if (view === 'prompt' && !videoScript) {
             // Keep on prompt if they were there
          } else if (view === 'landing') {
             // Stay on landing
          } else {
             // Default fallback or specific redirect if needed
             // setView('landing'); 
          }
      }
  }, [user, view, videoScript]);

  // Force login on Get Started or Manual Start
  const checkAuth = () => {
      if (!user) {
          setShowLoginModal(true);
          return false;
      }
      return true;
  };

  const handleGenerateScript = async (topic: string, duration: string, aspectRatio: 'landscape' | 'portrait', visualStyle: 'video' | 'image') => {
    if (!checkAuth()) return;
    
    // Calculate cost: parse duration string "1 minute" -> 1 credit, "2 minutes" -> 2 credits
    const minutes = parseInt(duration) || 1;
    const cost = minutes * 1;

    const success = await deductCredits(cost, 'magic_video');
    if (!success) return; // deductCredits handles the alert

    setIsLoading(true);
    setError(null);
    setVideoScript(null);

    try {
      const script = await generateVideoScript(topic, duration, aspectRatio, visualStyle);
      setVideoScript(script);
      setView('editor');
    } catch (err: any) {
      console.error("Error generating script:", err);
      setError(err.message || "Failed to generate video script. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualStart = () => {
    if (!checkAuth()) return;

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

  // Handler for Audio-to-Video feature which constructs script internally
  const handleScriptReady = (script: VideoScript) => {
      setVideoScript(script);
      setView('editor');
      setError(null);
  };

  const handleLoadProject = (project: SavedProject) => {
      setVideoScript(project);
      setView('editor');
      setShowProjectModal(false);
  }
  
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

  if (isAuthLoading) return <div className="h-screen flex items-center justify-center bg-gray-900"><LoadingSpinner /></div>;

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
                {user ? (
                    <div className="flex items-center gap-3 bg-gray-800 px-3 py-1.5 rounded-full border border-gray-700">
                        <div className="flex items-center gap-1 text-yellow-400 font-bold text-sm">
                            <MagicWandIcon className="w-4 h-4" />
                            {user.credits}
                        </div>
                        <div className="w-px h-4 bg-gray-600"></div>
                        <div className="text-xs text-gray-300 truncate max-w-[100px]">{user.name}</div>
                    </div>
                ) : (
                    <button onClick={() => setShowLoginModal(true)} className="text-sm font-semibold hover:text-white text-gray-300">
                        Sign In
                    </button>
                )}

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
                        onClick={() => {
                            if (checkAuth()) setView('prompt');
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-full transition-colors"
                    >
                        Get Started
                    </button>
                )}
            </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow overflow-auto relative bg-gray-900 custom-scrollbar scroll-smooth">
        
        {view === 'landing' && (
            <>
                <LandingPage onGetStarted={() => {
                    if (checkAuth()) setView('prompt');
                }} />
                <PricingSection />
            </>
        )}

        {view === 'prompt' && (
            <div className="min-h-full flex flex-col items-center justify-center p-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center animate-fade-in">
                        <LoadingSpinner />
                        <h2 className="mt-8 text-2xl font-bold text-white">Generating Magic...</h2>
                        <p className="mt-2 text-gray-400">Spending credits to cast spells...</p>
                    </div>
                ) : (
                    <div className="w-full max-w-4xl animate-fade-in-up">
                        <div className="mb-8">
                             <button onClick={handleGoHome} className="text-gray-500 hover:text-white mb-4 flex items-center gap-1 text-sm">&larr; Back to Home</button>
                        </div>
                        <PromptInput 
                            onGenerate={handleGenerateScript} 
                            onManualStart={handleManualStart} 
                            onScriptReady={handleScriptReady}
                            onOpenProjects={() => setShowProjectModal(true)}
                        />
                        
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

      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
        message={!user ? "Sign in to get your 10 FREE credits!" : undefined}
      />

      <ProjectManagerModal 
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        onLoadProject={handleLoadProject}
      />
    </div>
  );
};

export default App;
