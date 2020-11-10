import { Context, Middleware, Composer } from "telegraf"
import { User } from "telegraf/typings/telegram-types"

import { LocalStateManager, StateManager, IChatState } from "./state"
import { ContextExtantion, IExtantionOptions } from "."

export interface IPollState extends IChatState {
  messageId?: number
  user: User
  name: string
  data: { [key: string]: any }
}

export interface IPollContext<T extends IPollState> extends Context {
  _polls: Polls<T>
}

export type PollMiddleware<T extends IPollState> = Middleware<IPollContext<T>>
export type PollContext = IPollContext<IPollState>

export interface IPollsOptions<T extends IPollState> extends IExtantionOptions {
  manager?: StateManager<T>
}

export class Polls<T extends IPollState> extends ContextExtantion<IPollContext<T>> {
  public polls: { [name: string]: Poll<T> }
  public state: T = null
  public manager: StateManager<T>

  constructor(polls?: Array<Poll<T>>, options?: IPollsOptions<T>) {
    super(options)
    options = options || {}
    this.name = options.name || "_polls"
    this.manager = options.manager || new LocalStateManager<T>()
    this.polls = {}
    polls.forEach((poll: Poll<T>) => this.polls[poll.name] = poll)
  }

  public middleware(): Middleware<IPollContext<T>> {

    const middlewares = Object.keys(this.polls).map((name: string) => this.polls[name].middleware)
    const polls = this
    return Composer.compose([(ctx, next) => {
      ctx[polls.name] = polls
      if (ctx.callbackQuery) {
        return polls.handleCallbacks(ctx, next)
      } else {
        next && next()
      }
    }, ...middlewares])
  }

  public async start(ctx: IPollContext<T>, pollName: string, user?: User, data?: any) {
    const poll = this.polls[pollName]

    if (!poll) {
      return this.error(`Cannot show poll "${pollName}": poll not found!`)
    }

    if (!poll.onShowHandler) {
      return this.error(`Cannot show poll "${pollName}": show handler not found!`)
    }

    await this.createPoll(ctx, pollName, user || ctx.from, data)
    return poll.onShowHandler(ctx)
  }

  public async stop(ctx: IPollContext<T>, pollId?: string) {

    if (pollId) {
      await this.findPoll(ctx, { id: pollId })
    }

    if (!this.state) {
      return this.error(`Cannot stop poll: state not found!`)
    }

    const poll = this.polls[this.state.name]
    if (poll && poll.onStopHandler) {
      poll.onStopHandler(ctx)
    }

    return this.manager.delete(this.state.id)
  }

  public async show(ctx: IPollContext<T>, pollName: string, pollId?: string) {
    const poll = this.polls[pollName]

    if (!poll) {
      return this.error(`Cannot show poll "${pollName}": poll not found!`)
    }

    if (!poll.onShowHandler) {
      return this.error(`Cannot show poll "${pollName}": show handler not found!`)
    }

    if (pollId) {
      await this.manager.findOne(ctx.chat.id, pollId)
    }

    if (!this.state) {
      return this.error(`Cannot show poll "${pollName}": state not found!`)
    }

    return poll.onShowHandler(ctx)
  }

  public async findPoll(ctx: IPollContext<T>, params: { [key: string]: any }) {
    this.state = await this.manager.findOne(ctx.chat.id, params)
    return this.state
  }

  public async createPoll(ctx: IPollContext<T>, name: string, user?: User, data?: any) {
    user = user || ctx.message && ctx.message.from
                || ctx.callbackQuery && ctx.callbackQuery.message.from
    this.state = await this.manager.create({ chatId: ctx.chat.id, user, name, data } as T)
    return this.state
  }

  public async execute(ctx: IPollContext<T>, action: string, pollId?: string) {
    if (pollId) {
      await this.findPoll(ctx, { id: pollId })
    }

    if (!this.state) {
      return this.error(`Cannot execute action "${action}": state not found!`)
    }

    if (!this.polls[this.state.name]) {
      return this.error(`Cannot execute action "${action}": poll ${this.state.name} not found!`)
    }

    return this.polls[this.state.name].execute(ctx, action)
  }

  public async handleCallbacks(ctx: IPollContext<T>, next: () => {}) {

    if (await this.findPoll(ctx, { messageId: ctx.callbackQuery.message.message_id })) {
      this.execute(ctx, ctx.callbackQuery.data)
    } else {
      next && next()
    }
  }

  public async sendPollMessage(ctx: IPollContext<T>, text: string, extra: any) {

    if (!this.state) {
      return this.error(`Cannot update poll: state not found!`)
    }

    if (this.state.messageId) {
      ctx.telegram.deleteMessage(ctx.chat.id, this.state.messageId).catch(console.log)
    }

    const message = await ctx.reply(text, extra)
    return this.update(ctx, { messageId: message.message_id }, false)
  }

  public async update(ctx: IPollContext<T>, payload: { [key: string]: any }, show = true) {

    if (!this.state) {
      return this.error(`Cannot update poll: state not found!`)
    }

    await this.manager.update(this.state.id, payload )
    this.state = { ...this.state, ...payload }

    if (show) {
      return this.show(ctx, this.state.name)
    }
  }
}

export interface IActionHandler<T extends IPollState> {
  (ctx: IPollContext<T>)
}

export interface IActionHandlers<T extends IPollState> {
  [name: string]: IActionHandler<T>
}

export class Poll<T extends IPollState> {
  public actions: IActionHandlers<T>
  public middleware: any

  public onShowHandler: IActionHandler<T>
  public onStopHandler: IActionHandler<T>

  constructor(public name: string, ...fns: Array<PollMiddleware<T>>) {
    this.actions = {}
    this.middleware = Composer.compose(fns)
  }

  public use(...fns: Array<PollMiddleware<T>>) {
    this.middleware = Composer.compose([this.middleware, ...fns])
    return this
  }

  public action(name: string, handler: IActionHandler<T>) {
    this.actions[name] = handler
  }

  public onShow(handler: IActionHandler<T>) {
    this.onShowHandler = handler
  }

  public onStop(handler: IActionHandler<T>) {
    this.onStopHandler = handler
  }

  public async execute(ctx: IPollContext<T>, action: string) {

    if (!this.actions[action]) {
      ctx._polls.error(`Cannot execute action "${action}": action not found!`)
    }

    const { state } = ctx._polls
    if (!state) {
      ctx._polls.error(`Cannot execute action "${action}": state not found!`)
    }

    if (this.name !== state.name) {
      ctx._polls.error(`Cannot execute action "${action}": wrong state!`)
    }

    return this.actions[action](ctx)
  }
}
