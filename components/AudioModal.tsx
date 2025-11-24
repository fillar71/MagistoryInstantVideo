
import React, { useRef } from 'react';
import type { Segment } from '../types';
import { MusicIcon } from './icons';

interface AudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: Segment;
  onUpdateAudio: (newUrl: string | undefined) => void;
}

const stockMusic = [
    { name: 'Uplifting Corporate', url: 'https://storage.googleapis.com/magistory-public/music/uplifting-corporate.mp3' },
    { name: 'Cinematic Chill', url: 'https://storage.googleapis.com/magistory-public/music/cinematic-chill.mp3' },
    { name: 'Acoustic Folk', url: 'https://storage.googleapis.com/magistory-public/music/acoustic-folk.mp3' },
    { name: 'Ambient Background', url: 'https://storage.googleapis.com/magistory-public/music/ambient-background.mp3' },
];


const AudioModal: React.FC<AudioModalProps> = ({ isOpen, onClose, segment, onUpdateAudio }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = (event.target as any).files?.[0];
    if (file) {
      const audioUrl = URL.createObjectURL(file);
      onUpdateAudio(audioUrl);
      onClose();
    }
  };

  const handleUploadClick = () => {
    (fileInputRef.current as any)?.click();
  };

  const handleSelectStock = (url: string) => {
    onUpdateAudio(url);
    onClose();
  }

  const handleRemoveAudio = () => {
    onUpdateAudio(undefined);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl h-auto flex flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-purple-300">Audio Library</h2>
           <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
        </div>
        
        <div className="flex-grow overflow-y-auto space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-200 mb-2">Current Audio</h3>
                <div className="bg-gray-700 p-3 rounded-md flex items-center justify-between">
                    {segment.audioUrl ? (
                        <>
                            <span className="text-gray-300 truncate">{segment.audioUrl.startsWith('blob:') ? 'Custom Upload' : segment.audioUrl.split('/').pop()?.replace('.mp3', '')}</span>
                            <button onClick={handleRemoveAudio} className="text-sm text-red-400 hover:text-red-300">Remove</button>
                        </>
                    ) : (
                        <span className="text-gray-400">No audio attached</span>
                    )}
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-200 mb-2">Upload Audio</h3>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="audio/*"
                    className="hidden"
                />
                <button onClick={handleUploadClick} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold">
                    Upload from computer
                </button>
            </div>
            
            <div>
                <h3 className="text-lg font-semibold text-gray-200 mb-2">Stock Music</h3>
                <div className="space-y-2">
                    {stockMusic.map(track => (
                        <div key={track.name} className="bg-gray-700 p-3 rounded-md flex items-center justify-between hover:bg-gray-600 transition-colors">
                            <div className="flex items-center gap-3">
                                <MusicIcon />
                                <span className="text-gray-200">{track.name}</span>
                            </div>
                            <button onClick={() => handleSelectStock(track.url)} className="px-3 py-1 text-sm bg-gray-500 hover:bg-purple-500 rounded-md text-white">
                                Select
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AudioModal;