
import React, { useState, useEffect, useRef } from 'react';
import { suggestMediaKeywords } from '../services/geminiService';
import { searchPexelsPhotos, searchPexelsVideos } from '../services/pexelsService';
import LoadingSpinner from './LoadingSpinner';
import { PlayIcon, ExportIcon, MediaIcon, MagicWandIcon } from './icons';

interface MediaSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (newUrl: string, mediaType: 'image' | 'video') => void;
  initialKeywords: string;
  narrationText: string;
  mode?: 'default' | 'wizard';
  videoTitle?: string;
}

type SearchType = 'all' | 'photos' | 'videos' | 'upload';
type Orientation = 'landscape' | 'portrait' | 'square';
type WizardStep = 'source' | 'pexels-type' | 'search';

const MediaSearchModal: React.FC<MediaSearchModalProps> = ({ isOpen, onClose, onSelectMedia, initialKeywords, narrationText, mode = 'default', videoTitle }) => {
  const [query, setQuery] = useState(initialKeywords);
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Hover Preview State
  const [hoveredVideoId, setHoveredVideoId] = useState<number | null>(null);
  
  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(mode === 'wizard' ? 'source' : 'search');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'wizard') {
          setWizardStep('source');
          setQuery('');
          setSuggestions([]);
      } else {
          setWizardStep('search');
          setQuery(initialKeywords);
          if (narrationText && (!initialKeywords || initialKeywords === 'placeholder')) {
              handleSuggest();
          }
          if (!initialKeywords || initialKeywords === 'placeholder') {
              setSearchType('upload');
          } else {
              setSearchType('all');
          }
      }
    } else {
        setResults([]);
        setSuggestions([]);
        setHoveredVideoId(null);
    }
  }, [isOpen, initialKeywords, mode]);

  useEffect(() => {
      if (isOpen && searchType !== 'upload' && wizardStep === 'search' && query && query !== 'placeholder') {
          fetchMedia();
      }
  }, [isOpen, searchType, orientation, wizardStep]);
  
  const fetchMedia = async (overrideQuery?: string) => {
    const activeQuery = overrideQuery !== undefined ? overrideQuery : query;
    
    if (!activeQuery.trim()) {
        setResults([]);
        return;
    }
    
    const requestId = ++activeRequestRef.current;
    setIsLoading(true);
    setError(null);
    setHoveredVideoId(null);
    
    if (results.length > 0) {
         setResults([]);
    }

    try {
        let data: any[] = [];
        
        if (searchType === 'all') {
            const [photos, videos] = await Promise.all([
                searchPexelsPhotos(activeQuery, orientation),
                searchPexelsVideos(activeQuery, orientation)
            ]);
            
            const maxLength = Math.max(photos.length, videos.length);
            for (let i = 0; i < maxLength; i++) {
                if (photos[i]) data.push(photos[i]);
                if (videos[i]) data.push(videos[i]);
            }
        } else if (searchType === 'photos') {
            const photos = await searchPexelsPhotos(activeQuery, orientation);
            data = photos;
        } else if (searchType === 'videos') {
            const videos = await searchPexelsVideos(activeQuery, orientation);
            data = videos;
        }
        
        if (requestId === activeRequestRef.current) {
             setResults(data || []);
        }
    } catch (err: any) {
        if (requestId === activeRequestRef.current) {
            setError(err.message || "Failed to fetch media from Pexels.");
            setResults([]);
        }
    } finally {
        if (requestId === activeRequestRef.current) {
            setIsLoading(false);
        }
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchType !== 'upload') {
        fetchMedia();
    }
  };

  const handleSearchTypeChange = (type: SearchType) => {
      if (type !== searchType) {
        setResults([]); 
        setSearchType(type);
      }
  };

  const handleSuggest = async () => {
    if (!narrationText) return;
    setIsSuggesting(true);
    try {
      const suggestedString = await suggestMediaKeywords(narrationText, videoTitle);
      const parts = suggestedString.split(',').map(s => s.trim()).filter(s => s.length > 2);
      setSuggestions(parts);
    } catch (err) {
      console.warn("Failed to get suggestions", err);
    } finally {
      setIsSuggesting(false);
    }
  };
  
  const applySuggestion = (s: string) => {
      setQuery(s);
      fetchMedia(s);
  };
  
  const handleSelect = (item: any) => {
    const isVideo = item._type === 'video' || (item.video_files && item.video_files.length > 0);

    if (!isVideo) {
        if (item.src?.large2x) {
            onSelectMedia(item.src.large2x, 'image');
        }
    } else {
        if (item.video_files && item.video_files.length > 0) {
            const hdFile = item.video_files.find((f: any) => f.quality === 'hd') || 
                           item.video_files.find((f: any) => f.width >= 1280) ||
                           item.video_files[0];
            onSelectMedia(hdFile?.link, 'video');
        }
    }
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = (e.target as any).files?.[0];
      if (file) {
          const objectUrl = URL.createObjectURL(file);
          const type = file.type.startsWith('video/') ? 'video' : 'image';
          onSelectMedia(objectUrl, type);
          onClose();
      }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      // Robust Fallback: 1. Try generic placeholder, 2. If that fails (unlikely), set transparent
      const target = e.target as HTMLImageElement;
      if (!target.src.includes('placehold.co')) {
          target.src = 'https://placehold.co/600x400/333/999?text=Image+Unavailable';
      }
  }

  if (!isOpen) return null;

  if (wizardStep === 'source') {
      return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl p-8 text-center" onClick={e => e.stopPropagation()}>
              <h2 className="text-3xl font-bold text-white mb-8">Add New Segment</h2>
              <p className="text-gray-400 mb-8">Where would you like to get your media from?</p>
              
              <div className="grid grid-cols-2 gap-6">
                  <button 
                    onClick={() => (fileInputRef.current as any)?.click()}
                    className="flex flex-col items-center justify-center p-8 bg-gray-700 hover:bg-purple-600 rounded-xl transition-all duration-300 group border-2 border-transparent hover:border-purple-300"
                  >
                      <div className="p-4 bg-gray-600 rounded-full mb-4 group-hover:bg-purple-500">
                          <ExportIcon className="w-10 h-10 text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Device Storage</h3>
                      <p className="text-sm text-gray-400 mt-2 group-hover:text-purple-100">Upload video or image</p>
                  </button>

                  <button 
                    onClick={() => setWizardStep('pexels-type')}
                    className="flex flex-col items-center justify-center p-8 bg-gray-700 hover:bg-blue-600 rounded-xl transition-all duration-300 group border-2 border-transparent hover:border-blue-300"
                  >
                       <div className="p-4 bg-gray-600 rounded-full mb-4 group-hover:bg-blue-500">
                          <MediaIcon className="w-10 h-10 text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-white">Pexels Library</h3>
                      <p className="text-sm text-gray-400 mt-2 group-hover:text-blue-100">Search stock media</p>
                  </button>
              </div>

              <input 
                  type="file" 
                  accept="image/*,video/*" 
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileUpload}
              />
          </div>
        </div>
      )
  }

  if (wizardStep === 'pexels-type') {
      return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl p-8 text-center" onClick={e => e.stopPropagation()}>
              <div className="flex justify-start mb-4">
                  <button onClick={() => setWizardStep('source')} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm">
                      &larr; Back
                  </button>
              </div>
              <h2 className="text-3xl font-bold text-white mb-8">Select Media Type</h2>
              
              <div className="grid grid-cols-2 gap-6">
                   <button 
                    onClick={() => { setSearchType('photos'); setWizardStep('search'); }}
                    className="flex flex-col items-center justify-center p-8 bg-gray-700 hover:bg-pink-600 rounded-xl transition-all duration-300 group"
                  >
                      <h3 className="text-2xl font-bold text-white">Photos</h3>
                  </button>

                  <button 
                    onClick={() => { setSearchType('videos'); setWizardStep('search'); }}
                    className="flex flex-col items-center justify-center p-8 bg-gray-700 hover:bg-teal-600 rounded-xl transition-all duration-300 group"
                  >
                      <h3 className="text-2xl font-bold text-white">Videos</h3>
                  </button>
              </div>
          </div>
        </div>
      )
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
                {mode === 'wizard' && (
                    <button onClick={() => setWizardStep('pexels-type')} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm">
                        &larr; Back
                    </button>
                )}
                <h2 className="text-2xl font-bold text-purple-300">
                    {searchType === 'upload' ? 'Upload Media' : 'Search Media'}
                </h2>
            </div>
            {searchType !== 'upload' && (
                <p className="text-xs text-gray-500">
                    Media provided by <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">Pexels</a>
                </p>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl ml-4">&times;</button>
        </div>

        <div className="mt-4">
        {searchType !== 'upload' && (
            <>
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery((e.target as any).value)}
                    placeholder="Enter search keywords..."
                    className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder-gray-400"
                />
                <button 
                    type="button"
                    onClick={handleSuggest}
                    disabled={isSuggesting || !narrationText}
                    title={!narrationText ? "Narration text is empty" : "Refresh AI Suggestions"}
                    className="px-4 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-md hover:bg-gray-600 hover:text-white hover:border-purple-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                >
                    {isSuggesting ? <LoadingSpinner /> : <MagicWandIcon className="w-5 h-5 text-purple-400" />}
                </button>
                <button type="submit" className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 shadow-md">
                    Search
                </button>
                </form>

                {(suggestions.length > 0 || isSuggesting) && (
                    <div className="flex flex-wrap gap-2 mb-4 items-center animate-fade-in bg-gray-900/50 p-2 rounded-lg border border-gray-700/50">
                        <span className="text-[10px] text-purple-300 font-bold uppercase tracking-wider flex items-center mr-1">
                            <MagicWandIcon className="w-3 h-3 mr-1" /> Ideas:
                        </span>
                        {isSuggesting && suggestions.length === 0 && (
                            <span className="text-xs text-gray-500 animate-pulse italic">Analyzing narration...</span>
                        )}
                        {suggestions.map((s, i) => (
                            <button 
                                key={i} 
                                onClick={() => applySuggestion(s)}
                                className="px-3 py-1 bg-gray-800 border border-gray-600 rounded-full text-xs text-gray-300 hover:bg-purple-600 hover:text-white hover:border-purple-400 transition-all shadow-sm whitespace-nowrap"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </>
        )}
        
        {mode !== 'wizard' && (
            <div className="flex justify-between items-center border-b border-gray-700 mb-4">
            <nav className="flex gap-4">
                <button onClick={() => handleSearchTypeChange('all')} className={`px-4 py-2 font-semibold border-b-2 transition-colors ${searchType === 'all' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white'}`}>All</button>
                <button onClick={() => handleSearchTypeChange('photos')} className={`px-4 py-2 font-semibold border-b-2 transition-colors ${searchType === 'photos' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white'}`}>Photos</button>
                <button onClick={() => handleSearchTypeChange('videos')} className={`px-4 py-2 font-semibold border-b-2 transition-colors ${searchType === 'videos' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white'}`}>Videos</button>
                <button onClick={() => handleSearchTypeChange('upload')} className={`px-4 py-2 font-semibold border-b-2 transition-colors ${searchType === 'upload' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white'}`}>Upload</button>
            </nav>
            {searchType !== 'upload' && (
                <div className="flex items-center gap-2">
                    {(['landscape', 'portrait', 'square'] as Orientation[]).map(o => (
                        <button
                            key={o}
                            onClick={() => setOrientation(o)}
                            className={`px-3 py-1 text-sm rounded-md transition-colors capitalize ${
                                orientation === o
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            )}
            </div>
        )}
        </div>

        {error && <p className="text-red-400 text-center mb-2 bg-red-900/20 p-2 rounded border border-red-900/50">{error}</p>}

        <div className="flex-grow overflow-y-auto pr-2 -mr-2 custom-scrollbar">
          
          {searchType === 'upload' ? (
              <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-gray-600 rounded-lg p-8 hover:border-purple-500 transition-colors bg-gray-800/50">
                  <div className="bg-gray-700 p-4 rounded-full mb-4">
                      <ExportIcon className="w-8 h-8 text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-white">Upload Media</h3>
                  <p className="text-gray-400 mb-6 text-center">Select an image or video file from your device</p>
                  <input 
                      type="file" 
                      accept="image/*,video/*" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleFileUpload}
                  />
                  <button 
                    onClick={() => (fileInputRef.current as any)?.click()}
                    className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 shadow-lg"
                  >
                      Browse Files
                  </button>
              </div>
          ) : (
            isLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                    <LoadingSpinner />
                    <p className="text-gray-400 text-sm animate-pulse">Searching Pexels library...</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
                {results.map((item, index) => {
                    const isVideo = item._type === 'video' || !!item.video_files;
                    
                    const previewVideoUrl = isVideo 
                        ? (item.video_files.find((v: any) => v.quality === 'tiny')?.link || item.video_files[0]?.link) 
                        : null;

                    return (
                        <div 
                            key={`${item.id}-${index}`} 
                            className="aspect-video bg-gray-800 rounded-md overflow-hidden cursor-pointer group relative shadow-md border border-gray-700 hover:border-purple-500 transition-all" 
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => isVideo && setHoveredVideoId(item.id)}
                            onMouseLeave={() => setHoveredVideoId(null)}
                        >
                            <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-bold text-white z-10 shadow-sm ${isVideo ? 'bg-teal-600' : 'bg-pink-600'}`}>
                                {isVideo ? 'VIDEO' : 'PHOTO'}
                            </div>

                            {!isVideo ? (
                                <img 
                                    src={item.src?.medium} 
                                    alt={item.alt} 
                                    loading="lazy" 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    onError={handleImageError}
                                />
                            ) : (
                                <>
                                    {hoveredVideoId === item.id ? (
                                        <video 
                                            src={previewVideoUrl} 
                                            autoPlay 
                                            muted 
                                            loop 
                                            playsInline 
                                            className="w-full h-full object-cover animate-fade-in"
                                            onError={(e) => {
                                                // Fallback to image if video fails
                                                (e.target as HTMLVideoElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <>
                                            <img 
                                                src={item.image} 
                                                alt="Video Preview" 
                                                className="w-full h-full object-cover" 
                                                loading="lazy" 
                                                onError={handleImageError}
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors pointer-events-none">
                                                <div className="bg-black/50 p-2 rounded-full backdrop-blur-sm border border-white/20 shadow-lg transform group-hover:scale-110 transition-transform">
                                                    <PlayIcon className="w-6 h-6 text-white"/>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                            
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <p className="text-[10px] text-white truncate">{item.user?.name || item.photographer}</p>
                            </div>
                        </div>
                    );
                })}
                </div>
            )
          )}
           {!isLoading && results.length === 0 && !error && searchType !== 'upload' && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <MediaIcon className="w-12 h-12 mb-2 opacity-20" />
                    <p>No results found for "{query}"</p>
                    <p className="text-sm mt-1">Try using the AI suggestions or different keywords</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default MediaSearchModal;
