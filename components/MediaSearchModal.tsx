
import React, { useState, useEffect, useRef } from 'react';
import { suggestMediaKeywords } from '../services/geminiService';
import { searchPexelsPhotos, searchPexelsVideos } from '../services/pexelsService';
import LoadingSpinner from './LoadingSpinner';
import { PlayIcon, ExportIcon, MediaIcon } from './icons';

interface MediaSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (newUrl: string, mediaType: 'image' | 'video') => void;
  initialKeywords: string;
  narrationText: string;
  mode?: 'default' | 'wizard';
}

type SearchType = 'photos' | 'videos' | 'upload';
type Orientation = 'landscape' | 'portrait' | 'square';
type WizardStep = 'source' | 'pexels-type' | 'search';

const MediaSearchModal: React.FC<MediaSearchModalProps> = ({ isOpen, onClose, onSelectMedia, initialKeywords, narrationText, mode = 'default' }) => {
  const [query, setQuery] = useState(initialKeywords);
  const [searchType, setSearchType] = useState<SearchType>('photos');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(mode === 'wizard' ? 'source' : 'search');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'wizard') {
          setWizardStep('source');
          setQuery('');
      } else {
          setWizardStep('search');
          setQuery(initialKeywords);
          if (!initialKeywords || initialKeywords === 'placeholder') {
              setSearchType('upload');
          } else {
              setSearchType('photos');
          }
      }
    }
  }, [isOpen, initialKeywords, mode]);

  useEffect(() => {
      if (isOpen && searchType !== 'upload' && wizardStep === 'search') {
          fetchMedia();
      } else if (!isOpen) {
          setResults([]); 
      }
  }, [isOpen, query, searchType, orientation, wizardStep]); 
  
  const fetchMedia = async () => {
    if (!query.trim()) {
        setResults([]);
        return;
    }
    
    const requestId = ++activeRequestRef.current;
    setIsLoading(true);
    setError(null);
    
    if (results.length > 0) {
         setResults([]);
    }

    try {
        let data = [];
        if (searchType === 'photos') {
            data = await searchPexelsPhotos(query, orientation);
        } else if (searchType === 'videos') {
            data = await searchPexelsVideos(query, orientation);
        }
        
        if (requestId === activeRequestRef.current) {
             setResults(data || []);
        }
    } catch (err: any) {
        if (requestId === activeRequestRef.current) {
            setError(err.message || "Failed to fetch media from Pexels. Check your API key and network connection.");
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
    setIsSuggesting(true);
    setError(null);
    try {
      const suggested = await suggestMediaKeywords(narrationText);
      setQuery(suggested);
    } catch (err) {
      setError("Failed to get suggestions. Please try again.");
    } finally {
      setIsSuggesting(false);
    }
  };
  
  const handleSelect = (result: any) => {
    if (searchType === 'photos') {
        if (result.src?.large2x) {
            onSelectMedia(result.src.large2x, 'image');
        }
    } else {
        if (result.video_files && result.video_files.length > 0) {
            const hdFile = result.video_files.find((f: any) => f.quality === 'hd');
            onSelectMedia(hdFile?.link || result.video_files[0].link, 'video');
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

  if (!isOpen) return null;

  // --- Wizard: Step 1 (Source) ---
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

              {/* Hidden file input for direct trigger */}
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

  // --- Wizard: Step 2 (Pexels Type) ---
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

  // --- Default / Wizard Step 3 (Search) ---
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
                    {searchType === 'upload' ? 'Upload Media' : `Search ${searchType === 'photos' ? 'Photos' : 'Videos'}`}
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
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery((e.target as any).value)}
                placeholder="Enter search keywords..."
                className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none"
            />
            <button 
                type="button"
                onClick={handleSuggest}
                disabled={isSuggesting || !narrationText}
                title={!narrationText ? "Narration text is empty" : "Suggest keywords with AI"}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isSuggesting ? <div className="w-5 h-5"><LoadingSpinner /></div> : '✨'}
                Suggest
            </button>
            <button type="submit" className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700">
                Search
            </button>
            </form>
        )}
        
        {/* Only show nav tabs if NOT in wizard mode, or if user wants to switch context freely */}
        {mode !== 'wizard' && (
            <div className="flex justify-between items-center border-b border-gray-700 mb-4">
            <nav className="flex gap-4">
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

        {error && <p className="text-red-400 text-center mb-2">{error}</p>}

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          
          {searchType === 'upload' ? (
              <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-gray-600 rounded-lg p-8 hover:border-purple-500 transition-colors">
                  <div className="bg-gray-700 p-4 rounded-full mb-4">
                      <ExportIcon className="w-8 h-8 text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Upload Media</h3>
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
                <div className="flex items-center justify-center h-full">
                <LoadingSpinner />
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {results.map(item => (
                    <div key={item.id} className="aspect-video bg-gray-700 rounded-md overflow-hidden cursor-pointer group relative" onClick={() => handleSelect(item)}>
                    {searchType === 'photos' ? (
                        <img src={item.src?.medium} alt={item.alt} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"/>
                    ) : (
                        <>
                            {item.video_files && item.video_files.length > 0 ? (
                                <video 
                                    src={item.video_files[0].link} 
                                    poster={item.image} 
                                    muted 
                                    loop 
                                    playsInline 
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                    onMouseOver={e => (e.currentTarget as any).play().catch(() => {})}
                                    onMouseOut={e => {
                                        (e.currentTarget as any).pause();
                                        (e.currentTarget as any).currentTime = 0;
                                    }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500 text-xs">No Video</div>
                            )}
                            <div className="absolute top-2 right-2 bg-black/50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <PlayIcon className="w-4 h-4 text-white"/>
                            </div>
                        </>
                    )}
                    </div>
                ))}
                </div>
            )
          )}
           {!isLoading && results.length === 0 && !error && searchType !== 'upload' && (
                <div className="flex items-center justify-center h-full text-gray-500">
                    <p>No results found for "{query}". Try a different search.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default MediaSearchModal;