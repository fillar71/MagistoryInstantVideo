
import React from 'react';
import { MediaIcon, TextIcon, MusicIcon, EffectsIcon, ExportIcon, MagicWandIcon, UndoIcon, RedoIcon } from './icons';

interface ToolbarProps {
    onOpenAITools: () => void;
    onOpenAudioModal: () => void;
    onOpenExportModal: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
}

const ToolButton: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }> = ({ icon, label, onClick, disabled }) => (
  <button 
    onClick={onClick || (() => alert(`${label} feature coming soon!`))}
    disabled={disabled}
    className={`flex flex-col items-center gap-2 transition-colors w-full p-2 rounded-md 
      ${disabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-purple-400 hover:bg-gray-700'}
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
    onRedo
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
