import type { DataProvider, CompatibilityResult } from "../data/types.js";
import { getCompatibility } from "../data/compatibility-matrix.js";

type Input = { protocol_a: string; protocol_b: string };
type Output = CompatibilityResult & { data_as_of: string };

export function getCompatibilityTool(provider: DataProvider, input: Input): Output {
  const result = getCompatibility(input.protocol_a, input.protocol_b);
  return {
    ...result,
    data_as_of: provider.getDataTimestamp(),
  };
}
