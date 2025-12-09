export type Verdict = "SAFE" | "CAUTION" | "UNSAFE";

export type ClassifyItem = {
  label?: string;     // original label (token, barcode, etc.)
  name?: string;      // canonical food name or product name
  det_conf?: number;  // optional confidence
  final_status: Verdict;
  rationale?: string; // notes / explanation
  sources?: string[]; // citations
  isProduct?: boolean; // <-- true when this card is the overall product
};
