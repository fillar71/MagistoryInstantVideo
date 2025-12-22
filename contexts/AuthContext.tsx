import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
    id: string;
    name: string;
    email: string;
    credits: number;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (googleToken: string) => Promise<void>;
    loginAsGuest: () => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
    deductCredits: (cost: number, action: string) => Promise<boolean>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
    const [isLoading, setIsLoading] = useState(true);

    // ROBUST API URL DETECTION
    // 1. Try process.env.API_URL (injected by define in vite.config.ts)
    // 2. Try import.meta.env.VITE_API_URL (standard Vite env var)
    // 3. Fallback to localhost
    let apiUrlRaw = process.env.API_URL;
    
    // Check if process.env.API_URL is just empty string or undefined
    if (!apiUrlRaw || apiUrlRaw === "undefined") {
        apiUrlRaw = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';
    }
    
    const apiUrl = apiUrlRaw.replace(/\/$/, '');

    // DIAGNOSTIC & MIXED CONTENT CHECK
    useEffect(() => {
        if (window.location.hostname !== 'localhost') {
            const isHttps = window.location.protocol === 'https:';
            const isApiHttp = apiUrl.startsWith('http:');
            
            if (isHttps && isApiHttp) {
                console.error("🚨 CRITICAL SECURITY ERROR: Mixed Content Blocking.");
                console.error(`Your site is HTTPS (${window.location.origin}) but API is HTTP (${apiUrl}). Browser will BLOCK this connection.`);
                console.error("FIX: Ensure your Railway service is accessed via 'https://' (Railway provides SSL by default). Update API_URL.");
            } else if (apiUrl.includes('localhost')) {
                console.error("🚨 CONFIG ERROR: Production site trying to connect to localhost.");
                console.error("FIX: Set 'API_URL' or 'VITE_API_URL' in Vercel to your Railway URL.");
            } else {
                console.log("✅ API Connection OK:", apiUrl);
            }
        }
    }, [apiUrl]);

    useEffect(() => {
        if (token) {
            refreshUser();
        } else {
            setIsLoading(false);
        }
    }, [token]);

    const refreshUser = async () => {
        if (token && token.startsWith('mock-session-')) {
             if (!user) {
                 setUser({
                    id: 'demo-user',
                    name: 'Guest (Offline Mode)',
                    email: 'guest@magistory.com',
                    credits: 100
                 });
             }
             setIsLoading(false);
             return;
        }

        try {
            const res = await axios.get(`${apiUrl}/user/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUser(res.data);
        } catch (error: any) {
            console.warn("Failed to refresh session:", error.message);
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                 logout();
            }
        } finally {
            setIsLoading(false);
        }
    };

    const loginAsGuest = () => {
        const mockToken = `mock-session-${Date.now()}`;
        const mockUser = {
            id: 'demo-user',
            name: 'Guest (Offline Mode)',
            email: 'guest@magistory.com',
            credits: 100 
        };
        localStorage.setItem('auth_token', mockToken);
        setToken(mockToken);
        setUser(mockUser);
    };

    const login = async (googleToken: string) => {
        console.log(`Sending login request to: ${apiUrl}/auth/google`);
        try {
            const res = await axios.post(`${apiUrl}/auth/google`, { token: googleToken });
            const { token: sessionToken, user: userData } = res.data;
            
            localStorage.setItem('auth_token', sessionToken);
            setToken(sessionToken);
            setUser(userData);
        } catch (error: any) {
            console.error("Login Error Details:", error);
            
            if (error.code === "ERR_NETWORK") {
                let msg = `Network Error: Cannot connect to ${apiUrl}.`;
                if (window.location.protocol === 'https:' && apiUrl.startsWith('http:')) {
                    msg += " (Mixed Content Error: Change API_URL to https://)";
                } else {
                    msg += " Check CORS or if server is running.";
                }
                console.error(msg);
                throw new Error(msg);
            }
            
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
    };

    const deductCredits = async (cost: number, action: string): Promise<boolean> => {
        if (!user || !token) return false;
        
        if (token.startsWith('mock-session-')) {
            if (user.credits >= cost) {
                const newCredits = user.credits - cost;
                setUser({ ...user, credits: newCredits });
                return true;
            } else {
                alert("Insufficient offline credits.");
                return false;
            }
        }

        try {
            const res = await axios.post(`${apiUrl}/credits/deduct`, 
                { cost, action },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (res.data.success) {
                setUser(prev => prev ? { ...prev, credits: res.data.remainingCredits } : null);
                return true;
            }
            return false;
        } catch (error: any) {
            console.error("Transaction failed", error);
            if (error.code === 'ERR_NETWORK') return true;
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, login, loginAsGuest, logout, refreshUser, deductCredits, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};