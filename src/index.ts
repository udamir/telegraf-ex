import { Middleware, Composer, Context } from "telegraf"

export interface IExtantionOptions {
  name?: string
  onError?: (error: any) => void
  onWarning?: (warning: any) => void
}

export abstract class ContextExtantion<T extends Context> {
  public name: string
  public error: (error: any) => void
  public warning: (warning: any) => void

  constructor(options?: IExtantionOptions) {
    options = options || {}
    this.name = options.name || ""
    this.error = options.onError || ((error) => { throw new Error (error) })
    this.warning = options.onWarning || ((warning) => { console.log(warning) })
  }

  public abstract middleware(): Middleware<T>
}

export const extantions = (ext: Array<ContextExtantion<any>>) => {

  const contextSetup = (ctx: Context, next: () => {}) => {
    ext.forEach((x) => x.name && (ctx[x.name] = x))
    next && next()
  }

  const middlewares = ext.map((x) => x.middleware())
  return Composer.compose([contextSetup, ...middlewares])
}
