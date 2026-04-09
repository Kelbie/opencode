declare module "@opentui/solid/scripts/solid-plugin" {
  const plugin: {
    name: string
    setup: (build: unknown) => void
  }
  export default plugin
}
