import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Create your account — Vidhira",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return <SignupForm />;
}
