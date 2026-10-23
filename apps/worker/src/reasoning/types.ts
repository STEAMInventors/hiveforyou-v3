export type ReasoningJsonRequest = {
  task:
    | "classify_document"
    | "generate_schema"
    | "supplement_schema"
    | "plan_questions_decompose";
  systemPrompt: string;
  userPayload: Record<string, unknown>;
  correlationId?: string;
};

export type ReasoningJsonResult = {
  parsed: unknown;
  alias: string;
  durationMs: number;
};

export type ReasoningJsonClient = {
  completeJson(request: ReasoningJsonRequest): Promise<ReasoningJsonResult>;
};
