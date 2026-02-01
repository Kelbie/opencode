import { createEffect, createMemo, createSignal } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect, type DialogSelectRef } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { useKeybind } from "../context/keybind"
import * as fuzzysort from "fuzzysort"
import { useSDK } from "@tui/context/sdk"
import { formatUsdCeilFromMsat } from "@tui/util/routstr"

export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => x.id !== "opencode" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )
}

export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const keybind = useKeybind()
  const sdk = useSDK()
  const [ref, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [query, setQuery] = createSignal("")
  const [routstrBalanceMsat, setRoutstrBalanceMsat] = createSignal<number | undefined>()

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  createEffect(() => {
    if (!connected()) return
    if (props.providerID && props.providerID !== "routstr") return
    if (!sync.data.provider.some((x) => x.id === "routstr")) return

    sdk.client.routstr.balance
      .info()
      .then((res) => {
        if (res.error) return
        const balance = (res.data as any)?.balance
        const currency = (res.data as any)?.currency
        if (typeof balance !== "number") return
        if (currency === "msat") {
          setRoutstrBalanceMsat(balance)
          return
        }
        if (currency === "sat" || currency === "sats") {
          setRoutstrBalanceMsat(balance * 1000)
          return
        }
        // Routstr has historically returned msat balances; treat missing currency as msat.
        if (currency === undefined) {
          setRoutstrBalanceMsat(balance)
        }
      })
      .catch(() => {})
  })

  function footerForOpenCode(cost: { input?: number } | undefined) {
    return cost?.input === 0 ? "Free" : undefined
  }

  function footerForRoutstr(cost: { input?: number; output?: number } | undefined) {
    const input = typeof cost?.input === "number" ? cost.input : undefined
    const output = typeof cost?.output === "number" ? cost.output : undefined
    if (input === undefined || output === undefined) return
    const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    return `${USD.format(input)}/${USD.format(output)} /1M`
  }

  function routstrLimitMsat(info: any): number | undefined {
    const required = (info?.options as any)?.routstr?.min_msats
    if (typeof required !== "number" || required < 0) return
    return required
  }

  function routstrInsufficient(maxMsat: number | undefined): boolean {
    if (typeof maxMsat !== "number") return false
    const balance = routstrBalanceMsat()
    if (typeof balance !== "number") return false
    return balance < maxMsat
  }

  function routstrInsufficientFooter(maxMsat: number) {
    return `Insufficient balance (>${formatUsdCeilFromMsat(maxMsat)})`
  }

  const showExtra = createMemo(() => {
    if (!connected()) return false
    if (props.providerID) return false
    return true
  })

  const options = createMemo(() => {
    const q = query()
    const needle = q.trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = connected() ? local.model.favorite() : []
    const recents = local.model.recent()

    const recentList = showSections
      ? recents.filter(
          (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
        )
      : []

    const favoriteOptions = showSections
      ? favorites.flatMap((item) => {
          const provider = sync.data.provider.find((x) => x.id === item.providerID)
          if (!provider) return []
          const model = provider.models[item.modelID]
          if (!model) return []
          const maxMsat = provider.id === "routstr" ? routstrLimitMsat(model) : undefined
          const insufficient = provider.id === "routstr" ? routstrInsufficient(maxMsat) : false
          return [
            {
              key: item,
              value: {
                providerID: provider.id,
                modelID: model.id,
              },
              title: model.name ?? item.modelID,
              description: provider.name,
              category: "Favorites",
              disabled: insufficient || (provider.id === "opencode" && model.id.includes("-nano")),
              footer:
                provider.id === "routstr" && insufficient && maxMsat !== undefined
                  ? routstrInsufficientFooter(maxMsat)
                  : provider.id === "opencode"
                    ? footerForOpenCode(model.cost)
                    : undefined,
              onSelect: () => {
                dialog.clear()
                local.model.set(
                  {
                    providerID: provider.id,
                    modelID: model.id,
                  },
                  { recent: true },
                )
              },
            },
          ]
        })
      : []

    const recentOptions = showSections
      ? recentList.flatMap((item) => {
          const provider = sync.data.provider.find((x) => x.id === item.providerID)
          if (!provider) return []
          const model = provider.models[item.modelID]
          if (!model) return []
          const maxMsat = provider.id === "routstr" ? routstrLimitMsat(model) : undefined
          const insufficient = provider.id === "routstr" ? routstrInsufficient(maxMsat) : false
          return [
            {
              key: item,
              value: {
                providerID: provider.id,
                modelID: model.id,
              },
              title: model.name ?? item.modelID,
              description: provider.name,
              category: "Recent",
              disabled: insufficient || (provider.id === "opencode" && model.id.includes("-nano")),
              footer:
                provider.id === "routstr" && insufficient && maxMsat !== undefined
                  ? routstrInsufficientFooter(maxMsat)
                  : provider.id === "routstr"
                    ? footerForRoutstr(model.cost)
                  : provider.id === "opencode"
                    ? footerForOpenCode(model.cost)
                    : undefined,
              onSelect: () => {
                dialog.clear()
                local.model.set(
                  {
                    providerID: provider.id,
                    modelID: model.id,
                  },
                  { recent: true },
                )
              },
            },
          ]
        })
      : []

    const providerOptions = pipe(
      sync.data.provider,
      sortBy(
        (provider) => provider.id !== "opencode",
        (provider) => provider.name,
      ),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => (props.providerID ? info.providerID === props.providerID : true)),
          map(([model, info]) => {
            const value = {
              providerID: provider.id,
              modelID: model,
            }

            const maxMsat = provider.id === "routstr" ? routstrLimitMsat(info) : undefined
            const insufficient = provider.id === "routstr" ? routstrInsufficient(maxMsat) : false

            return {
              value,
              title: info.name ?? model,
              description: favorites.some(
                (item) => item.providerID === value.providerID && item.modelID === value.modelID,
              )
                ? "(Favorite)"
                : undefined,
              category: connected() ? provider.name : undefined,
              disabled: insufficient || (provider.id === "opencode" && model.includes("-nano")),
              footer:
                provider.id === "routstr" && insufficient && maxMsat !== undefined
                  ? routstrInsufficientFooter(maxMsat)
                  : provider.id === "routstr"
                    ? footerForRoutstr(info.cost)
                    : provider.id === "opencode"
                      ? footerForOpenCode(info.cost)
                      : undefined,
              onSelect() {
                dialog.clear()
                local.model.set(
                  {
                    providerID: provider.id,
                    modelID: model,
                  },
                  { recent: true },
                )
              },
            }
          }),
          filter((x) => {
            if (!showSections) return true
            const value = x.value
            const inFavorites = favorites.some(
              (item) => item.providerID === value.providerID && item.modelID === value.modelID,
            )
            if (inFavorites) return false
            const inRecents = recents.some(
              (item) => item.providerID === value.providerID && item.modelID === value.modelID,
            )
            if (inRecents) return false
            return true
          }),
          sortBy(
            (x) => x.footer !== "Free",
            (x) => x.title,
          ),
        ),
      ),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => {
            return {
              ...option,
              category: "Popular providers",
            }
          }),
          take(6),
        )
      : []

    // Search shows a single merged list (favorites inline)
    if (needle) {
      const filteredProviders = fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj)
      const filteredPopular = fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj)
      return [...filteredProviders, ...filteredPopular]
    }

    return [...favoriteOptions, ...recentOptions, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((x) => x.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    if (provider()) return provider()!.name
    return "Select model"
  })

  return (
    <DialogSelect
      keybind={[
        {
          keybind: keybind.all.model_provider_list?.[0],
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          keybind: keybind.all.model_favorite_toggle?.[0],
          title: "Favorite",
          disabled: !connected(),
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
      ]}
      ref={setRef}
      onFilter={setQuery}
      skipFilter={true}
      title={title()}
      current={local.model.current()}
      options={options()}
    />
  )
}
