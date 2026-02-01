import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { createSignal, onMount, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useSDK } from "@tui/context/sdk"
import { useDialog } from "@tui/ui/dialog"
import { Clipboard } from "@tui/util/clipboard"
import { useToast } from "@tui/ui/toast"
import { DialogRoutstrWallet } from "./dialog-routstr-wallet"

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

export function DialogRoutstrWithdraw() {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()

  const [token, setToken] = createSignal<string | undefined>()
  const [loading, setLoading] = createSignal(true)

  const copy = async () => {
    const value = token()
    if (!value) return
    await Clipboard.copy(value)
      .then(() => toast.show({ variant: "info", message: "Copied to clipboard" }))
      .catch(toast.error)
  }

  useKeyboard((evt) => {
    if (evt.name === "c" && !evt.ctrl && !evt.meta) {
      copy()
    }
  })

  onMount(async () => {
    setLoading(true)
    const result = await sdk.client.routstr.balance.refund()
    if (result.error) {
      setLoading(false)
      toast.show({ variant: "error", message: message(result.error) })
      dialog.replace(() => <DialogRoutstrWallet />)
      return
    }
    const value = (result.data as any)?.token
    if (typeof value === "string") {
      setToken(value)
    }
    setLoading(false)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Routstr Withdraw (Refund)
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <text fg={theme.textMuted}>
        This refunds your remaining Routstr balance as a Cashu token.
      </text>

      <Show when={loading()}>
        <text fg={theme.textMuted}>Processing…</text>
      </Show>

      <Show when={!loading() && token()}>
        <text fg={theme.textMuted}>Cashu token:</text>
        <text fg={theme.text} wrapMode="word">
          {token()}
        </text>
        <text fg={theme.text}>
          c <span style={{ fg: theme.textMuted }}>copy</span>
        </text>
      </Show>

      <box paddingTop={1} flexDirection="row" gap={2}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => copy()}>
          <text fg={theme.selectedListItemText}>copy</text>
        </box>
        <box
          paddingLeft={3}
          paddingRight={3}
          backgroundColor={theme.backgroundPanel}
          borderColor={theme.border}
          border={["left", "right"]}
          onMouseUp={() => dialog.replace(() => <DialogRoutstrWallet />)}
        >
          <text fg={theme.text}>back</text>
        </box>
      </box>
    </box>
  )
}

