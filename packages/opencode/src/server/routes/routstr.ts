import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { HTTPException } from "hono/http-exception"
import z from "zod"
import { Auth } from "@/auth"
import { lazy } from "@/util/lazy"

const ROUTSTR_BASE_URL = "https://api.routstr.com/v1"
const MODELS_CACHE_TTL_MS = 60_000
const BALANCE_CREATE_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 15_000

const cache = {
  time: 0,
  data: undefined as unknown,
}

async function getRoutstrApiKey(): Promise<string> {
  const info = await Auth.get("routstr")
  if (!info || info.type !== "api") {
    throw new HTTPException(400, { message: "Routstr is not connected. Connect it first, then retry." })
  }
  // Per RIP-01, `Authorization: Bearer` can be either `sk-...` or a `cashuA.../cashuB...` token.
  // Do not auto-exchange here because some users may be reusing an already-redeemed token.
  return info.key
}

function authHeader(key: string) {
  return {
    Authorization: `Bearer ${key}`,
  }
}

export const RoutstrRoutes = lazy(() =>
  new Hono()
    .get(
      "/models",
      describeRoute({
        summary: "List Routstr models",
        description: "Fetch Routstr /v1/models (cached briefly).",
        operationId: "routstr.models",
        responses: {
          200: {
            description: "Models",
            content: {
              "application/json": {
                schema: resolver(z.any()),
              },
            },
          },
        },
      }),
      async (c) => {
        const now = Date.now()
        if (cache.data !== undefined && now - cache.time < MODELS_CACHE_TTL_MS) {
          return c.json(cache.data)
        }

        const key = await Auth.get("routstr").then((x) => (x?.type === "api" ? x.key : undefined))
        const headers = key ? authHeader(key) : {}

        const res = await fetch(`${ROUTSTR_BASE_URL}/models`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new HTTPException(res.status as any, {
            message: `Failed to fetch Routstr models (${res.status}): ${body || res.statusText}`,
          })
        }

        const json = await res.json()
        cache.time = now
        cache.data = json
        return c.json(json)
      },
    )
    .post(
      "/balance/create",
      describeRoute({
        summary: "Create Routstr balance key",
        description: "Exchange a Cashu token for a Routstr balance API key (sk-...).",
        operationId: "routstr.balance.create",
        responses: {
          200: {
            description: "Created balance key",
            content: {
              "application/json": {
                schema: resolver(z.any()),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          initial_balance_token: z.string(),
        }),
      ),
      async (c) => {
        const token = c.req.valid("json").initial_balance_token
        const res = await fetch(`${ROUTSTR_BASE_URL}/balance/create?initial_balance_token=${encodeURIComponent(token)}`, {
          method: "GET",
          signal: AbortSignal.timeout(BALANCE_CREATE_TIMEOUT_MS),
        })

        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new HTTPException(res.status as any, {
            message: `Failed to create Routstr balance key (${res.status}): ${body || res.statusText}`,
          })
        }

        const json = await res.json()
        return c.json(json)
      },
    )
    .get(
      "/balance/info",
      describeRoute({
        summary: "Get Routstr balance",
        description: "Fetch Routstr /v1/balance/info using stored Routstr auth.",
        operationId: "routstr.balance.info",
        responses: {
          200: {
            description: "Balance info",
            content: {
              "application/json": {
                schema: resolver(z.any()),
              },
            },
          },
        },
      }),
      async (c) => {
        const key = await getRoutstrApiKey()
        const res = await fetch(`${ROUTSTR_BASE_URL}/balance/info`, {
          method: "GET",
          headers: authHeader(key),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new HTTPException(res.status as any, {
            message: `Failed to fetch Routstr balance (${res.status}): ${body || res.statusText}`,
          })
        }

        return c.json(await res.json())
      },
    )
    .post(
      "/balance/topup",
      describeRoute({
        summary: "Top up Routstr balance",
        description: "Top up Routstr /v1/balance/topup with a Cashu token.",
        operationId: "routstr.balance.topup",
        responses: {
          200: {
            description: "Topped up",
            content: {
              "application/json": {
                schema: resolver(z.any()),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          cashu_token: z.string(),
        }),
      ),
      async (c) => {
        const key = await getRoutstrApiKey()
        const body = c.req.valid("json")
        const res = await fetch(`${ROUTSTR_BASE_URL}/balance/topup`, {
          method: "POST",
          headers: {
            ...authHeader(key),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!res.ok) {
          const txt = await res.text().catch(() => "")
          throw new HTTPException(res.status as any, {
            message: `Failed to top up Routstr balance (${res.status}): ${txt || res.statusText}`,
          })
        }

        return c.json(await res.json())
      },
    )
    .post(
      "/balance/refund",
      describeRoute({
        summary: "Refund Routstr balance",
        description: "Refund remaining Routstr balance to a Cashu token.",
        operationId: "routstr.balance.refund",
        responses: {
          200: {
            description: "Refunded",
            content: {
              "application/json": {
                schema: resolver(z.any()),
              },
            },
          },
        },
      }),
      async (c) => {
        const key = await getRoutstrApiKey()
        const res = await fetch(`${ROUTSTR_BASE_URL}/balance/refund`, {
          method: "POST",
          headers: authHeader(key),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!res.ok) {
          const txt = await res.text().catch(() => "")
          throw new HTTPException(res.status as any, {
            message: `Failed to refund Routstr balance (${res.status}): ${txt || res.statusText}`,
          })
        }

        return c.json(await res.json())
      },
    ),
)

