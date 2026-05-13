declare module "qrcode-terminal" {
  type GenerateOptions = { small?: boolean };
  type GenerateCallback = (qr: string) => void;
  export function generate(text: string, options?: GenerateOptions, cb?: GenerateCallback): void;
  export function generate(text: string, cb: GenerateCallback): void;
  const _default: { generate: typeof generate };
  export default _default;
}
