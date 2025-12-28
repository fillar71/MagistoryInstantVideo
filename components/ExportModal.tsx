
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
    
    const pollIntervalRef = useRef<any>(null);
    const consecutiveErrorsRef = useRef(0);

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

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
            return blobUrl; 
        }
    };

    const preparePayload = async () => {
        setStatusText("Packaging media assets... (This may take a moment)");
        
        const processedSegments = JSON.parse(JSON.stringify(segments));
        const processedAudioTracks = JSON.parse(JSON.stringify(audioTracks));

        for (const segment of processedSegments) {
            for (const clip of segment.media) {
                if (clip.url.startsWith('blob:') || clip.url.startsWith('data:')) {
                    clip.url = await convertBlobUrlToBase64(clip.url);
                }
            }
            if (segment.audioUrl && (segment.audioUrl.startsWith('blob:') || segment.audioUrl.startsWith('data:'))) {
                segment.audioUrl = await convertBlobUrlToBase64(segment.audioUrl);
            }
            if (segment.narration_text && (!segment.wordTimings || segment.wordTimings.length === 0)) {
                const duration = segment.duration;
                segment.wordTimings = estimateWordTimings(segment.narration_text, duration);
            }
        }

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

        const sanitizedUrl = RENDER_URL.replace(/\/$/, '');

        try {
            const payload = await preparePayload();

            setStatus('sending');
            setStatusText("Uploading to Render Server...");

            const response = await fetch(`${sanitizedUrl}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const data = await response.json();
            const jobId = data.jobId;

            if (!jobId) throw new Error("Server did not return a Job ID.");

            setStatus('rendering');
            setStatusText("Rendering video in cloud...");
            
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${sanitizedUrl}/status/${jobId}`);
                    
                    if (!statusRes.ok) {
                        consecutiveErrorsRef.current++;
                        if (consecutiveErrorsRef.current > 10) throw new Error("Lost connection to server.");
                        return; 
                    }
                    consecutiveErrorsRef.current = 0;

                    const statusData = await statusRes.json();
                    
                    if (statusData.status === 'completed') {
                        clearInterval(pollIntervalRef.current);
                        setStatusText("Downloading final video...");
                        
                        const downloadRes = await fetch(`${sanitizedUrl}/download/${jobId}`);
                        if (!downloadRes.ok) throw new Error("Download failed");
                        
                        const blob = await downloadRes.blob();
                        const url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
                        
                        setVideoUrl(url);
                        setStatus('complete');
                    } else if (statusData.status === 'error') {
                        throw new Error(statusData.error || "Render job failed.");
                    }
                } catch (pollErr: any) {
                     if (pollErr.message.includes('Job not found')) return; // Ignore brief 404s
                     clearInterval(pollIntervalRef.current);
                     setError(pollErr.message);
                     setStatus('error');
                }
            }, 3000); 

        } catch (err: any) {
            console.error(err);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setError(err.message || "Failed to connect to render server.");
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in p-4" onClick={handleClose}>
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col p-6 border border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-purple-300">Export Video</h2>
                    <button onClick={handleClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>

                {status === 'idle' && (
                    <div className="space-y-4">
                         <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                             <label className="text-xs text-gray-400 font-bold block mb-2 uppercase">Video Quality</label>
                             <div className="flex gap-2">
                                {(['360p', '720p', '1080p'] as ExportQuality[]).map(q => (
                                    <button
                                        key={q}
                                        onClick={() => setQuality(q)}
                                        className={`flex-1 py-3 rounded-lg text-sm font-bold border transition-all ${quality === q 
                                            ? 'bg-purple-600 border-purple-500 text-white shadow-lg' 
                                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
                                    >
                                        {q}
                                    </button>
                                ))}
                             </div>
                         </div>
                         <div className="flex items-center gap-3 p-3 bg-blue-900/20 rounded border border-blue-500/20 text-blue-200 text-xs">
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                            Cloud rendering ensures smooth export on mobile devices.
                        </div>
                        <button 
                            onClick={handleStartExport} 
                            className="w-full py-4 rounded-lg text-white font-bold text-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-xl transform transition-transform active:scale-95"
                        >
                            Start Render
                        </button>
                    </div>
                )}

                {(status === 'preparing' || status === 'sending' || status === 'rendering') && (
                    <div className="text-center py-12">
                        <div className="flex justify-center mb-6"><LoadingSpinner /></div>
                        <h3 className="text-xl font-semibold text-white mb-2">Processing Video</h3>
                        <p className="text-sm text-gray-400 animate-pulse px-4">{statusText}</p>
                    </div>
                )}
                
                {status === 'complete' && videoUrl && (
                     <div className="text-center py-4">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <DownloadIcon className="w-8 h-8 text-white" />
                        </div>
                        <p className="text-xl font-bold text-green-400 mb-6">Ready to Download!</p>
                        
                        <a 
                            href={videoUrl} 
                            download={`${title.replace(/[^a-z0-9]/gi, '_')}_${quality}.mp4`} 
                            className="block w-full py-4 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold shadow-lg mb-3 flex items-center justify-center gap-2"
                        >
                            <DownloadIcon className="w-5 h-5" /> Download MP4
                        </a>
                        <button onClick={handleClose} className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300">
                            Close
                        </button>
                     </div>
                )}

                {status === 'error' && (
                    <div className="text-center">
                        <div className="bg-red-900/20 p-4 rounded-lg mb-6 border border-red-500/30">
                            <h3 className="text-red-400 font-bold mb-2">Export Failed</h3>
                            <p className="text-red-200 text-xs">{error}</p>
                        </div>
                        <button onClick={handleStartExport} className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold">
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
