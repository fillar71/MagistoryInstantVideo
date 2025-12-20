
export type TransitionEffect = 'fade' | 'slide' | 'zoom';
export type TextAnimation = 'none' | 'scale' | 'slide-up' | 'highlight';
export type AIToolTab = 'generate-image' | 'edit-image' | 'generate-video' | 'tts' | 'generate-sfx';

export interface TextOverlayStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  position: 'top' | 'center' | 'bottom';
  backgroundColor: string;
  animation?: TextAnimation;
  maxCaptionLines?: number;
}

export interface WordTiming {
    word: string;
    start: number; // seconds relative to segment start
    end: number;   // seconds relative to segment start
}

export interface MediaClip {
    id: string;
    url: string;
    type: 'image' | 'video';
}

export interface Segment {
  id: string;
  narration_text: string;
  search_keywords_for_media: string;
  media: MediaClip[]; // Changed from single url/type to array
  audioUrl?: string;
  audioVolume?: number; // 0.0 to 1.0
  transition?: TransitionEffect;
  textOverlayStyle?: TextOverlayStyle;
  duration: number; // Duration in seconds
  wordTimings?: WordTiming[];
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
  id?: string; // Optional ID for saving
  title: string;
  backgroundMusicKeywords?: string;
  segments: Segment[];
  audioTracks?: AudioClip[]; // New global audio tracks
}

export interface SavedProject extends VideoScript {
    id: string;
    lastModified: number;
    thumbnail?: string;
}
