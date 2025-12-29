
export type TransitionEffect = 'fade' | 'slide' | 'zoom';
export type TextAnimation = 'none' | 'scale' | 'slide-up' | 'highlight';
export type AIToolTab = 'generate-image' | 'edit-image' | 'generate-video' | 'tts' | 'generate-sfx';

export interface TextOverlayStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  // Position can still use presets, or manual x/y (percentages 0-100)
  position: 'top' | 'center' | 'bottom' | 'custom';
  x?: number; // 0 to 100 percentage
  y?: number; // 0 to 100 percentage
  backgroundColor: string;
  animation?: TextAnimation;
  maxCaptionLines?: number;
}

export interface WordTiming {
    word: string;
    start: number; // seconds relative to segment start
    end: number;   // seconds relative to segment start
}

export interface MediaTransform {
    scale: number;
    x: number;
    y: number;
}

export interface MediaClip {
    id: string;
    url: string;
    type: 'image' | 'video';
    transform?: MediaTransform; // New: Pan and Zoom data
}

export interface Segment {
  id: string;
  narration_text: string;
  search_keywords_for_media: string;
  media: MediaClip[]; 
  audioUrl?: string;
  audioVolume?: number; // 0.0 to 1.0
  transition?: TransitionEffect;
  textOverlayStyle?: TextOverlayStyle;
  duration: number; // Duration in seconds
  wordTimings?: WordTiming[];
  sfx_keywords?: string;
}

export interface AudioClip {
    id: string;
    url: string;
    name: string;
    type: 'music' | 'sfx';
    startTime: number; // Global start time in seconds
    duration: number;
    volume: number;
}

export interface VideoScript {
  id?: string; 
  title: string;
  aspectRatio?: 'landscape' | 'portrait'; // New: Project aspect ratio
  backgroundMusicKeywords?: string;
  segments: Segment[];
  audioTracks?: AudioClip[]; 
}

export interface SavedProject extends VideoScript {
    id: string;
    lastModified: number;
    thumbnail?: string;
}
