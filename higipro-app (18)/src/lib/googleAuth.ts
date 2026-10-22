/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Configure Google Auth Provider with streamlined People & Contacts Scopes
export const provider = new GoogleAuthProvider();

// Streamlined scope: full read/write for Google Contacts without unnecessary directory/sensitive scopes
export const GOOGLE_CONTACTS_SCOPES = [
  'https://www.googleapis.com/auth/contacts',
];

// Add scope to provider
GOOGLE_CONTACTS_SCOPES.forEach(scope => {
  provider.addScope(scope);
});

// Configure prompt to prevent redundant consent delays and auto-hint user's Google Account
export const DEFAULT_GOOGLE_ACCOUNT = 'higiprocomercial@gmail.com';

provider.setCustomParameters({
  prompt: 'select_account',
  login_hint: DEFAULT_GOOGLE_ACCOUNT,
});

// Flag to indicate if we are in the middle of a sign-in flow
let isSigningIn = false;

// Fast in-session and persistent local token cache keys
const SESSION_TOKEN_KEY = 'higipro_google_token_v2';
const SESSION_EXP_KEY = 'higipro_google_token_exp_v2';
const LOCAL_TOKEN_KEY = 'higipro_google_token_persistent_v2';
const LOCAL_EXP_KEY = 'higipro_google_token_persistent_exp_v2';

// In-memory access token cache with session & local storage restore
let cachedAccessToken: string | null = (() => {
  try {
    const sessionSaved = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const sessionExp = sessionStorage.getItem(SESSION_EXP_KEY);
    if (sessionSaved && (!sessionExp || Date.now() < Number(sessionExp))) {
      return sessionSaved;
    }
    const localSaved = localStorage.getItem(LOCAL_TOKEN_KEY);
    const localExp = localStorage.getItem(LOCAL_EXP_KEY);
    if (localSaved && (!localExp || Date.now() < Number(localExp))) {
      return localSaved;
    }
  } catch (e) {
    // Ignore storage issues
  }
  return null;
})();
let cachedUser: User | null = null;

// Listeners for auth state changes
type AuthCallback = (user: User | null, token: string | null) => void;
const authListeners: Set<AuthCallback> = new Set();

const notifyListeners = (user: User | null, token: string | null) => {
  authListeners.forEach(callback => {
    try {
      callback(user, token);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
};

export const subscribeToAuth = (callback: AuthCallback) => {
  authListeners.add(callback);
  // Immediately notify with current state
  callback(cachedUser || auth.currentUser, cachedAccessToken);
  return () => {
    authListeners.delete(callback);
  };
};

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    cachedUser = user;
    if (user) {
      // Check if we already have a valid session or local token
      if (!cachedAccessToken) {
        try {
          const sessionSaved = sessionStorage.getItem(SESSION_TOKEN_KEY);
          const sessionExp = sessionStorage.getItem(SESSION_EXP_KEY);
          if (sessionSaved && sessionExp && Date.now() < Number(sessionExp)) {
            cachedAccessToken = sessionSaved;
          } else {
            const localSaved = localStorage.getItem(LOCAL_TOKEN_KEY);
            const localExp = localStorage.getItem(LOCAL_EXP_KEY);
            if (localSaved && localExp && Date.now() < Number(localExp)) {
              cachedAccessToken = localSaved;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        notifyListeners(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
        notifyListeners(user, null);
      }
    } else {
      cachedAccessToken = null;
      cachedUser = null;
      try {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_EXP_KEY);
        localStorage.removeItem(LOCAL_TOKEN_KEY);
        localStorage.removeItem(LOCAL_EXP_KEY);
      } catch (e) {}
      if (onAuthFailure) onAuthFailure();
      notifyListeners(null, null);
    }
  });
};

// Google Sign-In with Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  // If already authenticated and token is still fresh, return immediately!
  if (cachedAccessToken && (cachedUser || auth.currentUser)) {
    return { user: (cachedUser || auth.currentUser)!, accessToken: cachedAccessToken };
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Falha ao obter token de acesso do Google.');
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;

    // Cache token in sessionStorage and localStorage so repeated connections on mobile are instant
    const expTime = String(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, credential.accessToken);
      sessionStorage.setItem(SESSION_EXP_KEY, expTime);
      localStorage.setItem(LOCAL_TOKEN_KEY, credential.accessToken);
      localStorage.setItem(LOCAL_EXP_KEY, expTime);
    } catch (e) {
      // Ignore
    }

    notifyListeners(result.user, cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Erro na autenticação com Google:', error);
    if (error?.code === 'auth/popup-blocked') {
      throw new Error('O navegador bloqueou a janela do Google. Por favor, permita popups no seu navegador ou abra o app em uma nova aba.');
    } else if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('A janela de login do Google foi fechada antes de concluir.');
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const sessionSaved = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const sessionExp = sessionStorage.getItem(SESSION_EXP_KEY);
    if (sessionSaved && (!sessionExp || Date.now() < Number(sessionExp))) {
      cachedAccessToken = sessionSaved;
      return cachedAccessToken;
    }
    const localSaved = localStorage.getItem(LOCAL_TOKEN_KEY);
    const localExp = localStorage.getItem(LOCAL_EXP_KEY);
    if (localSaved && (!localExp || Date.now() < Number(localExp))) {
      cachedAccessToken = localSaved;
      return cachedAccessToken;
    }
  } catch (e) {}
  return null;
};

export const getCurrentGoogleUser = (): User | null => {
  return cachedUser || auth.currentUser;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedUser = null;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXP_KEY);
    localStorage.removeItem(LOCAL_TOKEN_KEY);
    localStorage.removeItem(LOCAL_EXP_KEY);
  } catch (e) {}
  notifyListeners(null, null);
};
