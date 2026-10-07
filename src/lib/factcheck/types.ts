export const FACT_LABELS = [
  "Accurate",
  "Inaccurate",
  "Disputed",
  "Unsupported",
  "No Claims present",
] as const;

export type FactLabel = (typeof FACT_LABELS)[number];

export type FactCheckInput = {
  userQuery: string;
  fullResponse: string;
  targetSentence: string;
  /** YYYY-MM-DD */
  queryDate: string;
};

export type EntityHints = {
  sport: string;
  league: string;
  teams: string[];
  players: string[];
  /** YYYY-MM-DD, empty when unknown */
  eventDate: string;
  eventName: string;
};

export type Claim = {
  id: string;
  text: string;
  keyValues: string[];
  isSubjective: boolean;
  searchQueries: string[];
};

export type ClaimExtraction = {
  noClaims: boolean;
  noClaimsReason: string;
  claims: Claim[];
  entityHints: EntityHints;
};

export type DateStatus = "before_query_date" | "after_query_date" | "unknown_date";

export type SourceOrigin = "sports_api" | "tavily" | "manual";

export type SourceCandidate = {
  url: string;
  title: string;
  origin: SourceOrigin;
  publishedDate?: string;
  dateStatus: DateStatus;
  claimIds: string[];
  snippet?: string;
  apiExcerpt?: string;
  score?: number;
};

export type LinkStatus = "ok" | "http_error" | "timeout" | "empty" | "blocked";

export type KeyMatch = "match" | "partial" | "no_match";

export type LinkCheck = {
  url: string;
  status: LinkStatus;
  httpStatus?: number;
  keyMatch: KeyMatch;
  matchedValues: string[];
  excerpt: string;
  detail: string;
  publishedDate?: string;
};

export type VerifiedSource = SourceCandidate & { check: LinkCheck };

export type ClaimVerdict = {
  claimId: string;
  verdict: FactLabel;
  supportingUrls: string[];
  contradictingUrls: string[];
  note: string;
};

export type Narrative = { en: string; id: string };

export type AiResearchResult = {
  input: FactCheckInput;
  extraction: ClaimExtraction;
  verdicts: ClaimVerdict[];
  label: FactLabel;
  narrative: Narrative;
  sources: VerifiedSource[];
  rejected: LinkCheck[];
  citedUrls: string[];
  sourcesBlock: string;
};

export type ManualResearch = {
  label?: FactLabel;
  notes: string;
  urls: string[];
};

export type Agreement = "agree" | "disagree" | "ai_only" | "manual_only";

export type ClaimComparison = {
  claimId: string;
  aiVerdict: FactLabel;
  manualVerdict: string;
  agreement: Agreement;
  analysis: string;
};

export type Confidence = "tinggi" | "sedang" | "rendah";

export type FinalReview = {
  label: FactLabel;
  confidence: Confidence;
  narrative: Narrative;
  sources: VerifiedSource[];
  citedUrls: string[];
  sourcesBlock: string;
  manualChecks: LinkCheck[];
  comparisons: ClaimComparison[];
  notesForUser: string;
};

export type ProgressEvent =
  | { type: "stage"; stage: string; message: string }
  | {
      type: "link";
      url: string;
      status: "checking" | "ok" | "failed";
      detail: string;
    }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string };

export type Emit = (event: ProgressEvent) => void;
