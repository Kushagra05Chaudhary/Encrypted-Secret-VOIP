import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { cryptoService } from '../services/cryptoService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);
    const [publicKeyJwk, setPublicKeyJwk] = useState(null);
    const [cryptoReady, setCryptoReady] = useState(false);

    useEffect(() => {
        const initAuth = async () => {
            if (token) {
                try {
                    const response = await authAPI.getMe();
                    setUser(response.data);

                    // Initialize crypto keys after successful auth
                    await initializeCrypto(response.data);
                } catch (error) {
                    console.error('Auth init error:', error);
                    logout();
                }
            }
            setLoading(false);
        };

        initAuth();
    }, [token]);

    /**
     * Initialize RSA key pair - check IndexedDB or generate new
     */
    const initializeCrypto = async (userData) => {
        try {
            console.log('Initializing cryptographic keys...');

            // Initialize or retrieve existing key pair
            const pubKeyJwk = await cryptoService.initializeKeyPair();
            setPublicKeyJwk(pubKeyJwk);

            // Check if we need to update the server with our public key
            const storedPublicKey = userData.publicKey;
            const currentPublicKeyStr = JSON.stringify(pubKeyJwk);

            if (!storedPublicKey || storedPublicKey !== currentPublicKeyStr) {
                console.log('Updating public key on server...');
                await authAPI.updatePublicKey(currentPublicKeyStr);
            }

            setCryptoReady(true);
            console.log('Cryptographic keys ready');
        } catch (error) {
            console.error('Error initializing crypto:', error);
            // Don't block auth if crypto fails
            setCryptoReady(false);
        }
    };

    const login = async (email, password) => {
        try {
            const response = await authAPI.login({ email, password });
            const { token: newToken, ...userData } = response.data;

            localStorage.setItem('token', newToken);
            setToken(newToken);
            setUser(userData);

            // Initialize crypto keys after login
            await initializeCrypto(userData);

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || 'Login failed'
            };
        }
    };

    const register = async (username, email, password) => {
        try {
            // Generate RSA key pair before registration
            console.log('Generating RSA key pair for new user...');
            const pubKeyJwk = await cryptoService.initializeKeyPair();
            const publicKeyStr = JSON.stringify(pubKeyJwk);

            console.log('Sending registration request...');
            const response = await authAPI.register({
                username,
                email,
                password,
                publicKey: publicKeyStr
            });
            const { token: newToken, ...userData } = response.data;

            localStorage.setItem('token', newToken);
            setToken(newToken);
            setUser(userData);
            setPublicKeyJwk(pubKeyJwk);
            setCryptoReady(true);

            console.log('Registration successful!');
            return { success: true };
        } catch (error) {
            console.error('Registration error:', error);
            console.error('Error response:', error.response?.data);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            // Provide more helpful error messages
            let errorMessage = 'Registration failed';
            if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
                errorMessage = 'Cannot connect to server. Please ensure the backend server is running on http://localhost:5000';
            } else if (error.code === 'ERR_NAME_NOT_RESOLVED') {
                errorMessage = 'Server address could not be resolved. Check your network connection.';
            } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    };

    const logout = async () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setPublicKeyJwk(null);
        setCryptoReady(false);

        // Optionally clear crypto keys on logout
        // await cryptoService.clearKeys();
    };

    /**
     * Get the user's public key in JWK format
     */
    const getPublicKey = () => {
        return publicKeyJwk;
    };

    /**
     * Get the user's public key as a string for transmission
     */
    const getPublicKeyString = () => {
        return publicKeyJwk ? JSON.stringify(publicKeyJwk) : null;
    };

    const value = {
        user,
        token,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        cryptoReady,
        publicKeyJwk,
        getPublicKey,
        getPublicKeyString
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        // Return default values during HMR/initial render instead of throwing
        // This prevents console errors during development hot reloads
        return {
            user: null,
            token: null,
            isAuthenticated: false,
            loading: true,
            login: async () => { },
            register: async () => { },
            logout: () => { },
            cryptoReady: false,
            getPublicKeyString: () => null
        };
    }
    return context;
};

export default AuthContext;
