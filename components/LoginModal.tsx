
import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';
import { MagicWandIcon, PlayIcon } from './icons';

interface LoginModalProps {
    isOpen: boolean;
    onClose?: () => void;
    message?: string;
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, message }) => {
    const { login, loginAsGuest } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // CRITICAL: Ensure we access the specific variable so Vite can replace it.
    // Do NOT access process.env directly.
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    
    // Validasi sederhana: string harus ada dan panjangnya > 10 karakter
    const hasValidClientId = googleClientId && typeof googleClientId === 'string' && googleClientId.length > 10;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 text-center max-w-md w-full relative">
                
                {/* Close Button (Only show if not forced) */}
                {onClose && (
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl"
                    >
                        ✕
                    </button>
                )}

                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/50">
                         <MagicWandIcon className="w-8 h-8 text-white" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">Welcome to Magistory</h2>
                <p className="text-gray-400 mb-8">{message || "Sign in to generate AI videos instantly."}</p>
                
                {errorMsg && (
                    <div className="mb-6 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-xs text-left">
                        <strong>Login Error:</strong> {errorMsg}
                    </div>
                )}

                <div className="flex flex-col gap-4">
                    {/* OPTION 1: OFFLINE MODE (Always Safe) */}
                    <button 
                        onClick={() => {
                            loginAsGuest();
                            if(onClose) onClose();
                        }}
                        className="w-full py-3 bg-white text-gray-900 hover:bg-gray-100 font-bold rounded-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2 shadow-lg"
                    >
                        <PlayIcon className="w-5 h-5 text-gray-900" />
                        Enter Guest Mode (Offline)
                    </button>

                    <div className="flex items-center gap-3 my-2 opacity-50">
                        <div className="h-px bg-gray-600 flex-1"></div>
                        <span className="text-[10px] uppercase tracking-widest text-gray-400">OR</span>
                        <div className="h-px bg-gray-600 flex-1"></div>
                    </div>

                    {/* OPTION 2: GOOGLE LOGIN (Only if Configured) */}
                    <div className="flex justify-center min-h-[40px]">
                        {isProcessing ? (
                            <div className="flex items-center gap-2 text-gray-400">
                                <LoadingSpinner />
                                <span className="text-xs">Connecting...</span>
                            </div>
                        ) : (
                            hasValidClientId ? (
                                <div className="w-full flex justify-center">
                                    <GoogleLogin
                                        onSuccess={async (credentialResponse) => {
                                            if (credentialResponse.credential) {
                                                setIsProcessing(true);
                                                setErrorMsg(null);
                                                try {
                                                    await login(credentialResponse.credential);
                                                } catch (error: any) {
                                                    console.error("Login Error:", error);
                                                    setIsProcessing(false);
                                                    const msg = error.response?.data?.error || error.message || "Connection failed";
                                                    setErrorMsg(msg);
                                                }
                                            }
                                        }}
                                        onError={() => {
                                            setErrorMsg("Google Login Popup Closed or Failed.");
                                        }}
                                        theme="outline"
                                        size="large"
                                        text="signin_with"
                                        width="100%" 
                                    />
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 italic border border-gray-700 p-2 rounded w-full">
                                    Cloud Login Unavailable (API Key Missing)
                                </div>
                            )
                        )}
                    </div>
                    
                    <p className="text-[10px] text-gray-500 mt-2">
                        Guest mode saves data to your browser cache.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginModal;
