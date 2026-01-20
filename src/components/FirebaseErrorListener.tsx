'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/lib/firebase/error-emitter';
import { FirestorePermissionError } from '@/lib/firebase/errors';
import { useToast } from '@/hooks/use-toast';

/**
 * A client-side component that listens for globally emitted Firestore permission errors.
 *
 * In a development environment, it throws the error, allowing the Next.js error
 * overlay to catch it and display a rich, contextual error message to the developer.
 *
 * In a production environment, it would show a generic, user-friendly toast notification.
 *
 * This component renders no UI and should be placed in a root layout or provider.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: FirestorePermissionError) => {
      // In a real app, you might distinguish between production and development
      // to avoid showing raw errors to end-users.
      if (process.env.NODE_ENV === 'development') {
        // The error is thrown in a timeout to break out of the current call stack.
        // This ensures it's caught by Next.js's global error handler and displayed
        // in the development error overlay.
        setTimeout(() => {
          throw error;
        });
      } else {
        // In a production environment, you'd show a more generic message.
        console.error("Caught a Firestore permission error:", error);
        toast({
          variant: 'destructive',
          title: "Erreur de permission",
          description: "Vous n'avez pas les droits pour effectuer cette action.",
        });
      }
    };

    // Subscribe to the 'permission-error' event.
    errorEmitter.on('permission-error', handlePermissionError);

    // Unsubscribe on component unmount to prevent memory leaks.
    return () => {
      errorEmitter.off('permission-error', handlePermissionError);
    };
  }, [toast]);

  return null;
}
