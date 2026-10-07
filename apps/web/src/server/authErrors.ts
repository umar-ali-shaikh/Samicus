// Ported verbatim from frontend/src/auth/LoginScreen.jsx's friendly(err) -- same copy.
export function friendlyAuthError(message: string | undefined): string {
  const m = message || "Something went wrong.";
  if (/invalid login credentials/i.test(m)) return "That email and password don't match. If you signed up with Google, use “Continue with Google”.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a minute and try again.";
  if (/password should be at least/i.test(m)) return "Use a password of at least 8 characters.";
  return m;
}
