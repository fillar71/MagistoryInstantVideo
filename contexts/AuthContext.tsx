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

// Helper to pause execution
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
    const [isLoading, setIsLoading] = useState(true);

    // --- 1. ROBUST API URL RESOLUTION ---
    let apiUrlRaw = process.env.API_URL;
    
    // Fallback logic
    if (!apiUrlRaw || apiUrlRaw === "undefined" || apiUrlRaw === "") {
        // Try Vite standard env
        apiUrlRaw = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
    }
    
    let apiUrl = apiUrlRaw.replace(/\/$/, '');

    // --- 2. AUTO-UPGRADE TO HTTPS (Mixed Content Fix) ---
    // If we are on HTTPS (Vercel) but API is HTTP (Railway default URL often used without https://),
    // browser will block it. We force upgrade to HTTPS which Railway supports.
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && apiUrl.startsWith('http://')) {
        console.warn("🔒 Auto-fixing Mixed Content: Upgrading API URL to HTTPS.");
        apiUrl = apiUrl.replace('http://', 'https://');
    }

    // Diagnostic Log
    useEffect(() => {
        if (window.location.hostname !== 'localhost') {
            if (apiUrl.includes('localhost')) {
                console.error("🚨 CONFIG ERROR: Production app is trying to connect to localhost.");
                console.error("👉 Please set 'API_URL' in Vercel Environment Variables to your Backend URL.");
            } else {
                console.log("✅ API Configured:", apiUrl);
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
        console.log(`Attempting login to: ${apiUrl}/auth/google`);
        
        // --- 3. RETRY LOGIC (Handle Sleeping Server) ---
        // Try up to 3 times if we get a network error
        const maxRetries = 3;
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const res = await axios.post(`${apiUrl}/auth/google`, { token: googleToken });
                const { token: sessionToken, user: userData } = res.data;
                
                localStorage.setItem('auth_token', sessionToken);
                setToken(sessionToken);
                setUser(userData);
                return; // Success!

            } catch (error: any) {
                lastError = error;
                const isNetworkError = error.code === "ERR_NETWORK" || !error.response;
                
                if (isNetworkError && attempt < maxRetries) {
                    console.log(`Login attempt ${attempt} failed (Network). Retrying in 1.5s...`);
                    await delay(1500); // Wait for server to wake up
                    continue;
                }
                
                // If it's a 4xx error (e.g. invalid token), don't retry, fail immediately
                if (error.response && error.response.status >= 400 && error.response.status < 500) {
                    throw error;
                }
                
                if (attempt === maxRetries) break;
            }
        }

        // Final Error Handling
        console.error("All login attempts failed:", lastError);
        
        if (lastError.code === "ERR_NETWORK") {
            let msg = `Network Error: Cannot connect to ${apiUrl}.`;
            if (window.location.protocol === 'https:' && apiUrl.startsWith('http:')) {
                msg += " (Mixed Content Error: Ensure API_URL uses https://)";
            } else {
                msg += " The server might be down or waking up.";
            }
            throw new Error(msg);
        }
        
        throw lastError;
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
            // Optimistic UI: If network fails during deduct, allow user to proceed
            // so we don't block content creation due to minor API hiccups.
            console.error("Credit deduction failed (Network)", error);
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