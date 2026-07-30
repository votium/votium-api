export abstract class DomainException extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);

    this.name = new.target.name;
    this.code = code;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
