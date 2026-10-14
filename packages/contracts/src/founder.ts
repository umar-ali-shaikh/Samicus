/**
 * Founder (Command Centre) domain contracts. Ported from services/analytics/index.js's nine
 * TABS functions and routes/founder.js's GET /admin/analytics/:tab wrapper. These are
 * dashboard payloads (chart configs, KPI arrays, tables) rather than typed business entities,
 * so each DTO mirrors exactly what its function returns instead of reusing other domains'
 * entity DTOs.
 */
import { z } from "zod";
import { complaintsReportDto } from "./admin.js";

export const FOUNDER_TABS = ["founder", "fdemand", "fservices", "ffunnel", "frevenue", "fcorp", "fadv", "fai", "fcomplaints"] as const;
export type FounderTab = (typeof FOUNDER_TABS)[number];

const metricDto = z
  .object({
    label: z.string(),
    value: z.union([z.number(), z.string(), z.null()]),
    money: z.boolean().optional(),
    invert: z.boolean().optional(),
    suffix: z.string().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

export const overviewDto = z
  .object({
    briefing: z.string(),
    groups: z.array(z.object({ group: z.string(), metrics: z.array(metricDto) }).strict()),
  })
  .strict();
export type OverviewDto = z.infer<typeof overviewDto>;

export const demandDto = z
  .object({
    daily: z.array(z.number()),
    dailyLabels: z.array(z.string()),
    charts: z.array(z.object({ title: z.string(), rows: z.array(z.tuple([z.string(), z.number()])) }).strict()),
  })
  .strict();
export type DemandDto = z.infer<typeof demandDto>;

export const servicePerformanceDto = z
  .object({
    rows: z.array(
      z
        .object({
          service: z.string(),
          enquiries: z.number(),
          started: z.number(),
          completed: z.number(),
          abandoned: z.number(),
          conversion: z.number().nullable(),
          revenue: z.number().nullable(),
          asp: z.number().nullable(),
          csat: z.number().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type ServicePerformanceDto = z.infer<typeof servicePerformanceDto>;

export const funnelDto = z
  .object({
    stages: z.array(z.object({ stage: z.string(), count: z.number() }).strict()),
    delivered: z.number(),
    note: z.string(),
  })
  .strict();
export type FunnelDto = z.infer<typeof funnelDto>;

export const revenueDto = z
  .object({
    kpis: z.array(metricDto),
    monthly: z.array(z.object({ month: z.string(), gmv: z.number() }).strict()),
    byKind: z.array(z.object({ kind: z.string(), amount: z.number() }).strict()),
  })
  .strict();
export type RevenueDto = z.infer<typeof revenueDto>;

export const corporateDto = z
  .object({
    accounts: z.array(
      z
        .object({
          name: z.string(),
          plan: z.string().nullable(),
          seats: z.number(),
          seatLimit: z.number(),
          openMatters: z.number(),
          totalMatters: z.number(),
          legalSpend: z.number(),
          outstanding: z.number(),
          lastActivity: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type CorporateDto = z.infer<typeof corporateDto>;

export const advocatePerformanceDto = z
  .object({
    rows: z.array(
      z
        .object({
          id: z.string(),
          name: z.string().nullable(),
          status: z.string(),
          received: z.number(),
          accepted: z.number(),
          declined: z.number(),
          completed: z.number(),
          converted: z.number(),
          feesBilled: z.number(),
          csat: z.number().nullable(),
          ratings: z.number(),
        })
        .strict(),
    ),
  })
  .strict();
export type AdvocatePerformanceDto = z.infer<typeof advocatePerformanceDto>;

export const aiPerformanceDto = z
  .object({
    kpis: z.array(metricDto),
    knowledgeBase: z.record(z.string(), z.unknown()),
    gaps: z.array(z.object({ topic: z.string(), asked: z.number(), example: z.string() }).strict()),
  })
  .strict();
export type AiPerformanceDto = z.infer<typeof aiPerformanceDto>;

export const founderAnalyticsPayloadDto = z.union([
  overviewDto,
  demandDto,
  servicePerformanceDto,
  funnelDto,
  revenueDto,
  corporateDto,
  advocatePerformanceDto,
  aiPerformanceDto,
  complaintsReportDto,
]);

export const founderAnalyticsResponseDto = z.object({ tab: z.enum(FOUNDER_TABS), refreshedAt: z.string(), payload: founderAnalyticsPayloadDto }).strict();
export type FounderAnalyticsResponseDto = z.infer<typeof founderAnalyticsResponseDto>;
