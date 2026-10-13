import type {
  AdvocatePerformanceDto,
  AiPerformanceDto,
  ComplaintsReportDto,
  CorporateDto,
  DemandDto,
  FounderAnalyticsResponseDto,
  FounderTab,
  FunnelDto,
  OverviewDto,
  RevenueDto,
  ServicePerformanceDto,
} from "@vidhira/contracts";
import { ComplaintsListClient } from "../admin/complaints/ComplaintsListClient";
import { Advocates, Ai, Corporate, Demand, Funnel, Overview, Revenue, Services } from "./FounderSections";

const SECTIONS: Record<FounderTab, [string, string]> = {
  founder: ["Business Command Centre", "Every figure is aggregated from live data. Matter contents and privileged messages are never exposed here."],
  fdemand: ["Demand", "Where requests come from, when they arrive, and which services carry them."],
  fservices: ["Service performance", "Each service measured the same way: started, completed, abandoned, and what it earns."],
  ffunnel: ["User funnel", "From registration through to repeat payers."],
  frevenue: ["Revenue", "Gross transaction value and what the platform keeps."],
  fcorp: ["Corporate accounts", "Usage and spend for every business account."],
  fadv: ["Advocate performance", "Internal quality and responsiveness. Never a ranking, never shown to clients."],
  fai: ["AI performance", "How often the assistant answered, how often it said it lacked sources, and what it could not answer."],
  fcomplaints: ["Complaints", "Every complaint with its root cause and corrective action."],
};

// Ported from frontend/src/screens/CommandCentre.jsx -- one component per FOUNDER_TABS entry,
// dispatched by tab the same way the original picked a component out of an object literal.
export function FounderTabView({ response }: { response: FounderAnalyticsResponseDto }) {
  const { tab, refreshedAt, payload } = response;
  const [title, subtitle] = SECTIONS[tab];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 24 }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-label)" }}>
          Founder access · aggregated business data
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{subtitle}</div>
        <div style={{ fontSize: 11, color: "var(--color-label)", marginTop: 4 }}>Computed live · {new Date(refreshedAt).toLocaleTimeString("en-IN")}</div>
      </div>

      {tab === "fcomplaints" ? (
        (() => {
          const p = payload as ComplaintsReportDto;
          return <ComplaintsListClient initialComplaints={p.complaints} kpis={p.kpis} />;
        })()
      ) : tab === "founder" ? (
        <Overview p={payload as OverviewDto} />
      ) : tab === "fdemand" ? (
        <Demand p={payload as DemandDto} />
      ) : tab === "fservices" ? (
        <Services p={payload as ServicePerformanceDto} />
      ) : tab === "ffunnel" ? (
        <Funnel p={payload as FunnelDto} />
      ) : tab === "frevenue" ? (
        <Revenue p={payload as RevenueDto} />
      ) : tab === "fcorp" ? (
        <Corporate p={payload as CorporateDto} />
      ) : tab === "fadv" ? (
        <Advocates p={payload as AdvocatePerformanceDto} />
      ) : (
        <Ai p={payload as AiPerformanceDto} />
      )}
    </div>
  );
}
