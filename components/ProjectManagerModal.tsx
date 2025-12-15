
import React, { useState, useEffect } from 'react';
import { getProjects, deleteProject } from '../services/projectService';
import { SavedProject } from '../types';
import { TrashIcon, FolderIcon, PlayIcon } from './icons';

interface ProjectManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoadProject: (project: SavedProject) => void;
}

const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({ isOpen, onClose, onLoadProject }) => {
    const [projects, setProjects] = useState<SavedProject[]>([]);

    useEffect(() => {
        if (isOpen) {
            setProjects(getProjects());
        }
    }, [isOpen]);

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this project?")) {
            deleteProject(id);
            setProjects(getProjects());
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col p-6 border border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <FolderIcon className="w-8 h-8 text-purple-400" />
                        <h2 className="text-2xl font-bold text-white">My Projects</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {projects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
                            <FolderIcon className="w-16 h-16 mb-4" />
                            <p>No saved projects yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {projects.map(project => (
                                <div 
                                    key={project.id} 
                                    onClick={() => onLoadProject(project)}
                                    className="bg-gray-700 rounded-lg overflow-hidden border border-gray-600 hover:border-purple-500 hover:shadow-lg transition-all cursor-pointer group flex flex-col h-48 relative"
                                >
                                    {/* Thumbnail Preview */}
                                    <div className="h-32 bg-gray-900 relative overflow-hidden">
                                        {project.thumbnail ? (
                                            <img src={project.thumbnail} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                                                <PlayIcon className="w-8 h-8" />
                                            </div>
                                        )}
                                        
                                        {/* Overlay Actions */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <span className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-full">Load Project</span>
                                        </div>
                                    </div>

                                    <div className="p-3 flex justify-between items-center flex-1">
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-200 truncate text-sm" title={project.title}>{project.title || "Untitled Project"}</h3>
                                            <p className="text-[10px] text-gray-400 mt-1">
                                                {new Date(project.lastModified).toLocaleDateString()} at {new Date(project.lastModified).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={(e) => handleDelete(project.id, e)}
                                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors"
                                            title="Delete Project"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectManagerModal;
