"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PackCategoryDto } from "@vidhira/contracts";
import { Pill, Button, Callout } from "@/components/ui";
import { TextArea } from "@/components/forms";
import { publishPackRulesetAction } from "@/server/packActions";

const RULESET_EXAMPLE = JSON.stringify(
  {
    categoryId: "food",
    categoryName: "Packaged food",
    declarations: [{ key: "net_quantity", label: "Net quantity", ruleRef: "<cite the rule>", required: true, formatPattern: "\\d+\\s?(g|kg|ml|l)" }],
    claimRules: [{ pattern: "100% natural", verdict: "needs_substantiation", ruleRef: "<cite the rule>", substantiationRequired: true, saferPhrasing: "<safer wording>" }],
  },
  null,
  2,
);

export function RulesetsTab({ categories }: { categories: PackCategoryDto[] }) {
  const router = useRouter();
  const [json, setJson] = useState(RULESET_EXAMPLE);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function publish() {
    setError("");
    let body;
    try {
      body = JSON.parse(json);
    } catch {
      setError("That isn't valid JSON.");
      return;
    }
    startTransition(async () => {
      const result = await publishPackRulesetAction(body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Pack-compliance rulesets</div>
      <Callout tone="warning">
        Rulesets encode regulatory requirements. Have them prepared and checked by a qualified compliance advocate — the example below is a shape, not
        real law. Publishing creates a new version and re-flags affected approved packs.
      </Callout>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {categories.map((c) => (
          <Pill key={c.categoryId} active={false}>
            {c.categoryName} · v{c.currentVersion}
          </Pill>
        ))}
      </div>
      <TextArea label="Ruleset (JSON)" rows={14} value={json} onChange={(e) => setJson(e.target.value)} />
      {error && <Callout tone="danger">{error}</Callout>}
      <Button onClick={publish} disabled={isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
        Publish new version
      </Button>
    </div>
  );
}
