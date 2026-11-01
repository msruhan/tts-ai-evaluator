export type OdinDecision = "approve" | "request_edits" | "reject" | "provisional";

export type OdinMetadataSections = {
  format: string;
  topology: string;
  request: string;
  taskDescription: string;
  other: string;
  rawText: string;
};

export type OdinZipFile = {
  path: string;
  size: number;
  kind: "input" | "artifact" | "output" | "other";
  ext: string;
  textPreview: string;
  skippedReason?: string;
};

export type OdinZipAnalysis = {
  fileCount: number;
  totalUncompressed: number;
  truncated: boolean;
  files: OdinZipFile[];
  namingIssues: string[];
  containsMetadataRtf: boolean;
};

export type AlignmentStatus = "match" | "mismatch" | "missing";

export type AlignmentCheck = {
  id: string;
  label: string;
  status: AlignmentStatus;
  detail: string;
};

export type IdeaMetadataAlignment = {
  goal: string;
  request: string;
  exactMatch: boolean;
  checks: AlignmentCheck[];
};

export type OdinReviewResult = {
  header: string;
  decision: OdinDecision;
  writerFeedback: string;
  qcNotes: string;
  metadata: OdinMetadataSections;
  zip: OdinZipAnalysis;
  alignment: IdeaMetadataAlignment;
  model?: string;
};
