
import React, { useState, useEffect, useRef } from 'react';
import { searchPixabayAudio } from '../services/pixabayService';
import { searchPexelsPhotos, searchPexelsVideos } from '../services/pexelsService';
import { MagicWandIcon, PlayIcon, MusicIcon, TextIcon, SearchIcon, ExportIcon, VolumeXIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import { getCachedMediaUrl } from '../utils/cache';

interface ResourcePanelProps {
  activeTab: string;
  onSelectMedia: (url: string, type: 'image' | 'video') => void;
  onSelectAudio: (url: string, name: string, type?: 'music' | 'sfx') => void;
  onAddText: (text: string) => void;
  onOpenAITools: () => void;
  onAutoCaptions: () => void;
  initialAudioType?: 'music' | 'sfx';
}

const ResourcePanel: React.FC<ResourcePanelProps> = ({ 
  activeTab, onSelectMedia, onSelectAudio, onAddText, onOpenAITools, onAutoCaptions, initialAudioType
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | string | null>(null);
  
  // Tab specific states
  const [audioSearchType, setAudioSearchType] = useState<'music' | 'sfx'>('music');
  const [mediaSource, setMediaSource] = useState<'stock' | 'upload'>('stock');
  const [stockMediaType, setStockMediaType] = useState<'all' | 'image' | 'video'>('all');

  // Hover Preview State
  const [hoveredVideoId, setHoveredVideoId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setResults([]);
    setQuery('');
    if (activeTab === 'media') {
        setMediaSource('stock');
        setStockMediaType('all');
        handleSearch('business');
    }
    if (activeTab === 'audio') {
        // Respect initial type if provided
        if (initialAudioType) setAudioSearchType(initialAudioType);
        handleSearch(initialAudioType === 'sfx' ? 'whoosh' : 'cinematic');
    }
  }, [activeTab, initialAudioType]);

  // Re-search when switching audio type or stock media type
  useEffect(() => {
      if (activeTab === 'audio' && query) {
          handleSearch(query);
      }
      if (activeTab === 'media' && mediaSource === 'stock' && query) {
          handleSearch(query);
      }
  }, [audioSearchType, stockMediaType]);

  const handleSearch = async (overrideQuery?: string) => {
    const q = overrideQuery || query;
    if (!q) return;
    setIsLoading(true);
    setResults([]);

    try {
      if (activeTab === 'media') {
        let finalResults: any[] = [];
        
        if (stockMediaType === 'all') {
            const [photos, videos] = await Promise.all([
               searchPexelsPhotos(q),
               searchPexelsVideos(q)
            ]);
            const max = Math.max(photos.length, videos.length);
            for(let i=0; i<max; i++) {
               if(photos[i]) finalResults.push({...photos[i], type: 'image'});
               if(videos[i]) finalResults.push({...videos[i], type: 'video'});
            }
        } else if (stockMediaType === 'image') {
            const photos = await searchPexelsPhotos(q);
            finalResults = photos.map(p => ({...p, type: 'image'}));
        } else if (stockMediaType === 'video') {
            const videos = await searchPexelsVideos(q);
            finalResults = videos.map(v => ({...v, type: 'video'}));
        }
        setResults(finalResults);
      } else if (activeTab === 'audio') {
        // Keep Pixabay for Audio (Pexels doesn't support audio)
        const audio = await searchPixabayAudio(q, audioSearchType);
        setResults(audio);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMediaSelect = async (item: any) => {
      if (item.type === 'video') {
          // Video Caching Logic
          setDownloadingId(item.id);
          try {
              // Prefer SD (small) or Tiny for quota saving
              // Pexels mapping: look for width < 640 for tiny/sd
              const tinyVid = item.video_files.find((v: any) => v.quality === 'tiny');
              const sdVid = item.video_files.find((v: any) => v.quality === 'sd');
              // Fallback to first available if qualities aren't tagged perfectly
              const targetUrl = sdVid?.link || tinyVid?.link || item.video_files[0].link;
              
              const cachedUrl = await getCachedMediaUrl(targetUrl);
              onSelectMedia(cachedUrl, 'video');
          } catch (e) {
              console.error("Failed to cache video", e);
              // Fallback
              onSelectMedia(item.video_files[0].link, 'video');
          } finally {
              setDownloadingId(null);
          }
      } else {
          // Images are lightweight, direct use
          onSelectMedia(item.src.medium, 'image');
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const url = URL.createObjectURL(file);
          
          if (activeTab === 'audio') {
               onSelectAudio(url, file.name, audioSearchType);
          } else if (activeTab === 'media') {
               const type = file.type.startsWith('video/') ? 'video' : 'image';
               onSelectMedia(url, type);
          }
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const getSearchPlaceholder = () => {
      if (activeTab === 'audio') return `Search ${audioSearchType === 'music' ? 'Music' : 'SFX'}...`;
      if (activeTab === 'media') {
          if (stockMediaType === 'image') return 'Search Photos...';
          if (stockMediaType === 'video') return 'Search Videos...';
          return 'Search Media...';
      }
      return 'Search...';
  }

  if (activeTab === 'text') {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]">
        
        {/* Auto Captions Section */}
        <div className="p-4 border-b border-black/50 bg-[#252525]">
           <div className="flex items-center gap-2 mb-2">
                <MagicWandIcon className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-gray-200 text-sm">Auto Captions</h3>
           </div>
           <p className="text-[10px] text-gray-400 mb-3 leading-tight">
               Automatically generate synchronized subtitles from your narration text.
           </p>
           <button 
              onClick={onAutoCaptions}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 border border-white/10"
            >
              <TextIcon className="w-3 h-3" /> Generate Subtitles
            </button>
        </div>

        <div className="p-4 border-b border-black/50">
          <h3 className="font-bold text-gray-200 text-sm">Quick Presets</h3>
        </div>
        <div className="p-4 grid gap-3 overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => onAddText("Add your text")}
              className="h-14 bg-[#252525] hover:bg-[#2a2a2a] border border-gray-700 hover:border-purple-500 rounded flex items-center justify-center text-white font-sans font-bold text-sm transition-all"
            >
              Default Text
            </button>
            <button 
              onClick={() => onAddText("TITLE")}
              className="h-20 bg-[#252525] hover:bg-[#2a2a2a] border border-gray-700 hover:border-purple-500 rounded flex items-center justify-center text-white font-serif font-black text-2xl transition-all"
            >
              TITLE
            </button>
            <button 
              onClick={() => onAddText("Subtitle")}
              className="h-12 bg-[#252525] hover:bg-[#2a2a2a] border border-gray-700 hover:border-purple-500 rounded flex items-center justify-center text-yellow-400 font-mono font-medium text-xs transition-all"
            >
              Subtitle
            </button>
        </div>
      </div>
    );
  }

  if (activeTab === 'ai') {
      return (
        <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]">
            <div className="p-4 border-b border-black/50">
                <h3 className="font-bold text-gray-200 text-sm">AI Magic</h3>
            </div>
            <div className="p-4 flex flex-col gap-3">
                <button 
                    onClick={onOpenAITools}
                    className="p-4 bg-gradient-to-br from-purple-900/50 to-gray-800 border border-purple-500/30 rounded-xl hover:shadow-lg hover:shadow-purple-900/20 transition-all text-left group"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <MagicWandIcon className="text-purple-400" />
                        <span className="font-bold text-white text-sm">Generator Hub</span>
                    </div>
                    <p className="text-[10px] text-gray-400 group-hover:text-gray-300 leading-relaxed">
                        Create scripts, generate images, videos, and realistic speech using Gemini.
                    </p>
                </button>
            </div>
        </div>
      )
  }

  // Helper to check if search should be visible
  const showSearch = (activeTab === 'media' && mediaSource === 'stock') || activeTab === 'audio';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]">
      <div className="p-3 border-b border-black/50 flex flex-col gap-2">
        <h3 className="font-bold text-gray-200 text-sm capitalize">{activeTab} Library</h3>
        
        {/* Media Type Toggles */}
        {activeTab === 'media' && (
             <div className="flex gap-2 mb-1">
                <button 
                    onClick={() => setMediaSource('stock')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded flex items-center justify-center gap-1 transition-colors ${mediaSource === 'stock' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                    <SearchIcon className="w-3 h-3" /> Stock
                </button>
                <button 
                    onClick={() => setMediaSource('upload')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded flex items-center justify-center gap-1 transition-colors ${mediaSource === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                    <ExportIcon className="w-3 h-3" /> Upload
                </button>
            </div>
        )}

        {/* Audio Type Toggles */}
        {activeTab === 'audio' && (
            <div className="flex gap-2 mb-1">
                <button 
                    onClick={() => setAudioSearchType('music')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded flex items-center justify-center gap-1 transition-colors ${audioSearchType === 'music' ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                    <MusicIcon className="w-3 h-3" /> Music
                </button>
                <button 
                    onClick={() => setAudioSearchType('sfx')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded flex items-center justify-center gap-1 transition-colors ${audioSearchType === 'sfx' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                    <VolumeXIcon className="w-3 h-3" /> SFX
                </button>
            </div>
        )}

        {/* Search Bar */}
        {showSearch && (
            <div className="relative mb-2">
                <input
                    type="text"
                    className="w-full bg-[#121212] border border-gray-700 rounded-md py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-purple-500 placeholder-gray-500 transition-colors"
                    placeholder={getSearchPlaceholder()}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            </div>
        )}
        
        {/* Media Type Filter (Sub-tabs for Stock) */}
        {activeTab === 'media' && mediaSource === 'stock' && (
            <div className="flex bg-[#252525] p-1 rounded-md mb-2">
                {(['all', 'image', 'video'] as const).map(type => (
                    <button 
                        key={type}
                        onClick={() => setStockMediaType(type)}
                        className={`flex-1 py-1 text-[10px] font-bold uppercase rounded transition-colors ${stockMediaType === type ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {type === 'image' ? 'Photos' : type === 'video' ? 'Videos' : 'All'}
                    </button>
                ))}
            </div>
        )}
        
        {/* Upload Button for Audio (Keep existing style for Audio tab) */}
        {activeTab === 'audio' && (
            <div>
                 <input 
                    type="file" 
                    accept="audio/*" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload}
                 />
                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 bg-[#252525] hover:bg-[#303030] border border-dashed border-gray-600 hover:border-purple-500 rounded text-xs text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
                 >
                    <ExportIcon className="w-3 h-3" /> Upload Audio File
                 </button>
            </div>
        )}

      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {isLoading ? (
          <div className="flex justify-center py-10"><LoadingSpinner /></div>
        ) : (
          <>
            {activeTab === 'media' && (
              <>
                  {mediaSource === 'stock' ? (
                     <>
                        <div className="text-[10px] text-gray-500 text-right mb-2 flex items-center justify-end gap-1">
                            <span>Powered by Pexels</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {results.map((item, i) => (
                            <div 
                                key={i} 
                                className="aspect-square bg-gray-800 rounded-md overflow-hidden relative group cursor-pointer border border-transparent hover:border-purple-500 transition-all"
                                onClick={() => handleMediaSelect(item)}
                                onMouseEnter={() => item.type === 'video' && setHoveredVideoId(item.id)}
                                onMouseLeave={() => setHoveredVideoId(null)}
                            >
                                {item.type === 'video' ? (
                                <>
                                    {hoveredVideoId === item.id ? (
                                        <video 
                                            src={item.video_files.find((v: any) => v.quality === 'tiny')?.link || item.video_files[0].link}
                                            className="w-full h-full object-cover"
                                            autoPlay 
                                            muted 
                                            loop 
                                            playsInline
                                        />
                                    ) : (
                                        <>
                                            <img src={item.image} className="w-full h-full object-cover" loading="lazy" />
                                            {/* Play Icon Overlay */}
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="bg-black/40 rounded-full p-1.5 backdrop-blur-[1px]">
                                                    <PlayIcon className="w-5 h-5 text-white/90" />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <div className="absolute top-1 right-1 bg-black/60 rounded px-1 text-[7px] font-bold text-white z-20 pointer-events-none">VIDEO</div>
                                    
                                    {/* Download Indicator */}
                                    {downloadingId === item.id && (
                                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-30">
                                            <LoadingSpinner />
                                            <span className="text-[8px] text-white mt-1">Caching...</span>
                                        </div>
                                    )}
                                </>
                                ) : (
                                <img src={item.src.medium} className="w-full h-full object-cover" loading="lazy" />
                                )}
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors pointer-events-none"></div>
                                
                                {/* Credits & License Overlay */}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none flex flex-col justify-end min-h-[40px]">
                                    <p className="text-[9px] text-gray-300 leading-tight">
                                        {item.type === 'video' ? 'Video' : 'Photo'} by <span className="text-white font-medium hover:underline">{item.photographer || item.user?.name}</span> on Pexels
                                    </p>
                                    <p className="text-[8px] text-green-400 mt-1 font-medium bg-green-900/30 inline-block px-1 rounded border border-green-500/20 w-fit">
                                        Free for Commercial Use
                                    </p>
                                </div>
                            </div>
                            ))}
                        </div>
                        {results.length === 0 && !isLoading && (
                                <div className="col-span-2 text-center text-gray-500 py-8 text-xs">
                                    No results found for "{query}".
                                </div>
                        )}
                     </>
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center p-4 border-2 border-dashed border-gray-700 rounded-lg hover:border-blue-500 transition-colors bg-[#252525] group">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-500 group-hover:text-blue-500 transition-colors">
                             <ExportIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-white font-bold mb-2">Upload Media</h3>
                        <p className="text-xs text-gray-400 mb-6">Support Image (JPG, PNG) & Video (MP4)</p>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg transition-colors"
                        >
                            Select File
                        </button>
                        <input 
                            type="file" 
                            accept="image/*,video/*" 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleFileUpload}
                        />
                    </div>
                  )}
              </>
            )}

            {activeTab === 'audio' && (
              <div className="flex flex-col gap-1">
                 <div className="text-[10px] text-gray-500 text-right mb-1">Powered by Pixabay</div>
                {results.map((item, i) => (
                  <div 
                    key={i} 
                    className="bg-[#252525] p-2 rounded flex items-center justify-between group hover:bg-[#2a2a2a] border border-transparent hover:border-gray-600 transition-all"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0 ${audioSearchType === 'music' ? 'bg-teal-700' : 'bg-orange-700'}`}>
                            {audioSearchType === 'music' ? <MusicIcon className="w-3 h-3" /> : <VolumeXIcon className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-200 truncate font-medium max-w-[120px]">{item.name}</p>
                            <p className="text-[9px] text-gray-500">{Math.floor(item.duration/60)}:{(item.duration%60).toString().padStart(2,'0')}</p>
                        </div>
                    </div>
                    <button 
                        className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onSelectAudio(item.url, item.name, audioSearchType)}
                    >
                        Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ResourcePanel;
