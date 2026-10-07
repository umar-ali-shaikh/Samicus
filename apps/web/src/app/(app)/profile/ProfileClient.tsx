"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import type { AccountDto, AccountMemberDto, AdvocateDto, PlanDto } from "@vidhira/contracts";
import { Card, Button, Callout, Badge, Field, Select, inputStyle } from "@/components/ui";
import { createAccountAction, addMemberAction, removeMemberAction, getMembersAction } from "@/server/accountsActions";
import { initialAuthFormState } from "@/server/authActionState";
import { ApplyAdvocateForm, type PracticeAreaOption } from "@/components/advocates/ApplyAdvocateForm";
import { AdvocateProfileEditorForm } from "@/components/advocates/AdvocateProfileEditorForm";
import { VerificationStatusCard } from "@/components/advocates/VerificationStatusCard";

const cleanName = (n = "") => n.replace(/\s*\([0-9a-f]{6}\)$/, "");
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// Ported from frontend/src/screens/Profile.jsx's Accounts/Members/Plans sections.
export function ProfileClient({
  accounts,
  plans,
  initialAccountId,
  initialMembers,
  advocate,
  practiceAreas,
}: {
  accounts: AccountDto[];
  plans: PlanDto[];
  initialAccountId: string | null;
  initialMembers: AccountMemberDto[];
  advocate: AdvocateDto | null;
  practiceAreas: PracticeAreaOption[];
}) {
  const [activeAccountId, setActiveAccountId] = useState(initialAccountId);
  const [showApply, setShowApply] = useState(false);
  const [members, setMembers] = useState(initialMembers);
  const [membersPending, startMembersTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  function selectAccount(id: string) {
    setActiveAccountId(id);
    startMembersTransition(async () => {
      setMembers(await getMembersAction(id));
    });
  }

  function refreshMembers() {
    if (!activeAccountId) return;
    startMembersTransition(async () => {
      setMembers(await getMembersAction(activeAccountId));
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 900, padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Profile & settings</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Accounts</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {accounts.map((a) => (
            <Card
              key={a.id}
              style={{
                cursor: "pointer",
                flex: "1 1 180px",
                padding: 14,
                border: `1.5px solid ${activeAccountId === a.id ? "var(--color-navy)" : "var(--color-border)"}`,
              }}
            >
              <button
                type="button"
                onClick={() => selectAccount(a.id)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
              >
                <div style={{ fontWeight: 700 }}>{cleanName(a.display_name)}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "capitalize" }}>
                  {a.type} · {a.myRole}
                </div>
              </button>
            </Card>
          ))}
        </div>

        {activeAccount && (
          <Card style={{ padding: 16 }}>
            <MembersPanel account={activeAccount} members={members} loading={membersPending} onChanged={refreshMembers} />
          </Card>
        )}

        {showCreate ? (
          <CreateAccountForm onDone={() => setShowCreate(false)} />
        ) : (
          <Button variant="outline" onClick={() => setShowCreate(true)} style={{ alignSelf: "flex-start" }}>
            + Add a business or family account
          </Button>
        )}
      </div>

      {plans.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Plans</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {plans.map((p) => (
              <Card key={p.id} style={{ padding: 14 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{inr(p.price_monthly)}/mo</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{p.audience}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div id="advocate" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Advocate listing</div>
        {advocate ? (
          <>
            <VerificationStatusCard advocate={advocate} />
            <AdvocateProfileEditorForm advocate={advocate} />
          </>
        ) : showApply ? (
          <ApplyAdvocateForm practiceAreas={practiceAreas} onDone={() => setShowApply(false)} />
        ) : (
          <Button variant="outline" onClick={() => setShowApply(true)} style={{ alignSelf: "flex-start" }}>
            Apply to list as an advocate
          </Button>
        )}
      </div>
    </div>
  );
}

function CreateAccountForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(createAccountAction, initialAuthFormState);
  const [type, setType] = useState<"business" | "family">("business");

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <Select label="Type" name="type" value={type} onChange={(e) => setType(e.target.value as "business" | "family")} options={[["business", "Business"], ["family", "Family"]]} />
          <Field label="Name">
            <input name="displayName" style={inputStyle} required minLength={2} />
          </Field>
          {type === "business" && (
            <Field label="GSTIN (optional)">
              <input name="gstin" style={inputStyle} />
            </Field>
          )}
        </div>
        {state.error && <Callout tone="danger">{state.error}</Callout>}
        {state.notice && <Callout tone="success">{state.notice}</Callout>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="submit" disabled={pending} style={{ width: "auto" }}>
            {pending ? "Creating…" : "Create account"}
          </Button>
          <Button type="button" variant="outline" onClick={onDone} style={{ width: "auto" }}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MembersPanel({
  account,
  members,
  loading,
  onChanged,
}: {
  account: AccountDto;
  members: AccountMemberDto[];
  loading: boolean;
  onChanged: () => void;
}) {
  const canManage = account.myRole === "owner" || account.myRole === "admin";
  const [addError, setAddError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function remove(memberId: string) {
    startTransition(async () => {
      await removeMemberAction(account.id, memberId);
      onChanged();
    });
  }

  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setAddError(undefined);
    startTransition(async () => {
      const result = await addMemberAction(initialAuthFormState, formData);
      if (result.error) {
        setAddError(result.error);
        return;
      }
      form.reset();
      onChanged();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Members · {account.seat_limit} seats</div>
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading…</div>
      ) : (
        members.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span>
              {m.user?.full_name} <span style={{ color: "var(--color-text-muted)" }}>· {m.user?.email}</span>
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge>{m.role}</Badge>
              {canManage && m.role !== "owner" && (
                <button onClick={() => remove(m.id)} style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12 }}>
                  Remove
                </button>
              )}
            </span>
          </div>
        ))
      )}
      {canManage && account.type !== "individual" && (
        <form onSubmit={submitAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input type="hidden" name="accountId" value={account.id} />
          <Field label="Invite by email">
            <input type="email" name="email" style={{ ...inputStyle, minWidth: 200 }} required />
          </Field>
          <Select label="Role" name="role" defaultValue="member" options={["admin", "member", "finance", "viewer"]} />
          <Button type="submit" disabled={isPending} style={{ width: "auto" }}>
            Add
          </Button>
        </form>
      )}
      {addError && <Callout tone="danger">{addError}</Callout>}
    </div>
  );
}
