#!/usr/bin/env node
/**
 * Kubova MCP server.
 *
 * Exposes the Kubova container loading calculator as an MCP server so
 * Claude, Cursor, Cline, ChatGPT, n8n, and any other MCP-aware AI agent
 * can pack containers as a tool call.
 *
 * Usage in Claude Code / Cursor settings:
 *
 *   {
 *     "mcpServers": {
 *       "kubova": {
 *         "command": "npx",
 *         "args": ["-y", "@kubova/mcp@latest"],
 *         "env": { "KUBOVA_API_KEY": "kbv_..." }
 *       }
 *     }
 *   }
 *
 * Env:
 *   KUBOVA_API_KEY  (required) — get one at https://kubova.com/dashboard/api-keys
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const API_URL = 'https://kubova.com';
const API_KEY = process.env.KUBOVA_API_KEY;

if (!API_KEY) {
  // eslint-disable-next-line no-console
  console.error('[kubova-mcp] KUBOVA_API_KEY is required. Generate one at /dashboard/api-keys.');
  process.exit(1);
}

const CargoSchema = z.object({
  id: z.string(),
  name: z.string(),
  shape: z.enum(['box', 'cylinder']).default('box'),
  lengthCm: z.number().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  diameterCm: z.number().positive().optional(),
  quantity: z.number().int().positive(),
  weightKg: z.number().nonnegative(),
  color: z.string().default('#3b82f6'),
  includeInLoading: z.boolean().default(true),
  allowStacking: z.boolean().default(true),
  allowRotation: z.boolean().default(true),
});

const ContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  innerLengthCm: z.number().positive(),
  innerWidthCm: z.number().positive(),
  innerHeightCm: z.number().positive(),
  doorWidthCm: z.number().positive(),
  doorHeightCm: z.number().positive(),
  maxPayloadKg: z.number().positive(),
});

const PackInputSchema = z.object({
  cargos: z.array(CargoSchema).min(1),
  container: ContainerSchema.optional(),
  containers: z.array(ContainerSchema).optional(),
  options: z
    .object({
      loadingDirection: z.enum(['floor-to-top', 'right-to-left']).optional(),
      maxContainers: z.number().int().positive().optional(),
    })
    .optional(),
});

const PACK_INPUT_JSONSCHEMA = {
  type: 'object',
  required: ['cargos'],
  properties: {
    cargos: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'name', 'lengthCm', 'widthCm', 'heightCm', 'quantity', 'weightKg'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          shape: { type: 'string', enum: ['box', 'cylinder'], default: 'box' },
          lengthCm: { type: 'number' },
          widthCm: { type: 'number' },
          heightCm: { type: 'number' },
          diameterCm: { type: 'number' },
          quantity: { type: 'integer', description: 'Number of identical pieces of this SKU.' },
          weightKg: {
            type: 'number',
            description:
              'Weight of ONE piece in kg — NOT the row total. If a packing list shows both ' +
              '"weight/piece" and "weight total", use weight/piece.',
          },
          color: { type: 'string' },
          includeInLoading: { type: 'boolean', default: true },
          allowStacking: { type: 'boolean', default: true },
          allowRotation: { type: 'boolean', default: true },
        },
      },
    },
    container: {
      type: 'object',
      description: 'Single container to pack into. Use this OR containers[].',
    },
    containers: {
      type: 'array',
      description: 'Multiple container types — Kubova picks the best mix.',
    },
    options: {
      type: 'object',
      properties: {
        loadingDirection: { type: 'string', enum: ['floor-to-top', 'right-to-left'] },
        maxContainers: { type: 'integer' },
      },
    },
  },
} as const;

// generate_report accepts the same input PLUS an optional precomputed `result`,
// so a report can render the EXACT plan a prior pack_containers call produced
// instead of repacking (which could differ run-to-run).
const ReportInputSchema = PackInputSchema.extend({
  result: z.unknown().optional(),
});

const REPORT_INPUT_JSONSCHEMA = {
  type: 'object',
  required: ['cargos'],
  properties: {
    ...PACK_INPUT_JSONSCHEMA.properties,
    result: {
      type: 'object',
      description:
        'OPTIONAL but strongly recommended: the exact `result` object returned by a ' +
        'prior pack_containers call. Pass it here so the report renders THAT plan ' +
        'instead of repacking — this guarantees the PDF matches the packing you already ' +
        'showed the user. Omit only if you have not packed yet.',
    },
  },
} as const;

const CartonSchema = z.object({
  name: z.string(),
  lengthCm: z.number().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  weightKg: z.number().nonnegative(),
  qtyPerSet: z.number().int().positive().default(1),
  allowRotation: z.boolean().default(true),
  allowStacking: z.boolean().default(true),
});

const CapacityInputSchema = z.object({
  product: z.object({
    name: z.string().optional(),
    cartons: z.array(CartonSchema).min(1),
  }),
  containers: z.array(ContainerSchema).optional(),
});

const CAPACITY_INPUT_JSONSCHEMA = {
  type: 'object',
  required: ['product'],
  properties: {
    product: {
      type: 'object',
      required: ['cartons'],
      properties: {
        name: { type: 'string' },
        cartons: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['name', 'lengthCm', 'widthCm', 'heightCm', 'weightKg'],
            properties: {
              name: { type: 'string' },
              lengthCm: { type: 'number' },
              widthCm: { type: 'number' },
              heightCm: { type: 'number' },
              weightKg: {
                type: 'number',
                description: 'Weight of ONE carton in kg — NOT the line total.',
              },
              qtyPerSet: {
                type: 'integer',
                default: 1,
                description: 'How many of THIS carton make up one set/product.',
              },
              allowRotation: { type: 'boolean', default: true },
              allowStacking: { type: 'boolean', default: true },
            },
          },
        },
      },
    },
    containers: {
      type: 'array',
      description: "Containers to evaluate. Omit for the standard 20' DC, 40' DC, 40' HC.",
    },
  },
} as const;

const server = new Server(
  { name: 'kubova-mcp', version: '0.1.5' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'pack_containers',
      description:
        'Pack a list of cargo SKUs into one or more shipping containers using ' +
        'the Kubova solver. Returns per-container placements with x,y,z ' +
        'coordinates in cm, volume utilization, weight, and any unplaced pieces.',
      inputSchema: PACK_INPUT_JSONSCHEMA,
    },
    {
      name: 'generate_report',
      description:
        'Generate a CAD-style PDF + 3D PNG report for a packing job. ' +
        'IMPORTANT: to keep the report consistent with a plan you already produced, pass ' +
        'the `result` object from your previous pack_containers call — the report then ' +
        'renders that exact plan instead of recomputing (which can differ run-to-run). ' +
        'If `result` is omitted, it packs from cargos + containers. Returns base64-encoded ' +
        'PDF + PNG per container plus the pack result.',
      inputSchema: REPORT_INPUT_JSONSCHEMA,
    },
    {
      name: 'estimate_capacity',
      description:
        'How many complete SETS of one product fit in a single container? A product is ' +
        '1+ carton types with qtyPerSet each (e.g. a table shipping as 2 cartons: top + ' +
        'legs). All cartons of a set ride in the SAME container. Uses real 3D packing ' +
        '(not just volume math) and reports the binding limit (dimension/weight/volume) ' +
        "per container. Omit `containers` to evaluate the standard 20' DC, 40' DC, 40' HC.",
      inputSchema: CAPACITY_INPUT_JSONSCHEMA,
      annotations: { title: 'Estimate container capacity', readOnlyHint: true, openWorldHint: false },
    },
    {
      name: 'verify_key',
      description: 'Verify the configured API key. Returns the key identity, scopes, and rate limit.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'Verify connection', readOnlyHint: true, openWorldHint: false },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'verify_key') {
    const res = await fetch(`${API_URL}/api/v1/me`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const text = await res.text();
    return {
      content: [{ type: 'text', text }],
      isError: !res.ok,
    };
  }

  if (name === 'estimate_capacity') {
    const parsed = CapacityInputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
        isError: true,
      };
    }
    const res = await fetch(`${API_URL}/api/v1/capacity`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const text = await res.text();
    return { content: [{ type: 'text', text }], isError: !res.ok };
  }

  if (name === 'pack_containers' || name === 'generate_report') {
    const schema = name === 'generate_report' ? ReportInputSchema : PackInputSchema;
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
        isError: true,
      };
    }

    // Normalize a passed-in result so the report renders the prior plan (skips
    // repacking). Accept either the PackResult itself or the whole
    // { ok, result } response wrapper the agent may have copied back.
    const forwardBody: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };
    if (name === 'generate_report' && forwardBody.result && typeof forwardBody.result === 'object') {
      const r = forwardBody.result as { containers?: unknown; result?: { containers?: unknown } };
      if (!Array.isArray(r.containers) && Array.isArray(r.result?.containers)) {
        forwardBody.result = r.result;
      }
    }

    const endpoint = name === 'pack_containers' ? '/api/v1/pack' : '/api/v1/report';
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwardBody),
    });

    const text = await res.text();
    // Tripwire for the classic agent mistake: line-total weight pasted into
    // the per-piece field. Density beyond solid steel is implausible cargo.
    const flagged = (parsed.data.cargos ?? [])
      .map((c) => {
        const m3 = (c.lengthCm * c.widthCm * c.heightCm) / 1_000_000;
        return m3 > 0 && c.weightKg / m3 > 5000
          ? `"${c.name}" = ${c.weightKg} kg/piece (${Math.round(c.weightKg / m3).toLocaleString()} kg/m³)`
          : null;
      })
      .filter((x): x is string => x !== null);
    if (flagged.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text:
              `⚠️ SUSPICIOUS INPUT — ${flagged.join('; ')}. That density exceeds solid steel; ` +
              'weightKg is the weight of ONE piece, so a row total was probably pasted by ' +
              'mistake. Verify with the user and re-call with the per-piece weight.',
          },
          { type: 'text', text },
        ],
        isError: !res.ok,
      };
    }
    return {
      content: [{ type: 'text', text }],
      isError: !res.ok,
    };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

// eslint-disable-next-line no-console
console.error('[kubova-mcp] connected on stdio');
