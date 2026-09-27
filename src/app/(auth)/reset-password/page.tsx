"use client";

import * as React from "react";
import { ResetForm } from "@/components/auth/reset-form";

export default function ResetPasswordPage() {
  return (
    <React.Suspense>
      <ResetForm endpoint="auth/reset-password" title="Choose a new password" description="Pick a strong password you don't use anywhere else." />
    </React.Suspense>
  );
}
