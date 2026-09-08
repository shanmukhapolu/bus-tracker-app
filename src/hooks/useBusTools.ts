import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { Bus } from "../types/bus";

interface ToolContext {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}

// Optional progressive enhancement; ordinary browsers use the same visible controls.
export function useBusTools(buses: Bus[], onSelect: (id: string) => void) {
  const current = useRef({ buses, onSelect });
  current.current = { buses, onSelect };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ToolContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "select_bus",
            description:
              "Select a bus by number, close the bus menu, center its map location, and show its arrival card.",
            inputSchema: {
              type: "object",
              properties: { busNumber: { type: "string" } },
              required: ["busNumber"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute(input) {
              if (
                !input ||
                typeof input !== "object" ||
                !("busNumber" in input) ||
                typeof input.busNumber !== "string" ||
                Object.keys(input).length !== 1
              )
                throw new Error("Provide a busNumber string.");
              const bus = current.current.buses.find(
                (item) => item.busNumber === input.busNumber,
              );
              if (!bus) throw new Error("Bus not found.");
              flushSync(() => current.current.onSelect(bus.id));
              return {
                busNumber: bus.busNumber,
                route: bus.route,
                status: bus.status,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {
        /* Optional API availability must not block the tracker. */
      });
    } catch {
      /* Browsers without a working registry retain the complete UI. */
    }
    return () => lifecycle.abort();
  }, []);
}
