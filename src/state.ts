import { Context, Middleware, Composer } from "telegraf"
import { ContextExtantion, IExtantionOptions } from "."

export interface IChatState {
  id: string
  chatId: number
  params?: any
}

export abstract class StateManager<T extends IChatState>  {
  public abstract async create(state: T): Promise<T>
  public abstract async findOne(chatId: number, params?: any): Promise<T>
  public abstract async findMany(params?: any): Promise<T[]>
  public abstract async getOne(id: string): Promise<T>
  public abstract async update(id: string, values: any): Promise<void>
  public abstract async delete(id: string): Promise<void>
}

export interface IStateDataIndex {
  [id: string]: number
}

export class LocalStateManager<T extends IChatState> extends StateManager<T> {
  public stateData: T[]
  public stateDataIndex: IStateDataIndex
  public lastIndex = 0

  constructor() {
    super()
    this.stateData = []
    this.stateDataIndex = {}
  }

  public async create(state: T): Promise<T> {
    const id = "id" + this.lastIndex
    const index = this.stateData.push({ id, params: {}, ...state }) - 1
    this.stateDataIndex[id] = index
    return this.stateData[index]
  }

  public async findOne(chatId: number, params?: any): Promise<T> {
    return this.stateData.find((state: T) => this.compareParams(state, { ...params, chatId }))
  }

  public async findMany(params?: any): Promise<T[]> {
    return this.stateData.filter((state: T) => this.compareParams(state, { ...params }))
  }

  public async getOne(id: string) {
    const index = this.stateDataIndex[id]
    return index !== undefined ? this.stateData[index] : null
  }

  public async update(id: string, values: any) {
    const index = this.stateDataIndex[id]
    if (index !== undefined) {
      this.stateData[index] = { ...this.stateData[index], ...values }
    }
  }

  public async delete(id: string) {
    delete this.stateData[id]
  }

  private compareParams(data: any, values: any): boolean {
    for (const key of Object.keys(values)) {
      const path = key.split(".")
      let item = data
      for (const step of path) {
        if (Object.keys(item).includes(step)) {
          item = item[step]
        } else {
          return false
        }
      }
      if (item !== values[key]) {
        return false
      }
    }
    return true
  }
}

export interface IChatStateContext<T extends IChatState> extends Context {
  _chat: ChatState<T>
}

export interface IChatStateOptions<T extends IChatState> extends IExtantionOptions {
  manager?: StateManager<T>
}

export class ChatState<T extends IChatState> extends ContextExtantion<IChatStateContext<T>> {
  public state: T = null
  public middlewares: Middleware<any>
  public manager: StateManager<T>

  constructor(options: IChatStateOptions<T> = {}, ...fnc: Array<Middleware<any>>) {
    super(options)
    options = options || {}
    this.name = options.name || "_chat"
    this.manager = options.manager || new LocalStateManager<T>()
    this.middlewares = Composer.compose(fnc)
  }

  public middleware(params?: any): Middleware<IChatStateContext<T>> {
    const chat = this
    return Composer.compose([async (ctx, next) => {
      chat.state = await chat.manager.findOne(ctx.chat.id)
      if (!chat.state) {
        chat.state = await chat.manager.create({ chatId: ctx.chat.id, ...params })
      }
      ctx[chat.name] = chat
      next && next()
    }, chat.middlewares])
  }

  public async findState(chatId: number, params?: any) {
    this.state = await this.manager.findOne(chatId, params)
  }

  public async updateState(state: any) {
    this.manager.update(this.state.id, state)
    this.state = { ...this.state, ...state}
  }

  public async deleteState() {
    this.manager.delete(this.state.id)
  }
}
