import React, { useState } from 'react';
import type { Segment, AudioClip } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { DownloadIcon } from './icons';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  segments: Segment[];
  audioTracks?: AudioClip[]; 
}

type ExportStatus = 'idle' | 'preparing' | 'sending' | 'rendering' | 'complete' | 'error';

// Default from env, but can be overridden by user in UI
const DEFAULT_BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, title, segments, audioTracks = [] }) => {
    const [status, setStatus] = useState<ExportStatus>('idle');
    const [statusText, setStatusText] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    
    // Allow user to edit the URL if connection fails
    const [currentBackendUrl, setCurrentBackendUrl] = useState(DEFAULT_BACKEND_URL);

    // Helper to convert blob URLs to Base64 strings so the backend can read them
    const convertBlobUrlToBase64 = async (blobUrl: string): Promise<string> => {
        try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to convert blob to base64", e);
            return blobUrl; // Fallback (might fail on backend if it's strictly local)
        }
    };

    const preparePayload = async () => {
        setStatusText("Preparing assets for server...");
        
        // Deep copy segments to modify URLs without affecting app state
        const processedSegments = JSON.parse(JSON.stringify(segments));
        const processedAudioTracks = JSON.parse(JSON.stringify(audioTracks));

        // Process Segments
        for (const segment of processedSegments) {
            // Process Media Clips
            for (const clip of segment.media) {
                if (clip.url.startsWith('blob:') || clip.url.startsWith('data:')) {
                    clip.url = await convertBlobUrlToBase64(clip.url);
                }
            }
            // Process Narration Audio
            if (segment.audioUrl && (segment.audioUrl.startsWith('blob:') || segment.audioUrl.startsWith('data:'))) {
                segment.audioUrl = await convertBlobUrlToBase64(segment.audioUrl);
            }
        }

        // Process Global Audio Tracks
        for (const track of processedAudioTracks) {
            if (track.url.startsWith('blob:') || track.url.startsWith('data:')) {
                track.url = await convertBlobUrlToBase64(track.url);
            }
        }

        return {
            title,
            segments: processedSegments,
            audioTracks: processedAudioTracks,
            resolution: { width: 1280, height: 720 }
        };
    };

    const handleStartExport = async () => {
        setStatus('preparing');
        setError('');
        setVideoUrl(null);

        // Remove trailing slash if present
        const sanitizedUrl = currentBackendUrl.replace(/\/$/, '');

        try {
            const payload = await preparePayload();

            setStatus('sending');
            setStatusText("Uploading data to render engine...");

            const response = await fetch(`${sanitizedUrl}/render`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            // Check content type to distinguish JSON error from HTML 404/500 page
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Render server failed');
                }
            } else {
                 // If not JSON (likely HTML error page from Vercel/Railway/Express default)
                 const text = await response.text();
                 if (!response.ok) {
                     throw new Error(`Server Error (${response.status}): ${response.statusText}. Check URL.`);
                 }
                 // If 200 OK but not JSON, that's weird
                 throw new Error("Received invalid response format from server.");
            }

            setStatus('rendering');
            setStatusText("Server is rendering your video. Please wait...");

            // The backend returns the video file directly as a blob
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            setVideoUrl(url);
            setStatus('complete');

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to connect to render server. Is the backend running?");
            setStatus('error');
        }
    };

    const handleClose = () => {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={handleClose}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg flex flex-col p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-purple-300">Export Video</h2>
                    <button onClick={handleClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
                </div>

                {status === 'idle' && (
                    <div className="text-center space-y-4">
                         <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-md text-left">
                            <p className="text-gray-200 mb-2">
                                Rendering will be performed on the <b>Cloud Server</b>.
                            </p>
                            <label className="text-xs text-gray-400 font-bold block mb-1">Render Server URL</label>
                            <input 
                                type="text" 
                                value={currentBackendUrl}
                                onChange={(e) => setCurrentBackendUrl(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-300 focus:border-purple-500 outline-none"
                                placeholder="https://your-project.up.railway.app"
                            />
                        </div>
                        <button 
                            onClick={handleStartExport} 
                            className="w-full py-3 rounded-md text-white font-semibold transition-colors bg-purple-600 hover:bg-purple-700 shadow-lg"
                        >
                            Start Cloud Render
                        </button>
                    </div>
                )}

                {(status === 'preparing' || status === 'sending' || status === 'rendering') && (
                    <div className="text-center py-8">
                        <div className="flex justify-center mb-6"><LoadingSpinner /></div>
                        <h3 className="text-lg font-semibold text-white mb-2">Processing</h3>
                        <p className="text-sm text-gray-400 animate-pulse">{statusText}</p>
                    </div>
                )}
                
                {status === 'complete' && videoUrl && (
                     <div className="text-center">
                        <p className="text-xl font-semibold text-green-400 mb-4">Render Complete!</p>
                        <video src={videoUrl} controls className="w-full rounded-md mb-4 max-h-64 bg-black shadow-lg"></video>
                        <div className="flex gap-2">
                            <a href={videoUrl} download={`${title.replace(/ /g, '_')}.mp4`} className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold flex items-center justify-center gap-2 transition-colors">
                                <DownloadIcon /> Download
                            </a>
                            <button onClick={handleClose} className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-200">
                                Close
                            </button>
                        </div>
                     </div>
                )}

                {status === 'error' && (
                    <div className="text-center">
                        <div className="bg-red-900/20 p-4 rounded-md mb-6 border border-red-900/50">
                            <h3 className="text-red-400 font-bold mb-1">Export Failed</h3>
                            <p className="text-red-300 text-sm mb-4">{error}</p>
                            
                            <div className="text-left">
                                <label className="text-xs text-red-300 font-bold block mb-1">Verify Server URL:</label>
                                <input 
                                    type="text" 
                                    value={currentBackendUrl}
                                    onChange={(e) => setCurrentBackendUrl(e.target.value)}
                                    className="w-full bg-gray-900 border border-red-500/50 rounded p-2 text-sm text-gray-300 focus:border-red-500 outline-none"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Check Railway Dashboard for the correct "Public Domain" (e.g., https://xxx.up.railway.app)
                                </p>
                            </div>
                        </div>
                        <button onClick={handleStartExport} className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-md text-white font-semibold">
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;