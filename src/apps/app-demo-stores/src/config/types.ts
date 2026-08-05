/**
 * Provisional — replaced in Task 8 once the real pasted config files are read. Enough shape to
 * let the rest of the skeleton compile.
 */
export interface LayerConfig {
  type: "vector";
  id: string;
  label: string;
  category?: string;
  source: { type: string; url: string };
  visible: boolean;
  fields: { id: string; label: string }[];
  default_variable: string;
  variables: unknown[];
}
