import { coreSemanticProviders } from "./core-provider";
import type {
  SemanticProvider,
  SemanticScanContext,
  SemanticScanResult,
} from "./types";

const providers: SemanticProvider[] = [...coreSemanticProviders];

export function registerSemanticProvider(
  provider: SemanticProvider,
): () => void {
  providers.push(provider);
  return () => {
    const index = providers.indexOf(provider);
    if (index >= 0) providers.splice(index, 1);
  };
}

export function scanWithSemanticProviders(
  context: SemanticScanContext,
): SemanticScanResult {
  const results = providers
    .filter((provider) => provider.supports(context.fileName))
    .map((provider) => provider.scan(context));
  return {
    objects: results.flatMap((result) => result.objects),
    diagnostics: results.flatMap((result) => result.diagnostics),
  };
}

export { providers as semanticProviders };
export type * from "./types";
