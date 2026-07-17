import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Settings2Icon,
  KeyIcon,
  ExternalLinkIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlugZapIcon,
  Loader2Icon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useAiProviderStore } from "@/stores/ai-provider-store";
import type { AiProviderInfo } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export function AiSettings() {
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const setAiProvider = useSettingsStore((s) => s.setAiProvider);
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    loadProviders();
  }, []);

  // Reset the test result when switching providers
  useEffect(() => {
    setTestState({ status: "idle" });
  }, [aiProvider]);

  const loadProviders = async () => {
    try {
      const list = await invoke<AiProviderInfo[]>("ai_list_providers");
      const noneEntry: AiProviderInfo = {
        id: "none",
        name: "No AI (Editor only)",
        ready: true,
      };
      setProviders([noneEntry, ...list]);

      // Load saved API keys and base URL
      for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
        try {
          const val = await invoke<string | null>("ai_get_api_key", {
            keyName: k,
          });
          if (val) setApiKeys((prev) => ({ ...prev, [k]: val }));
        } catch {
          // key not set
        }
      }
      try {
        const url = await invoke<string | null>("ai_get_api_key", {
          keyName: "OPENAI_BASE_URL",
        });
        if (url) setBaseUrl(url);
      } catch {
        // not set
      }
    } catch {
      setProviders([{ id: "none", name: "No AI (Editor only)", ready: true }]);
    }
  };

  const handleTestConnection = async () => {
    setTestState({ status: "testing" });
    const result = await useAiProviderStore
      .getState()
      .testConnection(aiProvider);
    if (result.ok) {
      setTestState({
        status: "ok",
        message:
          result.modelCount && result.modelCount > 0
            ? `Connected — ${result.modelCount} model${result.modelCount === 1 ? "" : "s"} available`
            : "Connected",
      });
    } else {
      setTestState({
        status: "error",
        message: result.error ?? "Connection failed",
      });
    }
  };

  const checkStatus = async (id: string) => {
    setCheckingId(id);
    try {
      const aiStore = useAiProviderStore.getState();
      const info = await aiStore.checkStatus(id);
      if (info) {
        setProviders((prev) => prev.map((p) => (p.id === id ? info : p)));
      }
    } catch {
      // status check failed
    }
    setCheckingId(null);
  };

  const handleSaveKey = async (keyName: string) => {
    try {
      await invoke("ai_set_api_key", {
        keyName,
        value: keyInput,
      });
      setApiKeys((prev) => ({ ...prev, [keyName]: keyInput }));
      setEditingKey(null);
      setKeyInput("");
    } catch (err: any) {
      console.error("Failed to save API key:", err);
    }
  };

  const handleRemoveKey = async (keyName: string) => {
    try {
      await invoke("ai_set_api_key", { keyName, value: "" });
      setApiKeys((prev) => {
        const next = { ...prev };
        delete next[keyName];
        return next;
      });
    } catch {
      // ignore
    }
  };

  const providerNeedsKey = (id: string): string | null => {
    switch (id) {
      case "anthropic":
        return "ANTHROPIC_API_KEY";
      case "openai":
        return "OPENAI_API_KEY";
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings2Icon className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">AI Provider</h3>
      </div>

      {/* Provider selector */}
      <div className="space-y-1">
        {providers.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              aiProvider === p.id
                ? "border-ring bg-accent/50"
                : "border-border hover:bg-muted/50",
            )}
          >
            <button
              type="button"
              className="flex flex-1 items-center gap-3 text-left"
              onClick={() => {
                setAiProvider(p.id as typeof aiProvider);
                if (p.id !== "none" && !p.ready) {
                  checkStatus(p.id);
                }
              }}
            >
              <div
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                  aiProvider === p.id
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/30",
                )}
              >
                {aiProvider === p.id && (
                  <div className="size-2 rounded-full bg-primary-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{p.name}</div>
                {p.message != null ? (
                  <div className="truncate text-muted-foreground text-xs">
                    {p.message}
                  </div>
                ) : null}
              </div>
            </button>

            {p.id !== "none" && (
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-xs transition-colors",
                  p.ready
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
                onClick={() => checkStatus(p.id)}
                disabled={checkingId === p.id}
              >
                {checkingId === p.id ? "..." : p.ready ? "Ready" : "Check"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* API Key configuration */}
      {aiProvider !== "none" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <KeyIcon className="size-4 text-muted-foreground" />
            <h4 className="font-medium text-xs">API Keys</h4>
          </div>

          {(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const)
            .filter((k) => {
              const needed = providerNeedsKey(aiProvider);
              return needed === k || !needed;
            })
            .map((keyName) => {
              const hasKey = !!apiKeys[keyName];
              const isEditing = editingKey === keyName;
              const label =
                keyName === "ANTHROPIC_API_KEY"
                  ? "Anthropic API Key"
                  : "OpenAI API Key";

              return (
                <div key={keyName} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      {label}
                    </span>
                    {hasKey && !isEditing && (
                      <button
                        type="button"
                        className="text-muted-foreground text-xs hover:text-foreground"
                        onClick={() => handleRemoveKey(keyName)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKey ? "text" : "password"}
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder="sk-..."
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 pr-8 font-mono text-xs outline-none focus:border-ring"
                        />
                        <button
                          type="button"
                          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? (
                            <EyeOffIcon className="size-3.5" />
                          ) : (
                            <EyeIcon className="size-3.5" />
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="rounded-md bg-primary px-2.5 py-1.5 font-medium text-primary-foreground text-xs"
                        onClick={() => handleSaveKey(keyName)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="rounded-md px-2 py-1.5 text-muted-foreground text-xs hover:text-foreground"
                        onClick={() => {
                          setEditingKey(null);
                          setKeyInput("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : hasKey ? (
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5">
                      <CheckIcon className="size-3 text-emerald-500" />
                      <span className="text-muted-foreground text-xs">
                        Configured
                      </span>
                      <button
                        type="button"
                        className="ml-auto text-muted-foreground text-xs hover:text-foreground"
                        onClick={() => {
                          setEditingKey(keyName);
                          setKeyInput(apiKeys[keyName]);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-border border-dashed px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:border-ring hover:text-foreground"
                      onClick={() => setEditingKey(keyName)}
                    >
                      <KeyIcon className="size-3" />
                      Set API key
                    </button>
                  )}

                  {/* Help link */}
                  {!hasKey && !isEditing && (
                    <a
                      href={
                        keyName === "ANTHROPIC_API_KEY"
                          ? "https://console.anthropic.com/"
                          : "https://platform.openai.com/api-keys"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                    >
                      Get API key
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                </div>
              );
            })}

          {/* Custom base URL for OpenAI-compatible providers */}
          {aiProvider === "openai" && (
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs">
                Base URL (optional)
              </span>
              <input
                type="text"
                value={baseUrl}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs outline-none focus:border-ring"
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  setBaseUrl(val);
                  try {
                    // Empty value removes the override (back to api.openai.com)
                    await invoke("ai_set_api_key", {
                      keyName: "OPENAI_BASE_URL",
                      value: val,
                    });
                  } catch {
                    // ignore
                  }
                }}
              />
              <div className="text-muted-foreground/70 text-xs">
                Use DeepSeek, OpenRouter, Ollama, or any OpenAI-compatible
                endpoint (e.g. https://api.deepseek.com/v1)
              </div>
            </div>
          )}

          {/* Connection test — makes a real authenticated request */}
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={testState.status === "testing"}
              onClick={handleTestConnection}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-ring hover:bg-muted/50 disabled:opacity-60"
            >
              {testState.status === "testing" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlugZapIcon className="size-3.5" />
              )}
              Test connection
            </button>
            {testState.status === "ok" && (
              <div className="flex items-start gap-1.5 text-emerald-600 text-xs dark:text-emerald-500">
                <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" />
                <span>{testState.message}</span>
              </div>
            )}
            {testState.status === "error" && (
              <div className="flex items-start gap-1.5 text-destructive text-xs">
                <XCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                <span className="break-all">
                  {testState.message.slice(0, 400)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
