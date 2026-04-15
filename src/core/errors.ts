/**
 * @file
 * @brief Defines the repository-specific error class used by CLI and extension workflows.
 * @details Centralizes deterministic failure signaling by pairing an error message with a numeric exit code. The module is pure and performs no I/O. Access complexity is O(1).
 */

/**
 * @brief Represents a useReq failure with a stable numeric exit code.
 * @details Extends `Error` so callers can propagate human-readable diagnostics together with process-style status codes. Construction and property access are O(1). State mutation is limited to the created instance.
 */
export class ReqError extends Error {
  /**
   * @brief Stores the process-style exit code associated with the failure.
   * @details Downstream CLI and extension handlers read this field to decide the final command status. Access complexity is O(1). The field is assigned during construction.
   */
  code: number;

  /**
   * @brief Initializes a ReqError instance.
   * @details Assigns the inherited error message, normalizes the runtime name to `ReqError`, and stores the provided numeric exit code. Time complexity is O(1). Side effects are limited to instance field mutation.
   * @param[in] message {string} Human-readable failure description.
   * @param[in] code {number} Process exit code associated with the failure. Defaults to `1`.
   * @post `this.name === "ReqError"`.
   * @post `this.code === code`.
   */
  constructor(message: string, code = 1) {
    super(message);
    this.name = "ReqError";
    this.code = code;
  }
}
