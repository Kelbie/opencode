import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { createMemo, createSignal, onMount } from "solid-js"
import { useToast } from "@tui/ui/toast"
import { DialogRoutstrDeposit } from "./dialog-routstr-deposit"
import { DialogRoutstrWithdraw } from "./dialog-routstr-withdraw"
import { DialogPrompt } from "@tui/ui/dialog-prompt"

function message(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const anyErr = err as any
    const msg = anyErr?.data?.message
    if (typeof msg === "string") return msg
  }
  return "An unknown error has occurred"
}

function formatBalance(data: any) {
  const balance = typeof data?.balance === "number" ? data.balance : undefined
  const currency = typeof data?.currency === "string" ? data.currency : undefined
  if (balance === undefined) return "Balance: —"

  if (currency === "msat") {
    const sats = balance / 1000
    return `Balance: ${balance} msat (${sats} sats)`
  }

  return `Balance: ${balance} ${currency ?? "sat"}`
}

export function DialogRoutstrWallet() {
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()

  const [loading, setLoading] = createSignal(true)
  const [info, setInfo] = createSignal<any>()

  const refresh = async () => {
    setLoading(true)
    const result = await sdk.client.routstr.balance.info()
    if (result.error) {
      setLoading(false)
      toast.show({ variant: "error", message: message(result.error) })
      return
    }
    setInfo(result.data)
    setLoading(false)
  }

  onMount(() => {
    refresh()
  })

  const replaceKey = () => {
    dialog.replace(() => (
      <DialogPrompt
        title="Set Routstr key"
        placeholder="cashuA... or sk-..."
        onConfirm={async (value) => {
          if (!value) return
          const trimmed = value.trim()
          if (!trimmed) return

          if (trimmed.startsWith("cashuA") || trimmed.startsWith("cashuB")) {
            const result = await sdk.client.routstr.balance.create({
              initial_balance_token: trimmed,
            })
            if (result.error) {
              toast.show({ variant: "error", message: message(result.error) })
              return
            }
            const apiKey = (result.data as any)?.api_key
            if (!apiKey || typeof apiKey !== "string") {
              toast.show({ variant: "error", message: "Routstr did not return a balance key" })
              return
            }
            await sdk.client.auth.set({
              providerID: "routstr",
              auth: {
                type: "api",
                key: apiKey,
              },
            })
            await sdk.client.instance.dispose()
            await sync.bootstrap()
            dialog.replace(() => <DialogRoutstrWallet />)
            return
          }

          await sdk.client.auth.set({
            providerID: "routstr",
            auth: {
              type: "api",
              key: trimmed,
            },
          })
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          dialog.replace(() => <DialogRoutstrWallet />)
        }}
      />
    ))
  }

  const title = createMemo(() => {
    if (loading()) return "Routstr Wallet"
    return `Routstr Wallet — ${formatBalance(info())}`
  })

  return (
    <DialogSelect
      title={loading() ? "Routstr Wallet — Loading…" : title()}
      placeholder="Action"
      skipFilter
      options={[
        {
          title: "Top up",
          value: "topup",
          onSelect: () => dialog.replace(() => <DialogRoutstrDeposit />),
        },
        {
          title: "Replace key",
          value: "replace-key",
          onSelect: () => replaceKey(),
        },
        {
          title: "Withdraw (refund)",
          value: "refund",
          onSelect: () => dialog.replace(() => <DialogRoutstrWithdraw />),
        },
        {
          title: "Refresh",
          value: "refresh",
          onSelect: () => refresh(),
        },
        {
          title: "Close",
          value: "close",
          onSelect: () => dialog.clear(),
        },
      ]}
    />
  )
}

