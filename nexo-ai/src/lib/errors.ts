/** Turns Firebase/Firestore errors into messages that say what to fix. */
export function firebaseMessage(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? "");
  if (code.includes("permission-denied"))
    return "Firestore blocked access (permission-denied). In Firebase console > Firestore Database, create the database if needed, then open Rules, paste the contents of firestore.rules and tap Publish.";
  if (code.includes("not-found") || code.includes("failed-precondition"))
    return "Firestore database not found. In Firebase console > Build > Firestore Database, tap Create database.";
  if (code.includes("unavailable"))
    return "Cannot reach Firestore. Check your connection and that the Firestore database exists.";
  if (code.includes("unauthenticated"))
    return "Your sign-in expired. Sign out and sign in again.";
  return `Could not save to Firestore${code ? ` (${code})` : ""}.`;
}
