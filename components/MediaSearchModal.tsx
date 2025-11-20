
import React, { useState, useEffect, useRef } from 'react';
import { suggestMediaKeywords } from '../services/geminiService';
import { searchPexelsPhotos, searchPexelsVideos } from '../services/pexelsService';
import LoadingSpinner from './LoadingSpinner';
import { PlayIcon } from './icons';

interface MediaSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (newUrl: string, mediaType: 'image' | 'video') => void;
  initialKeywords: string;
  narrationText: string;
}

type SearchType = 'photos' | 'videos';
type Orientation = 'landscape' | 'portrait' | 'square';

const MediaSearchModal: React.FC<MediaSearchModalProps> = ({ isOpen, onClose, onSelectMedia, initialKeywords, narrationText }) => {
  const [query, setQuery] = useState(initialKeywords);
  const [searchType, setSearchType] = useState<SearchType>('photos');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to track the current active search request to prevent race conditions
  const activeRequestRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialKeywords);
      // Trigger search will be handled by the next effect because isOpen changed
    }
  }, [isOpen, initialKeywords]);

  useEffect(() => {
      if (isOpen) {
          fetchMedia();
      } else {
          setResults([]); // Clear when closed
      }
  }, [isOpen, query, searchType, orientation]); // Re-fetch when any param changes
  
  const fetchMedia = async () => {
    if (!query.trim()) {
        setResults([]);
        return;
    }
    
    const requestId = ++activeRequestRef.current;
    setIsLoading(true);
    setError(null);
    
    // Optimistically clear results if switching types to avoid render mismatch
    // We do this here inside the fetch start to sync with loading state
    if (results.length > 0) {
         // Optional: keep old results until new ones load? 
         // No, safer to clear to avoid "video_files" on photo object errors if render happens.
         setResults([]);
    }

    try {
        let data = [];
        if (searchType === 'photos') {
            data = await searchPexelsPhotos(query, orientation);
        } else {
            data = await searchPexelsVideos(query, orientation);
        }
        
        // Only update if this request is still the active one
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
    fetchMedia();
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
        // Safety check for video properties
        if (result.video_files && result.video_files.length > 0) {
            const hdFile = result.video_files.find((f: any) => f.quality === 'hd');
            onSelectMedia(hdFile?.link || result.video_files[0].link, 'video');
        }
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-purple-300 mb-4">Find New Media</h2>
            <p className="text-xs text-gray-500">
                Media provided by <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">Pexels</a>
            </p>
        </div>
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
        
        <div className="flex justify-between items-center border-b border-gray-700 mb-4">
          <nav className="flex gap-4">
             <button onClick={() => handleSearchTypeChange('photos')} className={`px-4 py-2 font-semibold border-b-2 transition-colors ${searchType === 'photos' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white'}`}>Photos</button>
             <button onClick={() => handleSearchTypeChange('videos')} className={`px-4 py-2 font-semibold border-b-2 transition-colors ${searchType === 'videos' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-transparent hover:text-white'}`}>Videos</button>
          </nav>
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
        </div>

        {error && <p className="text-red-400 text-center mb-2">{error}</p>}

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          {isLoading ? (
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
                                onMouseOver={e => e.currentTarget.play().catch(() => {})}
                                onMouseOut={e => {
                                    e.currentTarget.pause();
                                    e.currentTarget.currentTime = 0;
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
          )}
           {!isLoading && results.length === 0 && !error && (
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
