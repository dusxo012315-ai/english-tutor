export class WikipediaError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryable = false,
    public retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "WikipediaError";
  }
}
