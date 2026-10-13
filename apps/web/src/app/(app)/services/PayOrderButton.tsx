"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout } from "@/components/ui";
import { payFor } from "@/lib/payments";

// Ported from frontend/src/screens/Services.jsx's MyOrders "Pay now" button.
export function PayOrderButton({ orderId, serviceName, user }: { orderId: string; serviceName: string; user: { full_name?: string; email?: string | null } }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function pay() {
    setError(undefined);
    startTransition(async () => {
      try {
        const paid = await payFor("service_order", orderId, { user, description: serviceName });
        if (paid) router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment failed.");
      }
    });
  }

  return (
    <>
      <Button onClick={pay} disabled={isPending} style={{ width: "auto" }}>
        Pay now
      </Button>
      {error && <Callout tone="danger">{error}</Callout>}
    </>
  );
}
