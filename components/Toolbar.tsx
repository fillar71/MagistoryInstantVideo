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
    className={`flex flex-col items-center gap-2 transition-colors w-full p-2 rounded-md 
      ${disabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-purple-400 hover:bg-gray-700'}
      ${className || ''}
    `}
    >
    {icon}
    <span className="text-xs">{label}</span>
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
    <div className="bg-gray-800 rounded-lg p-2 flex lg:flex-col items-center justify-around lg:justify-start lg:gap-4 w-full lg:w-24 flex-shrink-0">
        <ToolButton icon={<MediaIcon />} label="Media" />
        <ToolButton icon={<TextIcon />} label="Text" />
        <ToolButton icon={<MusicIcon />} label="Audio" onClick={onOpenAudioModal} />
        <ToolButton icon={<EffectsIcon />} label="Effects" />
        <ToolButton icon={<MagicWandIcon />} label="AI Tools" onClick={onOpenAITools} />
        
        <div className="w-full h-px bg-gray-700 my-2 hidden lg:block"></div>
        
        <ToolButton icon={<UndoIcon />} label="Undo" onClick={onUndo} disabled={!canUndo} />
        <ToolButton icon={<RedoIcon />} label="Redo" onClick={onRedo} disabled={!canRedo} />
        
        {onDelete && (
             <ToolButton 
                icon={<TrashIcon className="w-6 h-6" />} 
                label="Delete" 
                onClick={onDelete} 
                disabled={!hasActiveSegment}
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
            />
        )}

        <div className="flex-grow"></div>
         <button 
            onClick={onOpenExportModal}
            className="flex items-center justify-center gap-2 text-white bg-purple-600 hover:bg-purple-700 transition-colors w-full p-3 rounded-md mt-auto"
        >
            <ExportIcon />
            <span className="text-sm font-semibold hidden lg:inline">Export</span>
        </button>
    </div>
  );
};

export default Toolbar;