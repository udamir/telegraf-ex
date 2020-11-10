
// ==== async createUsersListReplyMarkup =====================

export interface IPaginationParams {
  page?: number
  itemsPerPage?: number
  cyrcle?: boolean
}

export class PaginationList<T> {
  public pages: number
  public page: number
  public cycle: boolean
  public itemsPerPage: number

  constructor(public items: T[], public params?: IPaginationParams) {
    this.itemsPerPage = params && params.itemsPerPage || Number(process.env.ITEMS_PER_PAGE || 5)
    this.cycle = params && params.cyrcle || true
    this.page = params && params.page || 1
    this.pages = Math.trunc((items.length - 1) / this.itemsPerPage) + 1
    this.setPage(this.page)
  }

  public getPageList(): T[] {
    const start = (this.page - 1) * this.itemsPerPage
    return this.items.filter((item, index) => index >= start && index < this.items.length && index < start + this.itemsPerPage)
  }

  public isFirst(): boolean {
    return this.page === 1
  }

  public isLast(): boolean {
    return this.page === this.pages
  }

  public setPage(page: number): number {
    if (this.cycle) {
      this.page = (page < 1) ? this.pages : (page > this.pages) ? 1 : page
    } else {
      this.page = (page < 1) ? 1 : (page > this.pages) ? this.pages : page
    }
    return this.page
  }

  public currentPage(): string {
    return this.page + " / " + this.pages
  }

}
