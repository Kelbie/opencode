import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useSDK } from "@tui/context/sdk"
import { useToast } from "@tui/ui/toast"
import { DialogAlert } from "@tui/ui/dialog-alert"
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

export function DialogRoutstrDeposit() {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()

  return (
    <DialogSelect
      title="Routstr Top Up"
      placeholder="Method"
      skipFilter
      options={[
        {
          title: "Cashu token",
          value: "cashu",
          onSelect: () => {
            dialog.replace(() => (
              <DialogPrompt
                title="Paste Cashu token"
                placeholder="cashuA..."
                onConfirm={async (value) => {
                  if (!value) return
                  const result = await sdk.client.routstr.balance.topup({
                    cashu_token: value.trim(),
                  })
                  if (result.error) return toast.show({ variant: "error", message: message(result.error) })
                  toast.show({ variant: "info", message: "Top up complete" })
                  dialog.replace(() => <DialogRoutstrWallet />)
                }}
              />
            ))
          },
        },
        {
          title: "Lightning invoice",
          value: "lightning",
          onSelect: async () => {
            await DialogAlert.show(
              dialog,
              "Not implemented",
              "Lightning deposits require mint interaction to produce a Cashu token. For now, top up by pasting a Cashu token.",
            )
            dialog.replace(() => <DialogRoutstrDeposit />)
          },
        },
        {
          title: "Back",
          value: "back",
          onSelect: () => dialog.replace(() => <DialogRoutstrWallet />),
        },
      ]}
    />
  )
}

