
import React, { useState, useEffect, useRef } from 'react';
import type { Segment, AudioClip } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { DownloadIcon } from './icons';
import { estimateWordTimings } from '../utils/media';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  segments: Segment[];
  audioTracks?: AudioClip[]; 
}

type ExportStatus = 'idle' | 'preparing' | 'sending' | 'rendering' | 'complete' | 'error';
type ExportQuality = '360p' | '720p' | '1080p';

// Use RENDER_URL for heavy video processing
const RENDER_URL = process.env.RENDER_URL || 'http://localhost:3002';

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, title, segments, audioTracks = [] }) => {
    const [status, setStatus] = useState<ExportStatus>('idle');
    const [statusText, setStatusText] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [quality, setQuality] = useState<ExportQuality>('720p');
    
    // Poll interval ref
    const pollIntervalRef = useRef<any>(null);
    // Track consecutive errors to prevent infinite loops on network failure
    const consecutiveErrorsRef = useRef(0);

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

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

            // Ensure word timings exist for subtitles
            if (segment.narration_text && (!segment.wordTimings || segment.wordTimings.length === 0)) {
                // If audio exists, use its duration, else use segment duration
                const duration = segment.duration;
                // Calculate linear timings as fallback
                segment.wordTimings = estimateWordTimings(segment.narration_text, duration);
            }
        }

        // Process Global Audio Tracks
        for (const track of processedAudioTracks) {
            if (track.url.startsWith('blob:') || track.url.startsWith('data:')) {
                track.url = await convertBlobUrlToBase64(track.url);
            }
        }

        let width = 1280;
        let height = 720;

        switch (quality) {
            case '360p': width = 640; height = 360; break;
            case '720p': width = 1280; height = 720; break;
            case '1080p': width = 1920; height = 1080; break;
        }

        return {
            title,
            segments: processedSegments,
            audioTracks: processedAudioTracks,
            resolution: { width, height }
        };
    };

    const handleStartExport = async () => {
        setStatus('preparing');
        setError('');
        setVideoUrl(null);
        consecutiveErrorsRef.current = 0;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        // Remove trailing slash if present
        const sanitizedUrl = RENDER_URL.replace(/\/$/, '');

        try {
            const payload = await preparePayload();

            setStatus('sending');
            setStatusText("Uploading data to render engine...");

            // 1. Send Job Request
            const response = await fetch(`${sanitizedUrl}/render`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}...`);
            }

            const data = await response.json();
            const jobId = data.jobId;

            if (!jobId) throw new Error("Server did not return a Job ID.");

            // 2. Start Polling
            setStatus('rendering');
            setStatusText("Rendering in cloud (0%)...");
            
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${sanitizedUrl}/status/${jobId}`);
                    
                    // Critical: Handle 404 (Job Lost/Server Restarted)
                    if (statusRes.status === 404) {
                        clearInterval(pollIntervalRef.current);
                        throw new Error("Job not found on server. The server may have restarted. Please try again.");
                    }

                    if (!statusRes.ok) {
                        consecutiveErrorsRef.current++;
                        console.warn(`Status check failed (${statusRes.status}). Attempt ${consecutiveErrorsRef.current}/5`);
                        if (consecutiveErrorsRef.current > 5) {
                            clearInterval(pollIntervalRef.current);
                            throw new Error(`Connection lost to server (${statusRes.status}).`);
                        }
                        return; // Retry next tick
                    }
                    
                    // Reset consecutive errors on success
                    consecutiveErrorsRef.current = 0;

                    const statusData = await statusRes.json();
                    
                    if (statusData.status === 'completed') {
                        clearInterval(pollIntervalRef.current);
                        setStatusText("Downloading final video...");
                        
                        // 3. Download File
                        const downloadRes = await fetch(`${sanitizedUrl}/download/${jobId}`);
                        
                        // STRICT CHECK: Ensure we got a video, not a JSON error
                        const contentType = downloadRes.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            const errData = await downloadRes.json();
                            throw new Error(errData.error || "Download endpoint returned JSON instead of Video.");
                        }

                        if (!downloadRes.ok) throw new Error("Download request failed");
                        
                        const blob = await downloadRes.blob();
                        // Enforce MP4 type so browser treats it correctly
                        const videoBlob = new Blob([blob], { type: 'video/mp4' });
                        const url = URL.createObjectURL(videoBlob);
                        
                        setVideoUrl(url);
                        setStatus('complete');
                    } else if (statusData.status === 'error') {
                        clearInterval(pollIntervalRef.current);
                        throw new Error(statusData.error || "Render job failed on server.");
                    } else {
                        setStatusText("Rendering in cloud (Processing)...");
                    }
                } catch (pollErr: any) {
                    console.warn("Poll loop error:", pollErr);
                    
                    // If it's a fetch error (network down, CORS, Mixed Content), count it
                    if (pollErr.name === 'TypeError' || pollErr.message.includes('Failed to fetch')) {
                        consecutiveErrorsRef.current++;
                        if (consecutiveErrorsRef.current > 5) {
                            clearInterval(pollIntervalRef.current);
                            setError("Connection to server lost. Check your network or make sure the Render Server is running.");
                            setStatus('error');
                            return;
                        }
                    } else {
                         // Fatal logic error or explicitly thrown error
                         clearInterval(pollIntervalRef.current);
                         setError(pollErr.message);
                         setStatus('error');
                    }
                }
            }, 3000); // Check every 3 seconds

        } catch (err: any) {
            console.error(err);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setError(err.message || "Failed to connect to render server. Is the backend running?");
            setStatus('error');
        }
    };

    const handleClose = () => {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
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
                    <div className="space-y-4">
                         
                         {/* Quality Selector */}
                         <div className="bg-gray-700/50 p-4 rounded-md border border-gray-600">
                             <label className="text-xs text-gray-400 font-bold block mb-2 uppercase">Video Quality</label>
                             <div className="flex gap-2">
                                {(['360p', '720p', '1080p'] as ExportQuality[]).map(q => (
                                    <button
                                        key={q}
                                        onClick={() => setQuality(q)}
                                        className={`flex-1 py-2 rounded text-sm font-bold border transition-all ${quality === q 
                                            ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/50' 
                                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                                    >
                                        {q === '360p' ? '360p (Draft)' : q === '720p' ? '720p (HD)' : '1080p (FHD)'}
                                    </button>
                                ))}
                             </div>
                         </div>

                         <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-md text-left flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></div>
                            <p className="text-gray-200 text-sm">
                                Rendering will be performed on the <b>Cloud Server</b>.
                            </p>
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
                        <p className="text-xs text-gray-500 mt-2">Do not close this window.</p>
                    </div>
                )}
                
                {status === 'complete' && videoUrl && (
                     <div className="text-center">
                        <p className="text-xl font-semibold text-green-400 mb-4">Render Complete!</p>
                        <video src={videoUrl} controls className="w-full rounded-md mb-4 max-h-64 bg-black shadow-lg"></video>
                        <div className="flex gap-2">
                            <a href={videoUrl} download={`${title.replace(/[^a-z0-9]/gi, '_')}_${quality}.mp4`} className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-md text-white font-semibold flex items-center justify-center gap-2 transition-colors">
                                <DownloadIcon /> Download MP4
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
                            <p className="text-red-300 text-sm mb-4 break-words">{error}</p>
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
