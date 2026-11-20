/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  auth,
  googleProvider,
  testFirestoreConnection,
} from '../lib/firebase';

interface FirebaseContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  isAuthenticating: boolean;
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<User>;
  resendVerificationEmail: () => Promise<void>;
  reloadAuthUser: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOutFirebase: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

async function ensureAuthPersistence(): Promise<void> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      try {
        await setPersistence(auth, inMemoryPersistence);
      } catch {
        // Ignore if environment enforces default persistence
      }
    }
  }
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  useEffect(() => {
    void testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (): Promise<User> => {
    setIsAuthenticating(true);
    try {
      await ensureAuthPersistence();
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<User> => {
    setIsAuthenticating(true);
    try {
      await ensureAuthPersistence();
      const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      return result.user;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<User> => {
    setIsAuthenticating(true);
    try {
      await ensureAuthPersistence();
      const result = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      const trimmedName = displayName?.trim();
      if (trimmedName) {
        await updateProfile(result.user, { displayName: trimmedName.slice(0, 100) }).catch(() => {});
      }
      if (!result.user.emailVerified) {
        await sendEmailVerification(result.user).catch(() => {});
      }
      return result.user;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const resendVerificationEmail = async (): Promise<void> => {
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const reloadAuthUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      await auth.currentUser.getIdToken(true);
    }
    setFirebaseUser(auth.currentUser);
    return Boolean(auth.currentUser.emailVerified);
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  };

  const signOutFirebase = async (): Promise<void> => {
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        isAuthenticating,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resendVerificationEmail,
        reloadAuthUser,
        sendPasswordReset,
        signOutFirebase,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
