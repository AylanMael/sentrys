'use client';

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

/**
 * A custom error class to represent Firestore permission errors with rich context.
 * This helps in debugging security rules by providing detailed information about the
 * denied request during development.
 */
export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    // We create a detailed, developer-friendly message.
    const message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:\n${JSON.stringify(
      {
        context: context,
      },
      null,
      2
    )}`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;

    // The 'digest' property is a Next.js-specific convention. By setting it,
    // we can make our custom error appear in the Next.js error overlay,
    // which is extremely helpful for debugging during development.
    // @ts-ignore
    this.digest = `FIRESTORE_PERMISSION_ERROR: ${context.operation.toUpperCase()} on ${context.path}`;
  }
}
