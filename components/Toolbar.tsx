
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
    className={`flex flex-col items-center gap-1.5 transition-all w-full p-2.5 rounded-md group
      ${disabled ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-white/5'}
      ${className || ''}
    `}
    >
    <div className="group-hover:scale-110 transition-transform">{icon}</div>
    <span className="text-[9px] font-medium tracking-wide uppercase">{label}</span>
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
    <div className="flex flex-col items-center gap-2 w-full">
        {/* Main Tools */}
        <div className="space-y-1 w-full pb-4 border-b border-white/5">
            <ToolButton icon={<MediaIcon />} label="Media" />
            <ToolButton icon={<TextIcon />} label="Text" />
            <ToolButton icon={<MusicIcon />} label="Audio" onClick={onOpenAudioModal} />
            <ToolButton icon={<EffectsIcon />} label="FX" />
        </div>
        
        {/* AI Tools */}
        <div className="space-y-1 w-full py-4 border-b border-white/5">
             <ToolButton 
                icon={<MagicWandIcon className="w-6 h-6 text-purple-500 group-hover:text-purple-400" />} 
                label="AI Tools" 
                onClick={onOpenAITools} 
            />
        </div>
        
        {/* Edit Actions */}
        <div className="space-y-1 w-full py-4">
            <ToolButton icon={<UndoIcon />} label="Undo" onClick={onUndo} disabled={!canUndo} />
            <ToolButton icon={<RedoIcon />} label="Redo" onClick={onRedo} disabled={!canRedo} />
            
            {onDelete && (
                <ToolButton 
                    icon={<TrashIcon className="w-5 h-5" />} 
                    label="Delete" 
                    onClick={onDelete} 
                    disabled={!hasActiveSegment}
                    className="text-red-900/50 hover:text-red-400 hover:bg-red-900/10"
                />
            )}
        </div>

        {/* Spacer */}
        <div className="flex-grow"></div>
        
        {/* Export */}
         <button 
            onClick={onOpenExportModal}
            className="flex flex-col items-center justify-center gap-2 text-white bg-purple-600 hover:bg-purple-500 transition-all w-12 h-12 rounded-full mt-auto shadow-lg shadow-purple-900/40 hover:scale-110"
            title="Export Video"
        >
            <ExportIcon className="w-5 h-5" />
        </button>
        <span className="text-[9px] font-bold text-gray-500 mt-1 uppercase tracking-wider">Export</span>
    </div>
  );
};

export default Toolbar;
