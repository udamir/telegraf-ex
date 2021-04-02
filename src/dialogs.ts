import { MessageSubTypes, ExtraReplyMessage, User, InlineKeyboardButton } from "telegraf/typings/telegram-types"
import { Composer, Middleware, Context } from "telegraf"

import { LocalStateManager, StateManager, IChatState } from "./state"
import { ContextExtantion, IExtantionOptions } from "."
import { InlineKeyboard, InlineKeyboardItem } from "./extra/markup"

export interface INextPhaseData {
  phase: string,
  params?: { [ key: string]: any }
}

export interface INextPhaseCallBack {
  [ id: string ]: INextPhaseData | undefined,
  _default?: INextPhaseData,
}

export interface INextPhaseMessage {
  [ type: string ]: INextPhaseData,
}

export interface INextPhase {
  callback?: INextPhaseCallBack
  message?: INextPhaseMessage
}

export type INextHandler = (message: DialogMessage, params?: { [key: string]: any }) => void

export interface IDialogState extends IChatState {
  messageId?: number
  user: User
  name: string
  next: INextPhase
}

export interface IDialogContext<T extends IDialogState> extends Context {
  $dialogs: Dialogs<T>
}

export type IDialogPhaseHandler<T extends IDialogState> = (ctx: IDialogContext<T>, next?: INextHandler, state?: T | null) => void

export type DialogContext = IDialogContext<IDialogState>

export interface IMessageHandler {
  userId: number,
  messageType: MessageSubTypes[]
  nextPhase: string
}

export interface ICalbackHandler {
  userId: number
  messageId: number
  nextPhase: string
}

export interface IDialogMessageData {
  text: string
  extra?: ExtraReplyMessage
  params?: { [key: string]: any }
  next: INextPhase
}

export interface IDialogMessageDataParams {
  text: string
  extra?: ExtraReplyMessage
  params?: { [key: string]: any }
  inlineKeyboard?: InlineKeyboardItem[]
}

export class DialogMessage {

  public static inlineKeyboardItem(button: InlineKeyboardButton, ...options: any[]): InlineKeyboardItem {
    let numInRow = 1
    let params = {}
    for (const option of options) {
      if (typeof option === "number") {
        numInRow = option
      } else if (typeof option === "object") {
        params = option
      }
    }

    return { button, numInRow, params, group: "" }
  }

  public static inlineButton(text: string, callback_data?: string, url?: string): InlineKeyboardButton {
    return { text, callback_data, url }
  }

  public data: IDialogMessageData

  constructor(data?: IDialogMessageDataParams) {
    data = data || {} as IDialogMessageDataParams
    this.data = {
      text: data.text || "",
      extra: data.extra || {},
      params: data.params || {},
      next: {},
    }
    if (data.extra && data.extra.reply_markup && "inline_keyboard" in data.extra.reply_markup) {
      this.data.next.callback = {}
    }
    if (data.inlineKeyboard) {
      this.inlineKeyboard(data.inlineKeyboard)
    }
  }

  public inlineKeyboard(inlineKeyboardItems: InlineKeyboardItem[]) {
    const callback = this.data.next.callback || {}
    const inlineKeyboard = new InlineKeyboard()
    inlineKeyboardItems.forEach(({ button, numInRow, params }) => {
      const id = Math.random().toString(36).substr(3, 10)
      callback[id] = { phase: button.callback_data || "", params }
      button.callback_data = id
      inlineKeyboard.item(button, "", numInRow)
    })
    this.data.extra = this.data.extra || {}
    this.data.extra.reply_markup = { inline_keyboard: inlineKeyboard.end() }
    this.data.next.callback = callback
    return this
  }

  public text(text: string | (() => string), extra?: ExtraReplyMessage) {
    if (typeof text === "function") {
      text = text()
    }
    this.data.text = text
    this.data.extra = extra
    if (extra && extra.reply_markup && "inline_keyboard" in extra.reply_markup) {
      this.data.next = { callback: {} }
    }
    return this
  }

  public inlineKeyboardButtons(buttons: InlineKeyboardButton[][]) {
    this.data.extra!.reply_markup = { inline_keyboard: buttons }
    this.data.next.callback = this.data.next.callback || {}
    return this
  }

  public params(params: { [key: string]: any } = {}) {
    this.data.params = { ...this.data.params, ...params }
    return this
  }

  public onMessage(type: MessageSubTypes | "any", phase: string, paramName?: string, timeout?: number) {
    const message = this.data.next.message
    timeout = timeout && timeout + Date.now()
    this.data.next.message = { ...message, [type]: { phase, params: { paramName, timeout } } }
    return this
  }

  public onCallback(phase = "", params?: any) {
    const callback = this.data.next.callback
    this.data.next.callback = { ...callback, _default: { phase, params } }
    return this
  }
}

export interface IDialogsOptions<T extends IDialogState> extends IExtantionOptions {
  manager?: StateManager<T>
}

export class Dialogs<T extends IDialogState> extends ContextExtantion<IDialogContext<T>> {
  public dialogs: { [name: string]: Dialog<T> }
  public state: T | null = null
  public manager: StateManager<T> | LocalStateManager<T>

  constructor(dialogs?: Dialog<T>[], public options?: IDialogsOptions<T>) {
    super(options)
    options = options || {}
    this.name = options.name || "$dialogs"
    this.manager = options.manager || new LocalStateManager()
    this.dialogs = {}
    dialogs?.forEach((dialog: Dialog<T>) => this.dialogs[dialog.name] = dialog)
  }

  public middleware(): Middleware<IDialogContext<T>> {

    const middlewares = Object.keys(this.dialogs).map((name: string) => this.dialogs[name].middlewares)
    const dialogs = this
    return Composer.compose([(ctx, next) => {
      (ctx as any)[dialogs.name] = dialogs
      if (ctx.message) {
        return dialogs.handleMessages(ctx, next)
      } else if (ctx.callbackQuery) {
        return dialogs.handleCallbacks(ctx, next)
      } else {
        return next && next()
      }
    }, ...middlewares])
  }

  public async createDialog(ctx: IDialogContext<T>, name: string, user: User, params?: { [key: string]: any }) {
    user = user || ctx.message?.from || ctx.callbackQuery?.message?.from
    this.state = await this.manager.create({ chatId: ctx.chat!.id, user, name, params } as T)
    return this.state
  }

  public async findDialog(ctx: IDialogContext<T>, params: { [key: string]: any }) {
    this.state = await this.manager.findOne(ctx.chat!.id, params)
    return this.state
  }

  public async updateDialogParams(ctx: IDialogContext<T>, params?: { [key: string]: any }) {
    const { state } = ctx.$dialogs
    if (!state) { return }
    return this.manager.update(state.id, { params: { ...state.params, ...params }} )
  }

  public async updateState(ctx: IDialogContext<T>, dialogName: string, user?: User, params?: { [key: string]: any }) {
    const dialog = this.dialogs[dialogName]

    if (!dialog) {
      return this.error(`Cannot update dialog "${dialogName}": dialog not found!`)
    }

    // save user in dialog
    user = user || this.state && this.state.user || undefined

    if (!user) {
      return this.error(`Cannot update dialog "${dialogName}": user not found!`)
    }

    // find previos
    if (!this.state) {
      await this.findDialog(ctx, { "user.id": user.id })
    }

    // create new dialog
    if (!this.state) {
      return this.createDialog(ctx, dialogName, user, params)
    }

    // update dialog state
    const update = { name: dialogName, next: null, params }
    this.state = { ...this.state, ...update }
    return ctx.$dialogs.manager.update(this.state!.id, update)
  }

  public async enter(ctx: IDialogContext<T>, dialogName: string, user?: User, params?: { [key: string]: any }) {
    const dialog = this.dialogs[dialogName]
    if (!dialog) {
      return this.error(`Cannot update dialog "${dialogName}": dialog not found!`)
    }

    // update dialog state
    await this.updateState(ctx, dialogName, user || ctx.from, params)

    // execute on enter handler
    if (dialog.onEnterHandler) {
      return dialog.onEnterHandler(ctx, this.next(ctx), this.state)
    }
  }

  public async exit(ctx: IDialogContext<T>) {
    if (!this.state) {
      return this.error(`Cannot exit dialog: state not found!`)
    }

    const { name, id } = this.state

    // execute on exit handler
    const { onExitHandler } = this.dialogs[name]
    if (onExitHandler) {
      await onExitHandler(ctx, this.next(ctx), this.state)
    }

    this.state = null
    return this.manager.delete(id)
  }

  public async goto(ctx: IDialogContext<T>, dialogName: string, phase: string, user?: User, params?: { [key: string]: any }) {
    if (this.dialogs[dialogName]) {
      await this.updateState(ctx, dialogName, user, { ...params })
      this.dialogs[dialogName].execute(ctx, phase, { ...params })
    }
  }

  public async handleMessages(ctx: IDialogContext<T>, next: () => {}) {

    const dialog = await this.findDialog(ctx, { "user.id": ctx.message!.from!.id })
    if (!dialog || !dialog.next) {
      dialog && await this.exit(ctx)
      return next && next()
    }

    const messageTypes = dialog.next?.message && Object.keys(dialog.next.message) || []
    const messageType = messageTypes.find((type) => ctx.updateSubTypes.indexOf(type as MessageSubTypes) !== -1)
    const phaseData = messageType ? (dialog.next.message![messageType] || dialog.next.message!.any) : undefined

    const timeout = phaseData?.params?.timeout ? phaseData?.params?.timeout < Date.now() : false

    if (!phaseData || timeout) {
      return next && next()
    }

    if (phaseData!.params?.paramName && messageType) {
      dialog.params = { ...dialog.params, [phaseData.params.paramName]: (ctx.message as any)[messageType] }
    }

    // dialog.messageId = 0
    return this.goto(ctx, dialog.name, phaseData.phase, ctx.from, dialog.params)
  }

  public async handleCallbacks(ctx: IDialogContext<T>, next: () => {}) {
    const dialog = await this.findDialog(ctx, { messageId: ctx.callbackQuery!.message!.message_id })

    if (!dialog || (dialog.user.id !== ctx.callbackQuery!.from.id)) {
      return next && next()
    }

    if (!dialog.next || !dialog.next.callback) {
      return this.exit(ctx)
    }

    const { callback } = dialog.next
    const phaseData = callback[ctx.callbackQuery!.data!] || callback._default
    const nextPhase = phaseData ? phaseData.phase : ctx.callbackQuery!.data

    if (nextPhase) {
      dialog.params = { ...dialog.params, ...(phaseData && phaseData.params) }
      return this.goto(ctx, dialog.name, nextPhase, ctx.from, dialog.params)
    }

    return this.exit(ctx)
  }

  public next(ctx: IDialogContext<T>): INextHandler {
    const dialogs = this
    return (message?: DialogMessage, params?: { [key: string]: any}) => {
      if (message) {
        message.params(params)
        return dialogs.sendPhaseMessage(ctx, message)
      } else {
        // navigate
        if (params && params.dialog && !params.phase) {
          return dialogs.enter(ctx, params.dialog, dialogs.state!.user, params)
        } else if (params && params.phase) {
          const dialogName = params.dialog || dialogs.state!.name
          return dialogs.goto(ctx, dialogName, params.phase, dialogs.state!.user, params)
        } else {
          return dialogs.exit(ctx)
        }
      }
    }
  }

  public async sendPhaseMessage(ctx: IDialogContext<T>, phaseMessage: DialogMessage) {
    const { data } = phaseMessage
    const { state } = ctx.$dialogs

    const params = state ? { ...state.params, ...data.params } : { ...data.params }
    const messageId = state && state.messageId || 0

    const stateUpdate = {
      messageId,
      next: data.next,
      params,
    }

    if (ctx.callbackQuery?.message!.message_id === messageId) {
       // edit old message
       await ctx.editMessageText(data.text, data.extra)
       stateUpdate.messageId = ctx.callbackQuery.message.message_id
    } else {
      // delete old mssage and send new
      if (messageId) {
        ctx.telegram.deleteMessage(ctx.chat!.id, messageId).catch(this.warning)
      }
      const message = await ctx.reply(data.text, data.extra)
      stateUpdate.messageId = message.message_id
    }

    if (data.next && Object.keys(data.next).length) {
      this.manager.update(state!.id, stateUpdate)
    } else {
      this.manager.delete(state!.id)
    }
  }
}

export class Dialog<T extends IDialogState> {
  public handlers: { [name: string]: IDialogPhaseHandler<T> }
  public scenarios: { [name: string]: string[] }
  public middlewares: any
  public enterPhase: string

  public onEnterHandler?: IDialogPhaseHandler<T>
  public onExitHandler?: IDialogPhaseHandler<T>

  constructor(public name: string, enterPhase: string = "", ...fns: Array<Middleware<any>>) {
    this.enterPhase = enterPhase
    this.handlers = {}
    this.middlewares = Composer.compose(fns)
    this.scenarios = {}
  }

  public use(...fns: Array<Middleware<any>>) {
    this.middlewares = Composer.compose([this.middlewares, ...fns])
    return this
  }

  public phase(name: string, handler: IDialogPhaseHandler<T>) {
    this.handlers[name] = handler
  }

  public scenario(name: string, phases: string[]) {
    this.scenarios[name] = phases
    return this
  }

  public trigger(phase: string) {
    return (ctx: IDialogContext<T>) => this.execute(ctx, phase)
  }

  public onEnter(handler: IDialogPhaseHandler<T>) {
    this.onEnterHandler = handler
  }

  public onExit(handler: IDialogPhaseHandler<T>) {
    this.onExitHandler = handler
  }

  public async execute(ctx: IDialogContext<T>, phase: string, params?: { [key: string]: any }) {

    if (!this.handlers[phase]) {
      return ctx.$dialogs.error(`Cannot execute phase "${phase}": handler not found!`)
    }
    const { state } = ctx.$dialogs

    if (!state) {
      return ctx.$dialogs.error(`Cannot execute phase "${phase}": state not found!`)
    }

    if (this.name !== state.name) {
      const update = { name: this.name, next: null, params }
      ctx.$dialogs.state = { ...state, ...update }
      await ctx.$dialogs.manager.update(state.id, update)
    }

    return this.handlers[phase](ctx, ctx.$dialogs.next(ctx), { ...state, params: { ...state.params, ...params }})
  }
}
