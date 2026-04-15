export class ReqError extends Error {
  code: number;

  constructor(message: string, code = 1) {
    super(message);
    this.name = "ReqError";
    this.code = code;
  }
}
