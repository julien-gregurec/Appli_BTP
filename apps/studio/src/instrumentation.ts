import type { Instrumentation } from "next";
import { describeRequestError } from "./lib/observability";
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  console.error(JSON.stringify(describeRequestError(error, request, context)));
};
