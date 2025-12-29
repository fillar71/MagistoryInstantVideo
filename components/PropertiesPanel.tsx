
import React from 'react';
import type { Segment, TextOverlayStyle, TransitionEffect, AudioClip } from '../types';
import { VolumeXIcon, TextIcon, TransitionIcon, TrashIcon, MusicIcon, MagicWandIcon } from './icons';

interface PropertiesPanelProps {
  segment: Segment | null;
  audioTrack?: AudioClip | null;
  onUpdateVolume: (id: string, vol: number) => void;
  onUpdateText: (id: string, text: string) => void;
  onUpdateStyle: (id: string, style: Partial<TextOverlayStyle>) => void;
  onUpdateTransition: (id: string, transition: TransitionEffect) => void;
  onDelete: () => void;
  onOpenAITools: () => void;
  onUpdateAudioTrack?: (id: string, updates: Partial<AudioClip>) => void;
  onDeleteAudioTrack?: (id: string) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  segment, audioTrack, onUpdateVolume, onUpdateText, onUpdateStyle, onUpdateTransition, onDelete, onOpenAITools, onUpdateAudioTrack, onDeleteAudioTrack
}) => {
  
  // Render Audio Track Properties if selected
  if (audioTrack && onUpdateAudioTrack && onDeleteAudioTrack) {
    return (
        <div className="h-auto bg-[#1e1e1e] flex flex-row items-center px-4 py-3 gap-6 overflow-x-auto custom-scrollbar no-scrollbar-mobile min-h-[80px]">
            {/* Info */}
            <div className="flex flex-col gap-1 border-r border-white/10 pr-4 min-w-[140px] flex-shrink-0">
                 <label className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-2">
                    <MusicIcon className="w-3 h-3" /> Selected Track
                 </label>
                 <div className="text-sm font-medium text-white truncate w-32" title={audioTrack.name}>
                     {audioTrack.name}
                 </div>
            </div>
            
            {/* Timing */}
            <div className="flex flex-col gap-2 border-r border-white/10 pr-4 min-w-[200px] flex-shrink-0">
                <div className="flex gap-2">
                     <div className="flex-1">
                         <span className="text-[9px] text-gray-500 block mb-1">START</span>
                         <input 
                            type="number" step="0.1" min="0"
                            value={audioTrack.startTime}
                            onChange={(e) => onUpdateAudioTrack(audioTrack.id, { startTime: Math.max(0, parseFloat(e.target.value)) })}
                            className="w-full bg-[#121212] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-purple-500 outline-none"
                         />
                     </div>
                     <div className="flex-1">
                         <span className="text-[9px] text-gray-500 block mb-1">DUR</span>
                         <input 
                            type="number" step="0.1" min="0.1"
                            value={audioTrack.duration}
                            onChange={(e) => onUpdateAudioTrack(audioTrack.id, { duration: Math.max(0.1, parseFloat(e.target.value)) })}
                            className="w-full bg-[#121212] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-purple-500 outline-none"
                         />
                     </div>
                </div>
            </div>

            {/* Volume */}
            <div className="flex flex-col gap-1 border-r border-white/10 pr-4 min-w-[140px] flex-shrink-0">
                 <div className="flex justify-between">
                     <span className="text-[10px] font-bold text-gray-500">VOLUME</span>
                     <span className="text-xs text-purple-400 font-bold">{Math.round(audioTrack.volume * 100)}%</span>
                 </div>
                 <input 
                    type="range" min="0" max="1" step="0.05"
                    value={audioTrack.volume}
                    onChange={(e) => onUpdateAudioTrack(audioTrack.id, { volume: parseFloat(e.target.value) })}
                    className="w-full h-3 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
            </div>

            {/* Actions */}
             <div className="ml-auto pl-2 flex-shrink-0">
                <button 
                        onClick={() => onDeleteAudioTrack(audioTrack.id)}
                        className="flex flex-col items-center justify-center w-12 h-12 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                        title="Delete Audio Track"
                    >
                    <TrashIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
  }

  // Render Segment Properties
  if (segment) {
    return (
        <div className="h-auto bg-[#1e1e1e] flex flex-row items-center px-4 py-3 gap-6 overflow-x-auto custom-scrollbar no-scrollbar-mobile min-h-[90px]">
           {/* Text Section */}
           <div className="flex items-start gap-4 border-r border-white/10 pr-6 min-w-[280px] md:min-w-[350px] flex-shrink-0">
              <div className="flex flex-col gap-2 w-full">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                        <TextIcon className="w-3 h-3" /> Script
                    </label>
                    <button 
                        onClick={onOpenAITools}
                        className="text-[9px] bg-purple-900/40 hover:bg-purple-600 text-purple-300 hover:text-white px-2 py-1 rounded flex items-center gap-1 transition-colors border border-purple-500/30"
                    >
                        <MagicWandIcon className="w-3 h-3" /> AI Voice/Image
                    </button>
                  </div>
                  <textarea 
                      value={segment.narration_text || ''}
                      onChange={(e) => onUpdateText(segment.id, e.target.value)}
                      className="bg-[#121212] border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:border-purple-500 outline-none w-full h-12 resize-none leading-relaxed"
                      placeholder="Enter narration text..."
                  />
              </div>
           </div>
    
           {/* Caption Style */}
           <div className="flex flex-col gap-2 border-r border-white/10 pr-4 min-w-[200px] flex-shrink-0">
                 <label className="text-[10px] text-gray-400 font-bold uppercase">Text Overlay</label>
                 <div className="flex gap-2">
                    {/* Font Size */}
                    <div className="flex items-center bg-[#121212] rounded border border-gray-700 h-8 px-2 flex-1">
                        <span className="text-[9px] text-gray-500 font-bold mr-1">SIZE</span>
                        <input 
                            type="number" 
                            value={segment.textOverlayStyle?.fontSize || 30}
                            onChange={(e) => onUpdateStyle(segment.id, { fontSize: parseInt(e.target.value) })}
                            className="w-full bg-transparent text-xs font-mono outline-none text-white text-right"
                        />
                    </div>
                    {/* Color */}
                    <div className="h-8 w-8 bg-[#121212] rounded border border-gray-700 p-1 relative overflow-hidden">
                        <input 
                            type="color" 
                            value={segment.textOverlayStyle?.color || '#ffffff'}
                            onChange={(e) => onUpdateStyle(segment.id, { color: e.target.value })}
                            className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer opacity-0"
                        />
                        <div className="w-full h-full rounded-sm shadow-sm" style={{ backgroundColor: segment.textOverlayStyle?.color || '#ffffff' }}></div>
                    </div>
                 </div>
                 
                 {/* Position Controls */}
                 <div className="flex gap-2">
                     <div className="flex items-center bg-[#121212] rounded border border-gray-700 h-6 px-1 flex-1">
                        <span className="text-[8px] text-gray-500 font-bold mr-1">X%</span>
                        <input 
                            type="number" min="0" max="100"
                            value={Math.round(segment.textOverlayStyle?.x ?? 50)}
                            onChange={(e) => onUpdateStyle(segment.id, { x: parseInt(e.target.value), position: 'custom' })}
                            className="w-full bg-transparent text-[10px] font-mono outline-none text-white text-right"
                        />
                     </div>
                     <div className="flex items-center bg-[#121212] rounded border border-gray-700 h-6 px-1 flex-1">
                        <span className="text-[8px] text-gray-500 font-bold mr-1">Y%</span>
                        <input 
                            type="number" min="0" max="100"
                            value={Math.round(segment.textOverlayStyle?.y ?? (segment.textOverlayStyle?.position === 'bottom' ? 85 : 50))}
                            onChange={(e) => onUpdateStyle(segment.id, { y: parseInt(e.target.value), position: 'custom' })}
                            className="w-full bg-transparent text-[10px] font-mono outline-none text-white text-right"
                        />
                     </div>
                 </div>
           </div>

           {/* Audio Section */}
           <div className="flex flex-col gap-2 border-r border-white/10 pr-4 min-w-[120px] flex-shrink-0">
               <label className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                    <MusicIcon className="w-3 h-3" /> Clip Vol
               </label>
               <div className="bg-[#121212] p-2 rounded-lg border border-gray-700 flex flex-col gap-1">
                   <div className="flex justify-between items-center">
                        <span className="text-[10px] text-purple-400 font-mono font-bold">{Math.round((segment.audioVolume ?? 1) * 100)}%</span>
                   </div>
                   <input 
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={segment.audioVolume ?? 1}
                        onChange={(e) => onUpdateVolume(segment.id, parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
               </div>
           </div>
    
           {/* Transition Section */}
           <div className="flex flex-col gap-2 border-r border-white/10 pr-4 min-w-[120px] flex-shrink-0">
               <label className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                   <TransitionIcon className="w-3 h-3" /> Anim
               </label>
               <div className="flex flex-col gap-1 bg-[#121212] p-1 rounded-lg border border-gray-700">
                   {['fade', 'slide', 'zoom'].map(t => (
                       <button 
                            key={t}
                            onClick={() => onUpdateTransition(segment.id, t as any)}
                            className={`w-full py-1 text-[9px] uppercase rounded transition-all font-medium flex items-center justify-between px-2 ${segment.transition === t ? 'bg-purple-600 text-white' : 'text-gray-400'}`}
                       >
                           <span>{t}</span>
                       </button>
                   ))}
               </div>
           </div>
    
           {/* Actions */}
           <div className="ml-auto pl-2 flex-shrink-0">
               <button 
                    onClick={onDelete}
                    className="flex flex-col items-center justify-center w-12 h-12 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                    title="Delete Segment"
                >
                   <TrashIcon className="w-5 h-5" />
               </button>
           </div>
        </div>
      );
  }

  // Fallback
  return (
    <div className="h-16 flex items-center justify-center text-gray-600 text-xs font-medium">
        Select a clip to edit properties
    </div>
  );
};

export default PropertiesPanel;
