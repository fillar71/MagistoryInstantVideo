
import React from 'react';
import { MediaIcon, TextIcon, MusicIcon, EffectsIcon, ExportIcon, MagicWandIcon, UndoIcon, RedoIcon, TrashIcon } from './icons';

interface ToolbarProps {
    onOpenAITools: () => void;
    onOpenAudioModal: () => void;
    onOpenExportModal: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onDelete?: () => void;
    hasActiveSegment?: boolean;
}

const ToolButton: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; className?: string }> = ({ icon, label, onClick, disabled, className }) => (
  <button 
    onClick={onClick || (() => (window as any).alert(`${label} feature coming soon!`))}
    disabled={disabled}
    className={`flex flex-col items-center justify-center gap-1.5 transition-all p-2 rounded-lg group md:w-full min-w-[50px]
      ${disabled ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-white/5'}
      ${className || ''}
    `}
    title={label}
    >
    <div className="group-hover:scale-110 transition-transform">{icon}</div>
    <span className="text-[9px] font-medium tracking-wide uppercase hidden md:block opacity-70 group-hover:opacity-100">{label}</span>
  </button>
);

const Toolbar: React.FC<ToolbarProps> = ({ 
    onOpenAITools, 
    onOpenAudioModal, 
    onOpenExportModal,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onDelete,
    hasActiveSegment = true
}) => {
  return (
    <div className="flex md:flex-col flex-row items-center justify-around md:justify-start gap-1 md:gap-0 w-full h-full md:pb-4 bg-zinc-900/50">
        
        {/* ASSETS GROUP */}
        <div className="flex md:flex-col flex-row gap-1 w-full md:py-4 md:border-b border-white/5 pr-2 md:pr-0">
            <ToolButton icon={<MediaIcon className="w-5 h-5" />} label="Media" />
            <ToolButton icon={<TextIcon className="w-5 h-5" />} label="Text" />
            <ToolButton icon={<MusicIcon className="w-5 h-5" />} label="Audio" onClick={onOpenAudioModal} />
        </div>
        
        {/* AI GROUP */}
        <div className="flex md:flex-col flex-row gap-1 w-full md:py-4 md:border-b border-white/5 pr-2 md:pr-0">
             <ToolButton 
                icon={<MagicWandIcon className="w-6 h-6 text-purple-500 group-hover:text-purple-400" />} 
                label="AI Magic" 
                onClick={onOpenAITools} 
                className="bg-purple-900/10 hover:bg-purple-900/20"
            />
        </div>
        
        {/* EDIT GROUP */}
        <div className="flex md:flex-col flex-row gap-1 w-full md:py-4">
            <ToolButton icon={<UndoIcon className="w-5 h-5" />} label="Undo" onClick={onUndo} disabled={!canUndo} />
            <ToolButton icon={<RedoIcon className="w-5 h-5" />} label="Redo" onClick={onRedo} disabled={!canRedo} />
            
            {onDelete && (
                <ToolButton 
                    icon={<TrashIcon className="w-5 h-5" />} 
                    label="Delete" 
                    onClick={onDelete} 
                    disabled={!hasActiveSegment}
                    className="text-red-900/60 hover:text-red-400 hover:bg-red-900/10"
                />
            )}
        </div>

        {/* Spacer for Desktop */}
        <div className="hidden md:block md:flex-grow"></div>
        
        {/* EXPORT GROUP */}
         <button 
            onClick={onOpenExportModal}
            className="flex flex-col items-center justify-center gap-1 text-white bg-purple-600 hover:bg-purple-500 transition-all w-10 h-10 md:w-12 md:h-12 rounded-full md:mt-auto shadow-lg shadow-purple-900/40 hover:scale-110 ml-2 md:ml-0 md:mb-2"
            title="Export Video"
        >
            <ExportIcon className="w-5 h-5" />
        </button>
        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider hidden md:block pb-2">Export</span>
    </div>
  );
};

export default Toolbar;
