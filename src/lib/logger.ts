import chalk from 'chalk'

export class Logger {
  static #instances: Map<string, Logger> = new Map()
  #name: string

  constructor(name: string) {
    this.#name = name
  }

  static #getInstance(name: string): Logger {
    if (!Logger.#instances.has(name))
      Logger.#instances.set(name, new Logger(name))
    return Logger.#instances.get(name)!
  }

  static init(name: string) {
    return this.#getInstance(name)
  }

  #logMessage(message: string, prefixNewLine: boolean, suffixNewLine: boolean) {
    const prefix = prefixNewLine ? '\n' : ''
    const suffix = suffixNewLine ? '\n' : ''
    console.log(`${prefix}${message}${suffix}`)
  }

  log(message: string, prefixNewLine = false, suffixNewLine = false) {
    this.#logMessage(`${chalk.blue(`[${this.#name}]`)} ${message}`, prefixNewLine, suffixNewLine)
  }

  error(message: string, prefixNewLine = false, suffixNewLine = false) {
    this.#logMessage(`${chalk.red(`[${this.#name}]`)} ${chalk.red(message)}`, prefixNewLine, suffixNewLine)
  }

  static log(name: string, message: string, prefixNewLine = false, suffixNewLine = false) {
    this.#getInstance(name).log(message, prefixNewLine, suffixNewLine)
  }

  static error(name: string, message: string, prefixNewLine = false, suffixNewLine = false) {
    this.#getInstance(name).error(message, prefixNewLine, suffixNewLine)
  }
}
