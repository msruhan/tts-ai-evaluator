export type HandbookTone = "na" | "good" | "ok" | "mid" | "bad" | "worst";

export type HandbookLevel = {
  n: string;
  tone?: HandbookTone | string;
  s?: string;
  t?: string;
};

export type HandbookFu = {
  label?: string;
  q?: string;
  open?: boolean;
  opts?: Array<string | { t?: string; d?: string; label?: string; n?: string; s?: string; desc?: string }>;
};

export type HandbookNote = {
  t?: string;
  b?: string;
};

export type HandbookSplit = {
  title?: string;
  intro?: string;
  a?: { h?: string; items?: string[] };
  b?: { h?: string; items?: string[] };
};

export type HandbookCard = {
  id: string;
  num: string;
  cat: string;
  title: string;
  ask?: string;
  lead?: string;
  rule?: string;
  note?: HandbookNote | string | null;
  levels?: HandbookLevel[];
  fu?: HandbookFu;
  fu2?: HandbookFu;
  split?: HandbookSplit;
  sxs?: boolean;
  sxsLabel?: string;
  sxsNA?: boolean;
};

export type HandbookDefItem = {
  t: string;
  d?: string;
  e?: string;
  _id?: string;
};

export type HandbookDefGroup = {
  g: string;
  for?: string;
  items: HandbookDefItem[];
};

export type HandbookData = {
  meta?: {
    title?: string;
    subtitle?: string;
    source?: string;
    note?: string;
  };
  PRIMER: HandbookCard[];
  QS: HandbookCard[];
  DEFS: HandbookDefGroup[];
};
