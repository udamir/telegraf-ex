import { Schema, Model, Types, Document, model, SchemaDefinition, SchemaOptions } from "mongoose"

import { StateManager, IChatState } from "./state"
import { IDialogState } from "./dialogs"
import { IPollState } from "./polls"

export const StateSchema = new Schema<IChatState>({
  id: String,
  chatId: Number,
  params: Object,
})

export const createStateSchema = <T extends Document>(definition: SchemaDefinition, options?: SchemaOptions) => {
  options = {
    toObject: {
      transform(doc, ret) {
        const { _id, __v, ...rest } = ret
        return { id: doc.id, ...rest }
      },
    },
    ...options,
  }
  return new Schema<T>(Object.assign({}, StateSchema.obj, definition), options)
}

export interface IPoll extends IPollState, Document {
  id: string
}

const PollStateSchema = createStateSchema<IPoll>({
  user: Object,
  messageId: Number,
  name: String,
  data: Object,
})

export interface IDialog extends IDialogState, Document {
  id: string
}

const DialogStateSchema = createStateSchema<IDialog>({
  user: Object,
  userName: String,
  messageId: Number,
  name: String,
  next: Object,
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
    const data = this.stateModel && await this.stateModel.findOne({ chatId, ...params }).exec()
    return data ? data.toObject({ versionKey: false }) : null
  }

  public async findMany( params?: any): Promise<T[]> {
    const data = this.stateModel && await this.stateModel.find({ ...params }).exec() || []
    return data.map((items) => items.toObject({ versionKey: false }))
  }

  public async getOne(id: string) {
    const data = this.stateModel && await this.stateModel.findOne({ id } as any).exec()
    return data ? data.toObject({ versionKey: false }) : null
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
