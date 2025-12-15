
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
        try {
            const res = await axios.get(`${apiUrl}/user/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUser(res.data);
        } catch (error) {
            console.error("Failed to fetch user", error);
            logout();
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (googleToken: string) => {
        try {
            const res = await axios.post(`${apiUrl}/auth/google`, { token: googleToken });
            const { token: sessionToken, user: userData } = res.data;
            
            localStorage.setItem('auth_token', sessionToken);
            setToken(sessionToken);
            setUser(userData);
        } catch (error) {
            console.error("Login failed", error);
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
            } else {
                console.error("Transaction failed", error);
            }
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUser, deductCredits, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
