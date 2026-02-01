const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

export const ROUTSTR_BTC_USD = 78_000
export const MSAT_PER_BTC = 100_000_000_000

export function msatToUsd(msat: number) {
  return (msat / MSAT_PER_BTC) * ROUTSTR_BTC_USD
}

export function formatUsdCeilFromMsat(msat: number) {
  const usd = msatToUsd(msat)
  const rounded = Math.ceil(usd * 100) / 100
  const min = rounded > 0 && rounded < 0.01 ? 0.01 : rounded
  return USD.format(min)
}

export function formatMsat(msat: number) {
  const usd = msatToUsd(msat)
  const approx = usd > 0 && usd < 0.01 ? "<$0.01" : USD.format(usd)
  return `${msat} msat (~${approx})`
}
