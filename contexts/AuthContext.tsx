
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

    // Use API_URL for Auth and Credits
    const apiUrl = process.env.API_URL || 'http://localhost:3001';

    useEffect(() => {
        if (token) {
            refreshUser();
        } else {
            setIsLoading(false);
        }
    }, [token]);

    const refreshUser = async () => {
        // OFFLINE MODE CHECK: If token is a mock token, restore mock user
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
            console.error("Failed to fetch user", error);
            // Don't auto-logout immediately on network error (allow retry), unless it's a 401/403
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                 logout();
            } else if ((error as any).code === "ERR_NETWORK") {
                // If network error during refresh, maybe we keep the user state if it existed, or do nothing
                // For now, let's stop loading.
            } else {
                logout();
            }
        } finally {
            setIsLoading(false);
        }
    };

    const loginAsGuest = () => {
        console.warn("Entering Offline Mode manually.");
        const mockToken = `mock-session-${Date.now()}`;
        const mockUser = {
            id: 'demo-user',
            name: 'Guest (Offline Mode)',
            email: 'guest@magistory.com',
            credits: 100 // Free credits for offline usage
        };
        
        localStorage.setItem('auth_token', mockToken);
        setToken(mockToken);
        setUser(mockUser);
    };

    const login = async (googleToken: string) => {
        try {
            const res = await axios.post(`${apiUrl}/auth/google`, { token: googleToken });
            const { token: sessionToken, user: userData } = res.data;
            
            localStorage.setItem('auth_token', sessionToken);
            setToken(sessionToken);
            setUser(userData);
        } catch (error: any) {
            console.error("Login failed", error);
            
            // REMOVED AUTOMATIC GUEST FALLBACK HERE
            // If the server returns 502 or Network Error, we want the Modal to show "Error" 
            // instead of silently logging the user in as Guest.
            
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
        
        // Offline Mode Handler
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
            if (error.response?.status === 403) {
                alert("Insufficient Credits! Please upgrade your plan.");
            } else if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
                 // If backend drops mid-session, allow action optimistically
                 console.warn("Network error during credit deduction. Allowing action optimistically.");
                 return true;
            } else {
                console.error("Transaction failed", error);
            }
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
