import type { Hooks, PluginInput } from "@opencode-ai/plugin"

const ROUTSTR_BASE_URL = "https://api.routstr.com/v1"

export async function RoutstrAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "routstr",
      methods: [
        {
          type: "api",
          label: "Cashu Token or Session Key",
        },
      ],
      async loader(getAuth) {
        const info = await getAuth()
        if (!info || info.type !== "api") return {}
        return {
          apiKey: info.key,
          baseURL: ROUTSTR_BASE_URL,
        }
      },
    },
  }
}

