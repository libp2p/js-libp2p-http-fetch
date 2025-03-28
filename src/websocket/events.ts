export class ErrorEvent extends Event {
  public readonly message: string
  public readonly error: Error
  public readonly filename = ''
  public readonly lineno = 0
  public readonly colno = 0

  constructor (err: Error) {
    super('error')
    this.error = err
    this.message = err.message
  }
}
