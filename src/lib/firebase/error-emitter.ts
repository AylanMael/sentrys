import { EventEmitter } from 'events';

/**
 * A global event emitter for centrally handling specific application-wide events.
 * This instance is used to broadcast Firestore permission errors from where they are caught
 * to a central listener component that can display them to the developer.
 *
 * It's implemented using the 'events' module to provide a simple, effective pub/sub mechanism.
 *
 * Usage:
 * 1. Import `errorEmitter` in the file where an error occurs.
 * 2. Call `errorEmitter.emit('permission-error', myCustomError);`
 *
 * 3. A listener component will be subscribed to the 'permission-error' event.
 */
export const errorEmitter = new EventEmitter();
