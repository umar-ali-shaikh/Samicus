"use client";

import { useState, useTransition } from "react";
import { Button, Callout } from "@/components/ui";
import { exportMyDataAction, deleteMyAccountAction } from "@/server/privacyActions";
import { signOutAction } from "@/server/authActions";

// Ported from frontend/src/screens/Profile.jsx's Privacy section.
export function PrivacySection() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isExporting, startExport] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function exportData() {
    startExport(async () => {
      const data = await exportMyDataAction();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "vidhira-my-data.json" });
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function deleteAccount() {
    setError(undefined);
    startDelete(async () => {
      const result = await deleteMyAccountAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // storage unavailable (private mode) -- nothing to clear
      }
      await signOutAction();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Trust, privacy &amp; ethics</div>
      {error && <Callout tone="danger">{error}</Callout>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="outline" onClick={exportData} disabled={isExporting} style={{ width: "auto" }}>
          Download my data
        </Button>
        {confirming ? (
          <>
            <span style={{ fontSize: 12.5 }}>This cannot be undone.</span>
            <Button variant="danger" onClick={deleteAccount} disabled={isDeleting} style={{ width: "auto" }}>
              {isDeleting ? "Deleting…" : "Yes, delete my account"}
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} style={{ width: "auto" }}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)} style={{ width: "auto" }}>
            Delete account
          </Button>
        )}
      </div>
    </div>
  );
}
