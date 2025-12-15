
import { SavedProject, VideoScript } from "../types";
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'magistory_projects_v1';

export const saveProject = (script: VideoScript): SavedProject => {
    try {
        const projects = getProjects();
        const now = Date.now();
        
        // Use existing ID or create new one
        const id = script.id || uuidv4();
        
        // Create thumbnail from first media item if available
        const firstMedia = script.segments[0]?.media[0]?.url;
        
        const projectToSave: SavedProject = {
            ...script,
            id,
            lastModified: now,
            thumbnail: firstMedia
        };

        const existingIndex = projects.findIndex(p => p.id === id);
        
        if (existingIndex >= 0) {
            projects[existingIndex] = projectToSave;
        } else {
            projects.unshift(projectToSave);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
        return projectToSave;
    } catch (error) {
        console.error("Failed to save project:", error);
        throw new Error("Failed to save project. Storage might be full.");
    }
};

export const getProjects = (): SavedProject[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        return JSON.parse(data).sort((a: SavedProject, b: SavedProject) => b.lastModified - a.lastModified);
    } catch (error) {
        console.error("Failed to load projects:", error);
        return [];
    }
};

export const deleteProject = (id: string): void => {
    const projects = getProjects();
    const filtered = projects.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const getProjectById = (id: string): SavedProject | undefined => {
    const projects = getProjects();
    return projects.find(p => p.id === id);
};
