import { Context, Middleware } from "telegraf"
import { ContextExtantion, IExtantionOptions } from "."

export interface IActionContext extends Context {
  _actions: { [key: string]: string }
}

export interface ICache {
  get: (key: string) => string
  set: (key: string, value: string) => void
  delete: (key: string) => void
}

export interface IActionsOptions extends IExtantionOptions {
  throttling?: number
  cache?: ICache
  parser?: (text: string) => { action: string, params: any }
}

class LocalCache implements ICache {
  private data: { [key: string]: string } = {}

  public get(key: string): string {
    return this.data[key]
  }

  public set(key: string, value: string) {
    this.data[key] = value
  }

  public delete(key: string) {
    delete this.data[key]
  }
}

export class Actions extends ContextExtantion<IActionContext> {
  public throttling: number
  public params: any
  public parser: (text: string) => { action: string, params: any }
  private cache: ICache

  constructor(options?: IActionsOptions) {
    super(options)
    options = options || {}
    this.name = options.name || "_actions"
    this.params = {}
    this.cache = options.cache || new LocalCache()
    this.parser = options.parser
    this.throttling = options.throttling
  }

  public middleware(): Middleware<any> {
    const actions = this
    return (ctx, next) => {
      if (ctx.callbackQuery && ctx.callbackQuery.data) {
        if (actions.throttling) {
          const key = ctx.chat.id + ":" + ctx.from.id
          if (actions.cache.get(key) !== ctx.callbackQuery.data) {
            actions.cache.set(key, ctx.callbackQuery.data)
            setTimeout(() => actions.cache.delete(key), actions.throttling)
          } else {
            next = null
          }
        }
        if (next && actions.parser) {
          const actionData = this.parser(ctx.callbackQuery.data)
          if (actionData) {
            ctx.callbackQuery.data = actionData.action
            ctx[actions.name] = actionData.params
          }
        }
      }
      next && next()
    }
  }
}
