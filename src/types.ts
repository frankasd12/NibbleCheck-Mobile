export type Verdict = "SAFE" | "CAUTION" | "UNSAFE";

export type ClassifyItem = {
  label?: string;     // or "name" depending on backend payload
  name?: string;
  det_conf?: number;
  final_status: Verdict;
  rationale?: string;
  sources?: string[];
};
