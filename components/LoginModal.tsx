
import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';

interface LoginModalProps {
    isOpen: boolean;
    onClose?: () => void; // Optional if forced
    message?: string;
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, message }) => {
    const { login } = useAuth();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 text-center max-w-md w-full">
                <h2 className="text-2xl font-bold text-white mb-2">Welcome to Magistory</h2>
                <p className="text-gray-400 mb-6">{message || "Please sign in to continue creating magic."}</p>
                
                <div className="flex justify-center mb-6">
                    <GoogleLogin
                        onSuccess={async (credentialResponse) => {
                            if (credentialResponse.credential) {
                                await login(credentialResponse.credential);
                                if (onClose) onClose();
                            }
                        }}
                        onError={() => {
                            console.log('Login Failed');
                        }}
                        theme="filled_black"
                        size="large"
                        shape="pill"
                    />
                </div>
                
                <p className="text-xs text-gray-500">
                    By signing in, you receive <b>10 FREE Credits</b> to start generating videos!
                </p>
            </div>
        </div>
    );
};

export default LoginModal;
