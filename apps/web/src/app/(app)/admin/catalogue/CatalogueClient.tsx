"use client";

import { useState } from "react";
import type { GuideListItemDto, PackCategoryDto, ServiceListItemDto, UsageDto } from "@vidhira/contracts";
import { Pill } from "@/components/ui";
import { ServicesTab } from "./ServicesTab";
import { GuidesTab } from "./GuidesTab";
import { RulesetsTab } from "./RulesetsTab";
import { UsageTab } from "./UsageTab";

const TABS = ["Services", "Guides", "Pack rulesets", "Usage"] as const;

// Ported from frontend/src/screens/Catalogue.jsx.
export function CatalogueClient({
  services,
  guides,
  categories,
  usage,
}: {
  services: ServiceListItemDto[];
  guides: GuideListItemDto[];
  categories: PackCategoryDto[];
  usage: UsageDto;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Services");
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Catalogue &amp; rules</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Everything customer-facing that isn&apos;t user-generated is managed here — nothing is hard-coded.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
      </div>
      {tab === "Services" && <ServicesTab services={services} />}
      {tab === "Guides" && <GuidesTab guides={guides} />}
      {tab === "Pack rulesets" && <RulesetsTab categories={categories} />}
      {tab === "Usage" && <UsageTab usage={usage} />}
    </div>
  );
}
