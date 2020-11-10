import { Schema, Model, Types, Document, model } from "mongoose"

import { StateManager, IChatState } from "./state"
import { IDialogState } from "./dialogs"
import { IPollState } from "./polls"

export interface IPoll extends IPollState, Document {
  id: string
}

const PollStateSchema = new Schema<IPoll>({
  id: String,
  chatId: Number,
  user: Object,
  messageId: Number,
  name: String,
  data: Object,
  params: Object,
})

export interface IDialog extends IDialogState, Document {
  id: string
}

const DialogStateSchema = new Schema<IDialog>({
  id: String,
  chatId: Number,
  user: Object,
  userName: String,
  messageId: Number,
  name: String,
  next: Object,
  params: Object,
})

export const PollModel = model<IPoll>("poll", PollStateSchema)
export const DialogModel = model<IDialog>("dialog", DialogStateSchema)

export interface IChatStateSchema extends IChatState, Document {
  id: string
}

export class MongoStateManager<S extends IChatStateSchema, T extends IChatState> extends StateManager<T> {

  constructor(public stateModel: Model<S>) {
    super()
    if (!stateModel) {
      console.log("State Model is not defined")
    }
  }

  public async create(state: T): Promise<T> {
    state.id = Types.ObjectId().toHexString()
    return (await new this.stateModel(state).save()).toObject({ versionKey: false })
  }

  public async findOne(chatId: number, params?: any): Promise<T> {
    const poll = this.stateModel && await this.stateModel.findOne({ chatId, ...params }).exec()
    return poll ? poll.toObject({ versionKey: false }) : null
  }

  public async findMany( params?: any): Promise<T[]> {
    const data = this.stateModel && await this.stateModel.find({ ...params }).exec() || []
    return data.map((items) => items.toObject({ versionKey: false }))
  }

  public async getOne(id: string) {
    const poll = this.stateModel && await this.stateModel.findOne({ id } as any).exec()
    return poll ? poll.toObject({ versionKey: false }) : null
  }

  public async update(id: string, values: any) {
    if (this.stateModel) {
      await this.stateModel.updateOne({ id } as any, values).exec()
    }
  }

  public async delete(id: string) {
    if (this.stateModel) {
      await this.stateModel.deleteOne({ id } as any).exec()
    }
  }
}
