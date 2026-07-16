/// <reference lib="webworker" />
import { scanWithSemanticProviders } from "./providers";
import type { SemanticScanContext } from "./types";

self.onmessage = (event: MessageEvent<SemanticScanContext>) => {
  const context = event.data;
  self.postMessage({
    context,
    result: scanWithSemanticProviders(context),
  });
};
