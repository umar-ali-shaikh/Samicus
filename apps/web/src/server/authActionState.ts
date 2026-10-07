// Separate from authActions.ts because a "use server" file may only export async functions --
// no plain objects or types are allowed there.
export interface AuthFormState {
  error?: string;
  notice?: string;
}

export const initialAuthFormState: AuthFormState = {};
