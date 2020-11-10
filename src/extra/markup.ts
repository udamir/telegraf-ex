
// ineKeyboard exapmle:
// const inline_keyboard = new InlineKeyboard()
//   .item({ text: "", callback_data: " "}, "", 1)
//   .item(inlineButton("text", "action"), "A", 2)
//   .item(actionButton("text", "action", { param: 1 }))
//   .nextRow()
//   .items([
//     { button: { text: "", callback_data: ""}, group: "A", numInRow: 2 },
//     inlineKeyboardItem ({ text: "", callback_data: ""}, "A", 2),
//   ])
//   .end("A")
//
// const reply_markup = new InlineKeyboard()
//   .item({ text: "", callback_data: " "}, "B", 1)
//   .item(actionButton("text", "action", { param: 1 }))
//   .markup("B")

export interface IActionData {
  action: string,
  params: any
}

export const setActionData = (action: string, params?: any): string => {
  let callback_data = action
  Object.keys(params || {}).forEach((key) => {
    callback_data += "\x01" + key + ":" + params[key]
  })
  return callback_data.length + ":" + callback_data
}

export const getActionData = (callback_data: string): IActionData => {
  const len = callback_data.substring(0, callback_data.indexOf(":")) as any
  if (len && len * 1 === callback_data.length - len.length - 1) {
    const result = { action: "", params: {} }
    callback_data.split("\x01").forEach((param) => {
      const [key, value] = param.replace(/:+/, "\x01").split("\x01")
      if (key === len) {
        result.action = value
      } else {
        result.params[key] = value
      }
    })
    return result
  } else {
    return null
  }
}

export const actionButton = (text: string, action: string, params?): InlineKeyboardButton => {
  return { text, callback_data: setActionData(action, params) }
}

export const userActionButton = (userId: number, text: string, action: string, params?): InlineKeyboardButton => {
  return { text, callback_data: setActionData(action, { userId, ... params }) }
}

export const inlineButton = (text: string, callback_data?: string, url?: string): InlineKeyboardButton => {
  return { text, callback_data, url }
}

export const inlineKeyboardItem = (button: InlineKeyboardButton, group?: string, numInRow?: number) => {
  return { button, group, numInRow }
}

export interface InlineKeyboardButton {
  text: string
  url?: string
  callback_data?: string
  switch_inline_query?: string
  switch_inline_query_current_chat?: string
  callback_game?: object
  pay?: boolean
}

export interface InlineKeyboardItem {
  button: InlineKeyboardButton
  params?: { [ key: string ]: any }
  group?: string
  numInRow?: number
}

export class InlineKeyboard {
  public buttons: InlineKeyboardItem[][] = []

  public item(button: InlineKeyboardButton, group: string = "", numInRow: number = 1) {
    const lastRow = this.buttons.length || this.buttons.push([])
    let rowSize = 0
    this.buttons[lastRow - 1].map((item) => rowSize += 1 / item.numInRow)
    if (rowSize + 1 / numInRow > 1) {
      this.buttons.push([{ group, button, numInRow }])
    } else {
      this.buttons[lastRow - 1].push({ group, button, numInRow })
    }
    return this
  }

  public nextRow() {
    this.buttons.push([])
    return this
  }

  public items(buttons: InlineKeyboardItem[], group?: string, numInRow?: number) {
    buttons.forEach((item) => this.item(item.button, item.group || group, item.numInRow || numInRow || 1))
    return this
  }

  public end(group?: string[] | string): InlineKeyboardButton[][] {
    const groups = Array.isArray(group) ? group : [ group ]
    const inline_keyboard: InlineKeyboardButton[][] = []
    this.buttons.forEach((rows) => {
      const row = []
      rows.forEach((item) => {
        if (!item.group || !groups || !groups.length || groups.findIndex((g) => g === item.group ) >= 0) {
          row.push(item.button)
        }
      })
      if (row.length) {
        inline_keyboard.push(row)
      }
    })
    return inline_keyboard
  }

  public markup(group?: string[] | string) {
    return { reply_markup: { inline_keyboard: this.end(group) }}
  }
}
