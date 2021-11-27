import { Context } from "telegraf"

import { ContextExtantion, IExtantionOptions } from "."

export interface IParserContext extends Context {
  _parser: CommandParser
}

interface IParserSchema {
  schema: ParseSchema
  controller: string
  result?: any[]
}

export interface IParseSchemaStep {
  type: string
  params: any
}

export class ParseSchema {
  public steps: IParseSchemaStep[]

  constructor() {
    this.steps = []
  }

  public addItem(type: string, params: any) {
    this.steps.push({ type, params })
    return this
  }

  public prefix(text: string, optional = false) {
    return this.addItem("prefix", { text, optional })
  }

  public number(name: string, optional = false) {
    return this.addItem("number", { name, optional })
  }

  public text(name: string, optional = false) {
    return this.addItem("text", { name, optional })
  }

  public date(name: string, optional = false) {
    return this.addItem("date", { name, optional })
  }
}

export class CommandParser extends ContextExtantion<any> {
  public schemas: IParserSchema[]
  public items: { [name: string]: (ctx: IParserContext) => {} }
  public parser: any
  public params: any

  constructor(options?: IExtantionOptions) {
    super(options)
    this.name = options && options.name || "_parser"
    this.items = {}
    this.params = {}
    this.schemas = []
  }

  public schema(schema: ParseSchema, controller: string) {
    this.schemas.push({ schema, controller })
    return this
  }

  public controller(name: string, handler: (ctx: IParserContext) => {}) {
    this.items[name] = handler
    return this
  }

  public execute(command: string, ctx: IParserContext, params?: any) {
    const data = this.parse(command)
    if (data && data.result && this.items[data.controller]) {
      params = { ...params }
      for (let i = 0; i < data.schema.steps.length; i++) {
        const step = data.schema.steps[i]
        if (step.params.name) {
          params[step.params.name] = data.result[i]
        }
      }
      this.run(data.controller, ctx, params)
    }
  }

  public async run(controllerName: string, ctx: IParserContext, params?: { [key: string]: any }) {
    this.params = { ...this.params, ...params }
    if (!this.items[controllerName]) {
      return this.error(`Controller "${controllerName}" - not found!`)
    }
    this.items[controllerName](ctx)
    this.params = {}
  }

  public middleware() {
    const parser = this
    return (ctx: IParserContext, next: () => {}) => {
      (ctx as any)[parser.name] = parser
      if (ctx.message && "text" in ctx.message) {
        parser.execute(ctx.message.text, ctx)
      }
      next()
    }
  }

  public parse(text: string): IParserSchema | null {

    for (const { schema, controller } of this.schemas) {
      try {
        const result = this.parseStep(text, 0, schema, 0)
        return { schema, controller, result }
      } catch (error) {
        return null
      }
    }
    return null
  }

  public parseStep(text: string, index: number, schema: ParseSchema, step: number): any[] {
    const oldIndex = index
    const stepSchema = schema.steps[step]
    if (!stepSchema || stepSchema.type !== "prefix" || stepSchema.params.text[0] !== " ") {
      // skip spaces
      while (text.indexOf(" ", index) === index) {
        index++
      }
    }
    // next space index
    const nextSpace = text.indexOf(" ", index)

    if (!stepSchema) {
      if (index >= text.length) {
        return []
      }
      throw new Error("Cannot parse")
    } else if (stepSchema.type === "text") {
      let wordEnd = nextSpace > 0 && step < schema.steps.length - 1 ? nextSpace : text.length
      let word = text.substring(index, wordEnd)
      while (wordEnd < text.length && !this.parseStep(text, wordEnd + 1, schema, step + 1)) {
        wordEnd = text.indexOf(" ", wordEnd + 1)
        word = text.substring(index, wordEnd)
      }
      return [word, ...this.parseStep(text, index + word.length + 1, schema, step + 1)]
    } else if (stepSchema.type === "number") {
      const num = text.substring(index, nextSpace > 0 ? nextSpace : text.length)
      if (!isNaN(num as any * 1) && num !== "") {
        return [Number(num), ...this.parseStep(text, index + num.length, schema, step + 1)]
      } else if (stepSchema.params.optional) {
        return [, ...this.parseStep(text, oldIndex, schema, step + 1)]
      } else {
        throw new Error("Cannot parse")
      }
    } else if (stepSchema.type === "prefix") {
      const prefix = stepSchema.params.text
      const prefixEnd = index + prefix.length
      if (stepSchema.params.text === text.substring(index, prefixEnd)) {
        return [, ...this.parseStep(text, prefixEnd, schema, step + 1)]
      } else if (stepSchema.params.optional) {
        return [, ...this.parseStep(text, oldIndex, schema, step + 1)]
      } else {
        throw new Error("Cannot parse")
      }
    }
    throw new Error("Cannot parse")
  }
}
